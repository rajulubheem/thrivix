"""
Global Tool Approval Manager
Handles approval state and execution of approved tools
"""
import asyncio
import json
import uuid
from typing import Any, Dict, Optional, Callable, List
from datetime import datetime, timedelta
import structlog
import os
from threading import Lock

logger = structlog.get_logger()

class GlobalApprovalManager:
    """Singleton manager for tool approvals across all agents"""
    
    _instance = None
    _lock = Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance.initialized = False
        return cls._instance
    
    def __init__(self):
        if not self.initialized:
            self.pending_approvals = {}
            self.approval_responses = {}
            self.original_tools = {}
            self.tool_settings = {}
            self.callback_handlers = {}
            self.load_tool_settings()
            self.initialized = True
            logger.info("🔐 Global Approval Manager initialized")
    
    def load_tool_settings(self):
        """Load tool settings from app_settings.json"""
        try:
            settings_path = os.path.join(
                os.path.dirname(__file__), 
                '../../app_settings.json'
            )
            
            if os.path.exists(settings_path):
                with open(settings_path, 'r') as f:
                    data = json.load(f)
                    tools = data.get('tools', {})
                    
                    for tool_name, tool_config in tools.items():
                        self.tool_settings[tool_name] = {
                            'requires_approval': tool_config.get('requires_approval', False),
                            'name': tool_config.get('name', tool_name),
                            'description': tool_config.get('description', '')
                        }
                        
                logger.info(f"Loaded settings for {len(self.tool_settings)} tools")
                logger.info(f"Tools requiring approval: {[n for n, c in self.tool_settings.items() if c.get('requires_approval')]}")
        except Exception as e:
            logger.error(f"Failed to load tool settings: {e}")
    
    def requires_approval(self, tool_name: str) -> bool:
        """Check if a tool requires approval"""
        config = self.tool_settings.get(tool_name, {})
        return config.get('requires_approval', False)
    
    def create_approval_request(
        self, 
        tool_name: str, 
        tool_input: Dict[str, Any],
        original_tool: Any,
        agent_name: str = "agent"
    ) -> str:
        """Create a new approval request (or return existing if duplicate)"""
        
        # For deduplication, only use the main parameter (e.g., query for search)
        # Ignore minor parameter differences like search_depth
        key_params = {}
        if 'query' in tool_input:
            key_params['query'] = tool_input['query']
        elif 'path' in tool_input:
            key_params['path'] = tool_input['path']
        else:
            key_params = tool_input
            
        # Use tool name and key parameters as a signature
        signature = f"{agent_name}:{tool_name}:{json.dumps(key_params, sort_keys=True)}"
        
        # Check if we already have a pending approval with similar signature
        for approval_id, request in self.pending_approvals.items():
            if request.get('status') == 'pending' and request['tool'] == tool_name:
                # For the same tool, check if key parameters match
                existing_params = request['parameters']
                existing_key_params = {}
                if 'query' in existing_params:
                    existing_key_params['query'] = existing_params['query']
                elif 'path' in existing_params:
                    existing_key_params['path'] = existing_params['path']
                else:
                    existing_key_params = existing_params
                    
                existing_sig = f"{request['agent']}:{request['tool']}:{json.dumps(existing_key_params, sort_keys=True)}"
                if existing_sig == signature:
                    logger.info(f"♻️ Reusing existing approval request {approval_id} for {tool_name}")
                    # Update the original tool to the latest one
                    self.original_tools[approval_id] = {
                        'tool': original_tool,
                        'name': tool_name,
                        'input': tool_input  # Use the latest input parameters
                    }
                    return approval_id
        
        # Create new approval request
        approval_id = f"approval_{uuid.uuid4().hex[:8]}"
        
        self.pending_approvals[approval_id] = {
            'id': approval_id,
            'tool': tool_name,
            'parameters': tool_input,
            'agent': agent_name,
            'timestamp': datetime.utcnow().isoformat(),
            'status': 'pending',
            'timeout': datetime.utcnow() + timedelta(seconds=60),
            'signature': signature
        }
        
        self.original_tools[approval_id] = {
            'tool': original_tool,
            'name': tool_name,
            'input': tool_input
        }
        
        logger.info(f"📋 Created NEW approval request {approval_id} for {tool_name}")
        return approval_id
    
    def set_approval_response(
        self,
        approval_id: str,
        approved: bool,
        modified_params: Optional[Dict] = None,
        reason: Optional[str] = None
    ) -> bool:
        """Set the response for an approval request"""
        logger.info(f"📥 Received approval response for {approval_id}: approved={approved}")
        logger.info(f"📋 Current pending approvals: {list(self.pending_approvals.keys())}")
        logger.info(f"📋 Current approval responses: {list(self.approval_responses.keys())}")
        
        if approval_id not in self.pending_approvals:
            logger.warning(f"❌ Approval ID not found in pending: {approval_id}")
            logger.warning(f"Available IDs: {list(self.pending_approvals.keys())}")
            return False
        
        self.approval_responses[approval_id] = {
            'approved': approved,
            'modified_params': modified_params,
            'reason': reason,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        self.pending_approvals[approval_id]['status'] = 'approved' if approved else 'rejected'
        
        logger.info(f"{'✅ APPROVAL SET' if approved else '❌ REJECTION SET'} for tool execution: {approval_id}")
        logger.info(f"📋 Approval responses after setting: {list(self.approval_responses.keys())}")
        return True
    
    async def wait_for_approval(self, approval_id: str, timeout: int = 60) -> Dict[str, Any]:
        """Wait for approval response"""
        logger.info(f"⏳ Starting to wait for approval: {approval_id}")
        start_time = datetime.utcnow()
        poll_interval = 0.5
        check_count = 0
        
        while (datetime.utcnow() - start_time).seconds < timeout:
            check_count += 1
            if check_count % 10 == 0:  # Log every 5 seconds
                logger.info(f"⏳ Still waiting for {approval_id}, checked {check_count} times")
                logger.info(f"📋 Current approval responses: {list(self.approval_responses.keys())}")
            
            if approval_id in self.approval_responses:
                logger.info(f"✅ Found approval response for {approval_id}!")
                response = self.approval_responses.pop(approval_id)
                self.pending_approvals.pop(approval_id, None)
                logger.info(f"📤 Returning approval response: {response}")
                return response
            
            await asyncio.sleep(poll_interval)
        
        # Timeout - auto-reject
        logger.warning(f"⏱️ Approval timeout for {approval_id} after {timeout} seconds")
        self.pending_approvals.pop(approval_id, None)
        return {
            'approved': False,
            'reason': 'Timeout - no response received'
        }
    
    def get_original_tool(self, approval_id: str) -> Optional[Dict[str, Any]]:
        """Get the original tool for an approval request"""
        return self.original_tools.get(approval_id)
    
    def get_pending_approvals(self) -> Dict[str, Dict]:
        """Get all pending approval requests"""
        # Clean up expired approvals
        now = datetime.utcnow()
        expired = [
            aid for aid, req in self.pending_approvals.items()
            if req.get('timeout') and datetime.fromisoformat(req['timeout'].isoformat()) < now
        ]
        for aid in expired:
            self.pending_approvals.pop(aid, None)
            self.original_tools.pop(aid, None)
            
        return self.pending_approvals.copy()
    
    def register_callback_handler(self, agent_id: str, handler: Callable):
        """Register a callback handler for an agent"""
        self.callback_handlers[agent_id] = handler
    
    def get_callback_handler(self, agent_id: str) -> Optional[Callable]:
        """Get the callback handler for an agent"""
        return self.callback_handlers.get(agent_id)


# Global singleton instance
approval_manager = GlobalApprovalManager()