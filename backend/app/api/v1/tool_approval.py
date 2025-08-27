"""
Tool Approval API endpoints for human-in-the-loop control
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
import asyncio
import uuid
from datetime import datetime
import structlog
from app.services.approval_manager import approval_manager as old_approval_manager
from app.services.tool_approval_manager import approval_manager

logger = structlog.get_logger()

router = APIRouter()

# Pydantic models for request/response
class ApprovalResponse(BaseModel):
    approved: bool
    modified_parameters: Optional[Dict[str, Any]] = None
    rejection_reason: Optional[str] = None

# Store pending approval requests (for tracking)
pending_approvals: Dict[str, Dict[str, Any]] = {}
approval_responses: Dict[str, Dict[str, Any]] = {}

@router.post("/tool-approval/request")
async def request_tool_approval(
    agent: str,
    tool: str,
    parameters: Dict[str, Any],
    session_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Request approval for a tool execution
    """
    approval_id = str(uuid.uuid4())
    
    request_data = {
        "id": approval_id,
        "agent": agent,
        "tool": tool,
        "parameters": parameters,
        "session_id": session_id,
        "timestamp": datetime.utcnow().isoformat(),
        "status": "pending"
    }
    
    pending_approvals[approval_id] = request_data
    logger.info(f"Tool approval requested: {approval_id} for {tool} by {agent}")
    
    return {
        "approval_id": approval_id,
        "status": "pending",
        "message": f"Approval required for {tool}"
    }

@router.post("/tool-approval/{approval_id}/respond")
async def respond_to_approval(
    approval_id: str,
    response: ApprovalResponse
) -> Dict[str, Any]:
    """
    Respond to a tool approval request
    """
    # Use the new global approval manager to set the response
    success = approval_manager.set_approval_response(
        approval_id=approval_id,
        approved=response.approved,
        modified_params=response.modified_parameters,
        reason=response.rejection_reason
    )
    
    if not success:
        # Still track in local storage for reference
        if approval_id not in pending_approvals:
            logger.warning(f"Approval ID not found: {approval_id}")
        else:
            response_data = {
                "approval_id": approval_id,
                "approved": response.approved,
                "modified_parameters": response.modified_parameters,
                "rejection_reason": response.rejection_reason,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            approval_responses[approval_id] = response_data
            pending_approvals[approval_id]["status"] = "approved" if response.approved else "rejected"
    
    logger.info(f"Tool approval response: {approval_id} - {'Approved' if response.approved else 'Rejected'}")
    
    return {
        "status": "success" if success else "tracked",
        "approved": response.approved,
        "message": f"Tool {'approved' if response.approved else 'rejected'}"
    }

@router.get("/tool-approval/{approval_id}/status")
async def get_approval_status(approval_id: str) -> Dict[str, Any]:
    """
    Check the status of an approval request
    """
    if approval_id not in pending_approvals:
        raise HTTPException(status_code=404, detail="Approval request not found")
    
    request = pending_approvals[approval_id]
    response = approval_responses.get(approval_id)
    
    return {
        "request": request,
        "response": response,
        "status": request["status"]
    }

@router.get("/tool-approval/pending")
async def get_pending_approvals(session_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Get all pending approval requests
    """
    if session_id:
        pending = {
            k: v for k, v in pending_approvals.items() 
            if v["status"] == "pending" and v.get("session_id") == session_id
        }
    else:
        pending = {
            k: v for k, v in pending_approvals.items() 
            if v["status"] == "pending"
        }
    
    return {
        "pending": list(pending.values()),
        "count": len(pending)
    }

@router.delete("/tool-approval/{approval_id}")
async def cancel_approval(approval_id: str) -> Dict[str, Any]:
    """
    Cancel an approval request
    """
    if approval_id not in pending_approvals:
        raise HTTPException(status_code=404, detail="Approval request not found")
    
    del pending_approvals[approval_id]
    if approval_id in approval_responses:
        del approval_responses[approval_id]
    
    return {"status": "cancelled", "approval_id": approval_id}

# WebSocket for real-time approval updates (optional)
from fastapi import WebSocket, WebSocketDisconnect
from typing import Set

connected_clients: Set[WebSocket] = set()

@router.websocket("/tool-approval/ws")
async def approval_websocket(websocket: WebSocket):
    """
    WebSocket for real-time approval notifications
    """
    await websocket.accept()
    connected_clients.add(websocket)
    
    try:
        while True:
            # Keep connection alive and handle incoming messages
            data = await websocket.receive_text()
            
            # Handle approval responses via WebSocket
            if data.startswith("approve:"):
                approval_id = data.split(":")[1]
                await respond_to_approval(approval_id, True)
                
            elif data.startswith("reject:"):
                approval_id = data.split(":")[1]
                await respond_to_approval(approval_id, False)
                
    except WebSocketDisconnect:
        connected_clients.remove(websocket)

async def broadcast_approval_request(request_data: Dict[str, Any]):
    """
    Broadcast approval request to all connected clients
    """
    for client in connected_clients:
        try:
            await client.send_json({
                "type": "approval_request",
                "data": request_data
            })
        except:
            # Client disconnected, remove from set
            connected_clients.discard(client)

@router.post("/hook-approval/respond")
async def respond_to_hook_approval(
    approval_id: str,
    response: ApprovalResponse
) -> Dict[str, Any]:
    """
    Respond to a hook-based tool approval request from Strands agents
    This works with the ToolApprovalInterceptor hook
    """
    try:
        # Use the global approval manager
        success = approval_manager.set_approval_response(
            approval_id=approval_id,
            approved=response.approved,
            modified_params=response.modified_parameters,
            reason=response.rejection_reason
        )
        
        if not success:
            raise HTTPException(
                status_code=404,
                detail=f"Approval ID {approval_id} not found"
            )
        
        logger.info(
            f"Hook approval processed: {approval_id} - "
            f"{'approved' if response.approved else 'rejected'}"
        )
        
        return {
            "status": "success",
            "approved": response.approved,
            "message": f"Tool {'approved' if response.approved else 'rejected'} via hook system"
        }
        
    except Exception as e:
        logger.error(f"Error processing hook approval: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process hook approval: {str(e)}"
        )


@router.get("/hook-approval/pending")
async def get_pending_hook_approvals() -> Dict[str, Any]:
    """
    Get pending approvals from the hook-based system
    """
    if not HOOK_APPROVAL_AVAILABLE:
        return {"pending": [], "count": 0, "available": False}
    
    try:
        hook_manager = get_approval_manager()
        
        if not hook_manager:
            return {"pending": [], "count": 0, "available": False}
        
        pending = hook_manager.get_pending_approvals()
        
        return {
            "pending": list(pending.values()),
            "count": len(pending),
            "available": True
        }
        
    except Exception as e:
        logger.error(f"Error getting hook approvals: {e}")
        return {
            "pending": [],
            "count": 0,
            "available": False,
            "error": str(e)
        }
