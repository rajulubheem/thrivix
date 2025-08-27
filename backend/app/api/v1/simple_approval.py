"""
Simple Tool Approval API
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
import structlog

from app.services.tool_approval_simple import (
    approve_tool,
    deny_tool,
    reset_approvals,
    approved_tools,
    denied_tools
)

router = APIRouter()
logger = structlog.get_logger()

class ToolApprovalRequest(BaseModel):
    tool: str
    parameters: Dict[str, Any]
    approved: bool
    
@router.post("/approve-tool")
async def approve_tool_execution(request: ToolApprovalRequest) -> Dict[str, Any]:
    """
    Approve or deny a tool for the session
    """
    try:
        if request.approved:
            approve_tool(request.tool, request.parameters)
            message = f"Tool {request.tool} approved for this session"
        else:
            deny_tool(request.tool, request.parameters)
            message = f"Tool {request.tool} denied for this session"
            
        logger.info(message)
        
        return {
            "status": "success",
            "message": message,
            "approved": request.approved
        }
    except Exception as e:
        logger.error(f"Error processing approval: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/approval-status")
async def get_approval_status() -> Dict[str, Any]:
    """
    Get current approval status
    """
    return {
        "approved_count": len(approved_tools),
        "denied_count": len(denied_tools),
        "approved_tools": list(approved_tools),
        "denied_tools": list(denied_tools)
    }

@router.post("/reset-approvals")
async def reset_all_approvals() -> Dict[str, Any]:
    """
    Reset all approvals for a new session
    """
    reset_approvals()
    return {
        "status": "success",
        "message": "All approvals reset"
    }