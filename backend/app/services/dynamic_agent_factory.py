"""
Dynamic Agent Factory for Event-Driven Swarm
"""
import asyncio
import uuid
import logging
from typing import Dict, List, Optional
from app.services.event_aware_agent import EventAwareAgent, AgentCapabilities
from app.services.human_loop_agent import HumanLoopAgent
from app.services.agent_memory_store import get_memory_store
from app.services.event_bus import event_bus, SwarmEvent

logger = logging.getLogger(__name__)

class DynamicAgentFactory:
    """Create agents on-the-fly based on needs"""
    
    def __init__(self, human_loop_enabled: bool = True, execution_id: str = None, callback_handler=None, agent_timeout: float = None, timeout_provider=None, max_concurrent_agents: int = None):
        logger.info(f"🏭 DynamicAgentFactory __init__ called with callback_handler type={type(callback_handler).__name__}, is_callable={callable(callback_handler) if callback_handler else False}")
        self.human_loop_enabled = human_loop_enabled
        self.execution_id = execution_id
        self.callback_handler = callback_handler
        self.agent_timeout = agent_timeout or 120.0  # Default 120s if not provided
        self.timeout_provider = timeout_provider  # Callable to get agent-specific timeout
        self.max_concurrent_agents = max_concurrent_agents  # Optional cap
        logger.info(f"🏭 self.callback_handler after assignment: type={type(self.callback_handler).__name__}, is_callable={callable(self.callback_handler) if self.callback_handler else False}")
        self.memory_store = get_memory_store() if human_loop_enabled else None
        # No more hardcoded agent templates - everything is AI-driven now
        self.ai_role_analyzer = None  # Will be initialized when needed
        
        self.active_agents: Dict[str, EventAwareAgent] = {}
        self.spawned_count = 0
        
        # Register factory event handlers
        self._register_handlers()
    
    def _register_handlers(self):
        """Register event handlers for agent management"""
        event_bus.on("agent.needed", self._handle_agent_needed)
        event_bus.on("specialist.needed", self._handle_specialist_needed)
        event_bus.on("task.complete", self._cleanup_agents)
        # Track per-agent completion to release capacity
        event_bus.on("agent.completed", self._on_agent_completed)
        # Also track our internal callback style
        event_bus.on("agent_completed", self._on_agent_completed)

    async def _on_agent_completed(self, event):
        try:
            agent_name = None
            # unify possible shapes
            if hasattr(event, 'data') and isinstance(event.data, dict):
                agent_name = event.data.get('agent') or event.data.get('name')
            if not agent_name and hasattr(event, 'source'):
                agent_name = event.source
            if agent_name and agent_name in self.active_agents:
                self.active_agents.pop(agent_name, None)
        except Exception:
            pass
    
    async def _handle_agent_needed(self, event):
        """Handle request for a new agent"""
        # Store current event data for sequential execution tracking
        self._current_event_data = event.data
        
        role = event.data.get("role")
        reason = event.data.get("reason", "")
        context = event.data.get("context", "")
        
        logger.info(f"📋 Agent needed: {role} - {reason}")
        logger.info(f"📋 Handler called for agent.needed event - Role: {role}")
        
        # Check if we already have this type of agent
        for agent in self.active_agents.values():
            if agent.role == role and agent.state == "idle":
                logger.info(f"Found idle agent: {agent.name}")
                # Trigger the agent with the context, including session_id if available
                activation_data = {"task": context, "role": role, "reason": reason}
                if "session_id" in event.data:
                    activation_data["session_id"] = event.data["session_id"]
                await agent.activate(SwarmEvent(
                    type="agent.needed",
                    data=activation_data,
                    source=event.source
                ))
                return
        
        # Spawn new agent
        agent = await self.spawn_agent(role, {"context": context})
        if agent:
            # Activate the new agent with the context as task, including session_id if available
            activation_data = {"task": context, "role": role, "reason": reason}
            if "session_id" in event.data:
                activation_data["session_id"] = event.data["session_id"]
            await agent.activate(SwarmEvent(
                type="agent.needed",
                data=activation_data,
                source=event.source
            ))
    
    async def _handle_specialist_needed(self, event):
        """Handle request for a specialist agent"""
        specialty = event.data.get("specialty")
        agent = await self.spawn_specialist(specialty)
        if agent:
            await agent.activate(event)
    
    async def spawn_agent(self, role: str, context: dict = None) -> Optional[EventAwareAgent]:
        """Create a new agent dynamically based on specific needs"""
        
        logger.info(f"🚀 SPAWNING AGENT: {role}")

        # Concurrency gate if configured
        if self.max_concurrent_agents and self.max_concurrent_agents > 0:
            waited_ms = 0
            while len(self.active_agents) >= self.max_concurrent_agents:
                await asyncio.sleep(0.05)
                waited_ms += 50
                if waited_ms % 1000 == 0:
                    logger.info(f"⏳ Waiting for capacity: {len(self.active_agents)}/{self.max_concurrent_agents}")
        
        # Extract detailed requirements from context/role
        requirements = context.get("context", "") if context else ""
        reason = context.get("reason", "") if context else ""
        
        # Ensure role is a string (extract from dict if needed)
        if isinstance(role, dict):
            role_str = role.get("role", "general_specialist")
            if not requirements:
                requirements = role.get("reason", "")
        else:
            role_str = str(role)
        
        # Generate dynamic agent template based on specific needs
        template = await self._create_dynamic_template(role_str, requirements, reason)
        
        if not template:
            logger.warning(f"Failed to create dynamic template for: {role}")
            return None
        
        # Create unique name based on specialty
        specialty_name = template.get("specialty_name", role)
        agent_name = f"{specialty_name}_{self.spawned_count:03d}"
        self.spawned_count += 1
        
        # Create capabilities dynamically
        capabilities = AgentCapabilities(
            skills=template.get("skills", []),
            tools=template.get("tools", []),
            listens_to=template.get("listens_to", []),
            emits=template.get("emits", [])
        )
        
        # Create agent - use HumanLoopAgent if human loop is enabled
        if self.human_loop_enabled and self.execution_id:
            # Get the effective timeout for this specific agent
            effective_timeout = self.agent_timeout
            if self.timeout_provider and callable(self.timeout_provider):
                try:
                    # Now we have the actual agent name, we can get agent-specific timeout
                    specific_timeout = self.timeout_provider(self.execution_id, agent_name)
                    if specific_timeout:
                        effective_timeout = specific_timeout
                        logger.info(f"⏱️ Using agent-specific timeout {effective_timeout}s for {agent_name}")
                except Exception as e:
                    logger.debug(f"Could not get agent-specific timeout: {e}")
            
            agent = HumanLoopAgent(
                name=agent_name,
                role=role,
                system_prompt=template["system_prompt"],
                capabilities=capabilities,
                execution_id=self.execution_id,
                memory_store=self.memory_store,
                agent_timeout=effective_timeout
            )
            # Wire streaming callback so UI receives tokens and completion
            # IMPORTANT: Create an agent-specific wrapper to prevent cross-agent interference
            try:
                if self.callback_handler and callable(self.callback_handler):
                    # Create a wrapper that ensures agent isolation
                    original_callback = self.callback_handler
                    
                    # Create agent-specific callback wrapper based on original type
                    if asyncio.iscoroutinefunction(original_callback):
                        # Async version
                        async def agent_specific_callback(**kwargs):
                            # Ensure this callback is only for this specific agent
                            callback_agent = kwargs.get("agent")
                            if callback_agent and callback_agent != agent_name:
                                # Skip if this callback is for a different agent
                                logger.debug(f"Skipping callback for {callback_agent}, expected {agent_name}")
                                return
                            
                            # Ensure agent name is set correctly
                            kwargs["agent"] = agent_name
                            
                            # Call original async callback
                            await original_callback(**kwargs)
                    else:
                        # Sync version
                        def agent_specific_callback(**kwargs):
                            # Ensure this callback is only for this specific agent
                            callback_agent = kwargs.get("agent")
                            if callback_agent and callback_agent != agent_name:
                                # Skip if this callback is for a different agent
                                logger.debug(f"Skipping callback for {callback_agent}, expected {agent_name}")
                                return
                            
                            # Ensure agent name is set correctly
                            kwargs["agent"] = agent_name
                            
                            # Call original sync callback
                            original_callback(**kwargs)
                    
                    agent.callback_handler = agent_specific_callback
                    logger.info(f"✅ CALLBACK WIRED: Set agent-specific callback for {agent_name}")
                else:
                    if self.callback_handler is not None:
                        logger.error(f"❌ INVALID CALLBACK: Factory has callback_handler of type {type(self.callback_handler).__name__} (not callable) for {agent_name}")
                    else:
                        logger.warning(f"⚠️ NO CALLBACK: Factory has no callback_handler to wire to {agent_name}")
            except Exception as e:
                logger.error(f"❌ CALLBACK WIRE FAILED for {agent_name}: {e}")
            logger.info(f"🤖✨ Created HumanLoopAgent: {agent_name} for execution {self.execution_id}")
        else:
            agent = EventAwareAgent(
                name=agent_name,
                role=role,
                system_prompt=template["system_prompt"],
                capabilities=capabilities
            )
            logger.info(f"🔧✨ Created EventAwareAgent: {agent_name} (human_loop_enabled={self.human_loop_enabled}, execution_id={self.execution_id})")
        
        # Add to active agents
        self.active_agents[agent_name] = agent
        
        # Announce agent creation
        spawn_data = {
            "agent": agent_name,
            "role": role,
            "capabilities": {
                "skills": capabilities.skills,
                "tools": capabilities.tools
            }
        }
        
        # Include execution_id and parent if available (for sequential execution tracking)
        if hasattr(self, '_current_event_data') and self._current_event_data:
            if "execution_id" in self._current_event_data:
                spawn_data["execution_id"] = self._current_event_data["execution_id"]
            if "parent" in self._current_event_data:
                spawn_data["parent"] = self._current_event_data["parent"]
        
        await event_bus.emit("agent.spawned", spawn_data, source="factory")
        
        # Clear current event data after spawning
        self._current_event_data = None
        
        logger.info(f"✨ Spawned agent: {agent_name} ({role})")
        return agent
    
    async def _create_dynamic_template(self, role: str, requirements: str, reason: str) -> dict:
        """Use AI to create a fully dynamic agent template based on specific needs"""
        try:
            from strands import Agent
            from strands.models.openai import OpenAIModel
            import os
            from dotenv import load_dotenv
            
            load_dotenv()
            api_key = os.getenv("OPENAI_API_KEY")
            
            if not api_key:
                logger.warning("No OpenAI API key - using minimal fallback")
                return self._minimal_fallback_template(role, requirements)
            
            # Create AI template generator with enhanced capabilities
            model = OpenAIModel(
                client_args={"api_key": api_key},
                model_id="gpt-4o-mini", 
                params={"max_tokens": 600, "temperature": 0.2}
            )
            
            template_generator = Agent(
                name="dynamic_template_generator",
                system_prompt="""You are an advanced AI agent template generator. Create highly specialized agent configurations that are perfectly tailored to specific tasks.

Your mission: Generate agents that are EXPERTS in their specific domain, not generic workers.

Given a role description, requirements, and reason, create a JSON template with:

{
  "specialty_name": "highly_specific_agent_name",
  "system_prompt": "Detailed, role-specific system prompt that makes this agent an expert",
  "skills": ["domain_specific_skill1", "domain_specific_skill2", ...],
  "tools": ["relevant_tool1", "relevant_tool2", ...],
  "listens_to": ["specific_event_types"],
  "emits": ["specific_output_events"]
}

Key principles:
- specialty_name should be descriptive and specific (e.g., "quantum_physics_researcher", "react_component_architect")
- system_prompt should establish expertise and specific behavioral patterns
- skills should reflect deep domain knowledge
- tools should match the specific work needed
- events should be meaningful to the agent's workflow

Available tools: web_search, code_interpreter, file_editor, data_analysis, arxiv, wikipedia

Make this agent THE expert for this exact use case. Think like you're hiring a specialist consultant.

Return ONLY valid JSON.""",
                model=model
            )
            
            enhanced_prompt = f"""Create an expert specialist agent template for:

Role: {role}
Requirements: {requirements}
Reason: {reason}

This agent should be THE definitive expert for this specific need. Design it as if you're creating a world-class specialist consultant who excels at exactly this type of work.

Focus on:
- Deep specialization over generalization
- Specific expertise that matches the exact need
- Behavioral patterns that optimize for this use case
- Tools and skills perfectly aligned with the work

Generate the template now."""

            # Use stream_async to get the result
            result_content = ""
            async for event in template_generator.stream_async(enhanced_prompt):
                if "data" in event:
                    result_content += event["data"]
                elif "result" in event:
                    result = event["result"]
                    if hasattr(result, 'content'):
                        result_content = result.content
                    else:
                        result_content = str(result)
                    break
            
            # Use the accumulated content from streaming
            response = result_content.strip()
            
            # Strip markdown code blocks if present
            if response.startswith("```json"):
                response = response[7:]  # Remove ```json
            elif response.startswith("```"):
                response = response[3:]  # Remove ```
            
            if response.endswith("```"):
                response = response[:-3]  # Remove closing ```
            
            response = response.strip()
            
            # Parse JSON response with error resilience
            import json
            try:
                template = json.loads(response)
                specialty = template.get('specialty_name', role)
                logger.info(f"✅ Generated expert template for {specialty}")
                return template
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse template JSON: {e}")
                logger.error(f"Cleaned response that failed to parse: {response[:500]}...")
                return self._minimal_fallback_template(role, requirements)
                
        except Exception as e:
            logger.error(f"Dynamic template generation failed: {e}")
            return self._minimal_fallback_template(role, requirements)
    
    def _minimal_fallback_template(self, role: str, requirements: str) -> dict:
        """Minimal fallback template when AI generation fails"""
        # Ensure role is a string
        role_str = str(role) if not isinstance(role, str) else role
        requirements_str = str(requirements) if not isinstance(requirements, str) else requirements
        
        return {
            "specialty_name": role_str.replace(" ", "_").lower(),
            "system_prompt": f"You are a {role_str} specialist. {requirements_str}. Complete your assigned task professionally and efficiently.",
            "skills": [role_str.lower().replace(" ", "_"), "problem_solving"],
            "tools": [],
            "listens_to": ["agent.needed"],
            "emits": ["task.complete"]
        }
    
    async def spawn_specialist(self, specialty: str) -> Optional[EventAwareAgent]:
        """Create a specialist agent for specific need using AI analysis"""
        # Use the specialty directly as a role description for AI analysis
        return await self.spawn_agent(specialty, {"specialty": specialty, "context": f"Specialist needed for: {specialty}"})
    
    
    async def analyze_task_needs(self, task: str) -> List[dict]:
        """Use AI to analyze task and determine what specialized agents are needed"""
        try:
            # Initialize AI role analyzer if needed
            if not self.ai_role_analyzer:
                await self._initialize_ai_role_analyzer()
            
            if not self.ai_role_analyzer:
                return [{"role": "general_task_agent", "reason": "AI analysis unavailable"}]
            
            # Analyze task with AI
            analysis_prompt = f"""Analyze this task and determine what specialized agents are needed: "{task}"

CRITICAL RULES:
1. SIMPLE GREETINGS: If the task is just "Hi", "Hello", "How are you", or similar basic greetings, return ONLY ONE agent with role "conversational_agent".
2. SIMPLE QUESTIONS: For basic questions or simple conversational exchanges, use only ONE agent.
3. COMPLEX PROJECTS: Only use multiple agents for complex tasks like building apps, websites, or systems.

Respond with a JSON array of agent requirements, each with:
{{"role": "specific_role_description", "reason": "why this agent is needed", "priority": "high/medium/low"}}

For simple greetings, respond with:
[{{"role": "conversational_agent", "reason": "Handle simple greeting and conversation", "priority": "high"}}]

For complex tasks, focus on:
- What SPECIFIC expertise is needed (not generic roles)
- Break complex tasks into specialized capabilities
- Consider the full workflow from start to finish
- Be specific about agent purposes

Examples:
- Instead of "researcher" → "academic literature researcher for satellite technology"
- Instead of "writer" → "technical research paper writer with aerospace expertise"  
- Instead of "developer" → "Python simulation developer for orbital mechanics"

Return ONLY the JSON array, no other text."""

            # Use stream_async to get the analysis result
            analysis_content = ""
            try:
                async for event in self.ai_role_analyzer.stream_async(analysis_prompt):
                    if "data" in event:
                        analysis_content += event["data"]
                    elif "result" in event:
                        result = event["result"]
                        if hasattr(result, 'content'):
                            analysis_content = result.content
                        else:
                            analysis_content = str(result)
                        break
                        
                if not analysis_content.strip():
                    logger.error("AI role analyzer returned empty content")
                    return [{"role": "task_specialist", "reason": f"Complete task: {task}", "priority": "high"}]
                    
            except Exception as stream_error:
                logger.error(f"Error during AI role analysis streaming: {stream_error}")
                return [{"role": "task_specialist", "reason": f"Complete task: {task}", "priority": "high"}]
            
            response = analysis_content.strip()
            logger.info(f"AI role analyzer response: {response[:200]}...")
            
            # Strip markdown code blocks if present
            if response.startswith("```json"):
                response = response[7:]  # Remove ```json
            elif response.startswith("```"):
                response = response[3:]  # Remove ```
            
            if response.endswith("```"):
                response = response[:-3]  # Remove closing ```
            
            response = response.strip()
            
            # Parse AI response
            import json
            try:
                agent_needs = json.loads(response)
                logger.info(f"✅ AI identified {len(agent_needs)} specialized agents needed")
                return agent_needs
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse AI task analysis: {e}")
                logger.error(f"Cleaned response that failed to parse: {response[:500]}...")
                return [{"role": "general_analyst", "reason": "Parse AI analysis of task", "priority": "high"}]
                
        except Exception as e:
            logger.error(f"AI task analysis failed: {e}")
            return [{"role": "fallback_agent", "reason": f"Handle task: {task}", "priority": "high"}]
    
    async def _initialize_ai_role_analyzer(self):
        """Initialize the AI role analyzer"""
        try:
            from strands import Agent
            from strands.models.openai import OpenAIModel
            import os
            from dotenv import load_dotenv
            
            load_dotenv()
            api_key = os.getenv("OPENAI_API_KEY")
            
            if not api_key:
                logger.warning("No OpenAI API key - AI role analysis disabled")
                return
            
            model = OpenAIModel(
                client_args={"api_key": api_key},
                model_id="gpt-4o-mini",
                params={"max_tokens": 500, "temperature": 0.1}
            )
            
            self.ai_role_analyzer = Agent(
                name="ai_role_analyzer",
                system_prompt="""You are an intelligent task analysis specialist that determines what specialized AI agents are needed for tasks.

CRITICAL RULES FIRST:
1. SIMPLE GREETINGS ("Hi", "Hello", "How are you"): Return ONLY ONE "conversational_agent"
2. SIMPLE QUESTIONS/CONVERSATIONS: Use only ONE agent unless truly complex
3. COMPLEX PROJECTS (building apps, systems): Use multiple specialized agents

Your job is to:
1. Recognize simple conversational tasks and use minimal agents
2. Break down complex tasks into specific expertise areas
3. Identify what specialized capabilities are needed
4. Suggest agent roles that are SPECIFIC, not generic
5. Consider the full workflow and all steps needed

Always be specific about agent roles for complex tasks:
- "satellite orbital mechanics specialist" not "researcher"  
- "Python web application developer" not "developer"
- "academic paper formatting expert" not "writer"
- "aerospace quality assurance tester" not "reviewer"

Respond with clear JSON showing exactly what agents are needed and why.""",
                model=model
            )
            
            logger.info("✅ AI role analyzer initialized")
            
        except Exception as e:
            logger.error(f"Failed to initialize AI role analyzer: {e}")
            self.ai_role_analyzer = None
    
    async def _cleanup_agents(self, event):
        """Clean up agents when task is complete"""
        logger.info("🧹 Cleaning up agents")
        for agent in self.active_agents.values():
            agent.cleanup()
        self.active_agents.clear()
        self.spawned_count = 0
    
    def get_active_agents(self) -> Dict[str, dict]:
        """Get information about active agents"""
        return {
            name: {
                "role": agent.role,
                "state": agent.state,
                "current_task": agent.current_task
            }
            for name, agent in self.active_agents.items()
        }
    
    def get_agent(self, name: str) -> Optional[EventAwareAgent]:
        """Get specific agent by name"""
        return self.active_agents.get(name)
