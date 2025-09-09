"""
Enhanced Event-Aware Agent with Human-in-the-Loop and Memory
"""
import asyncio
import uuid
import logging
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict

from app.services.event_bus import event_bus, SwarmEvent
from app.services.event_aware_agent import EventAwareAgent, AgentCapabilities

logger = logging.getLogger(__name__)

@dataclass
class AgentMemory:
    """Persistent memory for agent context"""
    agent_id: str
    execution_id: str
    conversation_history: List[Dict[str, Any]]
    context_data: Dict[str, Any]
    decisions_made: List[Dict[str, Any]]
    human_interactions: List[Dict[str, Any]]
    created_at: str
    updated_at: str
    
    def to_dict(self):
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: dict):
        return cls(**data)

class HumanLoopAgent(EventAwareAgent):
    """Event-aware agent with human-in-the-loop and memory capabilities"""
    
    def __init__(
        self, 
        name: str, 
        role: str,
        system_prompt: str,
        capabilities: AgentCapabilities,
        execution_id: str,
        model_config: dict = None,
        memory_store=None
    ):
        super().__init__(name, role, system_prompt, capabilities, model_config)
        self.execution_id = execution_id
        self.memory_store = memory_store  # Will be injected by the factory
        self.memory: AgentMemory = self._initialize_memory()
        self.pending_human_requests: Dict[str, Dict] = {}
        self.callback_handler = None  # Will be set by ControlledSwarmService
        self._chunk_sequence = 0  # Sequence counter for ordered streaming
        
    def _is_stopped(self) -> bool:
        """Cooperative stop check using streaming module service registry."""
        try:
            import app.api.v1.endpoints.streaming as streaming_module
            exec_id = self.execution_id
            svc = None
            if hasattr(streaming_module, '_services_by_session'):
                svc = streaming_module._services_by_session.get(exec_id)
            if not svc and hasattr(streaming_module, '_global_swarm_service'):
                svc = streaming_module._global_swarm_service
            if svc and hasattr(svc, 'active_executions'):
                status = svc.active_executions.get(exec_id, {}).get('status')
                return status == 'stopped'
        except Exception:
            pass
        return False

    def _initialize_memory(self) -> AgentMemory:
        """Initialize or load agent memory"""
        if self.memory_store:
            # Try to load existing memory
            existing_memory = self.memory_store.get_agent_memory(self.id, self.execution_id)
            if existing_memory:
                return AgentMemory.from_dict(existing_memory)
        
        # Create new memory
        return AgentMemory(
            agent_id=self.id,
            execution_id=self.execution_id,
            conversation_history=[],
            context_data={},
            decisions_made=[],
            human_interactions=[],
            created_at=datetime.utcnow().isoformat(),
            updated_at=datetime.utcnow().isoformat()
        )
    
    async def _process_task(self, event: SwarmEvent) -> str:
        """Enhanced task processing with memory and human interaction"""
        logger.info(f"🤖 HumanLoopAgent {self.name} processing task: {event.data.get('task', 'Unknown')}")
        if self._is_stopped():
            logger.info(f"🛑 HumanLoopAgent {self.name} stop requested; skipping processing")
            return "Stopped by user"
        
        # Update memory with new task
        task_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "event_type": event.type,
            "task": event.data.get("task") or event.data.get("message") or str(event.data),
            "source": event.source
        }
        self.memory.conversation_history.append(task_data)
        self._save_memory()
        
        # Get context from previous agents in this execution
        context = await self._get_execution_context(event)
        
        # Check if we need human approval before proceeding
        logger.info(f"🔍 HumanLoopAgent {self.name} checking if human approval needed...")
        if self._is_stopped():
            logger.info(f"🛑 HumanLoopAgent {self.name} stop requested before approval check")
            return "Stopped by user"
        if await self._should_ask_human_approval(event):
            logger.info(f"✋ HumanLoopAgent {self.name} requesting human approval...")
            approval = await self._request_human_approval(event)
            if not approval:
                logger.info(f"❌ HumanLoopAgent {self.name} task cancelled by user")
                return "Task cancelled by user"
            else:
                logger.info(f"✅ HumanLoopAgent {self.name} approved by user, proceeding...")
        else:
            logger.info(f"➡️ HumanLoopAgent {self.name} proceeding without human approval")
        
        # Proceed with task processing using our own implementation
        if self._is_stopped():
            logger.info(f"🛑 HumanLoopAgent {self.name} stop requested before task execution")
            return "Stopped by user"
        result = await self._process_task_with_context(event, context)
        
        # Send completion signal (result already streamed in real-time via callback)
        if self.callback_handler:
            logger.info(f"🔄 Agent {self.name} completed with {len(result)} characters")
            await self.callback_handler(
                type="agent_completed",
                agent=self.name,
                data={
                    "output": result,
                    "execution_id": self.execution_id,
                    "tokens": len(result.split()) if result else 0
                }
            )
        else:
            logger.warning(f"⚠️ No callback handler available for completion signal")
        
        # Check if the agent's response indicates they need human input
        await self._check_for_human_questions(result)
        
        # Update memory with result
        result_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "result": result,
            "task_completed": True
        }
        self.memory.conversation_history.append(result_data)
        self._save_memory()
        
        return result
    
    async def _should_ask_human_approval(self, event: SwarmEvent) -> bool:
        """Use AI to intelligently determine if human approval is needed"""
        task = event.data.get("task", "")
        
        # Use AI to make intelligent decisions about when to ask for approval
        try:
            from strands import Agent
            from strands.models.openai import OpenAIModel
            import os
            from dotenv import load_dotenv
            
            load_dotenv()
            api_key = os.getenv("OPENAI_API_KEY")
            
            if not api_key:
                # Fallback: ask for approval on most tasks for testing
                return len(task) > 10  # Very low threshold for testing
            
            # Create a decision agent to intelligently determine if approval is needed
            model = OpenAIModel(
                client_args={"api_key": api_key},
                model_id="gpt-4o-mini",
                params={"max_tokens": 100, "temperature": 0.1}
            )
            
            decision_agent = Agent(
                name="approval_decision_agent",
                system_prompt="""You are an intelligent decision agent that determines when human approval is needed for CRITICAL tasks only.

ONLY require human approval for HIGH-RISK operations:
1. Executing system commands or shell scripts
2. Making network requests or API calls to external services
3. File system operations (creating, deleting, modifying files)
4. Database operations or data manipulation
5. Installing packages or dependencies
6. Running code or scripts
7. Making irreversible changes

DO NOT require approval for:
- Basic text generation (writing documentation, code snippets)
- Analysis and planning tasks
- Information processing and formatting
- Creating text-based content
- Regular development tasks like writing code
- Reviewing or analyzing existing content

The human-in-the-loop should be for CRITICAL decisions, not routine tasks.

Respond with ONLY "YES" if human approval is needed for critical operations, or "NO" if the agent can proceed independently.

DEFAULT: When in doubt, answer NO (let agents work autonomously).""",
                model=model
            )
            
            decision_prompt = f"""Task to analyze: "{task}"

Agent context:
- Agent: {self.name} ({self.role})
- Previous interactions: {len(self.memory.human_interactions)}
- Task history: {len(self.memory.conversation_history)}

Should this task require human approval before proceeding? Answer YES or NO."""
            
            # Get AI decision
            try:
                if hasattr(decision_agent, 'run'):
                    result = await decision_agent.run(decision_prompt)
                else:
                    result = decision_agent(decision_prompt)
                
                # Extract decision from result
                if hasattr(result, 'content'):
                    decision = result.content.strip().upper()
                elif hasattr(result, 'output'):
                    decision = result.output.strip().upper()
                else:
                    decision = str(result).strip().upper()
                
                needs_approval = "YES" in decision
                
                # Record this decision in memory
                self.record_decision(
                    decision=f"Human approval {'required' if needs_approval else 'not required'}",
                    reasoning=f"AI analysis of task: {task[:100]}...",
                    outcome=f"Decision: {'YES' if needs_approval else 'NO'}"
                )
                
                return needs_approval
                
            except Exception as e:
                logger.error(f"AI decision failed: {e}")
                # Fallback to always request approval for testing/development
                logger.info("🔄 AI decision failed, defaulting to requesting human approval")
                return True
                
        except Exception as e:
            logger.error(f"Approval decision system failed: {e}")
            # Conservative fallback - always request approval for testing/development
            logger.info("🔄 Entire approval decision system failed, defaulting to requesting human approval")
            return True
    
    async def _request_human_approval(self, event: SwarmEvent) -> bool:
        """Request human approval using Strands handoff_to_user pattern"""
        try:
            # Import handoff_to_user tool
            from strands_tools import handoff_to_user
            from strands import Agent
            from strands.models.openai import OpenAIModel
            import os
            from dotenv import load_dotenv
            
            load_dotenv()
            api_key = os.getenv("OPENAI_API_KEY")
            
            if not api_key:
                logger.warning("No OpenAI API key - auto-approving task")
                return True
            
            # Create agent with handoff tool
            model = OpenAIModel(
                client_args={"api_key": api_key},
                model_id="gpt-4o-mini",
                params={"max_tokens": 1000, "temperature": 0.3}
            )
            
            approval_agent = Agent(
                name=f"approval_agent_{self.name}",
                tools=[handoff_to_user],
                model=model
            )
            
            task = event.data.get("task", "")
            approval_message = f"""
🤖 Agent Request for Approval

Agent: {self.name} ({self.role})
Execution: {self.execution_id}

Task: {task}

Context from memory:
- Previous tasks: {len(self.memory.conversation_history)}
- Human interactions: {len(self.memory.human_interactions)}

This task may require human oversight. 

Type 'approve' to proceed, 'deny' to cancel, or 'modify: <instructions>' to provide guidance.
"""
            
            # Create human request ID
            request_id = str(uuid.uuid4())
            self.pending_human_requests[request_id] = {
                "event": event,
                "timestamp": datetime.utcnow().isoformat(),
                "status": "pending"
            }
            
            # Use session_id from event data if available, otherwise fall back to execution_id
            session_id = event.data.get("session_id") if event and hasattr(event, 'data') else None
            effective_execution_id = session_id or self.execution_id
            logger.info(f"🔗 Using execution_id for human approval: {effective_execution_id} (session_id: {session_id}, original: {self.execution_id})")
            
            # Emit human approval request event
            await event_bus.emit(
                "human.approval.needed",
                {
                    "id": request_id,
                    "agent": self.name,
                    "execution_id": effective_execution_id,
                    "session_id": session_id,  # Include both for compatibility
                    "task": task,
                    "message": approval_message,
                    "approval_type": "task_execution"
                },
                source=self.name
            )
            
            # Wait for human response with cooperative stop polling
            response_event = None
            total_wait = 0.0
            interval = 0.25
            max_wait = 300.0
            while total_wait < max_wait:
                if self._is_stopped():
                    logger.info(f"🛑 HumanLoopAgent {self.name} stop requested during approval wait")
                    return False
                response_event = await event_bus.wait_for_event(
                    f"human.approval.response.{request_id}",
                    timeout=interval
                )
                if response_event:
                    break
                total_wait += interval
            
            if response_event:
                response = response_event.data.get("response", "").lower()
                
                # Record human interaction
                interaction = {
                    "timestamp": datetime.utcnow().isoformat(),
                    "type": "approval_request",
                    "request": approval_message,
                    "response": response,
                    "approved": "approve" in response
                }
                self.memory.human_interactions.append(interaction)
                self._save_memory()
                
                # Clean up pending request
                if request_id in self.pending_human_requests:
                    del self.pending_human_requests[request_id]
                
                if "approve" in response:
                    return True
                elif "modify:" in response:
                    # Extract modification instructions
                    modification = response.split("modify:", 1)[1].strip()
                    # Update task with human guidance
                    event.data["task"] = f"{task}\n\nHuman guidance: {modification}"
                    return True
                else:
                    return False
            else:
                logger.warning(f"No approval response received for {request_id}")
                # Auto-approve after timeout
                return True
                
        except Exception as e:
            logger.error(f"Human approval request failed: {e}")
            # Default to approval if system fails
            return True
    
    async def ask_human_question(self, question: str, context: Dict = None) -> str:
        """Ask human a question and wait for response"""
        question_id = str(uuid.uuid4())
        
        question_data = {
            "id": question_id,
            "question": question,
            "agent": self.name,
            "execution_id": self.execution_id,
            "context": context or {},
            "memory_context": {
                "previous_interactions": len(self.memory.human_interactions),
                "conversation_length": len(self.memory.conversation_history)
            }
        }
        
        await event_bus.emit(
            "human.question",
            question_data,
            source=self.name
        )
        
        # Wait for response
        response_event = await event_bus.wait_for_event(
            f"human.response.{question_id}",
            timeout=300  # 5 minutes
        )
        
        response_text = "No response received"
        if response_event:
            response_text = response_event.data.get("answer", "No response")
        
        # Record interaction in memory
        interaction = {
            "timestamp": datetime.utcnow().isoformat(),
            "type": "question",
            "question": question,
            "response": response_text,
            "context": context or {}
        }
        self.memory.human_interactions.append(interaction)
        self._save_memory()
        
        return response_text
    
    async def request_human_handoff(self, reason: str, complete_handoff: bool = False) -> bool:
        """Request human takeover using Strands pattern"""
        try:
            from strands_tools import handoff_to_user
            from strands import Agent
            from strands.models.openai import OpenAIModel
            import os
            from dotenv import load_dotenv
            
            load_dotenv()
            api_key = os.getenv("OPENAI_API_KEY")
            
            if not api_key:
                logger.warning("No OpenAI API key - cannot perform handoff")
                return False
            
            # Create agent with handoff tool
            model = OpenAIModel(
                client_args={"api_key": api_key},
                model_id="gpt-4o-mini",
                params={"max_tokens": 500}
            )
            
            handoff_agent = Agent(
                name=f"handoff_agent_{self.name}",
                tools=[handoff_to_user],
                model=model
            )
            
            handoff_message = f"""
🔄 Agent Handoff Request

Agent: {self.name} ({self.role})
Execution: {self.execution_id}
Reason: {reason}

Memory Summary:
- Tasks completed: {len([h for h in self.memory.conversation_history if h.get('task_completed')])}
- Human interactions: {len(self.memory.human_interactions)}
- Current context: {self.memory.context_data}

{'Complete handoff - Agent will stop execution.' if complete_handoff else 'Temporary handoff - Agent will continue after your input.'}
"""
            
            # Emit handoff event
            handoff_id = str(uuid.uuid4())
            await event_bus.emit(
                "human.handoff.requested",
                {
                    "id": handoff_id,
                    "agent": self.name,
                    "execution_id": self.execution_id,
                    "reason": reason,
                    "message": handoff_message,
                    "complete_handoff": complete_handoff
                },
                source=self.name
            )
            
            if complete_handoff:
                # Stop agent execution
                self.state = "handed_off"
                return True
            else:
                # Wait for continuation signal
                continue_event = await event_bus.wait_for_event(
                    f"human.handoff.continue.{handoff_id}",
                    timeout=600  # 10 minutes for manual tasks
                )
                return continue_event is not None
                
        except Exception as e:
            logger.error(f"Human handoff failed: {e}")
            return False
    
    def _save_memory(self):
        """Save agent memory to storage"""
        if self.memory_store:
            self.memory.updated_at = datetime.utcnow().isoformat()
            try:
                self.memory_store.save_agent_memory(
                    self.id, 
                    self.execution_id, 
                    self.memory.to_dict()
                )
            except Exception as e:
                logger.error(f"Failed to save agent memory: {e}")
    
    def get_memory_context(self) -> Dict[str, Any]:
        """Get formatted memory context for AI processing"""
        return {
            "conversation_history": self.memory.conversation_history[-5:],  # Last 5 interactions
            "recent_decisions": self.memory.decisions_made[-3:],  # Last 3 decisions
            "human_interactions": self.memory.human_interactions,
            "context_data": self.memory.context_data,
            "execution_id": self.execution_id
        }
    
    def add_context_data(self, key: str, value: Any):
        """Add data to agent context memory"""
        self.memory.context_data[key] = value
        self._save_memory()
    
    async def _check_for_human_questions(self, agent_response: str):
        """Check if agent response contains implicit requests for human input"""
        question_patterns = [
            "I need clarification on",
            "Should I proceed with",
            "What are your preferences for",
            "Would you like me to",
            "How would you prefer",
            "Which option would you choose",
            "What's the best approach",
            "I'm unsure about"
        ]
        
        response_lower = agent_response.lower()
        for pattern in question_patterns:
            if pattern.lower() in response_lower:
                # Extract the question context
                lines = agent_response.split('\n')
                question_line = None
                for line in lines:
                    if pattern.lower() in line.lower():
                        question_line = line.strip()
                        break
                
                if question_line:
                    # Ask the human question
                    human_response = await self.ask_human_question(
                        question=question_line,
                        context={"agent_response": agent_response[:500]}
                    )
                    
                    # The human response is automatically recorded in ask_human_question
                    logger.info(f"Agent {self.name} asked human question and received response")
                    break

    async def _get_execution_context(self, event: SwarmEvent) -> str:
        """Get context from previous agents in this execution"""
        execution_id = event.data.get("execution_id", self.execution_id)
        
        try:
            # First, try to get accumulated results from the context if passed by ControlledSwarmService
            context_data = event.data.get("context", {})
            accumulated_results = context_data.get("accumulated_results", [])
            
            if accumulated_results:
                logger.info(f"🔗 Using accumulated_results from context: {len(accumulated_results)} results")
                context_parts = []
                for i, result in enumerate(accumulated_results[-3:]):  # Last 3 results
                    context_parts.append(f"Previous Agent {i+1} Output:\n{result}\n")
                return "\n".join(context_parts)
            
            # Fallback to event bus method
            logger.info("🔗 Falling back to event bus for context")
            recent_events = event_bus.get_recent_events(50)
            execution_events = [
                e for e in recent_events 
                if e.data.get("execution_id") == execution_id and e.type == "agent.completed"
            ]
            
            if not execution_events:
                return ""
            
            # Build context from previous agent outputs
            context_parts = []
            for event_item in execution_events[-3:]:  # Last 3 agent outputs
                agent_name = event_item.data.get("agent", "Unknown Agent")
                output = event_item.data.get("output", "")
                if output and len(output) > 20:  # Skip very short outputs
                    context_parts.append(f"**Previous work by {agent_name}:**\n{output[:800]}...\n")
            
            context = "\n".join(context_parts)
            logger.info(f"Agent {self.name} has context from {len(execution_events)} previous agents")
            return context
            
        except Exception as e:
            logger.error(f"Failed to get execution context: {e}")
            return ""
    
    async def _process_task_with_context(self, event: SwarmEvent, context: str) -> str:
        """Process the task with context from previous agents"""
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
            
            # Create model
            if self._is_stopped():
                return "Stopped by user"
            model = OpenAIModel(
                client_args={"api_key": api_key},
                model_id="gpt-4o-mini",
                params={"max_tokens": 2000, "temperature": 0.7}
            )
            
            # Build tools list based on capabilities
            tools = []
            if "web_search" in self.capabilities.tools:
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
            
            # Enhanced system prompt with context awareness
            enhanced_prompt = f"""
{self.system_prompt}

EXECUTION CONTEXT:
You are part of an ongoing multi-agent execution. Here's what other agents have already accomplished:

{context if context else "You are the first agent in this execution."}

IMPORTANT: Build upon the previous work. Don't repeat what's already been done. Focus on your specialized role and add value to the overall execution.

MEMORY CONTEXT:
- Previous interactions with humans: {len(self.memory.human_interactions)}
- Execution history: {len(self.memory.conversation_history)} tasks completed
- Context data: {self.memory.context_data}
"""
            
            # Create Strands agent with proper session management
            try:
                # Use correct import path for Strands session management
                try:
                    from strands.session.file_session_manager import FileSessionManager
                    session_available = True
                    logger.info("✅ Strands FileSessionManager imported successfully")
                except ImportError as e:
                    logger.warning(f"⚠️ Strands session management not available: {e}")
                    FileSessionManager = None
                    session_available = False
                
                # Use shared session_id for all agents in this execution  
                shared_session_id = f"swarm_{self.execution_id}"
                
                # Create session manager for persistence if available
                session_manager = None
                if session_available and FileSessionManager:
                    try:
                        import os
                        sessions_path = os.path.join(os.getcwd(), "sessions")
                        os.makedirs(sessions_path, exist_ok=True)
                        
                        session_manager = FileSessionManager(
                            session_id=shared_session_id,
                            storage_dir=sessions_path
                        )
                        logger.info(f"✅ Created FileSessionManager with session_id: {shared_session_id}")
                    except Exception as e:
                        logger.warning(f"⚠️ Failed to create session manager: {e}")
                        session_manager = None
                
                logger.info(f"🔗 Creating Strands agent with session_id: {shared_session_id}")
                
                # Create agent parameters conditionally
                agent_params = {
                    "name": self.name,
                    "system_prompt": enhanced_prompt,
                    "tools": tools,
                    "model": model,
                    "callback_handler": None  # Disable callback to avoid connection issues
                }
                
                # Add session manager only if available
                if session_manager:
                    agent_params["session_manager"] = session_manager
                    logger.info("✅ Session manager added to agent")
                else:
                    logger.info("⚠️ Agent created without session persistence")
                
                strands_agent = Agent(**agent_params)
                
                logger.info(f"✅ Strands agent created with session management")
                
            except ImportError as e:
                logger.warning(f"⚠️ Strands session management not available: {e}")
                # Fallback to basic agent
                strands_agent = Agent(
                    name=self.name,
                    system_prompt=enhanced_prompt,
                    tools=tools,
                    model=model,
                    callback_handler=None
                )
            
            # Build comprehensive task message with original context
            context_data = event.data.get("context", {})
            
            # Try to get original query from multiple sources
            original_query = (
                context_data.get("original_query") or
                event.data.get("original_query") or 
                event.data.get("task") or
                self.current_task or
                "No original query provided"
            )
            
            # Try to get agent role from multiple sources
            agent_role = (
                context_data.get("agent_role") or
                event.data.get("role") or
                self.role or
                "unspecified"
            )
            
            # Try to get reason from multiple sources
            reason = (
                context_data.get("reason") or
                event.data.get("reason") or
                f"Handle task as {agent_role} specialist" or
                "No specific reason provided"
            )
            
            # Construct clear task message with original context
            if original_query:
                task_message = f"""ORIGINAL USER REQUEST: {original_query}

YOUR ROLE: As a {agent_role} agent, your specific task is: {reason}

IMPORTANT: Work specifically on the original user request about "{original_query}". Do not generate generic content or examples. Focus on this specific task."""
            else:
                # Fallback to event data
                task_message = (
                    event.data.get("task") or 
                    event.data.get("message") or 
                    event.data.get("reason") or
                    self.current_task or
                    f"Complete {self.role} work for execution {self.execution_id}"
                )
            
            logger.info(f"🎯 Agent {self.name} received original query: {original_query}")
            logger.info(f"🎯 Agent {self.name} role: {reason}")
            
            logger.info(f"🎯 Agent {self.name} executing task: {task_message[:100]}...")
            
            # Execute agent with streaming callback handler
            try:
                logger.debug(f"Creating Strands agent with streaming callback handler")
                
                # Create streaming callback that captures tokens in real-time
                def capture_streaming_callback(**kwargs):
                    """Capture streaming from Strands and relay to our callback"""
                    if self._is_stopped():
                        return
                    if "data" in kwargs and self.callback_handler:
                        chunk_data = kwargs["data"]
                        
                        # CRITICAL FIX: Add sequence number to maintain order
                        try:
                            self._chunk_sequence += 1
                            sequence_num = self._chunk_sequence
                            
                            # Run callback in event loop with sequence number
                            loop = asyncio.get_event_loop()
                            if loop.is_running():
                                asyncio.create_task(self.callback_handler(
                                    type="text_generation",
                                    agent=self.name,
                                    data={
                                        "chunk": chunk_data, 
                                        "execution_id": self.execution_id,
                                        "sequence": sequence_num  # Add sequence for ordering
                                    }
                                ))
                        except Exception as e:
                            logger.error(f"Streaming callback error: {e}")
                
                # Create agent with streaming callback
                strands_agent = Agent(
                    name=self.name,
                    system_prompt=enhanced_prompt,
                    tools=tools,
                    model=model,
                    callback_handler=capture_streaming_callback  # Enable streaming!
                )
                
                logger.debug(f"Created Strands agent with callback handler")
                
                # Execute agent
                if self._is_stopped():
                    return "Stopped by user"
                if hasattr(strands_agent, 'run'):
                    try:
                        result = await strands_agent.run(task_message)
                    except TypeError:
                        result = strands_agent.run(task_message)
                else:
                    result = strands_agent(task_message)
                
                # Extract result content
                if hasattr(result, 'content'):
                    result_text = result.content
                elif hasattr(result, 'output'):
                    result_text = result.output
                else:
                    result_text = str(result)
                
                logger.info(f"✅ Agent {self.name} completed with {len(result_text)} characters")
                return result_text
                
            except Exception as e:
                logger.error(f"Strands execution failed for {self.name}: {e}")
                return f"Completed analysis by {self.name}: {task_message}"
                
        except Exception as e:
            logger.error(f"Task processing failed for {self.name}: {e}")
            return f"Error in {self.name}: {str(e)}"

    def record_decision(self, decision: str, reasoning: str, outcome: str = None):
        """Record a decision made by the agent"""
        decision_record = {
            "timestamp": datetime.utcnow().isoformat(),
            "decision": decision,
            "reasoning": reasoning,
            "outcome": outcome
        }
        self.memory.decisions_made.append(decision_record)
        self._save_memory()
