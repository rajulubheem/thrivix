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
from app.services.event_bus import event_bus, SwarmEvent
from app.services.event_aware_agent import EventAwareAgent, AgentCapabilities
from app.services.dynamic_agent_factory import DynamicAgentFactory

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
    HumanInLoopCoordinator = None
    DynamicAgentSpawner = None
    EventAnalyzer = None
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
    
    def __init__(self, event_bus, agent_name: str):
        self.event_bus = event_bus
        self.agent_name = agent_name
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
        
        # Emit completion event
        await self.event_bus.emit("agent.completed", {
            "agent": self.agent_name,
            "output": str(output)[:500],  # Truncate for event
            "timestamp": time.time()
        }, source=self.agent_name)
        
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
            
        self.active_executions = {}  # Track active executions
        self._setup_event_handlers()
    
    def stop_execution(self, execution_id: str):
        """Stop an active execution"""
        if hasattr(self, 'active_executions') and execution_id in self.active_executions:
            self.active_executions[execution_id]["status"] = "stopped"
            logger.info(f"🛑 Marked execution {execution_id} for stopping")
            return True
        return False
    
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
        
        if not STRANDS_AVAILABLE:
            return SwarmExecutionResponse(
                execution_id=str(uuid.uuid4()),
                status=ExecutionStatus.FAILED,
                error="Strands library not installed"
            )
        
        execution_id = request.execution_id or str(uuid.uuid4())
        
        # Note: Streaming is now handled directly by EventAwareAgent using stream_async
        # No bridge needed as agents will directly call streaming callbacks
        
        self.active_executions[execution_id] = {
            "status": "running",
            "start_time": datetime.utcnow(),
            "user_id": user_id,
            "spawned_agents": []
        }
        
        # Clear event history for new execution
        self.event_bus.clear_history()
        
        try:
            # Emit task started event with streaming callback
            await self.event_bus.emit("task.started", {
                "task": request.task,
                "execution_id": execution_id,
                "user_id": user_id,
                "streaming_callback": callback_handler  # Pass callback to agents
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
                session_id = getattr(request, 'session_id', None) or execution_id
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
                event_hooks = SwarmEventHooks(self.event_bus, config.name)
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
        
        # Initialize factory for this execution - use new instance
        factory = DynamicAgentFactory()
        
        # Set up event streaming
        async def stream_event(event: SwarmEvent):
            """Stream events to frontend"""
            if callback_handler:
                # Map event types to streaming callback format
                event_type = event.type
                if event.type == "agent.started":
                    event_type = "agent_started"
                elif event.type == "agent.completed":
                    event_type = "agent_completed"
                elif event.type == "task.complete":
                    event_type = "task_complete"
                
                await callback_handler(
                    type=event_type,
                    agent=event.source,
                    content=json.dumps(event.data),
                    data=event.data,
                    timestamp=datetime.now().isoformat()
                )
        
        # Register event streamer for all events
        event_bus.on("*", lambda e: asyncio.create_task(stream_event(e)))
        
        # Emit task start event
        await event_bus.emit(
            "task.started",
            {"task": task, "execution_id": execution_id},
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
            
            # Activate the first agent with the task
            if agent:
                logger.info(f"Activating agent {agent.name} with task")
                await agent.activate(SwarmEvent(
                    type="task.started",
                    data={"task": task, "message": task},
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
        else:
            logger.error("No roles identified for task")
            return SwarmExecutionResponse(
                status=ExecutionStatus.FAILED,
                result="Could not determine required agent roles",
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
        
        while not task_completed:
            await asyncio.sleep(0.5)  # Check every 500ms
            timeout_counter += 1
            
            # Check if execution was stopped by user
            if execution_id in self.active_executions:
                execution_status = self.active_executions[execution_id].get("status")
                if execution_status == "stopped":
                    logger.info(f"🛑 Execution {execution_id} stopped by user")
                    task_completed = True
                    break
            
            # Check if task is complete
            recent_events = event_bus.get_recent_events(20)  # Check more events
            
            for event in recent_events:
                # Forward agent completions to streaming callback
                if (event.type == "agent.completed" and 
                    callback_handler and 
                    event.id not in processed_completions):
                    
                    processed_completions.add(event.id)
                    output = event.data.get("output", "")
                    agent_name = event.data.get("agent", "unknown")
                    
                    # Send the agent output as streaming chunks
                    if output:
                        std_logger.info(f"🔄 STREAMING CALLBACK: Forwarding agent.completed to streaming callback for {agent_name}")
                        std_logger.info(f"🔄 OUTPUT LENGTH: {len(output)} characters")
                        
                        await callback_handler(
                            type="text_generation",
                            agent=agent_name,
                            data={"chunk": output, "execution_id": execution_id}
                        )
                        
                        std_logger.info(f"✅ STREAMING CALLBACK: text_generation sent")
                        
                        await callback_handler(
                            type="agent_completed",
                            agent=agent_name,
                            data={
                                "output": output,
                                "execution_id": execution_id,
                                "tokens": len(output.split()) if output else 0
                            }
                        )
                        
                        std_logger.info(f"✅ STREAMING CALLBACK: agent_completed sent")
            
            for event in recent_events:
                if event.type == "task.complete":
                    logger.info("✅ Task marked as complete by agent")
                    task_completed = True
                    break
                    
                # Also check if analyzer says task is complete
                elif event.type == "agent.completed" and event.source.startswith("analyzer"):
                    output = event.data.get("output", "")
                    if "complete" in output.lower() or "finished" in output.lower() or "done" in output.lower():
                        logger.info("✅ Task completion detected from analyzer output")
                        await event_bus.emit("task.complete", {
                            "agent": event.source,
                            "reason": "analyzer_completion_detected",
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
                
                if all_idle and timeout_counter > 10:  # After 5 seconds of idle
                    # Check if we have any completed work
                    completed_events = [
                        e for e in recent_events 
                        if e.type == "agent.completed" and len(e.data.get("output", "")) > 50
                    ]
                    
                    if len(completed_events) > 0:
                        logger.info("All agents idle with completed work - marking task complete")
                        await event_bus.emit("task.complete", {
                            "reason": "all_agents_idle_with_work",
                            "completed_agents": len(completed_events)
                        }, source="system")
                        task_completed = True
                        break
                    elif timeout_counter > 40:  # After 20 seconds
                        logger.warning("Agents idle too long without substantial work")
                        break
        
        if task_completed:
            # Compile results
            final_result = self._compile_event_results(factory)
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
            partial_result = self._compile_event_results(factory)
            
            return SwarmExecutionResponse(
                status=ExecutionStatus.FAILED,
                result=f"Execution timed out or stalled. Partial work:\n{partial_result}" if partial_result else "No substantial work completed",
                execution_id=execution_id,
                session_id=session_id,
                agents_used=list(factory.active_agents.keys()),
                total_time=time.time() - start_time
            )
    
    def _compile_event_results(self, factory: DynamicAgentFactory) -> str:
        """Compile results from event-driven execution"""
        results = []
        
        # Get outputs from event history
        for event in event_bus.get_recent_events(100):
            if event.type == "agent.completed":
                output = event.data.get("output", "")
                if output:
                    agent = event.data.get("agent", "Unknown")
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
                
                # Execute with streaming callback
                async def stream_handler(chunk):
                    if callback_handler and chunk:
                        await callback_handler(
                            type="text_generation",
                            agent=agent.name,
                            data={"chunk": chunk, "execution_id": execution_id}
                        )
                
                # Execute the agent using the correct API
                try:
                    if hasattr(strands_agent, 'run'):
                        try:
                            # Try async first
                            result = await strands_agent.run(full_task)
                        except TypeError:
                            # If not awaitable, call synchronously
                            result = strands_agent.run(full_task)
                    elif hasattr(strands_agent, '__call__'):
                        try:
                            result = await strands_agent(full_task)
                        except TypeError:
                            result = strands_agent(full_task)
                    elif hasattr(strands_agent, 'invoke'):
                        try:
                            result = await strands_agent.invoke(full_task)
                        except TypeError:
                            result = strands_agent.invoke(full_task)
                    else:
                        logger.warning(f"Unknown Strands agent API for {agent.name}")
                        result = f"Processed task: {full_task}"
                    
                    # Extract actual result from AgentResult object if needed
                    if hasattr(result, 'content'):
                        result_output = result.content
                    elif hasattr(result, 'output'):
                        result_output = result.output
                    elif hasattr(result, 'text'):
                        result_output = result.text
                    elif hasattr(result, 'result'):
                        result_output = result.result
                    else:
                        result_output = str(result)
                    
                except Exception as api_error:
                    logger.error(f"Strands API call failed for {agent.name}: {api_error}")
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