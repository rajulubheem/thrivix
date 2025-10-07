"""
Streaming V2: New efficient streaming endpoint using EventHub + WebSocket
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, validator
from typing import List, Dict, Any, Optional, Literal
from enum import Enum
import uuid
import asyncio
import logging

from app.services.event_hub import get_event_hub, ControlFrame, ControlType
from app.services.dag_orchestrator import (
    DAGOrchestrator,
    build_simple_dag,
    build_parallel_dag
)
from app.services.agent_runtime import MockAgentRuntime
from app.services.strands_agent_runtime import (
    StrandsAgentRuntime, 
    StrandsAgentConfig,
    StrandsAgentFactory
)
from app.services.true_dynamic_coordinator import TrueDynamicCoordinator
from app.services.neural_thinking_coordinator import NeuralThinkingCoordinator
from app.services.ai_workflow_assistant import ai_workflow_assistant

logger = logging.getLogger(__name__)

router = APIRouter()


class AgentConfig(BaseModel):
    """Configuration for an agent"""
    name: str
    role: str
    task: str
    model: str = "gpt-4o-mini"
    agent_id: Optional[str] = None
    agent_type: str = "research"  # research, analysis, writer, qa, custom
    system_prompt: Optional[str] = None
    temperature: float = 0.7


class ExecutionMode(str, Enum):
    """Supported execution modes"""
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
    DAG = "dag"
    DYNAMIC = "dynamic"
    NEURAL = "neural"  # New neural thinking mode


class StreamingRequestV2(BaseModel):
    """Request for streaming execution"""
    task: str
    execution_mode: ExecutionMode = ExecutionMode.DYNAMIC
    agents: Optional[List[AgentConfig]] = None  # Optional for dynamic mode
    max_parallel: int = Field(default=5, ge=1, le=20)
    use_mock: bool = False  # For testing without real LLM calls
    tool_preferences: Optional[Dict[str, Any]] = None
    
    @validator('agents')
    def validate_agents(cls, v, values):
        """Validate agents requirement based on mode"""
        mode = values.get('execution_mode')
        if mode not in [ExecutionMode.DYNAMIC, ExecutionMode.NEURAL] and not v:
            raise ValueError(f"Agents list required for {mode} mode")
        return v


class StreamingResponseV2(BaseModel):
    """Response with execution details"""
    exec_id: str
    websocket_url: str
    status: str
    message: str


class PlanRequest(BaseModel):
    task: str
    tool_preferences: Optional[Dict[str, Any]] = None
    context: Optional[Dict[str, Any]] = None


class PlanResponse(BaseModel):
    machine: Dict[str, Any]


class ExecuteWithMachineRequest(BaseModel):
    task: str
    machine: Dict[str, Any]
    execution_mode: ExecutionMode = ExecutionMode.DYNAMIC
    max_parallel: int = Field(default=5, ge=1, le=20)
    tool_preferences: Optional[Dict[str, Any]] = None


class EnhanceRequest(BaseModel):
    task: str
    prompt: str
    current_machine: Dict[str, Any]
    tool_preferences: Optional[Dict[str, Any]] = None


# Store active executions with background tasks
active_executions: Dict[str, Dict[str, Any]] = {}
background_tasks: Dict[str, asyncio.Task] = {}


@router.post("/stream/v2", response_model=StreamingResponseV2)
async def start_streaming_v2(
    request: StreamingRequestV2
):
    """
    Start a new streaming execution
    Returns WebSocket URL for real-time streaming
    """
    
    # Generate execution ID
    exec_id = str(uuid.uuid4())
    
    logger.info(f"Starting execution {exec_id}: mode={request.execution_mode}")
    
    # Clear any existing Redis streams and reset sequences for this execution
    hub = get_event_hub()
    await hub.connect()
    
    # Reset sequences for this execution
    await hub.reset_execution(exec_id)
    
    # Use EventHub method to delete streams
    try:
        await hub.delete_execution_streams(exec_id)
        logger.info(f"Cleared Redis streams for execution {exec_id}")
    except Exception as e:
        logger.warning(f"Could not clear Redis streams: {e}")
    
    # Create orchestrator
    orchestrator = DAGOrchestrator(max_parallel=request.max_parallel)
    
    # Check execution mode
    if request.execution_mode == ExecutionMode.DYNAMIC:
        # Use true dynamic coordinator
        coordinator = TrueDynamicCoordinator(
            agent_id="dynamic_coordinator",
            name="Dynamic Task Coordinator",
            model="gpt-4o-mini",
            session_id=exec_id
        )
        
        orchestrator.register_agent(coordinator)
        
        # Simple DAG with just the coordinator
        dag = build_simple_dag([
            {"agent_id": "dynamic_coordinator", "task": request.task}
        ])
        
        logger.info(f"Using true dynamic coordinator for task: {request.task}")
    
    elif request.execution_mode == ExecutionMode.NEURAL:
        # Use neural thinking coordinator
        coordinator = NeuralThinkingCoordinator(
            agent_id="neural_network",
            name="Neural Thinking Network",
            model="gpt-4o-mini",
            session_id=exec_id
        )
        
        orchestrator.register_agent(coordinator)
        
        # Simple DAG with just the neural network
        dag = build_simple_dag([
            {"agent_id": "neural_network", "task": request.task}
        ])
        
        logger.info(f"Using neural thinking network for task: {request.task}")
    
    elif request.agents:
        # Use provided agent configuration
        for i, agent_config in enumerate(request.agents):
            agent_id = agent_config.agent_id or f"agent_{i:03d}"
            
            if request.use_mock:
                # Use mock agents for testing
                agent = MockAgentRuntime(
                    agent_id=agent_id,
                    name=agent_config.name,
                    delay=0.05
                )
            else:
                # Create real Strands agent based on type
                if agent_config.agent_type == "research":
                    agent = StrandsAgentFactory.create_research_agent(agent_id)
                elif agent_config.agent_type == "analysis":
                    agent = StrandsAgentFactory.create_analysis_agent(agent_id)
                elif agent_config.agent_type == "writer":
                    agent = StrandsAgentFactory.create_writer_agent(agent_id)
                elif agent_config.agent_type == "qa":
                    agent = StrandsAgentFactory.create_qa_agent(agent_id)
                else:  # custom
                    # Use provided system prompt or default
                    system_prompt = agent_config.system_prompt or agent_config.role
                    agent = StrandsAgentFactory.create_custom_agent(
                        agent_id=agent_id,
                        name=agent_config.name,
                        system_prompt=system_prompt,
                        model=agent_config.model,
                        temperature=agent_config.temperature
                    )
            
            # Reset agent sequence for new execution
            agent.reset_sequence()
            orchestrator.register_agent(agent)
        
        # Build execution DAG based on mode
        if request.execution_mode == ExecutionMode.PARALLEL:
            # All agents in parallel
            dag = build_parallel_dag([[
                {"agent_id": f"agent_{i:03d}", "task": agent_cfg.task}
                for i, agent_cfg in enumerate(request.agents)
            ]])
        else:
            # Sequential execution (default)
            dag = build_simple_dag([
                {"agent_id": f"agent_{i:03d}", "task": agent_cfg.task}
                for i, agent_cfg in enumerate(request.agents)
            ])
    
    else:
        # Default to dynamic mode if no agents provided
        coordinator = TrueDynamicCoordinator(
            agent_id="dynamic_coordinator",
            name="Dynamic Task Coordinator",
            model="gpt-4o-mini",
            session_id=exec_id
        )
        
        orchestrator.register_agent(coordinator)
        
        dag = build_simple_dag([
            {"agent_id": "dynamic_coordinator", "task": request.task}
        ])
        
        logger.info(f"Defaulting to dynamic coordinator for task: {request.task}")
    
    # Store execution info
    active_executions[exec_id] = {
        "request": request.dict(),
        "orchestrator": orchestrator,
        "dag": dag,
        "status": "running"
    }
    
    # Start execution in background and track it
    task = asyncio.create_task(
        execute_in_background(
            exec_id,
            orchestrator,
            dag
        )
    )
    background_tasks[exec_id] = task
    logger.info(f"Created background task for execution {exec_id}: {task}")
    
    # Return WebSocket URL
    websocket_url = f"/api/v1/ws/{exec_id}"
    
    return StreamingResponseV2(
        exec_id=exec_id,
        websocket_url=websocket_url,
        status="started",
        message=f"Execution started in {request.execution_mode} mode"
    )


async def execute_in_background(
    exec_id: str,
    orchestrator: DAGOrchestrator,
    dag: Any
):
    """Background task to execute DAG"""
    try:
        logger.info(f"Background execution started: {exec_id}")
        
        # Execute DAG
        result = await orchestrator.execute_dag(exec_id, dag)
        
        # Update status
        if exec_id in active_executions:
            active_executions[exec_id]["status"] = "completed"
            active_executions[exec_id]["result"] = result
        
        logger.info(f"Background execution completed: {exec_id}")
        
        # Cleanup after 1 hour
        hub = get_event_hub()
        await hub.cleanup_execution(exec_id, ttl=3600)
        
    except Exception as e:
        logger.error(f"Background execution error {exec_id}: {e}")
        
        if exec_id in active_executions:
            active_executions[exec_id]["status"] = "failed"
            active_executions[exec_id]["error"] = str(e)
    finally:
        # Remove from background tasks
        if exec_id in background_tasks:
            del background_tasks[exec_id]


@router.get("/stream/v2/{exec_id}/status")
async def get_execution_status(exec_id: str):
    """Get status of an execution"""
    
    if exec_id not in active_executions:
        raise HTTPException(status_code=404, detail="Execution not found")
    
    execution = active_executions[exec_id]
    
    # Safe agent count (handle None agents in dynamic mode)
    agent_count = len(execution["request"].get("agents") or [])
    
    return {
        "exec_id": exec_id,
        "status": execution["status"],
        "agents": agent_count,
        "mode": execution["request"]["execution_mode"],
        "dag_stats": execution["dag"].get_statistics() if execution["dag"] else None,
        "result": execution.get("result"),
        "error": execution.get("error")
    }


@router.get("/stream/v2/test-dynamic")
async def test_dynamic_streaming():
    """
    Test the true dynamic coordinator that creates agents based on task
    """
    
    # Test with a complex task
    test_request = StreamingRequestV2(
        task="Create a comprehensive business plan for a sustainable coffee shop startup in Seattle, including market research, financial projections, and marketing strategy",
        execution_mode=ExecutionMode.DYNAMIC,
        use_mock=False
    )
    
    # Start execution
    response = await start_streaming_v2(test_request)
    
    return {
        "message": "Dynamic execution started",
        "exec_id": response.exec_id,
        "websocket_url": response.websocket_url,
        "instructions": f"Connect to ws://localhost:8000{response.websocket_url} to see dynamic agent creation"
    }


@router.post("/stream/v2/{exec_id}/cancel")
async def cancel_execution(exec_id: str):
    """Cancel a running execution"""
    
    if exec_id not in active_executions:
        raise HTTPException(status_code=404, detail="Execution not found")
    
    execution = active_executions[exec_id]
    
    # Cancel background task if still running
    if exec_id in background_tasks:
        task = background_tasks[exec_id]
        if not task.done():
            task.cancel()
            logger.info(f"Cancelled execution {exec_id}")
    
    # Update status
    execution["status"] = "cancelled"
    
    # Emit control frames to notify connected clients
    try:
        hub = get_event_hub()
        await hub.connect()
        
        # Emit error event
        await hub.publish_control(
            exec_id=exec_id,
            frame_type=ControlType.ERROR,
            agent_id="system",
            payload={"error": "Execution cancelled by user", "type": "Cancelled"}
        )
        
        # Emit session end
        await hub.publish_control(
            exec_id=exec_id,
            frame_type=ControlType.SESSION_END,
            payload={"status": "cancelled", "cancelled": True}
        )
    except Exception as e:
        logger.warning(f"Could not emit cancellation events: {e}")
    
    return {
        "exec_id": exec_id,
        "status": "cancelled",
        "message": "Execution cancelled successfully"
    }


@router.get("/stream/v2/test-neural")
async def test_neural_thinking():
    """
    Test the neural thinking coordinator that creates a network of thinking agents
    """
    
    # Test with a complex task requiring collaborative thinking
    test_request = StreamingRequestV2(
        task="Design an innovative solution for reducing plastic waste in oceans that is both economically viable and environmentally effective",
        execution_mode=ExecutionMode.NEURAL,
        use_mock=False
    )
    
    # Start execution
    response = await start_streaming_v2(test_request)
    
    return {
        "message": "Neural thinking network started",
        "exec_id": response.exec_id,
        "websocket_url": response.websocket_url,
        "instructions": f"Connect to ws://localhost:8000{response.websocket_url} to see neural agents thinking collaboratively"
    }


@router.get("/stream/v2/test")
async def test_streaming_v2():
    """
    Test endpoint to verify the streaming pipeline
    Creates a simple 3-agent mock execution
    """
    
    # Create test request
    test_request = StreamingRequestV2(
        task="Build a calculator app",
        agents=[
            AgentConfig(
                name="UI Designer",
                role="Design the user interface",
                task="Create a modern calculator UI design"
            ),
            AgentConfig(
                name="Backend Developer",
                role="Implement the logic",
                task="Build calculator operations and API"
            ),
            AgentConfig(
                name="QA Engineer",
                role="Test the application",
                task="Write tests for the calculator"
            )
        ],
        execution_mode="sequential",
        use_mock=True
    )
    
    # Start execution
    response = await start_streaming_v2(test_request)
    
    return {
        "message": "Test execution started",
        "exec_id": response.exec_id,
        "websocket_url": response.websocket_url,
        "instructions": f"Connect to ws://localhost:8000{response.websocket_url} to see streaming output"
    }


@router.post("/stream/state-machine")
async def start_state_machine_execution(request: StreamingRequestV2):
    """Start an AI-driven state machine workflow execution"""
    
    # Import AI state machine coordinator
    from app.services.ai_state_machine_coordinator import AIStateMachineCoordinator
    
    exec_id = f"exec_{uuid.uuid4().hex[:8]}"
    
    # Store execution info
    active_executions[exec_id] = {
        "exec_id": exec_id,
        "task": request.task,
        "type": "state_machine",
        "status": "running",
        "created_at": None  # Will be set when execution starts
    }
    
    # Create AI state machine coordinator  
    coordinator = AIStateMachineCoordinator(config={
        "use_mock": request.use_mock,
        "max_parallel": request.max_parallel,
        "tool_preferences": request.tool_preferences or {}
    })
    
    async def run_state_machine():
        """Background task to run state machine"""
        try:
            hub = get_event_hub()
            await hub.connect()
            
            # Execute state machine (it publishes directly to hub)
            await coordinator.execute(
                task=request.task,
                exec_id=exec_id,
                execution_mode=request.execution_mode
            )
                
        except Exception as e:
            logger.error(f"State machine execution error: {e}")
            await hub.publish_control(ControlFrame(
                exec_id=exec_id,
                type="error",
                payload={"error": str(e)}
            ))
        finally:
            # Clean up
            if exec_id in background_tasks:
                del background_tasks[exec_id]
            if exec_id in active_executions:
                active_executions[exec_id]["status"] = "completed"
    
    # Attach coordinator so we can accept human decisions
    active_executions[exec_id]["coordinator"] = coordinator

    # Start background task
    task = asyncio.create_task(run_state_machine())
    background_tasks[exec_id] = task
    
    logger.info(f"Started state machine execution {exec_id}")
    
    return {
        "exec_id": exec_id,
        "websocket_url": f"/api/v1/ws/{exec_id}",
        "status": "running",
        "message": "AI state machine workflow started"
    }


@router.post("/stream/state-machine/{exec_id}/decision")
async def submit_state_machine_decision(exec_id: str, payload: Dict[str, Any]):
    """Submit a human decision for a state in the current execution"""
    state_id = payload.get("state_id")
    event = payload.get("event")
    data = payload.get("data")
    if not state_id or not event:
        return {"success": False, "message": "state_id and event are required"}

    exec_info = active_executions.get(exec_id)
    if not exec_info:
        return {"success": False, "message": "Execution not found"}

    coordinator = exec_info.get("coordinator")
    hub = exec_info.get("hub")
    if not coordinator:
        return {"success": False, "message": "Coordinator not found for execution"}

    ok = coordinator.submit_decision(exec_id, state_id, event, data)

    # Publish control frame to notify frontend that decision was submitted
    if ok and hub:
        await hub.publish_control(ControlFrame(
            exec_id=exec_id,
            type="decision_submitted",
            agent_id=state_id,
            payload={"state_id": state_id, "event": event, "data": data}
        ))
    return {"success": ok}


@router.post("/stream/state-machine/{exec_id}/rerun_from")
async def rerun_state_machine_from(exec_id: str, payload: Dict[str, Any]):
    """Rerun an existing state machine execution from a specific state.
    Optionally accepts a graph_patch with states/edges to merge before rerun.
    """
    start_state_id = payload.get("start_state_id")
    graph_patch = payload.get("graph_patch") or None
    if not start_state_id:
        return {"success": False, "message": "start_state_id is required"}

    exec_info = active_executions.get(exec_id)
    if not exec_info:
        return {"success": False, "message": "Execution not found"}

    coordinator = exec_info.get("coordinator")
    if not coordinator:
        return {"success": False, "message": "Coordinator not found for execution"}

    async def do_rerun():
        try:
            await coordinator.rerun_from(exec_id, start_state_id, graph_patch)
        except Exception as e:
            logger.error(f"Rerun error ({exec_id}): {e}")
            hub = get_event_hub()
            await hub.connect()
            await hub.publish_control(ControlFrame(
                exec_id=exec_id,
                type="error",
                payload={"error": f"rerun_failed: {str(e)}"}
            ))

    # Fire and forget in background so HTTP returns immediately
    task = asyncio.create_task(do_rerun())
    background_tasks[exec_id] = task
    return {"success": True}


@router.post("/stream/state-machine/{exec_id}/update_graph")
async def update_state_machine_graph(exec_id: str, payload: Dict[str, Any]):
    """Patch/extend the current graph for an existing execution and broadcast update."""
    graph_patch = payload or {}
    exec_info = active_executions.get(exec_id)
    if not exec_info:
        return {"success": False, "message": "Execution not found"}
    coordinator = exec_info.get("coordinator")
    if not coordinator:
        return {"success": False, "message": "Coordinator not found for execution"}
    try:
        updated = await coordinator.update_graph(exec_id, graph_patch)
        return {"success": True, "machine": updated}
    except Exception as e:
        logger.error(f"Update graph error ({exec_id}): {e}")
        return {"success": False, "message": str(e)}


@router.post("/stream/state-machine/plan", response_model=PlanResponse)
async def plan_state_machine(request: PlanRequest):
    """Generate a state machine (plan-only) and return it without executing."""
    from app.services.ai_state_machine_coordinator import AIStateMachineCoordinator
    from app.services.state_machine_to_unified_adapter import state_machine_adapter

    # Simple and direct - no timeouts, no restrictions
    config = {
        "tool_preferences": request.tool_preferences or {}
    }

    coordinator = AIStateMachineCoordinator(config=config)

    # Just call it directly - let it take as long as it needs
    machine = await coordinator.analyze_and_create_state_machine(request.task)

    # Convert to enhanced format for unified tool system
    if request.tool_preferences and request.tool_preferences.get("use_enhanced_blocks", True):
        adapter_context = {
            **(request.context or {}),
            "task": request.task,
            "tool_preferences": request.tool_preferences or {}
        }
        logger.info("Converting to enhanced workflow...")
        enhanced_workflow = state_machine_adapter.convert_state_machine_to_workflow(machine, context=adapter_context)
        logger.info(f"Enhanced workflow created with {len(enhanced_workflow.get('blocks', []))} blocks")

        enhanced_workflow = state_machine_adapter.validate_and_fix_workflow(enhanced_workflow)
        logger.info("Workflow validated and fixed")

        machine["enhanced_blocks"] = enhanced_workflow.get("blocks", [])
        machine["enhanced_edges"] = enhanced_workflow.get("edges", [])
        machine["enhanced"] = True
        logger.info("Returning enhanced machine")

    # Add completion status
    machine["status"] = "completed"
    machine["execution_complete"] = True

    return PlanResponse(machine=machine)


@router.post("/stream/state-machine/enhance", response_model=PlanResponse)
async def enhance_state_machine(request: EnhanceRequest):
    """Enhance an existing state machine with AI-generated improvements."""
    from app.services.ai_state_machine_coordinator import AIStateMachineCoordinator
    from app.services.state_machine_to_unified_adapter import state_machine_adapter

    # Combine task and prompt for better context
    enhanced_task = f"{request.task}: {request.prompt}"

    # Configure with tool preferences
    config = {
        "tool_preferences": request.tool_preferences or {},
        "min_states": 16,  # Ensure sufficient complexity for enhancements
        "max_states": 40
    }

    coordinator = AIStateMachineCoordinator(config=config)

    # Generate enhanced state machine based on prompt and existing machine
    logger.info(f"Enhancing workflow with prompt: {request.prompt}")
    machine = await coordinator.analyze_and_create_state_machine(enhanced_task)

    # Merge with current machine if it has states
    if request.current_machine and request.current_machine.get("states"):
        # Keep user's existing states and add AI enhancements
        existing_states = {s["id"]: s for s in request.current_machine.get("states", [])}
        for state in machine.get("states", []):
            if state["id"] not in existing_states:
                existing_states[state["id"]] = state
        machine["states"] = list(existing_states.values())

    # Convert to enhanced format
    if request.tool_preferences and request.tool_preferences.get("use_enhanced_blocks", True):
        adapter_context = {
            "task": enhanced_task,
            "tool_preferences": request.tool_preferences or {}
        }
        logger.info("Converting enhanced machine to workflow...")
        enhanced_workflow = state_machine_adapter.convert_state_machine_to_workflow(machine, context=adapter_context)
        logger.info(f"Enhanced workflow created with {len(enhanced_workflow.get('blocks', []))} blocks")

        enhanced_workflow = state_machine_adapter.validate_and_fix_workflow(enhanced_workflow)
        logger.info("Enhanced workflow validated")

        machine["enhanced_blocks"] = enhanced_workflow.get("blocks", [])
        machine["enhanced_edges"] = enhanced_workflow.get("edges", [])
        machine["enhanced"] = True

    # Add completion status
    machine["status"] = "completed"
    machine["execution_complete"] = True
    logger.info("Returning enhanced machine with completion status")

    return PlanResponse(machine=machine)


@router.post("/stream/state-machine/execute")
async def execute_with_machine(request: ExecuteWithMachineRequest):
    """Execute a provided, user-edited state machine graph."""
    from app.services.ai_state_machine_coordinator import AIStateMachineCoordinator
    exec_id = str(uuid.uuid4())

    # Store execution info
    active_executions[exec_id] = {
        "exec_id": exec_id,
        "task": request.task,
        "type": "state_machine",
        "status": "running",
        "created_at": None
    }

    coordinator = AIStateMachineCoordinator(config={
        "max_parallel": request.max_parallel,
        "tool_preferences": request.tool_preferences or {}
    })
    active_executions[exec_id]["coordinator"] = coordinator

    async def run_exec():
        try:
            hub = get_event_hub()
            await hub.connect()
            await coordinator.execute(task=request.task, exec_id=exec_id, machine_override=request.machine)
        except Exception as e:
            logger.error(f"Execute-with-machine error: {e}")
            await hub.publish_control(ControlFrame(exec_id=exec_id, type="error", payload={"error": str(e)}))
        finally:
            if exec_id in background_tasks:
                del background_tasks[exec_id]
            if exec_id in active_executions:
                active_executions[exec_id]["status"] = "completed"

    task = asyncio.create_task(run_exec())
    background_tasks[exec_id] = task

    return {
        "exec_id": exec_id,
        "websocket_url": f"/api/v1/ws/{exec_id}",
        "status": "running",
        "message": "Execution started with provided machine"
    }


# ==================== AI WORKFLOW ASSISTANT ENDPOINTS ====================

class AIAssistantStartRequest(BaseModel):
    """Request to start AI workflow assistant session"""
    task: str = Field(..., description="The user's task description")
    session_id: Optional[str] = Field(None, description="Optional session ID")
    reuse_existing: bool = Field(False, description="If True, reuse existing session if it exists")
    current_canvas_state: Optional[Dict[str, Any]] = Field(None, description="Current canvas nodes and edges")
    available_tools: Optional[List[str]] = Field(None, description="List of available tools")


class AIAssistantMessageRequest(BaseModel):
    """User message to AI assistant"""
    session_id: str = Field(..., description="Session ID")
    message: str = Field(..., description="User's message")
    current_canvas_state: Optional[Dict[str, Any]] = Field(None, description="Current canvas nodes and edges")
    available_tools: Optional[List[str]] = Field(None, description="List of available tools")


@router.post("/ai-assistant/start")
async def start_ai_assistant(request: AIAssistantStartRequest):
    """
    Start a new AI workflow assistant session.
    AI will analyze the task and generate initial workflow nodes on canvas.

    Args:
        task: Description of workflow to build
        session_id: Optional session ID (auto-generated if not provided)
        reuse_existing: If True, continue existing session instead of creating new one

    Returns immediately with session_id. Streaming happens via WebSocket.
    """
    session_id = request.session_id or str(uuid.uuid4())

    try:
        # Start the AI session in background - don't wait for completion
        async def run_ai_session():
            try:
                await ai_workflow_assistant.start_session(
                    session_id=session_id,
                    task=request.task,
                    reuse_existing=request.reuse_existing,
                    current_canvas_state=request.current_canvas_state,
                    available_tools=request.available_tools
                )
            except Exception as e:
                logger.error(f"Error in background AI session: {e}")
                # Publish error to WebSocket
                hub = get_event_hub()
                await hub.connect()
                await hub.publish_control(ControlFrame(
                    exec_id=session_id,
                    type="ai_assistant_error",
                    payload={"error": str(e)}
                ))

        # Start background task
        asyncio.create_task(run_ai_session())

        # Return immediately with session ID
        return {
            "success": True,
            "session_id": session_id,
            "message": "Session started. Connect to WebSocket for streaming.",
            "operations": []  # Operations will stream via WebSocket
        }
    except Exception as e:
        logger.error(f"Error starting AI assistant: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai-assistant/message")
async def send_ai_assistant_message(request: AIAssistantMessageRequest):
    """
    Send a message to AI assistant.
    AI will respond and generate node operations to update the canvas.
    """
    try:
        result = await ai_workflow_assistant.send_message(
            session_id=request.session_id,
            user_message=request.message,
            current_canvas_state=request.current_canvas_state,
            available_tools=request.available_tools
        )
        return {
            "success": True,
            **result
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error in AI assistant message: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ai-assistant/{session_id}/status")
async def get_ai_assistant_status(session_id: str):
    """Get current status of AI assistant session"""
    session = ai_workflow_assistant.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "session_id": session.session_id,
        "task": session.task,
        "message_count": len(session.messages),
        "node_count": len(session.current_nodes),
        "edge_count": len(session.current_edges),
        "nodes": session.current_nodes,
        "edges": session.current_edges
    }


@router.get("/ai-assistant/{session_id}/history")
async def get_ai_assistant_history(session_id: str):
    """Get full conversation history for AI assistant session"""
    session = ai_workflow_assistant.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Convert messages to serializable format
    messages = []
    for msg in session.messages:
        messages.append({
            "role": msg.role,
            "content": msg.content,
            "operations": msg.operations,
            "timestamp": getattr(msg, 'timestamp', None)
        })

    return {
        "session_id": session.session_id,
        "task": session.task,
        "messages": messages,
        "message_count": len(messages),
        "available_tools": session.available_tools,
        "current_nodes": session.current_nodes,
        "current_edges": session.current_edges
    }


@router.delete("/ai-assistant/{session_id}")
async def clear_ai_assistant_session(session_id: str):
    """Delete an AI assistant session"""
    deleted = ai_workflow_assistant.delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True, "message": "Session deleted"}


@router.get("/ai-assistant/sessions/list")
async def list_ai_assistant_sessions():
    """List all active AI assistant sessions"""
    sessions = ai_workflow_assistant.list_sessions()
    return {
        "success": True,
        "sessions": sessions,
        "count": len(sessions)
    }
