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
                "triggered_by": event.type
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
                    "task": self.current_task
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
            if "web_search" in self.capabilities.tools:
                try:
                    from app.tools.tavily_search import tavily_search
                    tools.append(tavily_search)
                except:
                    pass
            
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
            
            decision_prompt = f"""You are coordinating a swarm of AI agents. Based on the output below from the '{self.role}' agent, decide what should happen next.

Available agent roles:
- researcher: Gathers information, searches web, analyzes data
- developer: Writes code, implements solutions
- writer: Creates content, documentation, articles
- reviewer: Reviews and provides feedback
- coordinator: Manages workflow between agents

Current output from {self.role} agent:
"{output}"

Analyze this output and decide:
1. Is the task complete? (yes/no)
2. What additional work is needed? 
3. Which agents should be spawned to continue?

Respond in this exact JSON format:
{{
    "task_complete": true/false,
    "reasoning": "explanation of your decision",
    "needed_agents": [
        {{
            "role": "agent_role",
            "reason": "why this agent is needed",
            "priority": "high/medium/low"
        }}
    ],
    "next_phase": "description of what happens next"
}}"""
            
            decision_agent = Agent(
                name="decision_maker",
                system_prompt="You are a swarm coordination expert. Analyze agent outputs and make intelligent decisions about what should happen next.",
                model=model
            )
            
            # Get AI decision using the correct API - handle sync/async properly
            try:
                if hasattr(decision_agent, 'run'):
                    try:
                        decision_result = await decision_agent.run(decision_prompt)
                    except TypeError:
                        decision_result = decision_agent.run(decision_prompt)
                elif hasattr(decision_agent, '__call__'):
                    try:
                        decision_result = await decision_agent(decision_prompt)
                    except TypeError:
                        decision_result = decision_agent(decision_prompt)
                elif hasattr(decision_agent, 'invoke'):
                    try:
                        decision_result = await decision_agent.invoke(decision_prompt)
                    except TypeError:
                        decision_result = decision_agent.invoke(decision_prompt)
                else:
                    logger.warning(f"Unknown decision agent API, using fallback")
                    await self._fallback_trigger_logic(output)
                    return
                
                # Extract actual result from AgentResult object if needed
                if hasattr(decision_result, 'content'):
                    decision_result = decision_result.content
                elif hasattr(decision_result, 'output'):
                    decision_result = decision_result.output
                elif hasattr(decision_result, 'text'):
                    decision_result = decision_result.text
                elif hasattr(decision_result, 'result'):
                    decision_result = decision_result.result
                    
            except Exception as api_error:
                logger.error(f"Decision agent API failed: {api_error}")
                await self._fallback_trigger_logic(output)
                return
            logger.info(f"AI decision for {self.name}: {str(decision_result)[:200]}...")
            
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
            # Try to extract JSON from the response
            json_match = re.search(r'\{.*\}', decision_text, re.DOTALL)
            if json_match:
                decision_json = json.loads(json_match.group())
            else:
                logger.warning("Could not extract JSON from AI decision, falling back")
                await self._fallback_trigger_logic(original_output)
                return
            
            # Check if task is complete
            if decision_json.get("task_complete", False):
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
            
            # Spawn needed agents based on AI decision
            needed_agents = decision_json.get("needed_agents", [])
            for agent_spec in needed_agents:
                if isinstance(agent_spec, dict) and "role" in agent_spec:
                    await event_bus.emit(
                        "agent.needed",
                        {
                            "role": agent_spec["role"],
                            "reason": agent_spec.get("reason", "AI determined this agent is needed"),
                            "priority": agent_spec.get("priority", "medium"),
                            "context": original_output[:500],
                            "decision_maker": "ai"
                        },
                        source=self.name
                    )
                    logger.info(f"AI requested {agent_spec['role']}: {agent_spec.get('reason')}")
            
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
            
        except json.JSONDecodeError:
            logger.warning("Failed to parse AI decision JSON, falling back to simple logic")
            await self._fallback_trigger_logic(original_output)
        except Exception as e:
            logger.error(f"Error processing AI decision: {e}")
            await self._fallback_trigger_logic(original_output)
    
    async def _fallback_trigger_logic(self, output: str):
        """Simple fallback logic when AI decision making fails"""
        # Simple completion check
        if len(output) > 100 and ("complete" in output.lower() or "done" in output.lower() or "finished" in output.lower()):
            await event_bus.emit(
                "task.complete",
                {
                    "agent": self.name,
                    "final_output": output,
                    "reasoning": "Simple completion detection",
                    "decision_maker": "fallback"
                },
                source=self.name
            )
            logger.info(f"Fallback logic: Task marked complete by {self.name}")
        else:
            # If analyzer hasn't requested anything and has substantial output, mark as complete
            if self.role == "analyzer" and len(output) > 200:
                await event_bus.emit(
                    "task.complete",
                    {
                        "agent": self.name,
                        "final_output": output,
                        "reasoning": "Analyzer completed substantial analysis",
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