"""
Tool Approval API Endpoints
Handles approval/rejection of tool executions
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import structlog

from app.services.tool_approval_hook import get_approval_manager

router = APIRouter()
logger = structlog.get_logger()


class ToolApprovalRequest(BaseModel):
    """Request to approve or reject a tool execution"""
    approval_id: str
    approved: bool
    modified_params: Optional[Dict[str, Any]] = None
    reason: Optional[str] = None


class ToolApprovalResponse(BaseModel):
    """Response after processing approval"""
    success: bool
    message: str


@router.post("/approve", response_model=ToolApprovalResponse)
async def approve_tool(request: ToolApprovalRequest):
    """
    Approve or reject a pending tool execution
    
    Args:
        request: Approval request with decision and optional modifications
    
    Returns:
        Success status and message
    """
    try:
        # Get the global approval manager
        approval_manager = get_approval_manager()
        
        if not approval_manager:
            raise HTTPException(
                status_code=500,
                detail="Approval manager not initialized"
            )
        
        # Process the approval
        approval_manager.approve_tool(
            approval_id=request.approval_id,
            approved=request.approved,
            modified_params=request.modified_params,
            reason=request.reason
        )
        
        action = "approved" if request.approved else "rejected"
        logger.info(f"Tool execution {action}: {request.approval_id}")
        
        return ToolApprovalResponse(
            success=True,
            message=f"Tool execution {action} successfully"
        )
        
    except Exception as e:
        logger.error(f"Error processing tool approval: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process approval: {str(e)}"
        )


@router.get("/pending")
async def get_pending_approvals():
    """
    Get all pending tool approval requests
    
    Returns:
        Dictionary of pending approval requests
    """
    try:
        approval_manager = get_approval_manager()
        
        if not approval_manager:
            return {"pending": {}}
        
        pending = approval_manager.get_pending_approvals()
        
        return {
            "pending": pending,
            "count": len(pending)
        }
        
    except Exception as e:
        logger.error(f"Error getting pending approvals: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get pending approvals: {str(e)}"
        )