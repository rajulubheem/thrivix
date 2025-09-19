"""
Test endpoint for the new efficient streaming architecture
Demonstrates the WebSocket + Redis Streams pipeline
"""

from fastapi import APIRouter, HTTPException
import asyncio
import uuid
import logging

from app.services.event_hub import get_event_hub, TokenFrame, ControlFrame, ControlType
from app.services.dag_orchestrator import DAGOrchestrator, build_simple_dag
from app.services.agent_runtime import MockAgentRuntime

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/test/efficient/demo")
async def test_efficient_demo():
    """
    Quick test of the efficient streaming pipeline
    Creates 3 mock agents and streams their output
    """
    
    exec_id = str(uuid.uuid4())[:8]
    
    # Create orchestrator
    orchestrator = DAGOrchestrator(max_parallel=2)
    
    # Register mock agents
    agents_config = [
        {"name": "Architect", "task": "Design the system architecture"},
        {"name": "Developer", "task": "Implement the code"},
        {"name": "Tester", "task": "Test the implementation"}
    ]
    
    for i, config in enumerate(agents_config):
        agent = MockAgentRuntime(
            agent_id=f"agent_{i:03d}",
            name=config["name"],
            delay=0.02  # Fast streaming for demo
        )
        orchestrator.register_agent(agent)
    
    # Build DAG
    dag = build_simple_dag([
        {"agent_id": f"agent_{i:03d}", "task": config["task"]}
        for i, config in enumerate(agents_config)
    ])
    
    # Start execution in background
    asyncio.create_task(orchestrator.execute_dag(exec_id, dag))
    
    return {
        "message": "Test execution started",
        "exec_id": exec_id,
        "websocket_url": f"ws://localhost:8000/api/v1/ws/{exec_id}",
        "agents": len(agents_config),
        "instructions": [
            f"1. Open WebSocket connection to: ws://localhost:8000/api/v1/ws/{exec_id}",
            "2. You'll receive streaming tokens and control events",
            "3. Or navigate to http://localhost:3000/efficient-swarm in the frontend"
        ]
    }


@router.get("/test/efficient/publish")
async def test_publish_events():
    """
    Test publishing events directly to EventHub
    Useful for debugging the streaming pipeline
    """
    
    exec_id = "test_" + str(uuid.uuid4())[:8]
    hub = get_event_hub()
    
    try:
        # Publish session start
        await hub.publish_control(ControlFrame(
            exec_id=exec_id,
            type=ControlType.SESSION_START,
            payload={"test": True}
        ))
        
        # Publish agent started
        await hub.publish_control(ControlFrame(
            exec_id=exec_id,
            type=ControlType.AGENT_STARTED,
            agent_id="test_agent",
            payload={"name": "Test Agent"}
        ))
        
        # Publish some tokens
        for i in range(5):
            await hub.publish_token(TokenFrame(
                exec_id=exec_id,
                agent_id="test_agent",
                seq=i+1,
                text=f"Token {i+1} ",
                ts=asyncio.get_event_loop().time(),
                final=False
            ))
            await asyncio.sleep(0.1)
        
        # Publish final token
        await hub.publish_token(TokenFrame(
            exec_id=exec_id,
            agent_id="test_agent",
            seq=6,
            text="",
            ts=asyncio.get_event_loop().time(),
            final=True
        ))
        
        # Publish agent completed
        await hub.publish_control(ControlFrame(
            exec_id=exec_id,
            type=ControlType.AGENT_COMPLETED,
            agent_id="test_agent",
            payload={"tokens": 5}
        ))
        
        # Publish session end
        await hub.publish_control(ControlFrame(
            exec_id=exec_id,
            type=ControlType.SESSION_END,
            payload={"success": True}
        ))
        
        return {
            "message": "Events published successfully",
            "exec_id": exec_id,
            "websocket_url": f"ws://localhost:8000/api/v1/ws/{exec_id}",
            "events_published": 9
        }
        
    except Exception as e:
        logger.error(f"Error publishing events: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/test/efficient/status")
async def test_redis_connection():
    """Test Redis connection and EventHub"""
    
    hub = get_event_hub()
    
    try:
        await hub.connect()
        
        # Try to publish a test event
        test_frame = ControlFrame(
            exec_id="connection_test",
            type="test",
            payload={"status": "connected"}
        )
        
        msg_id = await hub.publish_control(test_frame)
        
        return {
            "redis": "connected",
            "test_publish": "success",
            "message_id": msg_id
        }
        
    except Exception as e:
        return {
            "redis": "error",
            "error": str(e),
            "hint": "Make sure Redis is running: brew services start redis"
        }