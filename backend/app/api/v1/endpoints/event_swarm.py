"""
Event-Driven Swarm API endpoints with human-in-loop support
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import json
import asyncio
from datetime import datetime
import uuid

from app.schemas.swarm import SwarmExecutionRequest, SwarmExecutionResponse
from app.services.event_driven_strands_swarm import EventDrivenStrandsSwarm
from app.services.event_system import global_event_bus
from app.core.security import get_current_user
import structlog

router = APIRouter()
logger = structlog.get_logger()

# Global swarm service instance
event_swarm_service = EventDrivenStrandsSwarm()


@router.post("/execute")
async def execute_event_swarm(
    request: SwarmExecutionRequest,
    current_user: dict = Depends(get_current_user)
):
    """Execute swarm with event-driven coordination - returns execution ID for polling"""
    try:
        # Set execution mode to event_driven
        request.execution_mode = "event_driven"
        
        # Generate execution ID
        execution_id = request.execution_id or str(uuid.uuid4())
        request.execution_id = execution_id
        
        # Start execution in background (non-blocking)
        asyncio.create_task(
            event_swarm_service.execute_swarm_async(
                request,
                current_user["id"],
                None  # No streaming callback needed for polling
            )
        )
        
        # Return immediately with execution ID for polling
        return {
            "execution_id": execution_id,
            "status": "started",
            "message": "Event-driven swarm execution started"
        }
        
    except Exception as e:
        logger.error(f"Event swarm execution failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/events")
async def stream_swarm_events(
    current_user: dict = Depends(get_current_user)
):
    """Stream real-time swarm events"""
    async def event_generator():
        """Generate events from event bus"""
        logger.info("Starting event stream for swarm events")
        
        # Send initial connection message
        yield f"data: {json.dumps({'type': 'connected', 'message': 'Event stream connected'})}\n\n"
        
        # Get initial recent events
        recent = global_event_bus.get_recent_events(10)
        for event in recent:
            event_data = {
                'id': event.id,
                'type': event.type,
                'data': event.data,
                'source': event.source,
                'timestamp': event.timestamp
            }
            yield f"data: {json.dumps(event_data)}\n\n"
        
        # Stream new events as they occur
        last_index = len(global_event_bus.event_history)
        keepalive_counter = 0
        
        while True:
            await asyncio.sleep(0.1)
            keepalive_counter += 1
            
            # Check for new events
            current_events = global_event_bus.event_history
            if len(current_events) > last_index:
                for event in current_events[last_index:]:
                    event_data = {
                        'id': event.id,
                        'type': event.type,
                        'data': event.data,
                        'source': event.source,
                        'timestamp': event.timestamp
                    }
                    yield f"data: {json.dumps(event_data)}\n\n"
                last_index = len(current_events)
                keepalive_counter = 0
            
            # Send keepalive every 30 seconds
            if keepalive_counter >= 300:  # 30 seconds
                yield f": keepalive\n\n"
                keepalive_counter = 0
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.post("/human/answer")
async def provide_human_answer(
    question_id: str,
    answer: str,
    current_user: dict = Depends(get_current_user)
):
    """Provide answer to a human question"""
    try:
        await event_swarm_service.provide_human_response(question_id, answer)
        
        # Emit event that answer was provided
        await global_event_bus.emit("human.answered", {
            "question_id": question_id,
            "answer": answer,
            "user": current_user["id"]
        }, source="human")
        
        return {"status": "success", "question_id": question_id}
    except Exception as e:
        logger.error(f"Failed to provide human answer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/human/approve")
async def provide_approval(
    approval_id: str,
    approved: bool,
    reason: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Provide approval decision"""
    try:
        await event_swarm_service.provide_human_approval(approval_id, approved)
        
        # Emit event about approval
        await global_event_bus.emit("human.approval_provided", {
            "approval_id": approval_id,
            "approved": approved,
            "reason": reason,
            "user": current_user["id"]
        }, source="human")
        
        return {"status": "success", "approval_id": approval_id, "approved": approved}
    except Exception as e:
        logger.error(f"Failed to provide approval: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class SpawnAgentRequest(BaseModel):
    role: str
    context: Optional[dict] = None

@router.post("/spawn-agent")
async def spawn_dynamic_agent(
    request: SpawnAgentRequest,
    current_user: dict = Depends(get_current_user)
):
    """Manually spawn a new agent"""
    try:
        # Emit event to spawn agent
        await global_event_bus.emit("agent.needed", {
            "role": request.role,
            "context": request.context or {},
            "requesting_agent": "user",
            "user_id": current_user["id"]
        }, source="user")
        
        return {"status": "success", "message": f"Agent spawn request for {request.role} submitted"}
    except Exception as e:
        logger.error(f"Failed to spawn agent: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/agent-status")
async def get_agent_status(
    current_user: dict = Depends(get_current_user)
):
    """Get status of all active agents"""
    try:
        # Get active agents from event bus
        active_agents = global_event_bus.active_agents
        
        # Get recent agent events
        agent_events = global_event_bus.get_recent_events(20, "agent.*")
        
        return {
            "active_agents": list(active_agents.keys()),
            "recent_events": [
                {
                    "type": e.type,
                    "source": e.source,
                    "timestamp": e.timestamp
                } for e in agent_events
            ]
        }
    except Exception as e:
        logger.error(f"Failed to get agent status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/emit-event")
async def emit_custom_event(
    event_type: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Emit a custom event to the swarm (for testing/debugging)"""
    try:
        await global_event_bus.emit(event_type, {
            **data,
            "emitted_by": current_user["id"],
            "custom": True
        }, source="user")
        
        return {"status": "success", "event_type": event_type}
    except Exception as e:
        logger.error(f"Failed to emit event: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/events-test")
async def stream_swarm_events_test():
    """Test endpoint for streaming events without authentication"""
    async def event_generator():
        """Generate events from event bus"""
        logger.info("[TEST] Starting event stream for swarm events")
        
        # Send initial connection message
        yield f"data: {json.dumps({'type': 'connected', 'message': 'Event stream connected (TEST)'})}\n\n"
        
        # Get initial recent events
        recent = global_event_bus.get_recent_events(10)
        for event in recent:
            event_data = {
                'id': event.id,
                'type': event.type,
                'data': event.data,
                'source': event.source,
                'timestamp': event.timestamp
            }
            yield f"data: {json.dumps(event_data)}\n\n"
        
        # Stream new events as they occur
        last_index = len(global_event_bus.event_history)
        keepalive_counter = 0
        
        while True:
            await asyncio.sleep(0.1)
            keepalive_counter += 1
            
            # Check for new events
            current_events = global_event_bus.event_history
            if len(current_events) > last_index:
                logger.info(f"[TEST] Sending {len(current_events) - last_index} new events")
                for event in current_events[last_index:]:
                    event_data = {
                        'id': event.id,
                        'type': event.type,
                        'data': event.data,
                        'source': event.source,
                        'timestamp': event.timestamp
                    }
                    yield f"data: {json.dumps(event_data)}\n\n"
                last_index = len(current_events)
                keepalive_counter = 0
            
            # Send keepalive every 10 seconds for testing
            if keepalive_counter >= 100:  # 10 seconds
                logger.debug("[TEST] Sending keepalive")
                yield f": keepalive\n\n"
                keepalive_counter = 0
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*"
        }
    )


@router.post("/execute-test")
async def execute_event_swarm_test(
    request: SwarmExecutionRequest
):
    """Test endpoint for event-driven swarm without authentication - returns execution ID for polling"""
    try:
        # Set execution mode to event_driven
        request.execution_mode = "event_driven"
        
        # Generate execution ID
        execution_id = request.execution_id or str(uuid.uuid4())
        request.execution_id = execution_id
        
        # Start execution in background (non-blocking)
        asyncio.create_task(
            event_swarm_service.execute_swarm_async(
                request,
                "test_user",  # Use test user
                None  # No streaming callback needed for polling
            )
        )
        
        # Return immediately with execution ID for polling
        return {
            "execution_id": execution_id,
            "status": "started",
            "message": "[TEST] Event-driven swarm execution started"
        }
        
    except Exception as e:
        logger.error(f"[TEST] Event swarm execution failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# 🚨 EMERGENCY STOP CONTROLS 🚨

class StopRequest(BaseModel):
    execution_id: str
    force: bool = True


@router.post("/stop")
async def stop_execution(
    request: StopRequest,
    current_user: dict = Depends(get_current_user)
):
    """🚨 EMERGENCY STOP - Force stop a specific execution"""
    try:
        logger.warning(f"🚨 EMERGENCY STOP requested for execution {request.execution_id} by user {current_user.get('id')}")
        
        # Stop the specific execution
        success = event_swarm_service.stop_execution(request.execution_id)
        
        # Emit stop event
        await global_event_bus.emit("execution.emergency_stop", {
            "execution_id": request.execution_id,
            "stopped_by": current_user.get("id"),
            "force": request.force,
            "timestamp": datetime.utcnow().isoformat()
        }, source="emergency_stop")
        
        return {
            "execution_id": request.execution_id,
            "status": "stopped",
            "success": success,
            "message": "🛑 Execution stopped successfully"
        }
        
    except Exception as e:
        logger.error(f"Failed to stop execution {request.execution_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to stop execution: {str(e)}")


@router.post("/emergency-stop-all")
async def emergency_stop_all(
    current_user: dict = Depends(get_current_user)
):
    """🚨 NUCLEAR OPTION - Force stop ALL running executions"""
    try:
        logger.error(f"🚨🚨🚨 EMERGENCY STOP ALL requested by user {current_user.get('id')} 🚨🚨🚨")
        
        # Get all active executions and stop them
        stopped_count = 0
        if hasattr(event_swarm_service, 'active_executions'):
            executions_to_stop = list(event_swarm_service.active_executions.keys())
            
            for execution_id in executions_to_stop:
                try:
                    event_swarm_service.stop_execution(execution_id)
                    stopped_count += 1
                    logger.warning(f"🛑 Force stopped execution: {execution_id}")
                except Exception as e:
                    logger.error(f"Failed to stop execution {execution_id}: {e}")
        
        # Emit emergency stop all event
        await global_event_bus.emit("execution.emergency_stop_all", {
            "stopped_count": stopped_count,
            "stopped_by": current_user.get("id"),
            "timestamp": datetime.utcnow().isoformat()
        }, source="emergency_stop_all")
        
        return {
            "status": "emergency_stopped",
            "stopped_executions": stopped_count,
            "message": f"🚨 Emergency stop completed - {stopped_count} executions stopped"
        }
        
    except Exception as e:
        logger.error(f"Emergency stop all failed: {e}")
        raise HTTPException(status_code=500, detail=f"Emergency stop failed: {str(e)}")


@router.get("/status/{execution_id}")
async def get_execution_status(
    execution_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get detailed status of a specific execution"""
    try:
        if hasattr(event_swarm_service, 'get_execution_status'):
            status = event_swarm_service.get_execution_status(execution_id)
        else:
            # Fallback status check
            status = {
                "execution_id": execution_id,
                "status": "unknown", 
                "message": "Status monitoring not available"
            }
            
        return status
        
    except Exception as e:
        logger.error(f"Failed to get status for execution {execution_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Status check failed: {str(e)}")


@router.get("/list-active")
async def list_active_executions(
    current_user: dict = Depends(get_current_user)
):
    """List all currently active executions"""
    try:
        active_executions = []
        
        if hasattr(event_swarm_service, 'active_executions'):
            for execution_id, details in event_swarm_service.active_executions.items():
                active_executions.append({
                    "execution_id": execution_id,
                    "status": details.get("status", "unknown"),
                    "start_time": details.get("start_time"),
                    "user_id": details.get("user_id")
                })
        
        return {
            "active_executions": active_executions,
            "total_count": len(active_executions)
        }
        
    except Exception as e:
        logger.error(f"Failed to list active executions: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list executions: {str(e)}")