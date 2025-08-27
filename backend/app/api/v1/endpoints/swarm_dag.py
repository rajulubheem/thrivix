"""
Swarm DAG endpoints - Enhanced swarm with parallel execution support
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from typing import Dict, Any
import uuid
import logging

from app.schemas.swarm import (
    SwarmExecutionRequest,
    SwarmExecutionResponse,
    ExecutionStatus
)
from app.services.swarm_service import SwarmService
from app.services.swarm_dag_adapter import swarm_dag_adapter, ExecutionMode
from app.core.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/preview", response_model=Dict[str, Any])
async def preview_execution_mode(
    request: SwarmExecutionRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Preview how a task would be executed (sequential vs parallel).
    This doesn't actually run the agents, just analyzes the task.
    """
    try:
        # Convert agent configs to dict format
        agents = []
        if request.agents:
            agents = [
                {
                    "name": agent.name,
                    "system_prompt": agent.system_prompt,
                    "tools": agent.tools,
                    "role": agent.description or ""
                }
                for agent in request.agents
            ]
        
        # Get execution preview
        preview = swarm_dag_adapter.get_execution_preview(request.task, agents)
        
        return {
            "task": request.task,
            "preview": preview,
            "message": f"Task would be executed in {preview['recommended_mode']} mode"
        }
        
    except Exception as e:
        logger.error(f"Error previewing execution: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/execute", response_model=SwarmExecutionResponse)
async def execute_swarm_with_dag(
    request: SwarmExecutionRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """
    Execute swarm with automatic DAG parallel execution when beneficial.
    Falls back to sequential if parallel isn't suitable.
    """
    try:
        # Generate execution_id if not provided
        if not request.execution_id:
            request.execution_id = str(uuid.uuid4())
        
        # Convert execution_mode string to enum
        execution_mode = ExecutionMode.AUTO
        if request.execution_mode:
            if request.execution_mode.lower() == "sequential":
                execution_mode = ExecutionMode.SEQUENTIAL
            elif request.execution_mode.lower() == "parallel":
                execution_mode = ExecutionMode.PARALLEL
        
        # Convert agent configs to dict format
        agents = []
        if request.agents:
            agents = [
                {
                    "name": agent.name,
                    "system_prompt": agent.system_prompt,
                    "tools": agent.tools,
                    "role": agent.description or ""
                }
                for agent in request.agents
            ]
        
        # For background execution
        if request.background:
            background_tasks.add_task(
                _execute_with_dag_async,
                request,
                agents,
                execution_mode,
                current_user["id"]
            )
            return SwarmExecutionResponse(
                execution_id=request.execution_id,
                status=ExecutionStatus.QUEUED,
                message="Swarm execution queued with DAG optimization",
                execution_mode="auto"
            )
        
        # Execute synchronously with DAG optimization
        result = await _execute_with_dag_async(
            request,
            agents,
            execution_mode,
            current_user["id"]
        )
        return result
        
    except Exception as e:
        logger.error(f"Error executing swarm with DAG: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _execute_with_dag_async(
    request: SwarmExecutionRequest,
    agents: list,
    execution_mode: ExecutionMode,
    user_id: str
) -> SwarmExecutionResponse:
    """
    Internal function to execute with DAG optimization.
    """
    try:
        # Get existing swarm service for fallback
        swarm_service = SwarmService()
        
        # Execute with best mode
        result = await swarm_dag_adapter.execute_with_best_mode(
            task=request.task,
            agents=agents,
            execution_mode=execution_mode,
            existing_swarm_executor=swarm_service
        )
        
        # Build response
        response = SwarmExecutionResponse(
            execution_id=request.execution_id,
            status=ExecutionStatus.COMPLETED,
            result=str(result.get("result", "")),
            execution_mode=result.get("execution_mode", "unknown"),
            execution_details={
                "mode": result.get("execution_mode"),
                "reason": result.get("reason"),
                "parallel_groups": result.get("parallel_groups"),
                "time_saved": result.get("time_saved_estimate")
            },
            message=f"Executed in {result.get('execution_mode')} mode"
        )
        
        # If parallel was used, add more details
        if result.get("execution_mode") == "parallel":
            response.execution_details["speedup"] = f"{result.get('parallel_groups', 1)}x potential speedup"
        
        return response
        
    except Exception as e:
        logger.error(f"Error in DAG execution: {e}")
        return SwarmExecutionResponse(
            execution_id=request.execution_id,
            status=ExecutionStatus.FAILED,
            error=str(e),
            execution_mode="failed"
        )


@router.get("/execution-modes")
async def get_execution_modes():
    """
    Get available execution modes and their descriptions.
    """
    return {
        "modes": [
            {
                "value": "auto",
                "label": "Auto (Recommended)",
                "description": "Automatically choose best mode based on task analysis",
                "icon": "🤖"
            },
            {
                "value": "sequential",
                "label": "Sequential",
                "description": "Traditional mode - agents work one after another",
                "icon": "➡️"
            },
            {
                "value": "parallel",
                "label": "Parallel (DAG)",
                "description": "Agents work simultaneously when possible",
                "icon": "⚡"
            }
        ],
        "default": "auto",
        "recommendation": "Use 'auto' mode for best performance. The system will analyze your task and choose the optimal execution strategy."
    }