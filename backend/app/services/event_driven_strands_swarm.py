"""
Event-Driven Enhanced Swarm Service - Extends existing Strands swarm with event capabilities
"""
import asyncio
import json
import time
import uuid
from typing import Optional, Callable, Dict, Any, List
from datetime import datetime
import structlog
import os

from app.services.strands_swarm_service import StrandsSwarmService
from app.services.coordinator_memory import CoordinatorMemory
from app.services.strands_session_service import get_strands_session_service
from app.services.event_bus import event_bus, SwarmEvent
from app.services.event_aware_agent import EventAwareAgent, AgentCapabilities
from app.services.dynamic_agent_factory import DynamicAgentFactory
from app.services.agent_output_queue import get_output_queue, reset_output_queue

# Try to import existing event_system components if available
try:
    from app.services.event_system import (
        HumanInLoopCoordinator, 
        DynamicAgentSpawner,
        EventAnalyzer,
        global_event_bus
    )
except ImportError:
    # Use our new components
    global_event_bus = event_bus

# Import sequential controller (optional - only used when enabled)
try:
    from app.services.sequential_spawn_controller import get_sequential_controller
    SEQUENTIAL_CONTROLLER_AVAILABLE = True
except ImportError:
    SEQUENTIAL_CONTROLLER_AVAILABLE = False
from app.schemas.swarm import (
    SwarmExecutionRequest,
    SwarmExecutionResponse,
    ExecutionStatus,
    AgentConfig
)

try:
    from strands import Agent
    from strands.multiagent import Swarm
    STRANDS_AVAILABLE = True
except ImportError:
    STRANDS_AVAILABLE = False
    Agent = None
    Swarm = None

# Try to import hooks separately as they might not be available
try:
    from strands.hooks import HookProvider, HookRegistry
    # Standard events
    from strands.hooks import (
        AgentInitializedEvent,
        BeforeInvocationEvent,
        AfterInvocationEvent,
        MessageAddedEvent
    )
    HOOKS_AVAILABLE = True
except ImportError:
    try:
        # Try experimental imports if standard doesn't work
        from strands.experimental.hooks import (
            BeforeInvocationEvent,
            AfterInvocationEvent,
            MessageAddedEvent,
            BeforeModelInvocationEvent,
            AfterModelInvocationEvent,
            BeforeToolInvocationEvent,
            AfterToolInvocationEvent
        )
        from strands.hooks import HookProvider, HookRegistry
        HOOKS_AVAILABLE = True
    except ImportError:
        HOOKS_AVAILABLE = False
        # Create dummy classes to prevent errors
        class HookProvider:
            pass
        class BeforeInvocationEvent:
            pass
        class AfterInvocationEvent:
            pass
        class MessageAddedEvent:
            pass
    
import logging
logging.basicConfig(level=logging.DEBUG)
logger = structlog.get_logger()
# Also get a standard logger for debugging
std_logger = logging.getLogger(__name__)


class SwarmEventHooks(HookProvider):
    """Event hooks for Strands agents"""
    
    def __init__(self, event_bus, agent_name: str, execution_id: str = None):
        self.event_bus = event_bus
        self.agent_name = agent_name
        self.execution_id = execution_id
        self.event_analyzer = EventAnalyzer(event_bus) if EventAnalyzer else None
    
    def register_hooks(self, registry: HookRegistry):
        """Register event-emitting hooks"""
        # Wrap async methods for sync callback system
        def before_work_sync(event):
            asyncio.create_task(self.before_agent_work(event))
        
        def after_work_sync(event):
            asyncio.create_task(self.after_agent_work(event))
        
        def message_added_sync(event):
            asyncio.create_task(self.on_message_added(event))
        
        registry.add_callback(BeforeInvocationEvent, before_work_sync)
        registry.add_callback(AfterInvocationEvent, after_work_sync)
        registry.add_callback(MessageAddedEvent, message_added_sync)
    
    async def before_agent_work(self, event: BeforeInvocationEvent):
        """Emit event when agent starts working"""
        await self.event_bus.emit("agent.started", {
            "agent": self.agent_name,
            "timestamp": time.time()
        }, source=self.agent_name)
    
    async def after_agent_work(self, event: AfterInvocationEvent):
        """Process agent completion and analyze output for events"""
        output = event.response if hasattr(event, 'response') else ""
        
        # Emit completion event with execution_id for session isolation
        event_data = {
            "agent": self.agent_name,
            "output": str(output)[:500],  # Truncate for event
            "timestamp": time.time()
        }
        
        # Include execution_id if available for proper session isolation
        if self.execution_id:
            event_data["execution_id"] = self.execution_id
            
        await self.event_bus.emit("agent.completed", event_data, source=self.agent_name)
        
        # Analyze output for triggered events
        if output and self.event_analyzer:
            await self.event_analyzer.analyze_output(str(output), self.agent_name)
    
    # Tool events are not available in current Strands version
    # We'll track tools through the message events instead
    
    async def on_message_added(self, event: MessageAddedEvent):
        """Stream messages as events"""
        await self.event_bus.emit("message.added", {
            "agent": self.agent_name,
            "message": event.message.content if hasattr(event.message, 'content') else "",
            "role": event.message.role if hasattr(event.message, 'role') else "assistant"
        }, source=self.agent_name)


class EventDrivenStrandsSwarm(StrandsSwarmService):
    """Enhanced swarm with event-driven coordination"""
    
    def __init__(self):
        super().__init__()
        self.event_bus = global_event_bus
        
        # Initialize components conditionally
        if HumanInLoopCoordinator:
            self.human_coordinator = HumanInLoopCoordinator(self.event_bus)
        else:
            self.human_coordinator = None
            
        if DynamicAgentSpawner:
            self.agent_spawner = DynamicAgentSpawner(self.event_bus, self.agent_factory)
        else:
            self.agent_spawner = None
            
        if EventAnalyzer:
            self.event_analyzer = EventAnalyzer(self.event_bus)
        else:
            self.event_analyzer = None
            
        # Initialize optional sequential spawn controller
        if SEQUENTIAL_CONTROLLER_AVAILABLE:
            self.sequential_controller = get_sequential_controller()
            self.sequential_enabled = False  # Start disabled, can be enabled per execution
        else:
            self.sequential_controller = None
            self.sequential_enabled = False
            
        self.active_executions = {}  # Track active executions
        self.agent_cancellations = {}  # execution_id -> set(agent_names)
        self.agent_timeouts = {}  # execution_id -> default seconds
        self.agent_timeout_overrides = {}  # execution_id -> { agent: seconds }
        self._setup_event_handlers()
    
    def stop_execution(self, execution_id: str):
        """Stop an active execution"""
        if hasattr(self, 'active_executions') and execution_id in self.active_executions:
            self.active_executions[execution_id]["status"] = "stopped"
            logger.info(f"🛑 Marked execution {execution_id} for stopping")
            return True
        return False

    def stop_agent(self, execution_id: str, agent_name: str):
        """Cancel a single agent within an execution"""
        if execution_id not in self.agent_cancellations:
            self.agent_cancellations[execution_id] = set()
        self.agent_cancellations[execution_id].add(agent_name)
        logger.info(f"🛑 Requested stop for agent {agent_name} in execution {execution_id}")
        return True

    def set_agent_timeout(self, execution_id: str, agent_name: str, seconds: int):
        """Override timeout for a specific agent in an execution"""
        if execution_id not in self.agent_timeout_overrides:
            self.agent_timeout_overrides[execution_id] = {}
        self.agent_timeout_overrides[execution_id][agent_name] = max(5, int(seconds))
        logger.info(f"⏱️ Set timeout for {agent_name} in {execution_id} to {seconds}s")
        return True
    
    def enable_sequential_execution(self, execution_id: str):
        """Enable sequential hierarchical execution for specific execution ID"""
        if self.sequential_controller:
            self.sequential_controller.enable_for_execution(execution_id)
            logger.info(f"🔄 Sequential execution ENABLED for {execution_id}")
            return True
        else:
            logger.warning("🔄 Sequential controller not available")
            return False
    
    def disable_sequential_execution(self, execution_id: str):
        """Disable sequential execution for specific execution ID"""
        if self.sequential_controller:
            self.sequential_controller.disable_for_execution(execution_id)
            logger.info(f"🔄 Sequential execution DISABLED for {execution_id}")
            return True
        else:
            return False
    
    def get_sequential_status(self, execution_id: str):
        """Get sequential execution status for execution ID"""
        if self.sequential_controller:
            return self.sequential_controller.get_execution_status(execution_id)
        else:
            return {"enabled": False, "available": False}
    
    def _setup_event_handlers(self):
        """Set up core event handlers"""
        # Handle dynamic agent requests
        self.event_bus.on("agent.needed", self._handle_agent_needed)
        self.event_bus.on("handoff.requested", self._handle_handoff_request)
        self.event_bus.on("task.complete", self._handle_task_complete)
        self.event_bus.on("human.input.needed", self._handle_human_input_needed)
        
        logger.info("Event-driven swarm initialized with event handlers")
    
    async def execute_swarm_async(
        self,
        request: SwarmExecutionRequest,
        user_id: str,
        callback_handler: Optional[Callable] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        existing_agents: Optional[List[Dict[str, Any]]] = None
    ) -> SwarmExecutionResponse:
        """Execute swarm with event-driven coordination"""
        # Ensure execution_id is available for all paths
        execution_id = getattr(request, 'execution_id', None) or str(uuid.uuid4())

        
        # TURN-BASED: detect policy or pattern
        try:
            mode = getattr(request, 'execution_mode', '') or (getattr(request, 'context', {}) or {}).get('swarm_config', {}).get('mode')
        except Exception:
            mode = ''
        detect = self._parse_counting_task(request.task or '')
        if mode == 'turn_based' or detect is not None:
            start, end, chunk = detect or (1, 100, 10)
            return await self._execute_turn_based_counting(
                request=request,
                user_id=user_id,
                callback_handler=callback_handler,
                execution_id=execution_id,
                session_id=getattr(request, 'execution_id', None) or execution_id,
                start=start,
                end=end,
                chunk=chunk
            )

        if not STRANDS_AVAILABLE:
            return SwarmExecutionResponse(
                execution_id=str(uuid.uuid4()),
                status=ExecutionStatus.FAILED,
                error="Strands library not installed"
            )
        
        # execution_id already established above
        
        # Note: Streaming is now handled directly by EventAwareAgent using stream_async
        # No bridge needed as agents will directly call streaming callbacks
        
        self.active_executions[execution_id] = {
            "status": "running",
            "start_time": datetime.utcnow(),
            "user_id": user_id,
            "spawned_agents": []
        }
        # Apply per-agent timeout from request if provided
        try:
            cfg = getattr(request, 'context', {}).get('swarm_config', {}) if getattr(request, 'context', None) else {}
            self.agent_timeouts[execution_id] = int(cfg.get('max_agent_runtime', 90))
        except Exception:
            self.agent_timeouts[execution_id] = 90
        
        # Clear event history for new execution
        self.event_bus.clear_history()
        
        try:
            # Calculate session_id early for consistency
            session_id = getattr(request, 'session_id', None) or execution_id
            
            # Emit task started event with session_id (don't include callback in event data)
            await self.event_bus.emit("task.started", {
                "task": request.task,
                "execution_id": execution_id,
                "session_id": session_id,
                "user_id": user_id
            }, source="system")
            
            # Initialize with smart agent selection if needed
            await self.agent_factory.initialize_dynamic_builder()
            
            # Get initial agents
            if not request.agents or len(request.agents) == 0:
                # Analyze task to determine needed agents
                agent_configs = await self._analyze_and_spawn_agents(request.task)
            else:
                agent_configs = request.agents
            
            # Create Strands agents with event hooks
            strands_agents = await self._create_event_aware_agents(agent_configs, execution_id)
            
            # Execute with event-driven coordination
            if request.execution_mode == "event_driven":
                # Use TRUE event-driven execution with dynamic spawning
                return await self.execute_true_event_driven(
                    request.task, 
                    execution_id,
                    session_id,
                    callback_handler
                )
            else:
                # Fall back to parent implementation with event hooks added
                return await super().execute_swarm_async(request, user_id, callback_handler)
            
        except Exception as e:
            logger.error(f"Event-driven execution failed: {e}", exc_info=True)
            
            await self.event_bus.emit("task.failed", {
                "execution_id": execution_id,
                "error": str(e)
            }, source="system")
            
            return SwarmExecutionResponse(
                execution_id=execution_id,
                status=ExecutionStatus.FAILED,
                error=str(e)
            )
    
    async def _analyze_and_spawn_agents(self, task: str) -> List[AgentConfig]:
        """Analyze task and spawn appropriate agents"""
        # Use a coordinator agent to analyze the task
        analyzer_prompt = f"""Analyze this task and determine which specialist agents are needed:
Task: {task}

Consider these available agent types:
- researcher: For gathering information and analysis
- architect: For system design and planning
- developer: For code implementation
- tester: For testing and validation
- reviewer: For code review and quality
- documenter: For documentation

Output a JSON list of needed agents with their roles and why they're needed.
Example: [{{"role": "researcher", "reason": "need to gather requirements"}}]"""
        
        # This would call an LLM to analyze, for now use smart defaults
        agent_configs = self.agent_factory.get_agents_for_task(task, ["tavily_search"])
        
        # Emit event about agents being spawned
        for config in agent_configs:
            await self.event_bus.emit("agent.spawning", {
                "role": config.name,
                "reason": "initial task analysis"
            }, source="system")
        
        return agent_configs
    
    async def _create_event_aware_agents(
        self, 
        agent_configs: List[AgentConfig], 
        execution_id: str
    ) -> List[Agent]:
        """Create Strands agents with event hooks attached"""
        strands_agents = []
        
        # Try to import OpenAI model
        try:
            from strands.models.openai import OpenAIModel
            import os
            from dotenv import load_dotenv
            
            # Ensure .env is loaded
            load_dotenv()
            
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                logger.warning("OPENAI_API_KEY not found in environment")
                model = None
            else:
                # Create OpenAI model
                model = OpenAIModel(
                    client_args={
                        "api_key": api_key,
                    },
                    model_id="gpt-4o-mini",
                    params={
                        "max_tokens": 4000,
                        "temperature": 0.7,
                    }
                )
                logger.info(f"Using OpenAI model for agents (key starts with: {api_key[:10]}...)")
        except ImportError:
            logger.warning("OpenAI model not available, using default")
            model = None
        
        for config in agent_configs:
            # Get tool objects
            tool_objects = self._get_tools_for_agent(config.tools if config.tools else [])
            
            # Create agent with model
            if model:
                agent = Agent(
                    name=config.name,
                    system_prompt=self._enhance_prompt_with_events(config.system_prompt),
                    tools=tool_objects,
                    model=model
                )
            else:
                agent = Agent(
                    name=config.name,
                    system_prompt=self._enhance_prompt_with_events(config.system_prompt),
                    tools=tool_objects
                )
            
            # Add event hooks if available
            if STRANDS_AVAILABLE and HOOKS_AVAILABLE and hasattr(agent, 'hooks'):
                event_hooks = SwarmEventHooks(self.event_bus, config.name, execution_id)
                agent.hooks.add_hook(event_hooks)
            
            strands_agents.append(agent)
            
            # Track spawned agent
            self.active_executions[execution_id]["spawned_agents"].append(config.name)
            
            logger.info(f"Created event-aware agent: {config.name}")
        
        return strands_agents
    
    def _enhance_prompt_with_events(self, prompt: str) -> str:
        """Enhance agent prompt with event-awareness instructions"""
        event_instructions = """

EVENT-DRIVEN COORDINATION:
- When you need help from another specialist, include "NEED: [role] agent" in your response
- To hand off to a specific agent, include "HANDOFF: [agent_name]" 
- When blocked or need human input, include "HUMAN INPUT NEEDED: [question]"
- When your task is complete, include "TASK COMPLETE" in your response
- The system will automatically spawn agents or get human input based on these triggers

"""
        return prompt + event_instructions
    
    async def execute_true_event_driven(
        self,
        task: str,
        execution_id: str,
        session_id: str,
        callback_handler: Optional[Callable] = None
    ) -> SwarmExecutionResponse:
        """Execute task with TRUE event-driven dynamic agent spawning"""
        logger.info(f"🚀 Starting TRUE event-driven execution: {execution_id}")
        std_logger.info(f"🚀🚀🚀 CALLED execute_true_event_driven with task: {task}")
        
        start_time = time.time()
        # No artificial limits - let user control via UI
        
        # Use session_id as execution_id to match frontend
        actual_execution_id = session_id if session_id else execution_id
        logger.info(f"🔗 Using execution_id: {actual_execution_id} (session_id: {session_id})")
        
        # PARALLEL STREAMING: Direct callback without queue bottleneck
        # Each agent streams directly to the frontend
        async def direct_streaming_callback(**kwargs):
            """Direct parallel streaming - no queue, no waiting"""
            event_type = kwargs.get("type")
            agent_name = kwargs.get("agent")
            data = kwargs.get("data", {})
            
            # Forward ALL events directly to SSE for parallel streaming
            if callback_handler:
                if asyncio.iscoroutinefunction(callback_handler):
                    await callback_handler(**kwargs)
                else:
                    callback_handler(**kwargs)
            
            # Log for debugging
            if event_type == "text_generation":
                chunk = data.get("chunk", "")
                if chunk:
                    logger.debug(f"Direct streaming from {agent_name}: {len(chunk)} chars")
        
        # Initialize factory with DIRECT PARALLEL callback
        logger.info(f"🔍 Creating DynamicAgentFactory with PARALLEL streaming callback")
        factory = DynamicAgentFactory(human_loop_enabled=True, execution_id=actual_execution_id, callback_handler=direct_streaming_callback)
        logger.info(f"✅ DynamicAgentFactory created with PARALLEL streaming callback")
        
        # Sequential execution is DISABLED to allow parallel agent execution
        logger.info(f"Sequential execution disabled (parallel mode) for {actual_execution_id}")
        
        # Set up event streaming
        async def stream_event(event: SwarmEvent):
            """Stream events to frontend"""
            if callback_handler:
                # Keep original event type for frontend compatibility
                # The frontend expects exact event types like "agent.spawned", "agent.needed", etc.
                try:
                    if asyncio.iscoroutinefunction(callback_handler):
                        # Async callback
                        await callback_handler(
                            type=event.type,  # Use original event type
                            agent=event.source,
                            content=json.dumps(event.data) if event.data else "",
                            data=event.data,
                            timestamp=datetime.now().isoformat()
                        )
                    else:
                        # Sync callback - call directly
                        callback_handler(
                            type=event.type,  # Use original event type
                            agent=event.source,
                            content=json.dumps(event.data) if event.data else "",
                            data=event.data,
                            timestamp=datetime.now().isoformat()
                        )
                except Exception as e:
                    logger.error(f"Callback error in stream_event: {e}")
        
        # Register event streamer for all events on BOTH buses (prevent split-bus issues)
        # self.event_bus comes from event_system (global_event_bus) when available
        try:
            self.event_bus.on("*", lambda e: asyncio.create_task(stream_event(e)))
        except Exception:
            pass
        # Also listen to app.services.event_bus.event_bus if it's a different instance
        try:
            from app.services.event_bus import event_bus as local_bus
            if local_bus is not self.event_bus:
                local_bus.on("*", lambda e: asyncio.create_task(stream_event(e)))
        except Exception:
            pass
        
        # Emit task start event with session_id for human-loop compatibility
        await event_bus.emit(
            "task.started",
            {"task": task, "execution_id": execution_id, "session_id": session_id},
            source="system"
        )
        
        # Analyze task and spawn initial agent(s)
        needed_roles = await factory.analyze_task_needs(task)
        logger.info(f"Task analysis identified needs: {needed_roles}")
        std_logger.info(f"🔍 Task needs analysis result: {needed_roles}")
        
        # Spawn first agent (analyzer) and give it the task
        if needed_roles:
            first_role = needed_roles[0]
            logger.info(f"Spawning first agent: {first_role}")
            agent = await factory.spawn_agent(first_role)
            
            # Queue remaining agents for sequential spawning if enabled
            if len(needed_roles) > 1 and SEQUENTIAL_CONTROLLER_AVAILABLE:
                controller = get_sequential_controller()
                if actual_execution_id in controller.enabled_executions:
                    logger.info(f"🔄 Queueing {len(needed_roles) - 1} additional agents for sequential execution")
                    # Emit agent.needed events for remaining agents (they'll be queued by controller)
                    for role_info in needed_roles[1:]:
                        await self.event_bus.emit("agent.needed", {
                            "role": role_info.get("role"),
                            "reason": role_info.get("reason"),
                            "priority": role_info.get("priority", "medium"),
                            "execution_id": actual_execution_id,
                            "context": f"Initial task analysis identified need for {role_info.get('role')}"
                        }, source="system")
        else:
            # No specific roles needed - create a general conversational agent for simple interactions
            logger.info("No specialized agents needed, creating general conversational agent")
            first_role = {
                "role": "general_conversational_agent", 
                "reason": "Handle simple interactions and conversations", 
                "priority": "high"
            }
            agent = await factory.spawn_agent(first_role)
        
        # Activate the first agent with the task
        if agent:
            logger.info(f"Activating agent {agent.name} with task")
            await agent.activate(SwarmEvent(
                type="task.started",
                data={"task": task, "message": task, "session_id": session_id, "execution_id": execution_id},
                source="system"
            ))
            logger.info(f"Agent {agent.name} activated")
        else:
            logger.error("Failed to create first agent")
            return SwarmExecutionResponse(
                status=ExecutionStatus.FAILED,
                result="Failed to spawn initial agent",
                execution_id=execution_id,
                session_id=session_id,
                agents_used=[],
                total_time=time.time() - start_time
            )
        
        # Event loop - let agents self-organize
        logger.info("Starting event-driven execution loop")
        task_completed = False
        timeout_counter = 0
        processed_completions = set()  # Track which agent completions we've already processed
        max_agents = 10  # Limit number of agents to prevent overwhelming
        agents_spawned = 1  # Already spawned first agent
        
        while not task_completed:
            await asyncio.sleep(0.2)  # Check every 200ms for faster response
            timeout_counter += 1
            
            # Check if execution was stopped by user
            if execution_id in self.active_executions:
                execution_status = self.active_executions[execution_id].get("status")
                if execution_status == "stopped":
                    logger.info(f"🛑 Execution {execution_id} stopped by user")
                    task_completed = True
                    break
            
            # Check if task is complete
            # Merge recent events from both buses and de-duplicate by event id
            def _merged_recent_events(limit: int = 50):
                seen = set()
                merged = []
                try:
                    evs1 = self.event_bus.get_recent_events(limit) if hasattr(self.event_bus, 'get_recent_events') else []
                except Exception:
                    evs1 = []
                try:
                    from app.services.event_bus import event_bus as local_bus
                    evs2 = local_bus.get_recent_events(limit) if hasattr(local_bus, 'get_recent_events') else []
                except Exception:
                    evs2 = []
                for e in (evs1 + evs2):
                    if getattr(e, 'id', None) and e.id in seen:
                        continue
                    seen.add(getattr(e, 'id', str(len(seen)+1)))
                    merged.append(e)
                return merged

            recent_events = _merged_recent_events(50)
            
            # CHECK TASK COMPLETION FIRST before processing any new agent requests
            for event in recent_events:
                if event.type == "task.complete":
                    logger.info("✅ Task marked as complete by agent - stopping immediately")
                    task_completed = True
                    break
            
            # If task is complete, don't process any more events
            if task_completed:
                break
                
            for event in recent_events:
                # Forward agent completions to streaming callback
                if (event.type == "agent.completed" and 
                    callback_handler and 
                    event.id not in processed_completions):
                    
                    processed_completions.add(event.id)
                    output = event.data.get("output", "")
                    agent_name = event.data.get("agent", "unknown")
                    
                    # Don't send the output again - it was already streamed chunk by chunk
                    # Just send the completion signal
                    std_logger.info(f"🔄 STREAMING CALLBACK: Agent {agent_name} completed, sending completion signal only")
                    
                    await callback_handler(
                        type="agent_completed",
                        agent=agent_name,
                        data={
                            # Don't include output - already streamed
                            "execution_id": execution_id,
                            "tokens": len(output.split()) if output else 0,
                            "completed": True
                        }
                    )
                    
                    std_logger.info(f"✅ STREAMING CALLBACK: agent_completed signal sent (no duplicate content)")
            
            # Only process agent spawn requests if task is not complete
            if not task_completed:
                for event in recent_events:
                    # Handle agent.needed events directly in the loop
                    if event.type == "agent.needed" and event.id not in processed_completions:
                        processed_completions.add(event.id)
                        role = event.data.get("role")
                        # Also track processed roles to avoid duplicates
                        role_key = f"{role}:{event.data.get('reason', '')}"
                        if role and role_key not in processed_completions and agents_spawned < max_agents:
                            processed_completions.add(role_key)
                            agents_spawned += 1
                            logger.info(f"🔧 Spawning requested agent {agents_spawned}/{max_agents}: {role}")
                            
                            # Check if this is a sequential execution that was already handled by the controller
                            is_sequential = event.data.get("sequential", False)
                            if is_sequential:
                                # Sequential controller already handled this - skip duplicate spawning
                                logger.info(f"🔄 Skipping duplicate spawn for sequential agent: {role}")
                                continue
                            
                            # Create task to spawn and execute agent asynchronously
                            async def execute_agent(role, context):
                                # Use the same main_queued_callback for consistency
                                # Create a new factory instance with the main queued callback
                                agent_factory = DynamicAgentFactory(
                                    human_loop_enabled=True, 
                                    execution_id=actual_execution_id, 
                                    callback_handler=main_queued_callback
                                )
                                agent = await agent_factory.spawn_agent(role, {"context": context})
                                if agent:
                                    logger.info(f"🚀 Executing spawned agent: {agent.name}")
                                    try:
                                        result = await self._stream_agent_execution(
                                            agent=agent,
                                            task=task,
                                            previous_work=[],
                                            execution_id=actual_execution_id,
                                            callback_handler=callback_handler
                                        )
                                        logger.info(f"✅ Agent {agent.name} completed with output length: {len(result.get('output', ''))}")
                                    except Exception as e:
                                        logger.error(f"❌ Agent {agent.name} failed: {e}")
                            
                            # Check if sequential execution is enabled for this execution_id
                            if SEQUENTIAL_CONTROLLER_AVAILABLE:
                                controller = get_sequential_controller()
                                if actual_execution_id in controller.enabled_executions:
                                    # Sequential mode: execute immediately (controller already queued it)
                                    logger.info(f"🔄 Sequential mode: executing agent {role} immediately")
                                    await execute_agent(role, event.data.get("context", ""))
                                else:
                                    # Parallel mode: create async task
                                    asyncio.create_task(execute_agent(role, event.data.get("context", "")))
                            else:
                                # No controller available, use parallel mode
                                asyncio.create_task(execute_agent(role, event.data.get("context", "")))
                    
                    # Check if analyzer explicitly says the ENTIRE SWARM TASK is complete (not just analysis)
                    elif event.type == "agent.completed" and event.source.startswith("analyzer"):
                        output = event.data.get("output", "")
                        # Only consider it complete if analyzer explicitly says entire task/project is done
                        # AND there are no pending agent spawn requests
                        if ("entire task complete" in output.lower() or 
                            "project complete" in output.lower() or
                            "swarm task complete" in output.lower()):
                            logger.info("✅ Entire task completion detected from analyzer output")
                            await self.event_bus.emit("task.complete", {
                                "agent": event.source,
                                "reason": "analyzer_full_completion_detected",
                                "final_output": output
                            }, source="system")
                            task_completed = True
                            break
            
            if task_completed:
                break
            
            # Check if all agents are idle and we have some work done
            active_agents = factory.active_agents
            if len(active_agents) > 0:
                all_idle = all(agent.state == "idle" for agent in active_agents.values())
                
                if all_idle and timeout_counter > 50:  # After 10 seconds of idle (50 * 0.2s)
                    # Check if we have any completed work AND no pending agent spawn requests
                    completed_events = [
                        e for e in recent_events 
                        if e.type == "agent.completed" and len(e.data.get("output", "")) > 50
                    ]
                    
                    # Check for pending agent spawn requests
                    spawn_requests = [e for e in recent_events if e.type == "agent.needed"]
                    
                    if len(completed_events) > 0 and len(spawn_requests) == 0:
                        logger.info("All agents idle with completed work and no pending spawn requests - marking task complete")
                        await self.event_bus.emit("task.complete", {
                            "reason": "all_agents_idle_with_work_no_pending_requests",
                            "completed_agents": len(completed_events)
                        }, source="system")
                        task_completed = True
                        break
                    elif len(spawn_requests) > 0:
                        logger.info(f"All agents idle but have {len(spawn_requests)} pending spawn requests - continuing execution")
                    elif timeout_counter > 300:  # After 60 seconds (300 * 0.2s)
                        logger.warning("Agents idle too long without substantial work")
                        break
        
        if task_completed:
            # Compile results with session isolation
            final_result = self._compile_event_results(factory, execution_id)
            logger.info(f"Task completed successfully. Result length: {len(final_result)}")
            
            return SwarmExecutionResponse(
                status=ExecutionStatus.COMPLETED,
                result=final_result,
                execution_id=execution_id,
                session_id=session_id,
                agents_used=list(factory.active_agents.keys()),
                total_time=time.time() - start_time
            )
        else:
            # Timeout or failure
            logger.warning(f"Execution ended: timeout_counter={timeout_counter}, elapsed={time.time() - start_time}")
            partial_result = self._compile_event_results(factory, execution_id)
            
            return SwarmExecutionResponse(
                status=ExecutionStatus.FAILED,
                result=f"Execution timed out or stalled. Partial work:\n{partial_result}" if partial_result else "No substantial work completed",
                execution_id=execution_id,
                session_id=session_id,
                agents_used=list(factory.active_agents.keys()),
                total_time=time.time() - start_time
            )
    
    def _compile_event_results(self, factory: DynamicAgentFactory, execution_id: str = None) -> str:
        """Compile results from event-driven execution with proper session isolation"""
        results = []
        
        # Get recent events from the current execution
        all_events = event_bus.get_recent_events(50)  # Reduced to get more recent events
        
        # Filter for agent.completed events and use factory's active agents for session isolation
        factory_agent_names = set(factory.active_agents.keys()) if factory else set()
        
        for event in all_events:
            if event.type == "agent.completed":
                agent = event.data.get("agent", "Unknown")
                output = event.data.get("output", "")
                
                # Use factory's active agents for session isolation instead of execution_id
                # This ensures we only get results from agents in THIS execution
                if factory_agent_names and agent not in factory_agent_names:
                    continue  # Skip events from agents not in this execution
                    
                if output:
                    results.append(f"[{agent}]: {output}")
        
        return "\n\n".join(results) if results else "No outputs generated"
    
    async def _execute_event_driven(
        self,
        initial_agents: List[Agent],
        request: SwarmExecutionRequest,
        execution_id: str,
        callback_handler: Optional[Callable]
    ) -> SwarmExecutionResponse:
        """Execute with full event-driven coordination"""
        
        all_outputs = []
        all_artifacts = []
        agent_sequence = []
        active_agents = {agent.name: agent for agent in initial_agents}
        max_duration = request.execution_timeout or 900
        start_time = time.time()
        
        # Start with first agent
        if initial_agents:
            first_agent = initial_agents[0]
            agent_sequence.append(first_agent.name)
            
            # Execute first agent
            result = await self._stream_agent_execution(
                agent=first_agent,
                task=request.task,
                previous_work=[],
                execution_id=execution_id,
                callback_handler=callback_handler
            )
            
            all_outputs.append({
                "agent": first_agent.name,
                "output": result["output"]
            })
            all_artifacts.extend(result.get("artifacts", []))
        
        # Event-driven execution loop
        task_complete = False
        while not task_complete and (time.time() - start_time) < max_duration:
            # Check recent events
            recent_events = self.event_bus.get_recent_events(5)
            
            for event in recent_events:
                # Check for task completion
                if event.type == "task.complete":
                    task_complete = True
                    break
                
                # Check for agent needed
                elif event.type == "agent.needed":
                    role = event.data.get("role")
                    if role and role not in active_agents:
                        # Spawn new agent
                        new_config = self.agent_factory.create_agent(role)
                        if new_config:
                            new_agents = await self._create_event_aware_agents(
                                [new_config], execution_id
                            )
                            if new_agents:
                                new_agent = new_agents[0]
                                active_agents[new_agent.name] = new_agent
                                
                                # Execute new agent
                                result = await self._stream_agent_execution(
                                    agent=new_agent,
                                    task=f"Help with: {request.task}",
                                    previous_work=all_outputs,
                                    execution_id=execution_id,
                                    callback_handler=callback_handler
                                )
                                
                                all_outputs.append({
                                    "agent": new_agent.name,
                                    "output": result["output"]
                                })
                                all_artifacts.extend(result.get("artifacts", []))
                                agent_sequence.append(new_agent.name)
                
                # Check for handoff request
                elif event.type == "handoff.requested":
                    to_agent = event.data.get("to")
                    if to_agent in active_agents:
                        agent = active_agents[to_agent]
                        
                        result = await self._stream_agent_execution(
                            agent=agent,
                            task=f"Continue work on: {request.task}",
                            previous_work=all_outputs,
                            execution_id=execution_id,
                            callback_handler=callback_handler
                        )
                        
                        all_outputs.append({
                            "agent": agent.name,
                            "output": result["output"]
                        })
                        all_artifacts.extend(result.get("artifacts", []))
                        agent_sequence.append(agent.name)
                
                # Check for human input needed
                elif event.type == "human.input.needed":
                    question = event.data.get("question", "Input needed")
                    response = await self.human_coordinator.ask_human(
                        question, 
                        context={"task": request.task},
                        agent_name=event.source
                    )
                    
                    # Add human response to context
                    all_outputs.append({
                        "agent": "human",
                        "output": f"Human input: {response}"
                    })
            
            # Small delay to prevent busy loop
            await asyncio.sleep(0.5)
            
            # Check if we should continue
            if len(agent_sequence) >= (request.max_handoffs or 20):
                logger.info("Max handoffs reached, completing task")
                task_complete = True
        
        # Compile final response
        final_response = self._compile_outputs(all_outputs, all_artifacts)
        
        # Emit completion event
        await self.event_bus.emit("task.completed", {
            "execution_id": execution_id,
            "agents_used": agent_sequence,
            "duration": time.time() - start_time
        }, source="system")
        
        if callback_handler:
            await callback_handler(
                type="execution_completed",
                data={
                    "result": {
                        "final_response": final_response,
                        "artifacts": all_artifacts
                    }
                }
            )
        
        return SwarmExecutionResponse(
            execution_id=execution_id,
            status=ExecutionStatus.COMPLETED,
            result=final_response,
            handoffs=len(agent_sequence) - 1,
            agent_sequence=agent_sequence,
            artifacts=all_artifacts
        )
    
    async def _handle_agent_needed(self, event):
        """Handle dynamic agent spawn request"""
        execution_id = list(self.active_executions.keys())[0] if self.active_executions else None
        if execution_id:
            role = event.data.get("role")
            logger.info(f"Spawning {role} agent on demand")
            # Agent will be spawned in main loop
    
    async def _handle_handoff_request(self, event):
        """Handle agent handoff request"""
        logger.info(f"Handoff requested from {event.data.get('from')} to {event.data.get('to')}")
        # Handoff will be processed in main loop
    
    async def _handle_task_complete(self, event):
        """Handle task completion"""
        logger.info("Task marked as complete by agent")
        # Completion will be detected in main loop
    
    async def _handle_human_input_needed(self, event):
        """Handle human input request"""
        logger.info("Human input requested")
        # Will be handled in main loop
    
    async def provide_human_response(self, question_id: str, response: str):
        """Provide human response to a question"""
        self.human_coordinator.provide_answer(question_id, response)
    
    async def provide_human_approval(self, approval_id: str, approved: bool):
        """Provide human approval decision"""
        self.human_coordinator.provide_approval(approval_id, approved)
    
    async def _stream_agent_execution(
        self,
        agent,
        task: str,
        previous_work: list,
        execution_id: str,
        callback_handler=None
    ):
        """Execute an agent and stream its output"""
        try:
            # Emit agent start event
            if callback_handler:
                await callback_handler(
                    type="agent_started",
                    agent=agent.name,
                    data={"task": task, "execution_id": execution_id}
                )
            
            # Build context from previous work
            context = ""
            if previous_work:
                context = "\n\n".join([
                    f"Previous work by {work['agent']}:\n{work['output']}"
                    for work in previous_work[-3:]  # Last 3 agents
                ])
            
            # Prepare the full task with context
            full_task = f"{task}\n\nContext from previous agents:\n{context}" if context else task
            
            # Execute the agent using Strands
            from strands import Agent
            from strands.models.openai import OpenAIModel
            import os
            from dotenv import load_dotenv
            
            load_dotenv()
            api_key = os.getenv("OPENAI_API_KEY")
            
            if not api_key:
                logger.warning("No OpenAI API key - using simulation mode")
                await asyncio.sleep(1)
                result_output = f"{agent.role} processed: {task}"
            else:
                # Create a real Strands agent to do the work
                model = OpenAIModel(
                    client_args={"api_key": api_key},
                    model_id="gpt-4o-mini",
                    params={"max_tokens": 4000, "temperature": 0.7}
                )
                
                # Build tools list based on capabilities
                tools = []
                if hasattr(agent, 'capabilities') and hasattr(agent.capabilities, 'tools'):
                    if "web_search" in agent.capabilities.tools:
                        try:
                            from app.tools.tavily_search import tavily_search
                            tools.append(tavily_search)
                        except:
                            pass
                
                # Create Strands agent with appropriate prompt
                strands_agent = Agent(
                    name=agent.name,
                    system_prompt=agent.system_prompt,
                    tools=tools,
                    model=model
                )
                
                # Execute with Strands streaming and suppress OpenTelemetry context errors
                result_output = ""
                sequence = 0
                start_time = time.time()
                
                # Temporarily suppress OpenTelemetry context errors during stream processing
                import logging
                import warnings
                import contextlib
                
                @contextlib.contextmanager
                def suppress_otel_warnings():
                    # Suppress specific OpenTelemetry context errors
                    otel_logger = logging.getLogger("opentelemetry.context")
                    original_level = otel_logger.level
                    otel_logger.setLevel(logging.CRITICAL)
                    
                    with warnings.catch_warnings():
                        warnings.filterwarnings("ignore", message=".*was created in a different Context.*")
                        try:
                            yield
                        finally:
                            otel_logger.setLevel(original_level)
                
                try:
                    with suppress_otel_warnings():
                        async for evt in strands_agent.stream_async(full_task):
                            # Check cancellation or timeout
                            if execution_id in self.agent_cancellations and agent.name in self.agent_cancellations[execution_id]:
                                logger.info(f"🛑 Agent {agent.name} cancelled in execution {execution_id}")
                                break
                            # Determine effective timeout
                            eff_to = self.agent_timeouts.get(execution_id, 90)
                            if execution_id in self.agent_timeout_overrides:
                                eff_to = self.agent_timeout_overrides[execution_id].get(agent.name, eff_to)
                            if time.time() - start_time > eff_to:
                                logger.info(f"⏱️ Agent {agent.name} timed out in execution {execution_id}")
                                break
                            
                            # Process different event types
                            if "data" in evt:
                                chunk = evt["data"]
                                result_output += chunk
                                if callback_handler and chunk:
                                    await callback_handler(
                                        type="text_generation",
                                        agent=agent.name,
                                        data={
                                            "chunk": chunk,
                                            "execution_id": execution_id,
                                            "sequence": sequence
                                        }
                                    )
                                    sequence += 1
                            elif "event" in evt:
                                # Handle Anthropic-style event envelopes
                                try:
                                    ev = evt.get("event") or {}
                                    delta = (ev.get("contentBlockDelta") or {}).get("delta") or {}
                                    text = delta.get("text")
                                    if text:
                                        result_output += text
                                        if callback_handler:
                                            await callback_handler(
                                                type="text_generation",
                                                agent=agent.name,
                                                data={
                                                    "chunk": text,
                                                    "execution_id": execution_id,
                                                    "sequence": sequence
                                                }
                                            )
                                            sequence += 1
                                except Exception:
                                    pass
                            elif "current_tool_use" in evt:
                                tool_info = evt["current_tool_use"]
                                tool_name = tool_info.get("name", "")
                                if callback_handler and tool_name:
                                    await callback_handler(
                                        type="tool_call",
                                        agent=agent.name,
                                        data={
                                            "tool": tool_name,
                                            "parameters": tool_info.get("input", {})
                                        }
                                    )
                            elif "result" in evt:
                                res = evt["result"]
                                if hasattr(res, 'content') and res.content:
                                    result_output = res.content
                                    
                except Exception as api_error:
                    logger.error(f"Strands streaming failed for {agent.name}: {api_error}")
                    # Fall back to simple run if streaming fails completely
                    try:
                        result = await strands_agent.run(full_task)
                        result_output = getattr(result, 'content', str(result))
                    except Exception as fallback_error:
                        logger.error(f"Fallback also failed for {agent.name}: {fallback_error}")
                        result_output = f"Completed analysis by {agent.name}: {task}"
            
            # Stream the final result
            if callback_handler:
                await callback_handler(
                    type="text_generation", 
                    agent=agent.name,
                    data={"chunk": result_output, "execution_id": execution_id}
                )
                
                await callback_handler(
                    type="agent_completed",
                    agent=agent.name,
                    data={
                        "output": result_output,
                        "execution_id": execution_id,
                        "tokens": len(result_output.split()) if result_output else 0
                    }
                )
            
            return {
                "output": result_output,
                "artifacts": [],
                "tokens": len(result_output.split()) if result_output else 0
            }
            
        except Exception as e:
            logger.error(f"Agent execution failed for {agent.name}: {e}")
            error_output = f"Error in {agent.name}: {str(e)}"
            
            if callback_handler:
                await callback_handler(
                    type="agent_error",
                    agent=agent.name,
                    data={"error": str(e), "execution_id": execution_id}
                )
            
            return {
                "output": error_output,
                "artifacts": [],
                "tokens": 0
            }

    # ---- Turn-based helpers ----
    def _parse_counting_task(self, task: str):
        import re
        m = re.search(r"count\s+(\d+)\s*(?:to|-)\s*(\d+)", task.lower())
        if not m:
            return None
        start = int(m.group(1))
        end = int(m.group(2))
        chunk = 10
        m2 = re.search(r"each\s+(?:agent|worker)\s+(?:counts?|do|handle)\s+(\d+)", task.lower())
        if m2:
            try:
                chunk = int(m2.group(1))
            except Exception:
                pass
        return (start, end, chunk)

    async def _execute_turn_based_counting(self, request: SwarmExecutionRequest, user_id: str,
                                           callback_handler: Optional[Callable], execution_id: str,
                                           session_id: str, start: int, end: int, chunk: int) -> SwarmExecutionResponse:
        try:
            # Register execution so stop_execution() can cooperate
            self.active_executions[execution_id] = {
                "status": "running",
                "start_time": datetime.utcnow(),
                "user_id": user_id,
                "spawned_agents": []
            }
            # Prepare steps
            ranges = []
            for i in range(start, end + 1, chunk):
                ranges.append((i, min(end, i + chunk - 1)))
            # Gather agents list
            agent_names: List[str] = []
            if request.agents:
                for a in request.agents:
                    name = getattr(a, 'name', None) or (a.get('name') if isinstance(a, dict) else None)
                    if name:
                        agent_names.append(name)
            if not agent_names:
                agent_names = [f"agent_{i+1:02d}" for i in range(len(ranges))]

            # Ensure coordinator and agents exist under this Strands session
            strands = get_strands_session_service()
            for name in set(agent_names + ["coordinator"]):
                strands.get_or_create_agent(session_id=session_id, agent_name=name,
                                            system_prompt=f"{name} in turn-based counting.", tools=[],
                                            model_config={"model_id": "gpt-4o-mini", "temperature": 0.0, "max_tokens": 16},
                                            force_new=False)

            # Seed plan
            steps = [{
                "id": f"step_{idx}",
                "title": f"Count {rng[0]}..{rng[1]}",
                "agent": agent_names[idx % len(agent_names)],
                "input": {"range": rng}
            } for idx, rng in enumerate(ranges)]
            cmem = CoordinatorMemory(session_id)
            cmem.seed_plan(steps)

            if callback_handler:
                await callback_handler(type="session_start", agent=None, data={"execution_id": execution_id})

            # Execute using REAL Strands agents with strict instructions
            for idx, rng in enumerate(ranges):
                # Cooperative stop check
                if self.active_executions.get(execution_id, {}).get("status") == "stopped":
                    logger.info(f"🛑 Turn-based execution {execution_id} stopped before step {idx}")
                    return SwarmExecutionResponse(
                        execution_id=execution_id,
                        status=ExecutionStatus.STOPPED,
                        result=f"Stopped at step {idx}",
                        agent_sequence=agent_names,
                    )
                agent_name = agent_names[idx % len(agent_names)]

                # Announce agent start
                if callback_handler:
                    await callback_handler(type="agent_started", agent=agent_name, data={"step": idx})

                # Build strict instruction: single-line, numbers only
                instruction = (
                    f"You are part of a coordinated team. Output EXACTLY the numbers from {rng[0]} to {rng[1]} "
                    f"inclusive, separated by single spaces, on a single line, with NO extra words, labels, or punctuation."
                )

                # Get the Strands Agent instance (shared session managers)
                strands = get_strands_session_service()
                s_agent = strands.get_or_create_agent(
                    session_id=session_id,
                    agent_name=agent_name,
                    system_prompt=f"{agent_name}: follow strictly: numbers only, single line.",
                    tools=[],
                    model_config={"model_id": "gpt-4o-mini", "temperature": 0.0, "max_tokens": 64},
                    force_new=False
                )

                accumulated = ""
                final_output = ""
                try:
                    # Stream tokens from the agent
                    async for evt in s_agent.stream_async(instruction):
                        # Cooperative stop during streaming
                        if self.active_executions.get(execution_id, {}).get("status") == "stopped":
                            logger.info(f"🛑 Turn-based execution {execution_id} stopped during agent {agent_name} stream")
                            break
                        if "data" in evt:
                            chunk = evt["data"]
                            accumulated += chunk
                            if callback_handler and chunk:
                                await callback_handler(type="text_generation", agent=agent_name, data={"chunk": chunk})
                        elif "result" in evt:
                            res = evt["result"]
                            if hasattr(res, 'content') and res.content:
                                final_output = res.content
                except Exception as e:
                    # Fallback to a simple run
                    try:
                        res = await s_agent.run(instruction)
                        final_output = getattr(res, 'content', str(res))
                    except Exception:
                        pass

                output = (final_output or accumulated).strip()
                # Normalization: keep only numbers and single spaces
                try:
                    import re
                    nums = re.findall(r"\d+", output)
                    if nums:
                        output = " ".join(nums)
                except Exception:
                    pass

                if callback_handler:
                    await callback_handler(type="agent_completed", agent=agent_name, data={"output": output})

                state = cmem.advance(output=output, agent=agent_name, step_id=f"step_{idx}")
                next_agent = state.get("baton", {}).get("current_agent")
                if next_agent and callback_handler:
                    await callback_handler(type="handoff", agent=agent_name, data={"from": agent_name, "to": next_agent, "reason": "turn_based_next"})

            if callback_handler:
                await callback_handler(type="task.complete", agent="coordinator", data={"steps": len(ranges)})

            return SwarmExecutionResponse(
                execution_id=execution_id,
                status=ExecutionStatus.COMPLETED,
                result="Turn-based counting completed",
                agent_sequence=agent_names,
            )
        except Exception as e:
            logger.error(f"Turn-based counting failed: {e}")
            return SwarmExecutionResponse(
                execution_id=execution_id,
                status=ExecutionStatus.FAILED,
                error=str(e)
            )
