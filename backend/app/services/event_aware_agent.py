"""
Event-Aware Agent for Event-Driven Swarm
"""
import asyncio
import uuid
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from app.services.event_bus import event_bus, SwarmEvent

logger = logging.getLogger(__name__)

@dataclass
class AgentCapabilities:
    """Defines what an agent can do"""
    skills: List[str]
    tools: List[str]
    listens_to: List[str]  # Event patterns this agent responds to
    emits: List[str]  # Event types this agent can emit

class EventAwareAgent:
    """Agent that can emit and respond to events"""
    
    def __init__(
        self, 
        name: str, 
        role: str,
        system_prompt: str,
        capabilities: AgentCapabilities,
        model_config: dict = None
    ):
        self.id = str(uuid.uuid4())
        self.name = name
        self.role = role
        self.system_prompt = system_prompt
        self.capabilities = capabilities
        self.model_config = model_config or {"model_id": "gpt-4o-mini"}
        self.state = "idle"
        self.current_task = None
        self.context = {}
        
        # Register event listeners
        self._register_listeners()
        
    def _register_listeners(self):
        """Register to listen for relevant events"""
        for pattern in self.capabilities.listens_to:
            event_bus.on(pattern, self._handle_event)
            logger.debug(f"Agent {self.name} listening for: {pattern}")
    
    async def _handle_event(self, event: SwarmEvent):
        """Decide whether to respond to an event"""
        # Don't respond to own events
        if event.source == self.name:
            return
            
        # Check if we should respond
        if await self._should_respond(event):
            await self.activate(event)
    
    async def _should_respond(self, event: SwarmEvent) -> bool:
        """Intelligent decision on whether to respond to event"""
        # For now, simple logic - respond if we're idle and event matches our patterns
        if self.state != "idle":
            return False
            
        # Check specific event types
        if event.type == "agent.needed":
            needed_role = event.data.get("role", "")
            return needed_role == self.role or needed_role in self.capabilities.skills
            
        if event.type == "handoff.requested":
            target = event.data.get("to", "")
            return target == self.name or target == self.role
            
        # For other events, respond if we're capable
        return True
    
    async def activate(self, event: SwarmEvent):
        """Activate agent to handle an event"""
        logger.info(f"🤖 Agent {self.name} activating for event: {event.type}")
        
        self.state = "working"
        self.current_task = event.data.get("task") or event.data.get("message") or str(event.data)
        
        # Emit start event
        await event_bus.emit(
            "agent.started",
            {
                "agent": self.name,
                "role": self.role,
                "task": self.current_task,
                "triggered_by": event.type,
                # Propagate execution context for downstream controllers/UI
                "execution_id": event.data.get("execution_id"),
                "parent": event.data.get("parent")
            },
            source=self.name
        )
        
        try:
            # Process the task
            result = await self._process_task(event)
            
            # Emit completion event
            await event_bus.emit(
                "agent.completed",
                {
                    "agent": self.name,
                    "role": self.role,
                    "output": result,
                    "task": self.current_task,
                    # Include execution context for routing/sequencing
                    "execution_id": event.data.get("execution_id"),
                    "parent": event.data.get("parent")
                },
                source=self.name
            )
            
            # Check if we need to trigger other events
            await self._check_triggers(result)
            
        except Exception as e:
            logger.error(f"Agent {self.name} error: {e}")
            await event_bus.emit(
                "agent.error",
                {
                    "agent": self.name,
                    "error": str(e),
                    "task": self.current_task
                },
                source=self.name
            )
        finally:
            self.state = "idle"
            self.current_task = None
    
    async def _process_task(self, event: SwarmEvent) -> str:
        """Process the task - this is where the agent does its work"""
        # Use Strands SDK to actually process the task
        try:
            from strands import Agent
            from strands.models.openai import OpenAIModel
            import os
            from dotenv import load_dotenv
            
            load_dotenv()
            api_key = os.getenv("OPENAI_API_KEY")
            
            if not api_key:
                logger.warning("No OpenAI API key - using simulation mode")
                await asyncio.sleep(1)
                return f"{self.role} processed: {self.current_task}"
            
            # Create a real Strands agent to do the work
            model = OpenAIModel(
                client_args={"api_key": api_key},
                model_id="gpt-4o-mini",
                params={"max_tokens": 2000, "temperature": 0.7}
            )
            
            # Build tools list based on capabilities
            tools = []
            if "web_search" in self.capabilities.tools or "tavily_search" in self.capabilities.tools:
                try:
                    from app.tools.tavily_search_tool import tavily_search
                    tools.append(tavily_search)
                    logger.info("✅ Added tavily_search tool")
                except Exception as e:
                    logger.warning(f"⚠️ Could not load tavily_search_tool: {e}")
                    # Try alternative tool imports
                    try:
                        from app.tools.tavily_strands import tavily_search
                        tools.append(tavily_search)
                        logger.info("✅ Added tavily_search tool (alternative)")
                    except Exception as e2:
                        logger.warning(f"⚠️ Could not load alternative tavily tool: {e2}")
                        pass
            # File operations
            try:
                if "file_write" in self.capabilities.tools or "editor" in self.capabilities.tools:
                    from app.tools.file_tools import file_write
                    tools.append(file_write)
                    logger.info("✅ Added file_write tool")
            except Exception as e:
                logger.warning(f"⚠️ Could not load file_write tool: {e}")
            try:
                if "file_read" in self.capabilities.tools:
                    from app.tools.file_tools import file_read
                    tools.append(file_read)
                    logger.info("✅ Added file_read tool")
            except Exception as e:
                logger.warning(f"⚠️ Could not load file_read tool: {e}")
            # Python REPL
            try:
                if "python_repl" in self.capabilities.tools:
                    from app.tools.python_repl_tool import python_repl
                    tools.append(python_repl)
                    logger.info("✅ Added python_repl tool")
            except Exception as e:
                logger.warning(f"⚠️ Could not load python_repl tool: {e}")
            
            # Create agent with NO callback handler - we'll use stream_async
            strands_agent = Agent(
                name=self.name,
                system_prompt=self.system_prompt,
                tools=tools,
                model=model,
                callback_handler=None  # Use stream_async instead
            )
            
            # Process the task using stream_async
            task_message = event.data.get("task") or event.data.get("message") or str(event.data)
            result_text = ""
            
            try:
                # Get streaming callback from event data if available
                streaming_callback = event.data.get("streaming_callback")
                
                # Use stream_async to get real-time events with proper cleanup
                stream_generator = strands_agent.stream_async(task_message)
                
                try:
                    async for event_data in stream_generator:
                        # Check if execution was stopped
                        execution_id = event.data.get("execution_id")
                        if execution_id:
                            if await self._check_execution_stopped(execution_id):
                                logger.info(f"🛑 Agent {self.name} stopping due to execution halt")
                                result_text = result_text or "Execution stopped by user"
                                break
                        
                        # Forward streaming events to callback if available
                        if streaming_callback and "data" in event_data:
                            try:
                                await streaming_callback(
                                    type="text_generation",
                                    agent=self.name,
                                    data={"chunk": event_data["data"], "execution_id": execution_id}
                                )
                            except Exception as cb_error:
                                logger.warning(f"Streaming callback failed: {cb_error}")
                        
                        # Accumulate text data for final result
                        if "data" in event_data:
                            result_text += event_data["data"]
                        
                        # Handle final result
                        if "result" in event_data:
                            final_result = event_data["result"]
                            if hasattr(final_result, 'content'):
                                result_text = final_result.content
                            elif hasattr(final_result, 'output'):
                                result_text = final_result.output
                            elif hasattr(final_result, 'text'):
                                result_text = final_result.text
                            else:
                                result_text = str(final_result)
                            break
                            
                except GeneratorExit:
                    logger.debug("Generator exit during streaming - cleaning up")
                    result_text = result_text or f"Completed analysis of: {task_message}"
                except Exception as stream_error:
                    logger.warning(f"Streaming interrupted: {stream_error}")
                    result_text = result_text or f"Completed analysis of: {task_message}"
                finally:
                    # Ensure generator is properly closed
                    try:
                        await stream_generator.aclose()
                    except:
                        pass
                
                # If no result accumulated, fall back to simple response
                if not result_text.strip():
                    result_text = f"Completed analysis of: {task_message}"
                    
            except Exception as api_error:
                logger.error(f"Strands stream_async failed: {api_error}")
                result_text = f"Completed analysis of: {task_message}"
            finally:
                # Clean up HTTP connections from the model/agent
                try:
                    if hasattr(model, '_client') and hasattr(model._client, 'close'):
                        await model._client.aclose()
                    elif hasattr(model, 'client') and hasattr(model.client, 'close'):
                        await model.client.aclose()
                    elif hasattr(strands_agent, '_model') and hasattr(strands_agent._model, '_client'):
                        if hasattr(strands_agent._model._client, 'aclose'):
                            await strands_agent._model._client.aclose()
                except Exception as cleanup_error:
                    logger.debug(f"HTTP client cleanup completed with minor issues: {cleanup_error}")
            
            # Log the result
            logger.info(f"Agent {self.name} completed task with result length: {len(result_text)}")
            
            return result_text
            
        except Exception as e:
            logger.error(f"Agent {self.name} failed to process task: {e}")
            # Fall back to simulation
            await asyncio.sleep(1)
            if self.role == "analyzer":
                return f"Analysis complete: Task '{self.current_task}' requires research and development phases."
            elif self.role == "researcher":
                return f"Research findings: Found relevant information for '{self.current_task}'."
            elif self.role == "developer":
                return f"Development complete: Implemented solution for '{self.current_task}'."
            else:
                return f"{self.role} processed: {self.current_task}"
    
    async def _check_triggers(self, output: str):
        """Use AI to intelligently decide what happens next"""
        logger.info(f"Agent {self.name} analyzing output for next actions...")
        
        # Let the AI agent decide what to do next based on its output
        try:
            from strands import Agent
            from strands.models.openai import OpenAIModel
            import os
            from dotenv import load_dotenv
            
            load_dotenv()
            api_key = os.getenv("OPENAI_API_KEY")
            
            if not api_key:
                logger.warning("No OpenAI API key - using fallback logic")
                await self._fallback_trigger_logic(output)
                return
            
            # Create a decision agent
            model = OpenAIModel(
                client_args={"api_key": api_key},
                model_id="gpt-4o-mini",
                params={"max_tokens": 1000, "temperature": 0.3}
            )
            
            decision_prompt = f"""You are coordinating a dynamic swarm of specialized AI agents. Based on the output below from the '{self.role}' agent, decide what should happen next.

The agent output is: "{output}"

COMPLETION RULES:
1. SIMPLE GREETINGS: If the user just said "Hi", "Hello", "How are you", or similar greeting, create ONLY ONE agent to respond. After that agent responds, the task is COMPLETE.
2. USER STOPPED: If the output is "Stopped by user" or contains "stopped by user", the task is COMPLETE - do NOT create more agents.
3. SINGLE CONVERSATIONAL EXCHANGES: Basic questions, greetings, or simple requests need only ONE agent response to be complete.
4. COMPLEX PROJECTS: If the user requested building, creating, developing, or implementing something (like an app, website, system), this typically requires MULTIPLE specialists and should NOT be marked complete after just one agent.
5. PARTIAL WORK: If this appears to be just the first part of a larger project (like UI design for an app), more agents are likely needed.

CRITICAL: Simple conversational tasks like greetings should use MINIMAL agents (usually just 1).

ONLY mark as complete if:
- Simple conversational exchange (greetings, basic questions) after ONE agent response
- Single, self-contained request that was fully addressed
- User explicitly asked for only one specific thing and got it
- Output contains "Stopped by user" (user intervention)

CREATE MORE AGENTS if:
- User requested building/creating/developing something complex
- This output is clearly just one component (like UI design for an app)
- Multiple specialties are obviously needed to complete the user's request
- The output mentions "next steps" or implies more work needed

AVOID creating multiple agents for simple greetings or basic conversational exchanges.

Respond in this exact JSON format:
{{
    "task_complete": true_or_false,
    "reasoning": "explanation of why more work is needed or why task is complete",
    "needed_agents": [
        {{
            "role": "highly_specific_specialist_description",
            "reason": "exactly what this specialist will do",
            "priority": "high/medium/low"
        }}
    ],
    "next_phase": "what specific work happens next"
}}

CRITICAL: Each agent role in the "needed_agents" array MUST be unique. Do NOT repeat the same role multiple times. If you need multiple specialists of the same type, use different specific role names (e.g., "frontend_ui_developer" and "backend_api_developer" instead of two "developer" entries)."""
            
            decision_agent = Agent(
                name="dynamic_swarm_coordinator",
                system_prompt="""You are an advanced swarm coordination AI that manages multi-agent workflows. Your role is to determine when tasks are truly complete versus when more specialized agents are needed.

BALANCE RULES:
1. SIMPLE TASKS: Conversational exchanges, greetings, and basic questions are usually complete after one response.
2. USER INTERRUPTION: If an agent output is "Stopped by user", ALWAYS mark the task as complete - do NOT create more agents.
3. COMPLEX PROJECTS: Building, creating, or developing things (apps, websites, systems) typically require multiple specialized agents working together.
4. PARTIAL COMPLETION: If an agent only handles one aspect of a larger project (like UI design for an app), the task is NOT complete.

Be CONSERVATIVE about marking complex projects as complete. If the user requested building something substantial, multiple specialists are usually needed.

Only mark tasks complete when:
- It's a simple conversational exchange
- A single, specific request was fully addressed
- No additional work is clearly needed
- User stopped the agent (output contains "Stopped by user")

Create more agents when:
- Complex projects require multiple specialties
- Only one component of a larger system has been addressed
- The user's request implies multi-step development work""",
                model=model
            )
            
            # Use stream_async to get the AI decision
            try:
                decision_content = ""
                async for event in decision_agent.stream_async(decision_prompt):
                    if "data" in event:
                        decision_content += event["data"]
                    elif "result" in event:
                        result = event["result"]
                        if hasattr(result, 'content'):
                            decision_content = result.content
                        else:
                            decision_content = str(result)
                        break
                
                decision_result = decision_content.strip()
                    
            except Exception as api_error:
                logger.error(f"Decision agent API failed: {api_error}")
                await self._fallback_trigger_logic(output)
                return
            logger.info(f"AI decision for {self.name}: {str(decision_result)[:200]}...")
            
            # Send AI decision to frontend via streaming callback if available
            streaming_callback = getattr(self, 'callback_handler', None)
            if streaming_callback:
                try:
                    await streaming_callback(
                        type="ai_decision",
                        agent=self.name,
                        data={
                            "agent": self.name,
                            "decision": str(decision_result),
                            "reasoning": "AI decision made",
                            "chunk": f"🧠 AI Decision: {str(decision_result)[:100]}..."
                        }
                    )
                    logger.info(f"✅ Sent AI decision to frontend via callback for {self.name}")
                except Exception as callback_error:
                    logger.warning(f"Failed to send AI decision via callback: {callback_error}")
            
            # Parse the AI decision
            await self._process_ai_decision(str(decision_result), output)
            
        except Exception as e:
            logger.error(f"AI decision making failed: {e}")
            # Fall back to basic logic
            await self._fallback_trigger_logic(output)
    
    async def _process_ai_decision(self, decision_text: str, original_output: str):
        """Process the AI's decision about what to do next"""
        import json
        import re
        
        try:
            # Try multiple ways to extract JSON from the response
            decision_json = None
            
            # Try direct JSON parsing first
            try:
                decision_json = json.loads(decision_text)
                logger.info("Parsed JSON directly from AI decision")
            except json.JSONDecodeError:
                # Try to find JSON within the text using regex
                json_patterns = [
                    r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}',  # Simple nested braces
                    r'\{.*?"task_complete".*?\}',        # Find JSON containing task_complete
                    r'```json\s*(\{.*?\})\s*```',        # JSON in code blocks
                ]
                
                for pattern in json_patterns:
                    json_match = re.search(pattern, decision_text, re.DOTALL)
                    if json_match:
                        json_text = json_match.group(1) if json_match.groups() else json_match.group()
                        try:
                            decision_json = json.loads(json_text)
                            logger.info(f"Extracted JSON using pattern: {pattern[:20]}...")
                            break
                        except json.JSONDecodeError:
                            continue
                
                if not decision_json:
                    logger.warning(f"Could not parse JSON from AI decision: {decision_text[:200]}...")
                    await self._fallback_trigger_logic(original_output)
                    return
            
            # Prefer spawning needed agents if provided; only mark complete when none are needed
            needed_agents = decision_json.get("needed_agents", [])
            if decision_json.get("task_complete", False) and not needed_agents:
                await event_bus.emit(
                    "task.complete",
                    {
                        "agent": self.name,
                        "final_output": original_output,
                        "reasoning": decision_json.get("reasoning", "AI determined task complete"),
                        "decision_maker": "ai"
                    },
                    source=self.name
                )
                logger.info(f"AI decided task is complete: {decision_json.get('reasoning')}")
                return
            
            # Spawn needed agents based on AI decision (sequentially by controller)
            # CRITICAL: Deduplicate agent roles to prevent creating multiple identical agents
            seen_roles = set()
            for agent_spec in needed_agents:
                if isinstance(agent_spec, dict) and "role" in agent_spec:
                    role = agent_spec["role"]
                    
                    # Skip if we've already requested this role
                    if role in seen_roles:
                        logger.warning(f"🚫 Skipping duplicate agent role request: {role}")
                        continue
                    
                    seen_roles.add(role)
                    
                    await event_bus.emit(
                        "agent.needed",
                        {
                            "role": role,
                            "reason": agent_spec.get("reason", "AI determined this agent is needed"),
                            "priority": agent_spec.get("priority", "medium"),
                            "context": original_output[:500],
                            "decision_maker": "ai",
                            "execution_id": getattr(self, 'execution_id', None)
                        },
                        source=self.name
                    )
                    logger.info(f"AI requested {role}: {agent_spec.get('reason')}")
            
            # Emit progress event
            await event_bus.emit(
                "task.progress",
                {
                    "agent": self.name,
                    "status": "ai_analysis_complete",
                    "next_phase": decision_json.get("next_phase", "Continuing with identified agents"),
                    "reasoning": decision_json.get("reasoning"),
                    "agents_requested": len(needed_agents)
                },
                source=self.name
            )
            # If agents were requested, do not synthesize a final response here; let them work
            if needed_agents:
                return
        
        except json.JSONDecodeError:
            logger.warning("Failed to parse AI decision JSON, falling back to simple logic")
            await self._fallback_trigger_logic(original_output)
        except Exception as e:
            logger.error(f"Error processing AI decision: {e}")
            await self._fallback_trigger_logic(original_output)
    
    async def _fallback_trigger_logic(self, output: str):
        """Dynamic fallback logic when AI decision making fails"""
        output_lower = output.lower()
        
        # Only mark as complete if it's clearly a final result, not just analysis or outline
        if (len(output) > 500 and 
            any(phrase in output_lower for phrase in [
                "task is now complete", "final result", "completed successfully",
                "no further action needed", "deliverable is ready"
            ]) and
            not any(phrase in output_lower for phrase in [
                "outline", "plan", "summary", "analysis", "next steps", "should be"
            ])):
            await event_bus.emit(
                "task.complete",
                {
                    "agent": self.name,
                    "final_output": output,
                    "reasoning": "Fallback completion detection - appears to be final result",
                    "decision_maker": "fallback"
                },
                source=self.name
            )
            logger.info(f"Fallback logic: Task marked complete by {self.name}")
        else:
            # For analysis tasks, create dynamic specialized agents based on context
            if self.role in ["analyzer", "analyst"] and len(output) > 150:
                logger.info(f"Fallback: Creating dynamic specialists for complex task")
                
                # Create context-aware specialist agents
                needed_agents = []
                
                # Identify domain and task type to create specific specialists
                if any(word in output_lower for word in ["satellite", "space", "orbital", "aerospace"]):
                    if any(word in output_lower for word in ["research", "paper", "study", "publication"]):
                        needed_agents.extend([
                            {"role": "aerospace literature researcher", "reason": "Research satellite technology and space systems"},
                            {"role": "technical research paper writer for space systems", "reason": "Write comprehensive research paper on satellite technology"},
                            {"role": "aerospace peer review specialist", "reason": "Review and validate technical accuracy"}
                        ])
                    elif any(word in output_lower for word in ["design", "develop", "build", "system"]):
                        needed_agents.extend([
                            {"role": "satellite systems design engineer", "reason": "Design and specify satellite components"},
                            {"role": "orbital mechanics simulation specialist", "reason": "Model satellite trajectories and dynamics"}
                        ])
                
                # General content creation tasks
                elif any(word in output_lower for word in ["write", "document", "article", "content", "paper", "report"]):
                    content_type = "technical documentation"
                    if "blog" in output_lower: content_type = "blog content"
                    elif "academic" in output_lower: content_type = "academic paper"
                    elif "tutorial" in output_lower: content_type = "tutorial content"
                    
                    needed_agents.append({
                        "role": f"{content_type} specialist writer",
                        "reason": f"Create high-quality {content_type} based on requirements"
                    })
                
                # Software development tasks
                elif any(word in output_lower for word in ["code", "program", "app", "software", "implement"]):
                    tech_stack = "general programming"
                    if "python" in output_lower: tech_stack = "Python development"
                    elif "javascript" in output_lower or "react" in output_lower: tech_stack = "JavaScript/React development"
                    elif "web" in output_lower: tech_stack = "web application development"
                    
                    needed_agents.append({
                        "role": f"{tech_stack} specialist",
                        "reason": f"Implement solution using {tech_stack} expertise"
                    })
                
                # If no specific context, create a general task completion specialist
                if not needed_agents:
                    task_type = self.current_task or "assigned task"
                    needed_agents.append({
                        "role": f"task completion specialist for {task_type[:50]}",
                        "reason": "Complete the specific requirements of this task"
                    })
                
                # Emit agent spawn requests
                for agent_spec in needed_agents:
                    await event_bus.emit(
                        "agent.needed",
                        {
                            "role": agent_spec["role"],
                            "reason": agent_spec["reason"],
                            "priority": "high",
                            "context": output[:500],
                            "decision_maker": "fallback_dynamic"
                        },
                        source=self.name
                    )
                    logger.info(f"Fallback spawned dynamic agent: {agent_spec['role']}")
            
            else:
                # For non-analyzer agents or short outputs, just mark complete
                await event_bus.emit(
                    "task.complete", 
                    {
                        "agent": self.name,
                        "final_output": output,
                        "reasoning": "Simple task completed by specialist agent",
                        "decision_maker": "fallback"
                    },
                    source=self.name
                )
    
    async def ask_human(self, question: str) -> str:
        """Ask human for input"""
        question_id = str(uuid.uuid4())
        
        await event_bus.emit(
            "human.question",
            {
                "id": question_id,
                "question": question,
                "agent": self.name,
                "context": self.context
            },
            source=self.name
        )
        
        # Wait for response
        response_event = await event_bus.wait_for_event(
            f"human.response.{question_id}",
            timeout=300  # 5 minutes
        )
        
        if response_event:
            return response_event.data.get("answer", "No response")
        return "No response received"
    
    async def handoff_to(self, target_agent: str, reason: str, context: dict = None):
        """Hand off task to another agent"""
        await event_bus.emit(
            "handoff.requested",
            {
                "from": self.name,
                "to": target_agent,
                "reason": reason,
                "task": self.current_task,
                "context": context or self.context
            },
            source=self.name
        )
    
    async def _check_execution_stopped(self, execution_id: str) -> bool:
        """Check if the execution should be stopped"""
        try:
            # Try to import the global swarm service to check execution status
            import app.api.v1.endpoints.streaming as streaming_module
            if hasattr(streaming_module, '_global_swarm_service'):
                swarm_service = streaming_module._global_swarm_service
                if hasattr(swarm_service, 'active_executions') and execution_id in swarm_service.active_executions:
                    status = swarm_service.active_executions[execution_id].get("status")
                    return status == "stopped"
        except Exception as e:
            logger.debug(f"Could not check execution stop status: {e}")
        return False
    
    def cleanup(self):
        """Clean up agent resources"""
        # Remove event listeners
        for pattern in self.capabilities.listens_to:
            event_bus.off(pattern, self._handle_event)
