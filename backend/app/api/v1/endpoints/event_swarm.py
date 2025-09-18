"""
Event-Driven Swarm API endpoints with human-in-loop support
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import json
import asyncio
import time
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


@router.post("/stream")
async def stream_event_swarm(
    request: SwarmExecutionRequest
    # Temporarily disabled for testing: current_user: dict = Depends(get_current_user)
):
    """Stream swarm execution with Server-Sent Events"""
    logger.info(f"Starting SSE stream for execution: {request.task}")
    
    async def event_generator():
        logger.info("SSE generator started")
        try:
            # Set execution mode
            request.execution_mode = "event_driven"
            execution_id = request.execution_id or str(uuid.uuid4())
            request.execution_id = execution_id
            logger.info(f"Execution ID: {execution_id}")
            
            # Send initial connection event
            yield f"data: {json.dumps({'type': 'connected', 'execution_id': execution_id, 'timestamp': datetime.now().isoformat()})}\n\n"
            logger.info("Sent initial connection event")
            
            # Create a queue for streaming events
            event_queue = asyncio.Queue()
            
            # Track events from global event bus
            event_listener_task = None
            
            # Register listener for all events from the global event bus
            async def forward_bus_events(event):
                """Forward events from the global event bus to the SSE stream"""
                try:
                    logger.info(f"Forwarding event: {event.type} from {event.source}")
                    
                    # Forward all event bus events to the SSE stream
                    event_data = {
                        "type": event.type,
                        "data": event.data,
                        "source": event.source,
                        "timestamp": event.timestamp
                    }
                    
                    # Special handling for agent.completed events
                    if event.type == "agent.completed":
                        logger.info(f"Agent completed event detected: {event.data}")
                        # Don't send output again - it was already streamed
                        # The output field should not be in agent.completed anymore
                    
                    # Forward the original event without blocking
                    asyncio.create_task(event_queue.put(event_data))
                except Exception as e:
                    logger.error(f"Error forwarding bus event: {e}", exc_info=True)
            
            # Register the event listener
            global_event_bus.on("*", forward_bus_events)
            
            # Track pending events
            pending_events = []
            
            # Track recent events to avoid duplicates
            recent_event_hashes = set()
            event_dedup_window = 100  # Keep last 100 event hashes
            
            # Create async streaming callback to handle events from swarm
            async def streaming_callback(**kwargs):
                # Log what we receive for debugging - but only log the keys, not the values
                received_keys = list(kwargs.keys())
                if received_keys:
                    logger.debug(f"Streaming callback received keys: {received_keys}")
                
                # IMPORTANT: Process ONLY the expected fields from HumanLoopAgent
                # HumanLoopAgent sends: type, agent, data (containing chunk)
                event_type = kwargs.get("type", None)
                agent = kwargs.get("agent", None)
                data = kwargs.get("data", None)
                
                # Skip if missing required fields
                if not event_type or not agent:
                    logger.debug(f"Missing required fields: type={event_type}, agent={agent}")
                    return
                
                content = ""
                
                # Create hash for deduplication - be more specific to avoid false positives
                # For text_generation events, include timestamp to avoid blocking similar chunks
                chunk_text = ""
                if event_type == "text_generation" and isinstance(data, dict):
                    chunk_text = data.get("chunk", "")
                
                # Include a timestamp component to ensure we don't block similar chunks
                import time
                timestamp_bucket = int(time.time() * 10)  # 100ms buckets
                
                event_hash = hash((
                    event_type,
                    agent,
                    chunk_text if chunk_text else str(data),  # Use full text for uniqueness
                    timestamp_bucket  # Different time buckets won't clash
                ))
                
                # Skip if we've seen this exact event recently
                if event_hash in recent_event_hashes:
                    logger.debug(f"Skipping duplicate event from {agent}")
                    return
                
                # Add to recent events (use deque for proper FIFO)
                recent_event_hashes.add(event_hash)
                # Don't limit the dedup window - just clear it periodically
                if len(recent_event_hashes) > event_dedup_window * 2:
                    # Clear half the hashes to prevent memory growth
                    recent_event_hashes.clear()
                
                # Handle different event types based on what HumanLoopAgent sends
                # text_generation events contain streaming chunks
                if event_type == "text_generation" and data:
                    # Extract chunk content from data dict
                    if isinstance(data, dict):
                        content = data.get("chunk", "")
                    else:
                        content = str(data) if data else ""
                    
                    # Also queue this as agent output event  
                    if content and agent:
                        agent_output_event = {
                            "type": "text_generation",
                            "agent": agent,
                            "data": {
                                "chunk": content,
                                "text": content,
                                "content": content
                            },
                            "output": content,  # Keep for backwards compatibility
                            "role": "assistant",
                            "timestamp": datetime.now().isoformat()
                        }
                        # Queue the event properly using async put (will wait if needed)
                        try:
                            # Use asyncio.create_task to queue without blocking the callback
                            asyncio.create_task(event_queue.put(agent_output_event))
                            logger.info(f"Immediately queued text_generation from {agent}")
                        except Exception as e:
                            logger.error(f"Failed to queue text_generation from {agent}: {e}")
                            # Store as fallback
                            pending_events.append(agent_output_event)
                    return  # IMPORTANT: Return here to avoid processing the same data again
                        
                elif event_type == "agent_completed":
                    # Agent has completed - don't send content (already streamed)
                    # Just send completion signal
                    agent_output_event = {
                        "type": "agent_completed",
                        "agent": agent or kwargs.get("source", "unknown"),
                        # Don't include content - it was already streamed chunk by chunk
                        "role": "assistant", 
                        "complete": True,
                        "timestamp": datetime.now().isoformat()
                    }
                    # Store event to be queued later
                    pending_events.append(agent_output_event)
                    # Also try to push immediately to queue (non-blocking)
                    try:
                        event_queue.put_nowait(agent_output_event)
                        logger.info(f"Immediately queued agent_completed from {agent}")
                    except asyncio.QueueFull:
                        logger.warning(f"Queue full for immediate push from {agent}")
                    return  # IMPORTANT: Return here to avoid further processing
                    
                elif "current_tool_use" in kwargs and kwargs["current_tool_use"]:
                    tool = kwargs["current_tool_use"]
                    event_type = "tool"
                    agent = tool.get("name", "unknown")
                    content = json.dumps(tool.get("input", {}))
                elif "message" in kwargs:
                    msg = kwargs["message"]
                    event_type = "message"
                    content = msg.get("content", "")
                    agent = msg.get("role", "assistant")
                elif "result" in kwargs:
                    event_type = "complete"
                    result = kwargs["result"]
                    if hasattr(result, "output"):
                        content = result.output
                    else:
                        content = str(result)
                else:
                    # No recognized event type, skip
                    return
                        
                # Get agent name from various sources
                if not agent:
                    agent = kwargs.get("agent", kwargs.get("source", "coordinator"))
                
                # Create event for non-delta types (delta already handled above)
                if event_type != "delta":
                    event = {
                        "type": event_type,
                        "agent": agent,
                        "content": content,
                        "timestamp": datetime.now().isoformat()
                    }
                    
                    # Queue the event (non-blocking)
                    try:
                        event_queue.put_nowait(event)
                        logger.info(f"Queued event type: {event_type} from {agent}")
                    except asyncio.QueueFull:
                        logger.warning(f"Queue full, dropping event: {event_type} from {agent}")
                        # Still append to pending_events for later flush
                        pending_events.append(event)
            
            # Flush pending events periodically
            async def flush_pending_events():
                while True:
                    await asyncio.sleep(0.1)  # Check every 100ms
                    while pending_events:
                        event = pending_events.pop(0)
                        try:
                            await event_queue.put(event)
                            logger.info(f"Flushed pending event for agent: {event.get('agent')}")
                        except Exception as e:
                            logger.error(f"Failed to flush event: {e}")
            
            # Start the event flusher
            flusher_task = asyncio.create_task(flush_pending_events())
            
            # Start swarm execution in background
            async def run_swarm():
                try:
                    result = await event_swarm_service.execute_swarm_async(
                        request,
                        "test_user",  # Using test user for now
                        streaming_callback,
                        None  # conversation history
                    )
                    
                    # Queue completion event
                    await event_queue.put({
                        'type': 'complete',
                        'result': str(result.result if hasattr(result, 'result') else result),
                        'timestamp': datetime.now().isoformat()
                    })
                    
                    # Signal end of stream
                    await event_queue.put(None)
                    
                except Exception as e:
                    # Queue error event
                    await event_queue.put({
                        'type': 'error',
                        'message': str(e),
                        'timestamp': datetime.now().isoformat()
                    })
                    await event_queue.put(None)
            
            # Start swarm execution
            logger.info("Starting swarm execution task")
            swarm_task = asyncio.create_task(run_swarm())
            
            # Stream events from queue
            logger.info("Starting event streaming loop")
            event_count = 0
            last_keepalive = time.time()
            
            while True:
                # Process events efficiently
                try:
                    # Try to get event with short timeout
                    event = await asyncio.wait_for(event_queue.get(), timeout=0.1)
                    
                    if event is None:
                        logger.info("Received None event, ending stream")
                        return
                    
                    event_count += 1
                    event_type = event.get('type', 'unknown')
                    
                    # Log streaming events
                    if event_type == 'text_generation':
                        logger.info(f"Streaming text_generation event {event_count} from {event.get('agent', 'unknown')}")
                    else:
                        logger.debug(f"Streaming event {event_count}: {event_type}")
                    
                    # Send event immediately
                    yield f"data: {json.dumps(event)}\n\n"
                    
                except asyncio.TimeoutError:
                    # Send keepalive every second to maintain connection
                    current_time = time.time()
                    if current_time - last_keepalive >= 1.0:
                        logger.debug("Sending keepalive")
                        yield f"data: {json.dumps({'type': 'keepalive', 'timestamp': datetime.now().isoformat()})}\n\n"
                        last_keepalive = current_time
                    
                    # Check if swarm is done
                    if swarm_task.done():
                        # Give a bit more time for remaining events
                        await asyncio.sleep(0.5)
                        if event_queue.empty():
                            logger.info("Swarm task completed and queue empty, ending stream")
                            break
                        
        except Exception as e:
            logger.error(f"Streaming failed: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e), 'timestamp': datetime.now().isoformat()})}\n\n"
        finally:
            # Clean up
            try:
                flusher_task.cancel()
            except:
                pass
            try:
                global_event_bus.off("*", forward_bus_events)
            except:
                pass
            logger.info("Cleaned up event stream resources")
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering
            "X-Content-Type-Options": "nosniff"
        }
    )


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
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering
            "X-Content-Type-Options": "nosniff"
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


# Sequential Execution Control Endpoints

class SequentialControlRequest(BaseModel):
    execution_id: str
    enabled: bool

@router.post("/sequential/control")
async def control_sequential_execution(request: SequentialControlRequest):
    """Enable or disable sequential hierarchical execution for specific execution"""
    try:
        if request.enabled:
            success = event_swarm_service.enable_sequential_execution(request.execution_id)
            message = f"Sequential execution enabled for {request.execution_id}"
        else:
            success = event_swarm_service.disable_sequential_execution(request.execution_id)
            message = f"Sequential execution disabled for {request.execution_id}"
            
        return {
            "success": success,
            "message": message,
            "execution_id": request.execution_id,
            "sequential_enabled": request.enabled
        }
        
    except Exception as e:
        logger.error(f"Failed to control sequential execution: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to control sequential execution: {str(e)}")

@router.get("/sequential/status/{execution_id}")
async def get_sequential_status(execution_id: str):
    """Get sequential execution status for specific execution"""
    try:
        status = event_swarm_service.get_sequential_status(execution_id)
        return {
            "execution_id": execution_id,
            "sequential_status": status
        }
        
    except Exception as e:
        logger.error(f"Failed to get sequential status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get sequential status: {str(e)}")