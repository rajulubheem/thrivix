"""
Simple test endpoints for event-driven system
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import json
import asyncio
from datetime import datetime
import uuid

from app.services.event_system import global_event_bus
import structlog

router = APIRouter()
logger = structlog.get_logger()


@router.get("/test")
async def test_event_system():
    """Test if event system is working"""
    try:
        # Emit a test event
        await global_event_bus.emit("test.event", {
            "message": "Event system is working!",
            "timestamp": datetime.utcnow().isoformat()
        }, source="test")
        
        # Get recent events
        recent = global_event_bus.get_recent_events(5)
        
        return {
            "status": "success",
            "message": "Event system is operational",
            "recent_events": [
                {
                    "type": e.type,
                    "source": e.source,
                    "timestamp": e.timestamp
                } for e in recent
            ]
        }
    except Exception as e:
        logger.error(f"Event system test failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/emit")
async def emit_test_event(event_type: str, data: dict):
    """Emit a test event"""
    try:
        await global_event_bus.emit(event_type, data, source="test_api")
        return {"status": "success", "event_type": event_type}
    except Exception as e:
        logger.error(f"Failed to emit event: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stream")
async def stream_test_events():
    """Stream events for testing"""
    async def event_generator():
        """Generate test events"""
        # Send initial event
        yield f"data: {json.dumps({'type': 'connection', 'message': 'Connected to event stream'})}\n\n"
        
        # Send periodic test events
        for i in range(10):
            await asyncio.sleep(1)
            event = {
                "type": "test.periodic",
                "data": {"count": i, "message": f"Test event {i}"},
                "timestamp": datetime.utcnow().isoformat()
            }
            yield f"data: {json.dumps(event)}\n\n"
            
            # Also emit to global bus
            await global_event_bus.emit("test.periodic", event["data"], source="stream_test")
        
        # Send completion
        yield f"data: {json.dumps({'type': 'complete', 'message': 'Test stream complete'})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )


@router.post("/simulate-swarm")
async def simulate_swarm_events():
    """Simulate a swarm execution with events"""
    try:
        execution_id = str(uuid.uuid4())
        
        # Simulate task start
        await global_event_bus.emit("task.started", {
            "execution_id": execution_id,
            "task": "Test task simulation"
        }, source="simulator")
        
        # Simulate agent spawn
        await asyncio.sleep(0.5)
        await global_event_bus.emit("agent.spawned", {
            "agent_id": "researcher_test",
            "role": "researcher",
            "execution_id": execution_id
        }, source="simulator")
        
        # Simulate agent working
        await asyncio.sleep(0.5)
        await global_event_bus.emit("agent.started", {
            "agent": "researcher_test",
            "execution_id": execution_id
        }, source="researcher_test")
        
        # Simulate need for another agent
        await asyncio.sleep(1)
        await global_event_bus.emit("agent.needed", {
            "role": "developer",
            "reason": "Need to implement solution",
            "requesting_agent": "researcher_test"
        }, source="researcher_test")
        
        # Simulate human question
        await asyncio.sleep(0.5)
        await global_event_bus.emit("human.question", {
            "id": str(uuid.uuid4()),
            "question": "Should we use Python or JavaScript?",
            "requesting_agent": "researcher_test"
        }, source="researcher_test")
        
        # Simulate completion
        await asyncio.sleep(1)
        await global_event_bus.emit("task.completed", {
            "execution_id": execution_id,
            "duration": 3.5
        }, source="simulator")
        
        return {
            "status": "success",
            "execution_id": execution_id,
            "events_emitted": 6,
            "message": "Simulated swarm execution complete"
        }
        
    except Exception as e:
        logger.error(f"Simulation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))