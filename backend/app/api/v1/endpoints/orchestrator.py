"""
AI Orchestrator API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, Optional
from app.services.ai_orchestrator import AIOrchestrator
from app.core.security import get_current_user
from pydantic import BaseModel

router = APIRouter()


class OrchestrateRequest(BaseModel):
    task: str
    preferences: Optional[Dict[str, Any]] = None
    execution_mode: Optional[str] = "auto"


class OrchestrateResponse(BaseModel):
    task: str
    analysis: Dict[str, Any]
    agents: list
    workflow: str
    estimated_complexity: str


@router.post("/orchestrate", response_model=OrchestrateResponse)
async def orchestrate_task(
    request: OrchestrateRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Analyze task and generate optimal agent configuration
    """
    try:
        orchestrator = AIOrchestrator()
        result = await orchestrator.orchestrate(
            task=request.task,
            user_preferences=request.preferences,
            execution_mode=request.execution_mode
        )
        return OrchestrateResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/capabilities")
async def get_capabilities():
    """
    Get available capabilities and their associated tools
    """
    orchestrator = AIOrchestrator()
    return {
        "capabilities": orchestrator.capability_tools,
        "models": orchestrator.complexity_models
    }