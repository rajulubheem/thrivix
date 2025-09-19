"""
Streaming V2: New efficient streaming endpoint using EventHub + WebSocket
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
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


class StreamingRequestV2(BaseModel):
    """Request for streaming execution"""
    task: str
    agents: Optional[List[AgentConfig]] = None  # Optional for dynamic mode
    execution_mode: str = "dynamic"  # sequential, parallel, dag, dynamic
    max_parallel: int = Field(default=5, ge=1, le=20)
    use_mock: bool = False  # For testing without real LLM calls


class StreamingResponseV2(BaseModel):
    """Response with execution details"""
    exec_id: str
    websocket_url: str
    status: str
    message: str


# Store active executions
active_executions: Dict[str, Dict[str, Any]] = {}


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
    
    # Delete existing streams if they exist (shouldn't happen with UUID, but just in case)
    try:
        redis_client = hub._redis
        await redis_client.delete(f"exec.{exec_id}.token")
        await redis_client.delete(f"exec.{exec_id}.control")
        await redis_client.delete(f"exec.{exec_id}.metrics")
        logger.info(f"Cleared Redis streams for execution {exec_id}")
    except Exception as e:
        logger.warning(f"Could not clear Redis streams: {e}")
    
    # Create orchestrator
    orchestrator = DAGOrchestrator(max_parallel=request.max_parallel)
    
    # Check execution mode
    if request.execution_mode == "dynamic":
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
        if request.execution_mode == "parallel":
            # All agents in parallel
            dag = build_parallel_dag([[
                {"agent_id": f"agent_{i:03d}", "task": agent.task}
                for i, agent in enumerate(request.agents)
            ]])
        else:
            # Sequential execution (default)
            dag = build_simple_dag([
                {"agent_id": f"agent_{i:03d}", "task": agent.task}
                for i, agent in enumerate(request.agents)
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
    
    # Start execution in background
    task = asyncio.create_task(
        execute_in_background(
            exec_id,
            orchestrator,
            dag
        )
    )
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


@router.get("/stream/v2/{exec_id}/status")
async def get_execution_status(exec_id: str):
    """Get status of an execution"""
    
    if exec_id not in active_executions:
        raise HTTPException(status_code=404, detail="Execution not found")
    
    execution = active_executions[exec_id]
    
    return {
        "exec_id": exec_id,
        "status": execution["status"],
        "agents": len(execution["request"]["agents"]),
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
        execution_mode="dynamic",
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