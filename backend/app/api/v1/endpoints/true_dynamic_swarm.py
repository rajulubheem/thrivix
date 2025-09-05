"""
True Dynamic Swarm API endpoints
Session-based dynamic agent spawning with shared memory
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import json
import asyncio
from datetime import datetime
import uuid

from app.schemas.swarm import SwarmExecutionRequest
from app.services.true_dynamic_swarm_service import TrueDynamicSwarmService
from app.services.event_system import global_event_bus
from app.core.security import get_current_user
import structlog

router = APIRouter()
logger = structlog.get_logger()

# Global service instance
true_swarm_service = TrueDynamicSwarmService()

@router.post("/execute")
async def execute_true_dynamic_swarm(
    request: SwarmExecutionRequest,
    current_user: dict = Depends(get_current_user)
):
    """Execute true dynamic swarm with session-based coordination"""
    try:
        # Set execution mode
        request.execution_mode = "true_dynamic"
        
        # Generate execution ID
        execution_id = request.execution_id or str(uuid.uuid4())
        request.execution_id = execution_id
        
        # Start execution in background with error handling
        async def background_execution():
            try:
                await true_swarm_service.execute_swarm_async(
                    request,
                    current_user["id"],
                    None  # No streaming callback for now
                )
                logger.info(f"✅ Background swarm execution completed for {execution_id}")
            except Exception as e:
                logger.error(f"❌ Background swarm execution failed for {execution_id}: {e}", exc_info=True)
                # Emit error event to event stream
                await global_event_bus.emit("swarm.error", {
                    "execution_id": execution_id,
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat()
                }, source="true_dynamic_swarm")
        
        # Create the background task
        task = asyncio.create_task(background_execution())
        
        # Store the task reference to prevent it from being garbage collected
        true_swarm_service.execution_tasks[execution_id] = task
        
        return {
            "execution_id": execution_id,
            "status": "started",
            "message": "True dynamic swarm execution started with session-based coordination",
            "features": [
                "Session-based agent coordination",
                "Automatic sub-agent spawning and execution", 
                "Shared memory across all agents",
                "Hierarchical agent management",
                "AI decision-driven agent creation"
            ]
        }
        
    except Exception as e:
        logger.error(f"True dynamic swarm execution failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/events")
async def stream_true_swarm_events(
    current_user: dict = Depends(get_current_user)
):
    """Stream real-time events from true dynamic swarm"""
    async def event_generator():
        logger.info("Starting true dynamic swarm event stream")
        
        # Send initial connection message
        yield f"data: {json.dumps({'type': 'connected', 'message': 'True Dynamic Swarm event stream connected', 'features': ['session_coordination', 'auto_agent_spawning', 'shared_memory']})}\n\n"
        
        # Stream events from global event bus with enhanced filtering
        last_index = len(global_event_bus.event_history)
        keepalive_counter = 0
        
        while True:
            await asyncio.sleep(0.1)
            keepalive_counter += 1
            
            # Check for new events
            current_events = global_event_bus.event_history
            if len(current_events) > last_index:
                logger.info(f"🔄 EventSource: Found {len(current_events) - last_index} new events")
                for event in current_events[last_index:]:
                    # Enhanced event data for true dynamic swarm
                    event_data = {
                        'id': event.id,
                        'type': event.type,
                        'data': event.data,
                        'source': event.source,
                        'timestamp': event.timestamp,
                        'session_enhanced': True,
                        'coordination_type': 'true_dynamic'
                    }
                    
                    # Add session context if available
                    if hasattr(event, 'session_id'):
                        event_data['session_id'] = event.session_id
                    
                    logger.info(f"📤 EventSource: Sending event {event.type} from {event.source}")
                    yield f"data: {json.dumps(event_data)}\n\n"
                    
                last_index = len(current_events)
                keepalive_counter = 0
            
            # Send enhanced keepalive with system status
            if keepalive_counter >= 300:  # 30 seconds
                keepalive_data = {
                    "type": "keepalive",
                    "active_swarms": len(true_swarm_service.active_swarms),
                    "total_sessions": len(true_swarm_service.active_swarms),
                    "timestamp": datetime.utcnow().isoformat()
                }
                yield f"data: {json.dumps(keepalive_data)}\n\n"
                keepalive_counter = 0
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Swarm-Type": "true-dynamic"
        }
    )

@router.get("/status/{execution_id}")
async def get_true_swarm_status(
    execution_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get detailed status of true dynamic swarm execution"""
    try:
        status = true_swarm_service.get_swarm_status(execution_id)
        
        if "error" in status:
            raise HTTPException(status_code=404, detail="Swarm execution not found")
            
        return {
            **status,
            "swarm_type": "true_dynamic",
            "architecture": "session_based",
            "features_active": [
                "shared_session_memory",
                "auto_sub_agent_execution", 
                "hierarchical_coordination",
                "ai_driven_spawning"
            ]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get swarm status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/debug/active-sessions")
async def get_active_sessions(current_user: dict = Depends(get_current_user)):
    """Debug endpoint to see all active and completed sessions"""
    return {
        "active_sessions": list(true_swarm_service.active_swarms.keys()),
        "completed_sessions": list(true_swarm_service.completed_swarms.keys()),
        "active_count": len(true_swarm_service.active_swarms),
        "completed_count": len(true_swarm_service.completed_swarms),
        "total_count": len(true_swarm_service.active_swarms) + len(true_swarm_service.completed_swarms)
    }

@router.get("/session/{session_id}")
async def get_session_details(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get detailed session information including shared memory"""
    try:
        # Check new session format first
        session_data = true_swarm_service.active_sessions.get(session_id)
        if not session_data:
            # Check completed sessions
            session_data = true_swarm_service.completed_sessions.get(session_id)
        
        # Legacy fallback
        if not session_data:
            swarm = true_swarm_service.active_swarms.get(session_id)
            if not swarm:
                swarm = true_swarm_service.completed_swarms.get(session_id)
            
            if swarm:
                # Return legacy format
                return {
                    "session_id": swarm.session_id,
                    "project_context": swarm.get_project_context(),
                    "agent_registry": swarm.get_agent_registry(),
                    "communication_log": swarm.get_communication_log()[-10:],
                    "shared_results": swarm.get_shared_results(),
                    "spawn_queue": swarm.swarm_session.spawn_queue,
                    "main_agents": swarm.main_agents,
                    "sub_agents": swarm.sub_agents,
                    "coordination_stats": {
                        "total_agents": len(swarm.active_agents),
                        "active_agents": len([a for a in swarm.active_agents.values() if a["status"] == "executing"]),
                        "completed_agents": len([a for a in swarm.active_agents.values() if a["status"] == "completed"]),
                        "failed_agents": len([a for a in swarm.active_agents.values() if a["status"] == "failed"])
                    }
                }
            else:
                raise HTTPException(status_code=404, detail="Session not found")
        
        # Return new session format
        agents = session_data.get("agents", {})
        return {
            "session_id": session_id,
            "project_context": {
                "task": session_data.get("task", ""),
                "user_id": session_data.get("user_id", ""),
                "execution_mode": session_data.get("execution_mode", ""),
                "start_time": session_data.get("start_time", ""),
                "max_agents": session_data.get("max_agents", 0)
            },
            "agent_registry": {name: {"name": name, "type": "strands_agent"} for name in agents.keys()},
            "communication_log": [],  # Would need to get from Strands session if needed
            "shared_results": {},
            "spawn_queue": [],
            "main_agents": list(agents.keys()),
            "sub_agents": [],
            "coordination_stats": {
                "total_agents": len(agents),
                "active_agents": len(agents),  # All Strands agents are active
                "completed_agents": 0,
                "failed_agents": 0
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get session details: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class ManualSpawnRequest(BaseModel):
    session_id: str
    role: str
    priority: str = "medium"
    requirements: list = []
    requesting_agent: str = "user"

class ContinueSessionRequest(BaseModel):
    session_id: str
    task: str

@router.post("/continue-session")
async def continue_session(
    request: ContinueSessionRequest,
    current_user: dict = Depends(get_current_user)
):
    """Continue an existing swarm session with a new task"""
    try:
        # Check if session exists (try new format first, fallback to legacy)
        session_data = true_swarm_service.active_sessions.get(request.session_id)
        if not session_data:
            session_data = true_swarm_service.completed_sessions.get(request.session_id)
        
        # Legacy fallback - FORCE MIGRATION to Strands session management
        if not session_data:
            swarm = true_swarm_service.active_swarms.get(request.session_id)
            if not swarm:
                swarm = true_swarm_service.completed_swarms.get(request.session_id)
            
            if not swarm:
                raise HTTPException(status_code=404, detail="Session not found")
            
            # MIGRATE legacy session to Strands session management
            logger.info(f"🔄 Migrating legacy session {request.session_id} to Strands session management")
            
            from strands.session.file_session_manager import FileSessionManager
            
            # Create new Strands session manager
            session_manager = FileSessionManager(
                session_id=request.session_id,
                base_dir="./sessions"
            )
            
            # Create new session data with Strands session manager
            session_data = {
                "session_manager": session_manager,
                "task": request.task,
                "user_id": "demo-user",
                "execution_mode": "true_dynamic", 
                "start_time": datetime.utcnow().isoformat(),
                "max_agents": 50,
                "agents": {},
                "migrated_from_legacy": True
            }
            
            # Store in new format and remove from legacy
            true_swarm_service.active_sessions[request.session_id] = session_data
            if request.session_id in true_swarm_service.completed_swarms:
                del true_swarm_service.completed_swarms[request.session_id]
            if request.session_id in true_swarm_service.active_swarms:
                del true_swarm_service.active_swarms[request.session_id]
                
            logger.info(f"✅ Successfully migrated session {request.session_id} to Strands format")
        else:
            # New Strands session format - simply update task
            session_data["task"] = request.task
            session_data["last_updated"] = datetime.utcnow().isoformat()
            
            # Move back to active if it was completed
            if request.session_id in true_swarm_service.completed_sessions:
                true_swarm_service.active_sessions[request.session_id] = session_data
                del true_swarm_service.completed_sessions[request.session_id]
        
        # Start execution in background (single task, no nesting)
        async def background_execution():
            try:
                # Check if main analyzer already exists (don't create duplicates)
                analyzer_name = f"analyzer_{request.session_id[:8]}"
                session_data = true_swarm_service.active_sessions.get(request.session_id)
                
                need_coordination_loop = False
                
                if session_data:
                    # Strands session - check if analyzer exists in agents dict
                    if analyzer_name not in session_data.get("agents", {}):
                        await true_swarm_service._start_main_analyzer(request.session_id, request.task, None)
                        need_coordination_loop = True  # New analyzer needs coordination loop
                    else:
                        logger.info(f"🔄 Using existing main analyzer {analyzer_name} for continued session")
                        # Just send the new task to the existing analyzer (no coordination loop needed)
                        await true_swarm_service._send_task_to_existing_analyzer(request.session_id, request.task)
                else:
                    # Legacy session - check main_agents list
                    swarm = true_swarm_service.active_swarms.get(request.session_id)
                    if swarm and analyzer_name not in swarm.main_agents:
                        await true_swarm_service._start_main_analyzer(request.session_id, request.task, None)
                        need_coordination_loop = True  # New analyzer needs coordination loop
                    elif swarm:
                        logger.info(f"🔄 Using existing main analyzer {analyzer_name} for continued session")
                        # Just send the new task to the existing analyzer (no coordination loop needed)
                        await true_swarm_service._send_task_to_existing_analyzer(request.session_id, request.task)
                
                # Only run coordination loop for new analyzers (not for existing ones)
                if need_coordination_loop:
                    logger.info(f"🔄 Running coordination loop for new analyzer")
                    await true_swarm_service._run_coordination_loop(request.session_id, None)
                else:
                    logger.info(f"✅ Skipping coordination loop - task sent directly to existing analyzer")
                
                logger.info(f"✅ Session continuation completed for {request.session_id}")
            except Exception as e:
                logger.error(f"❌ Session continuation failed for {request.session_id}: {e}", exc_info=True)
                
        # Create the background task (single task for the entire flow)
        task = asyncio.create_task(background_execution())
        true_swarm_service.execution_tasks[request.session_id] = task
        
        return {
            "session_id": request.session_id,
            "status": "continued",
            "message": "Session continued with new task",
            "task": request.task
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to continue session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/spawn-agent")
async def manually_spawn_agent(
    request: ManualSpawnRequest,
    current_user: dict = Depends(get_current_user)
):
    """Manually spawn an agent in an active swarm session"""
    try:
        swarm = true_swarm_service.active_swarms.get(request.session_id)
        if not swarm:
            raise HTTPException(status_code=404, detail="Swarm session not found")
            
        # Queue the agent for spawning
        agent_specs = [{
            "role": request.role,
            "priority": request.priority,
            "requirements": request.requirements
        }]
        
        swarm.queue_agent_spawn(agent_specs, request.requesting_agent)
        
        # Process spawn queue immediately
        spawned_agents = await swarm.process_spawn_queue()
        
        return {
            "status": "success",
            "spawned_agents": spawned_agents,
            "session_id": request.session_id,
            "message": f"Successfully spawned {len(spawned_agents)} agents with session context"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to spawn agent: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stop/{execution_id}")
async def stop_true_swarm(
    execution_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Stop a true dynamic swarm execution"""
    try:
        if execution_id not in true_swarm_service.active_swarms:
            raise HTTPException(status_code=404, detail="Swarm execution not found")
            
        # Cleanup the swarm
        await true_swarm_service._cleanup_swarm(execution_id)
        
        # Emit stop event
        await global_event_bus.emit("swarm.stopped", {
            "execution_id": execution_id,
            "stopped_by": current_user.get("id"),
            "timestamp": datetime.utcnow().isoformat(),
            "swarm_type": "true_dynamic"
        }, source="api")
        
        return {
            "execution_id": execution_id,
            "status": "stopped",
            "message": "True dynamic swarm stopped successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to stop swarm: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/list-active")
async def list_active_swarms(
    current_user: dict = Depends(get_current_user)
):
    """List all active true dynamic swarms"""
    try:
        active_swarms = []
        
        for session_id, swarm in true_swarm_service.active_swarms.items():
            project_context = swarm.get_project_context()
            
            active_swarms.append({
                "session_id": session_id,
                "task": project_context.get("task", "Unknown task"),
                "start_time": project_context.get("start_time"),
                "agent_count": len(swarm.active_agents),
                "main_agents": len(swarm.main_agents),
                "sub_agents": len(swarm.sub_agents),
                "spawn_queue_size": len(swarm.swarm_session.spawn_queue),
                "swarm_type": "true_dynamic"
            })
        
        return {
            "active_swarms": active_swarms,
            "total_count": len(active_swarms),
            "service_type": "true_dynamic_swarm",
            "architecture": "session_based_coordination"
        }
        
    except Exception as e:
        logger.error(f"Failed to list active swarms: {e}")
        raise HTTPException(status_code=500, detail=str(e))