# services/swarm_service.py - Fixed to use proper agent loops
import asyncio
import json
import os
import re
from typing import Optional, Callable, Dict, Any, List
from datetime import datetime
import structlog
import uuid
from openai import AsyncOpenAI

from app.schemas.swarm import (
    SwarmExecutionRequest,
    SwarmExecutionResponse,
    ExecutionStatus,
    AgentConfig,
    Artifact
)
from app.config import settings

logger = structlog.get_logger()


class SwarmService:
    """Fixed Swarm Service using proper agent loops"""

    def __init__(self, iterative_agent_service=None):
        self.active_executions = {}
        self.client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.iterative_agent_service = iterative_agent_service

    async def execute_swarm_async(
        self,
        request: SwarmExecutionRequest,
        user_id: str,
        callback_handler: Optional[Callable] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> SwarmExecutionResponse:
        """Execute swarm using proper agent loops with conversation history support"""

        execution_id = request.execution_id or str(uuid.uuid4())
        self.active_executions[execution_id] = {
            "status": "running",
            "start_time": datetime.utcnow(),
            "user_id": user_id,
            "conversation_history": conversation_history or []
        }

        try:
            # Get agents - use provided or create defaults
            agents = request.agents if request.agents else self._get_default_agents()
            agent_map = {agent.name: agent for agent in agents}

            logger.info(f"Starting Swarm with {len(agents)} agents: {[a.name for a in agents]}")

            # Send start event
            if callback_handler:
                await callback_handler(
                    type="execution_started",
                    data={
                        "task": request.task,
                        "agents": [{"name": a.name, "description": a.description} for a in agents]
                    }
                )

            # Initialize swarm state with shared context including conversation history
            shared_context = {
                "original_task": request.task,
                "agent_contributions": {},
                "shared_knowledge": [],
                "available_agents": {a.name: a for a in agents},
                "conversation_history": conversation_history or [],
                "is_continuation": bool(conversation_history)
            }

            current_agent = agents[0]  # Start with first agent
            agent_sequence = []
            handoff_count = 0
            max_handoffs = request.max_handoffs or 15
            all_artifacts = []
            logger.info(f"execute_swarm_async -> max_handoffs {max_handoffs}")

            # MAIN SWARM LOOP - Using proper agent loops
            while handoff_count <= max_handoffs:
                logger.info(f"\n{'='*60}")
                logger.info(f"SWARM ITERATION {handoff_count + 1}: {current_agent.name}")

                # Build comprehensive context for current agent
                agent_task_context = self._build_agent_context(
                    current_agent, shared_context, agent_sequence
                )

                # FIXED: Use iterative agent service for proper agent loops
                if self.iterative_agent_service:
                    agent_result = await self.iterative_agent_service.execute_agent_with_loop(
                        agent=current_agent,
                        task=agent_task_context,
                        previous_work=list(shared_context["agent_contributions"].values()),
                        execution_id=execution_id,
                        callback_handler=callback_handler,
                        max_iterations=8,  # Allow proper iterative work
                        max_tokens_per_iteration=4000
                    )
                else:
                    # Fallback to simple execution if no iterative service
                    agent_result = await self._execute_agent_simple(
                        agent=current_agent,
                        task=agent_task_context,
                        callback_handler=callback_handler
                    )

                # Process agent results
                agent_output = agent_result.get("response", "")
                agent_artifacts = agent_result.get("artifacts", [])

                # Store agent's work in shared context
                shared_context["agent_contributions"][current_agent.name] = agent_output
                agent_sequence.append(current_agent.name)
                all_artifacts.extend(agent_artifacts)

                # Extract knowledge for sharing
                knowledge = self._extract_shared_knowledge(agent_output, current_agent.name)
                if knowledge:
                    shared_context["shared_knowledge"].append(knowledge)

                # FIXED: Parse handoff decision from agent's output
                handoff_decision = self._parse_handoff_from_output(agent_output, agent_map)

                if handoff_decision["should_handoff"]:
                    target_agent_name = handoff_decision["target_agent"]
                    reason = handoff_decision["reason"]

                    if target_agent_name in agent_map:
                        logger.info(f"🔄 Handoff: {current_agent.name} → {target_agent_name}")
                        logger.info(f"   Reason: {reason}")

                        if callback_handler:
                            await callback_handler(
                                type="handoff",
                                data={
                                    "from_agent": current_agent.name,
                                    "to_agent": target_agent_name,
                                    "reason": reason,
                                    "handoff_count": handoff_count + 1
                                }
                            )

                        current_agent = agent_map[target_agent_name]
                        handoff_count += 1

                        # Prevent repetitive handoffs
                        if self._detect_repetitive_handoffs(agent_sequence, target_agent_name):
                            logger.warning("⚠️ Repetitive handoffs detected, completing task")
                            break
                    else:
                        logger.warning(f"❌ Invalid handoff target: {target_agent_name}")
                        break
                else:
                    # No handoff - task completed
                    logger.info(f"✅ Task completed by {current_agent.name}")
                    break

            # Compile final response from all contributions
            final_response = self._create_final_response(shared_context, agent_sequence, all_artifacts)

            # Send completion
            if callback_handler:
                await callback_handler(
                    type="execution_completed",
                    data={"result": final_response}
                )

            return SwarmExecutionResponse(
                execution_id=execution_id,
                status=ExecutionStatus.COMPLETED,
                result=final_response,
                handoffs=handoff_count,
                tokens_used=0,
                agent_sequence=agent_sequence,
                artifacts=all_artifacts
            )

        except Exception as e:
            logger.error(f"Swarm failed: {e}", exc_info=True)
            return SwarmExecutionResponse(
                execution_id=execution_id,
                status=ExecutionStatus.FAILED,
                error=str(e)
            )
        finally:
            if execution_id in self.active_executions:
                del self.active_executions[execution_id]

    def _build_agent_context(
        self,
        agent: AgentConfig,
        shared_context: Dict[str, Any],
        agent_sequence: List[str]
    ) -> str:
        """Build comprehensive context for agent following Strands pattern"""

        context = f"TASK: {shared_context['original_task']}\n\n"

        # Add previous agents' work
        if shared_context["agent_contributions"]:
            context += "=== PREVIOUS AGENTS' WORK ===\n"
            for agent_name, output in shared_context["agent_contributions"].items():
                # Show meaningful preview
                preview = output[:400] + "..." if len(output) > 400 else output
                context += f"\n{agent_name}:\n{preview}\n"

        # Add shared knowledge
        if shared_context["shared_knowledge"]:
            context += "\n=== SHARED KNOWLEDGE ===\n"
            for knowledge in shared_context["shared_knowledge"]:
                context += f"• {knowledge}\n"

        # Add available agents for coordination
        available_agents = [name for name in shared_context["available_agents"].keys() if name != agent.name]
        if available_agents:
            context += f"\n=== AVAILABLE AGENTS FOR HANDOFF ===\n"
            for agent_name in available_agents:
                agent_info = shared_context["available_agents"][agent_name]
                context += f"• {agent_name}: {agent_info.description or f'{agent_name} specialist'}\n"

        # Add clear instructions
        context += f"""
=== YOUR ROLE ===
You are {agent.name}: {agent.description or f"A {agent.name} specialist"}

=== INSTRUCTIONS ===
1. Do substantial work in your area of expertise
2. Use available tools to research, analyze, or implement solutions
3. Build meaningfully on previous agents' work
4. Create concrete deliverables (analysis, code, reports, etc.)

=== HANDOFF INSTRUCTIONS ===
Only handoff when you need different specialized expertise.

To handoff, end your response with:
HANDOFF_TO: agent_name
REASON: Brief explanation of why you need their expertise

If no handoff is needed, simply complete your work without handoff instructions.

Focus on delivering substantial value through your expertise.
"""

        return context

    def _parse_handoff_from_output(self, output: str, agent_map: Dict[str, AgentConfig]) -> Dict[str, Any]:
        """Parse handoff decision from agent's output"""

        # Look for explicit handoff pattern
        handoff_pattern = r'HANDOFF_TO:\s*(\w+)'
        reason_pattern = r'REASON:\s*([^\n]+)'

        handoff_match = re.search(handoff_pattern, output, re.IGNORECASE)
        if handoff_match:
            target_agent = handoff_match.group(1).strip()
            reason_match = re.search(reason_pattern, output, re.IGNORECASE)
            reason = reason_match.group(1).strip() if reason_match else "Needs specialized expertise"

            if target_agent in agent_map:
                return {
                    "should_handoff": True,
                    "target_agent": target_agent,
                    "reason": reason
                }

        # No valid handoff found
        return {"should_handoff": False, "target_agent": None, "reason": None}

    def _detect_repetitive_handoffs(self, agent_sequence: List[str], next_agent: str) -> bool:
        """Detect repetitive handoff patterns"""
        if len(agent_sequence) < 6:
            return False

        # Check for ping-pong in recent handoffs
        recent_sequence = agent_sequence[-6:] + [next_agent]
        unique_agents = set(recent_sequence)

        # If only 2-3 unique agents in last 7 positions, likely repetitive
        if len(unique_agents) <= 3:
            logger.warning(f"Repetitive pattern: {recent_sequence}")
            return True

        return False

    def _extract_shared_knowledge(self, output: str, agent_name: str) -> Optional[str]:
        """Extract key knowledge from agent output for sharing"""

        # Look for key insights
        patterns = [
            r'(?:key finding|conclusion|insight|important)[:\-]\s*([^\n.]+)',
            r'(?:discovered|found|determined)[:\s]+([^\n.]+)',
        ]

        for pattern in patterns:
            match = re.search(pattern, output, re.IGNORECASE)
            if match:
                return f"{agent_name}: {match.group(1).strip()}"

        # Fallback: first substantial sentence
        sentences = re.split(r'[.!?]+', output)
        for sentence in sentences:
            if 30 < len(sentence.strip()) < 150:
                return f"{agent_name}: {sentence.strip()}"

        return None

    def _create_final_response(
        self,
        shared_context: Dict[str, Any],
        agent_sequence: List[str],
        all_artifacts: List[Dict]
    ) -> str:
        """Create comprehensive final response"""

        response = f"# Task: {shared_context['original_task']}\n\n"

        # Add collaboration summary
        response += "## Collaborative Swarm Result\n\n"
        response += f"This task was completed through collaboration of {len(set(agent_sequence))} specialized agents "
        response += f"across {len(agent_sequence)} interactions.\n\n"

        # Add each agent's contribution
        response += "## Agent Contributions\n\n"
        for agent_name, output in shared_context["agent_contributions"].items():
            response += f"### {agent_name.replace('_', ' ').title()}\n\n"
            response += output + "\n\n"

        # Add shared insights
        if shared_context["shared_knowledge"]:
            response += "## Key Insights\n\n"
            for knowledge in shared_context["shared_knowledge"]:
                response += f"• {knowledge}\n"
            response += "\n"

        # Add artifacts summary
        if all_artifacts:
            response += f"## Generated Files ({len(all_artifacts)})\n\n"
            for artifact in all_artifacts:
                response += f"• **{artifact['name']}** - {artifact.get('language', 'text')}\n"

        return response

    async def _execute_agent_simple(
        self,
        agent: AgentConfig,
        task: str,
        callback_handler: Optional[Callable]
    ) -> Dict[str, Any]:
        """Simple agent execution fallback"""

        if callback_handler:
            await callback_handler(
                type="agent_started",
                agent=agent.name,
                data={"task": task[:100]}
            )

        # Build messages with conversation history if available
        system_prompt = agent.system_prompt or f"You are {agent.name}."
        
        # Include conversation history context if this is a continuation
        if shared_context.get("is_continuation") and shared_context.get("conversation_history"):
            system_prompt += "\n\nYou are continuing an ongoing conversation. Previous messages are provided for context."

        messages = [
            {"role": "system", "content": system_prompt}
        ]
        
        # Add conversation history if available
        if shared_context.get("conversation_history"):
            for msg in shared_context["conversation_history"]:
                messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
        
        # Add current task
        messages.append({"role": "user", "content": task})

        try:
            response_text = ""
            model = getattr(agent, 'model', 'gpt-4o-mini')

            stream = await self.client.chat.completions.create(
                model=model,
                messages=messages,
                stream=True,
                temperature=0.7,
                max_tokens=3000
            )

            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    response_text += content

                    if callback_handler:
                        await callback_handler(
                            type="text_generation",
                            agent=agent.name,
                            data={"text": content}
                        )

            if callback_handler:
                await callback_handler(
                    type="agent_completed",
                    agent=agent.name,
                    data={"output": response_text}
                )

            return {
                "response": response_text,
                "artifacts": []
            }

        except Exception as e:
            logger.error(f"Agent {agent.name} failed: {e}")
            return {"response": f"Error: {str(e)}", "artifacts": []}

    def _get_default_agents(self) -> List[AgentConfig]:
        """Get default agent configuration - minimal but effective"""

        return [
            AgentConfig(
                name="researcher",
                description="Research and analysis specialist",
                system_prompt="""You are a research specialist. Your job is to:
1. Conduct thorough research using available tools
2. Gather comprehensive information on the given topic
3. Analyze findings and provide insights
4. Create structured reports or analysis

When you need specialized help from another agent (coding, design, review, etc.),
use: HANDOFF_TO: agent_name followed by REASON: explanation"""
            ),

            AgentConfig(
                name="analyst",
                description="Data analysis and synthesis specialist",
                system_prompt="""You are an analyst. Your job is to:
1. Analyze data and information from research
2. Synthesize findings into coherent insights
3. Identify patterns and trends
4. Create comprehensive analysis and recommendations

When you need specialized help, use: HANDOFF_TO: agent_name followed by REASON: explanation"""
            ),

            AgentConfig(
                name="compiler",
                description="Report compilation and synthesis specialist",
                system_prompt="""You are a report compiler. Your job is to:
1. Compile all previous work into a comprehensive report
2. Create well-structured, professional documents
3. Synthesize all findings into a cohesive narrative
4. Ensure completeness and clarity

Focus on creating the final deliverable. Usually no handoff needed after your work."""
            )
        ]

    async def stop_execution(self, execution_id: str) -> bool:
        """Stop execution"""
        if execution_id in self.active_executions:
            self.active_executions[execution_id]["status"] = "stopped"
            return True
        return False

    async def get_execution(self, execution_id: str, user_id: str):
        """Get execution details"""
        return self.active_executions.get(execution_id)

    async def get_user_executions(self, user_id: str, skip: int, limit: int):
        """Get user executions"""
        return []


class AgentTemplates:
    """Agent templates for quick agent creation - keeping for compatibility"""

    @staticmethod
    def researcher():
        return AgentConfig(
            name="researcher",
            description="Research specialist",
            system_prompt="""You are a research specialist. Analyze requirements, research best practices, and identify key decisions.
When research is complete, hand off to the appropriate specialist using:
HANDOFF_TO: specialist_name
REASON: Why you need their expertise""",
            tools=["tavily_search", "file_write"] if hasattr(AgentConfig, 'tools') else None
        )

    @staticmethod
    def architect():
        return AgentConfig(
            name="architect",
            description="System architect",
            system_prompt="""You are a system architect. Design system architecture, define APIs and interfaces.
Hand off to developer when design is ready using:
HANDOFF_TO: developer
REASON: Need implementation of the designed system""",
            tools=["file_write"] if hasattr(AgentConfig, 'tools') else None
        )

    @staticmethod
    def developer():
        return AgentConfig(
            name="developer",
            description="Software developer",
            system_prompt="""You are a software developer. Write clean, working code with proper error handling.
Hand off to reviewer when implementation is complete using:
HANDOFF_TO: reviewer
REASON: Need code review and validation""",
            tools=["file_write", "python_repl"] if hasattr(AgentConfig, 'tools') else None
        )

    @staticmethod
    def api_specialist():
        return AgentConfig(
            name="api_specialist",
            description="REST API specialist",
            system_prompt="""You are a REST API specialist. Your job is to implement COMPLETE REST APIs.

You MUST generate:
- Complete server.js with Express
- All route handlers in routes.js
- Database models in models.js
- package.json with dependencies
- .env.example for configuration

Write complete, production-ready code. Hand off to reviewer when done using:
HANDOFF_TO: reviewer
REASON: Need review of API implementation""",
            tools=["file_write"] if hasattr(AgentConfig, 'tools') else None
        )

    @staticmethod
    def backend_developer():
        return AgentConfig(
            name="backend_developer",
            description="Backend developer",
            system_prompt="""You are a backend developer. Enhance API implementations with:
- Error handling and validation
- Database connections
- Middleware
- Tests

Generate complete code. Hand off to reviewer using:
HANDOFF_TO: reviewer
REASON: Need review of backend implementation""",
            tools=["file_write", "python_repl"] if hasattr(AgentConfig, 'tools') else None
        )

    @staticmethod
    def data_specialist():
        return AgentConfig(
            name="data_specialist",
            description="Data analysis specialist",
            system_prompt="""You are a data analysis specialist. Create complete data analysis:
- Data loading and preprocessing
- Statistical analysis
- At least 5 visualizations
- Key insights

Use pandas, matplotlib, seaborn. Hand off to reviewer when done using:
HANDOFF_TO: reviewer
REASON: Need review of data analysis""",
            tools=["python_repl", "file_write"] if hasattr(AgentConfig, 'tools') else None
        )

    @staticmethod
    def reviewer():
        return AgentConfig(
            name="reviewer",
            description="Code reviewer",
            system_prompt="""You are a code reviewer. Review implementations for:
- Code quality
- Completeness
- Best practices

Provide final assessment. Task is usually complete after your review.""",
            tools=["file_read"] if hasattr(AgentConfig, 'tools') else None
        )

    @staticmethod
    def frontend_developer():
        return AgentConfig(
            name="frontend_developer",
            description="Frontend developer",
            system_prompt="""You are a frontend developer. Build React/Vue components with:
- Component structure
- State management
- Styling
- Event handlers

Write complete component code. Hand off to reviewer using:
HANDOFF_TO: reviewer
REASON: Need review of frontend implementation""",
            tools=["file_write"] if hasattr(AgentConfig, 'tools') else None
        )

    @staticmethod
    def tester():
        return AgentConfig(
            name="tester",
            description="QA tester",
            system_prompt="""You are a QA tester. Create tests:
- Unit tests
- Integration tests
- Test edge cases

Write test code. Hand off to documenter or complete the task using:
HANDOFF_TO: documenter
REASON: Need documentation for the tested system""",
            tools=["file_write", "python_repl"] if hasattr(AgentConfig, 'tools') else None
        )

    @staticmethod
    def documenter():
        return AgentConfig(
            name="documenter",
            description="Documentation specialist",
            system_prompt="""You are a documentation specialist. Create:
- README with setup instructions
- API documentation
- Usage examples

Complete the task with comprehensive documentation.""",
            tools=["file_write"] if hasattr(AgentConfig, 'tools') else None
        )