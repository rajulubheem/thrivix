"""
Approval Manager for true pause-and-wait tool execution
"""
import asyncio
import uuid
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
import structlog

logger = structlog.get_logger()

class ApprovalManager:
    """Manages tool approval requests with true pause-and-wait behavior"""
    
    def __init__(self):
        self.pending_approvals: Dict[str, asyncio.Event] = {}
        self.approval_results: Dict[str, Dict[str, Any]] = {}
        self.approval_timeout = 300  # 5 minutes timeout (increased for user convenience)
        self.recent_approvals: Dict[str, Dict[str, Any]] = {}  # Cache recent approvals to prevent duplicates
        
    async def request_approval(
        self,
        agent: str,
        tool: str,
        parameters: Dict[str, Any],
        callback_handler: Optional[Any] = None
    ) -> tuple[str, bool, Optional[Dict[str, Any]]]:
        """
        Request approval and WAIT for response
        Returns: (approval_id, approved, modified_parameters)
        """
        # Check for duplicate approval request (same agent, tool, params within 10 seconds)
        cache_key = f"{agent}:{tool}:{str(sorted(parameters.items()))}"
        
        if cache_key in self.recent_approvals:
            cached = self.recent_approvals[cache_key]
            time_diff = (datetime.utcnow() - cached['timestamp']).total_seconds()
            
            if time_diff < 10:  # Within 10 seconds - consider it a duplicate
                logger.info(f"🔄 Duplicate approval request detected for {tool} by {agent}, using cached response")
                return cached['approval_id'], cached['approved'], cached.get('modified_parameters')
        
        approval_id = str(uuid.uuid4())
        
        # Create an event to wait on
        approval_event = asyncio.Event()
        self.pending_approvals[approval_id] = approval_event
        
        # Send approval request to frontend
        if callback_handler:
            await callback_handler(
                type="tool_approval_required",
                agent=agent,
                data={
                    "tool": tool,
                    "parameters": parameters,
                    "approval_id": approval_id,
                    "message": f"Agent '{agent}' requests permission to use {tool}",
                    "requires_approval": True,
                    "execution_paused": True
                }
            )
        
        logger.info(f"📋 Approval requested: {approval_id} for {tool} by {agent}")
        logger.info("⏸️ EXECUTION PAUSED - Waiting for user approval...")
        logger.info(f"⏰ Approval timeout set to {self.approval_timeout} seconds")
        
        try:
            # WAIT for approval with timeout
            logger.info(f"🔄 Entering approval wait for {approval_id}...")
            await asyncio.wait_for(
                approval_event.wait(),
                timeout=self.approval_timeout
            )
            logger.info(f"✅ Approval wait completed for {approval_id}")
            
            # Get the result
            result = self.approval_results.get(approval_id, {
                "approved": False,
                "reason": "No response received"
            })
            
            approved = result.get("approved", False)
            modified_params = result.get("modified_parameters", parameters)
            
            # Cache the approval result
            self.recent_approvals[cache_key] = {
                'approval_id': approval_id,
                'approved': approved,
                'modified_parameters': modified_params if approved else None,
                'timestamp': datetime.utcnow()
            }
            
            # Clean old cache entries (older than 60 seconds)
            now = datetime.utcnow()
            self.recent_approvals = {
                k: v for k, v in self.recent_approvals.items()
                if (now - v['timestamp']).total_seconds() < 60
            }
            
            logger.info(f"Approval response: {approval_id} - {'APPROVED ✅' if approved else 'REJECTED ❌'}")
            
            # Send continuation event
            if callback_handler:
                await callback_handler(
                    type="tool_approval_response",
                    agent=agent,
                    data={
                        "tool": tool,
                        "approved": approved,
                        "approval_id": approval_id,
                        "execution_resumed": True
                    }
                )
            
            return approval_id, approved, modified_params if approved else None
            
        except asyncio.TimeoutError:
            logger.warning(f"Approval timeout for {approval_id}")
            
            if callback_handler:
                await callback_handler(
                    type="tool_approval_timeout",
                    agent=agent,
                    data={
                        "tool": tool,
                        "approval_id": approval_id,
                        "message": "Approval request timed out"
                    }
                )
            
            return approval_id, False, None
            
        finally:
            # Cleanup
            if approval_id in self.pending_approvals:
                del self.pending_approvals[approval_id]
            if approval_id in self.approval_results:
                del self.approval_results[approval_id]
    
    def set_approval_response(
        self,
        approval_id: str,
        approved: bool,
        modified_parameters: Optional[Dict[str, Any]] = None,
        reason: Optional[str] = None
    ):
        """
        Set the approval response and trigger continuation
        """
        if approval_id not in self.pending_approvals:
            logger.warning(f"Approval ID not found: {approval_id}")
            return False
        
        # Store the result
        self.approval_results[approval_id] = {
            "approved": approved,
            "modified_parameters": modified_parameters,
            "reason": reason,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Trigger the waiting event
        self.pending_approvals[approval_id].set()
        
        logger.info(f"Approval response set: {approval_id} - {'Approved' if approved else 'Rejected'}")
        return True
    
    def get_pending_approvals(self) -> list:
        """Get list of pending approval IDs"""
        return list(self.pending_approvals.keys())
    
    def cancel_approval(self, approval_id: str):
        """Cancel a pending approval"""
        if approval_id in self.pending_approvals:
            self.approval_results[approval_id] = {
                "approved": False,
                "reason": "Cancelled by user"
            }
            self.pending_approvals[approval_id].set()
            return True
        return False

# Global instance
approval_manager = ApprovalManager()