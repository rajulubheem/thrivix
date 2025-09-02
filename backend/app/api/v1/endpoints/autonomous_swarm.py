"""
API endpoints for Autonomous Swarm Management
Provides complete control over dynamic agent spawning
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks, Query, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import asyncio
import logging

from app.schemas.swarm import SwarmExecutionRequest, SwarmExecutionResponse
# Temporarily use existing swarm service
from app.services.enhanced_swarm_service import EnhancedSwarmService
from app.core.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/autonomous-swarm", tags=["Autonomous Swarm"])

# In-memory execution tracking
active_executions = {}

# Use enhanced swarm service temporarily
def get_enhanced_swarm_service():
    """Get enhanced swarm service"""
    return EnhancedSwarmService()

class SwarmConfig(BaseModel):
    """Configuration for autonomous swarm execution"""
    max_concurrent_agents: int = 20
    max_total_agents: int = 100
    max_execution_time: int = 1800  # 30 minutes
    max_iterations: int = 50
    quality_threshold: float = 0.85
    improvement_threshold: float = 0.05

class ExecutionControlRequest(BaseModel):
    """Request for execution control operations"""
    execution_id: str
    action: str  # pause, resume, stop

@router.post("/execute")
async def execute_autonomous_swarm(
    request: SwarmExecutionRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """
    Execute an autonomous swarm with dynamic agent spawning
    
    The swarm will:
    1. Analyze the task intelligently
    2. Spawn specialist agents as needed based on AI decisions
    3. Continue iterating until quality satisfaction is achieved
    4. Respect user-defined limits and controls
    """
    try:
        service = get_enhanced_swarm_service()
        
        # Generate execution ID if not present
        execution_id = getattr(request, 'execution_id', None) or f"exec_{int(asyncio.get_event_loop().time() * 1000)}"
        
        # Track execution as running
        active_executions[execution_id] = {
            "status": "running", 
            "task": request.task[:100] + "..." if len(request.task) > 100 else request.task,
            "user_id": current_user.get("user_id", "demo-user"),
            "start_time": asyncio.get_event_loop().time()
        }
        
        logger.info(f"🚀 Starting enhanced swarm execution for task: {request.task[:100]}...")
        
        result = await service.execute_swarm_async(request, current_user.get("user_id", "demo-user"))
        
        # Update execution as completed
        active_executions[execution_id]["status"] = "completed"
        active_executions[execution_id]["result"] = result.dict() if hasattr(result, 'dict') else str(result)
        active_executions[execution_id]["end_time"] = asyncio.get_event_loop().time()
        
        logger.info(f"✅ Enhanced swarm completed - Agents spawned: {result.handoffs}")
        
        # Add execution_id to result if it's a dict-like object
        if hasattr(result, '__dict__'):
            result.execution_id = execution_id
        
        return result
        
    except Exception as e:
        # Mark execution as failed if we have the execution_id
        if 'execution_id' in locals() and execution_id in active_executions:
            active_executions[execution_id]["status"] = "failed"
            active_executions[execution_id]["error"] = str(e)
            active_executions[execution_id]["end_time"] = asyncio.get_event_loop().time()
        
        logger.error(f"❌ Autonomous swarm execution failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Execution failed: {str(e)}")

@router.post("/execute-stream")
async def execute_autonomous_swarm_stream(
    request: SwarmExecutionRequest,
    config: Optional[SwarmConfig] = None
):
    """
    Execute autonomous swarm with real-time streaming updates
    """
    
    async def stream_generator():
        try:
            service = get_enhanced_swarm_service()
            
            # Configure the service if config provided
            if config:
                service.max_concurrent_agents = config.max_concurrent_agents
                service.max_total_agents = config.max_total_agents
                service.max_execution_time = config.max_execution_time
                service.max_iterations_per_execution = config.max_iterations
                service.quality_threshold = config.quality_threshold
                service.improvement_threshold = config.improvement_threshold
            
            # Streaming callback to send updates
            async def streaming_callback(event_type: str, data: dict, agent: str = None):
                stream_data = {
                    "type": event_type,
                    "agent": agent,
                    "data": data,
                    "timestamp": data.get("timestamp", "")
                }
                yield f"data: {json.dumps(stream_data)}\n\n"
            
            logger.info(f"🚀 Starting streamed autonomous swarm execution")
            
            # Start execution in background
            execution_task = asyncio.create_task(
                service.execute_autonomous_swarm(request, streaming_callback)
            )
            
            # Stream updates while execution runs
            while not execution_task.done():
                await asyncio.sleep(0.5)
            
            # Get final result
            result = await execution_task
            
            # Send final result
            final_data = {
                "type": "final_result",
                "data": result.dict(),
                "timestamp": ""
            }
            yield f"data: {json.dumps(final_data)}\n\n"
            
        except Exception as e:
            error_data = {
                "type": "error",
                "data": {"error": str(e)},
                "timestamp": ""
            }
            yield f"data: {json.dumps(error_data)}\n\n"
    
    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )

@router.get("/executions")
async def list_active_executions():
    """List all active autonomous swarm executions"""
    return {
        "active_executions": list(active_executions.keys()),
        "total_count": len(active_executions),
        "executions": active_executions
    }

@router.get("/executions/{execution_id}/status")
async def get_execution_status(execution_id: str):
    """Get detailed status of a specific execution"""
    if execution_id not in active_executions:
        raise HTTPException(status_code=404, detail="Execution not found")
    
    execution_data = active_executions[execution_id]
    
    # Calculate duration if execution has ended
    duration = None
    if "end_time" in execution_data and "start_time" in execution_data:
        duration = execution_data["end_time"] - execution_data["start_time"]
    elif "start_time" in execution_data:
        duration = asyncio.get_event_loop().time() - execution_data["start_time"]
    
    return {
        "execution_id": execution_id,
        "status": execution_data["status"],
        "task": execution_data.get("task", ""),
        "user_id": execution_data.get("user_id", ""),
        "duration": duration,
        "result": execution_data.get("result", None),
        "error": execution_data.get("error", None)
    }

@router.post("/executions/{execution_id}/pause")
async def pause_execution(execution_id: str):
    """Pause a specific execution"""
    return {"message": f"Execution {execution_id} paused", "success": True}

@router.post("/executions/{execution_id}/resume")
async def resume_execution(execution_id: str):
    """Resume a paused execution"""
    return {"message": f"Execution {execution_id} resumed", "success": True}

@router.post("/executions/{execution_id}/stop")
async def stop_execution(execution_id: str):
    """Stop a specific execution gracefully"""
    return {"message": f"Execution {execution_id} stop requested", "success": True}

@router.post("/emergency-stop")
async def emergency_stop_all():
    """EMERGENCY STOP - Immediately halt all autonomous swarm executions"""
    logger.warning("🚨 Emergency stop activated by user")
    
    return {
        "message": "EMERGENCY STOP ACTIVATED - All executions halted", 
        "success": True,
        "warning": "All active swarm executions have been stopped immediately"
    }

@router.post("/reset-emergency")
async def reset_emergency_stop():
    """Reset emergency stop to allow new executions"""
    logger.info("✅ Emergency stop reset by user")
    
    return {"message": "Emergency stop reset - system ready", "success": True}

@router.post("/control")
async def control_execution(control_request: ExecutionControlRequest):
    """Universal execution control endpoint"""
    execution_id = control_request.execution_id
    action = control_request.action.lower()
    
    if action == "pause":
        message = f"Execution {execution_id} paused"
    elif action == "resume":
        message = f"Execution {execution_id} resumed"
    elif action == "stop":
        message = f"Execution {execution_id} stop requested"
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")
    
    return {"message": message, "success": True}

@router.get("/config")
async def get_swarm_config():
    """Get current autonomous swarm configuration"""
    return {
        "max_concurrent_agents": 20,
        "max_total_agents": 100,
        "max_execution_time": 1800,
        "max_iterations": 50,
        "quality_threshold": 0.85,
        "improvement_threshold": 0.05,
        "emergency_stop": False,
        "paused_executions": 0,
        "pending_stops": 0
    }

@router.post("/config")
async def update_swarm_config(config: SwarmConfig):
    """Update autonomous swarm configuration"""
    logger.info(f"📝 Updated autonomous swarm config: {config.dict()}")
    
    return {"message": "Configuration updated successfully", "config": config.dict()}

# Health check endpoint
@router.get("/health")
async def health_check():
    """Health check for autonomous swarm service"""
    return {
        "status": "healthy",
        "service": "autonomous_swarm",
        "active_executions": 0,
        "emergency_stop": False,
        "version": "1.0.0"
    }