"""
Tool Approval Hook for Strands Agents
Implements tool approval using the Strands Hooks system
"""
import asyncio
import json
import uuid
from typing import Any, Dict, Optional, Callable
from datetime import datetime
import structlog

try:
    from strands.hooks import HookProvider, HookRegistry
    from strands.experimental.hooks import BeforeToolInvocationEvent, AfterToolInvocationEvent
    from strands import tool
    STRANDS_AVAILABLE = True
except ImportError:
    STRANDS_AVAILABLE = False
    # Create dummy base class for when Strands is not available
    class HookProvider:
        def register_hooks(self, registry, **kwargs):
            pass
    BeforeToolInvocationEvent = None
    AfterToolInvocationEvent = None
    HookRegistry = None

logger = structlog.get_logger()


class ToolApprovalInterceptor(HookProvider):
    """
    Intercepts tool calls to implement approval workflow
    Uses BeforeToolInvocationEvent to replace tools with approval requests
    """
    
    def __init__(
        self,
        callback_handler: Optional[Callable] = None,
        tool_settings: Optional[Dict[str, Dict]] = None,
        auto_approve: bool = False
    ):
        """
        Initialize the tool approval interceptor
        
        Args:
            callback_handler: Callback for sending approval requests to UI
            tool_settings: Dictionary of tool configurations with approval requirements
            auto_approve: If True, auto-approve all tools (for testing)
        """
        self.callback_handler = callback_handler
        self.tool_settings = tool_settings or {}
        self.auto_approve = auto_approve
        self.pending_approvals = {}
        self.approval_responses = {}
        self.original_tools = {}
        
        # Load tool settings from app_settings.json if available
        if not self.tool_settings:
            self._load_tool_settings()
    
    def _load_tool_settings(self):
        """Load tool settings from app_settings.json"""
        try:
            import json
            import os
            
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
                            'requires_approval': tool_config.get('requires_approval', True),
                            'name': tool_config.get('name', tool_name),
                            'description': tool_config.get('description', '')
                        }
                        
                logger.info(f"Loaded tool settings for {len(self.tool_settings)} tools")
        except Exception as e:
            logger.error(f"Failed to load tool settings: {e}")
    
    def register_hooks(self, registry: HookRegistry, **kwargs: Any) -> None:
        """Register callbacks for tool interception"""
        if not STRANDS_AVAILABLE:
            logger.warning("Strands hooks not available, tool approval disabled")
            return
            
        logger.info(f"🔐 Registering tool approval hooks with registry: {registry}")
        registry.add_callback(BeforeToolInvocationEvent, self._intercept_tool_call)
        registry.add_callback(AfterToolInvocationEvent, self._process_tool_result)
        logger.info(f"✅ Tool approval hooks registered - Settings: {list(self.tool_settings.keys())}")
    
    async def _intercept_tool_call(self, event: BeforeToolInvocationEvent) -> None:
        """
        Intercept tool calls before execution
        Check if approval is required and handle accordingly
        """
        # Access tool_use as an object, not a dict
        tool_use = event.tool_use
        tool_name = tool_use.name if hasattr(tool_use, 'name') else tool_use.get("name", "unknown") if isinstance(tool_use, dict) else "unknown"
        tool_input = tool_use.input if hasattr(tool_use, 'input') else tool_use.get("input", {}) if isinstance(tool_use, dict) else {}
        tool_use_id = tool_use.toolUseId if hasattr(tool_use, 'toolUseId') else tool_use.get("toolUseId", str(uuid.uuid4())) if isinstance(tool_use, dict) else str(uuid.uuid4())
        
        logger.info(f"🔍 Intercepting tool call: {tool_name}, event: {event}, tool_use: {event.tool_use}")
        logger.info(f"📋 Tool settings loaded: {self.tool_settings}")
        
        # Check if tool requires approval
        tool_config = self.tool_settings.get(tool_name, {})
        requires_approval = tool_config.get('requires_approval', True)
        logger.info(f"🔧 Tool {tool_name} config: {tool_config}, requires_approval: {requires_approval}")
        
        if not requires_approval or self.auto_approve:
            logger.info(f"✅ Tool {tool_name} auto-approved")
            return  # Let the tool execute normally
        
        # Store the original tool for later execution
        self.original_tools[tool_use_id] = {
            'tool': event.selected_tool,
            'name': tool_name,
            'input': tool_input
        }
        
        # Create approval request
        approval_id = f"approval_{tool_use_id}"
        approval_request = {
            'id': approval_id,
            'tool': tool_name,
            'parameters': tool_input,
            'timestamp': datetime.utcnow().isoformat(),
            'status': 'pending'
        }
        
        self.pending_approvals[approval_id] = approval_request
        
        # Send approval request to UI via callback
        if self.callback_handler:
            logger.info(f"📤 Sending approval request for {tool_name}")
            await self.callback_handler(
                type="tool_approval_required",
                agent=event.agent.name if hasattr(event, 'agent') else "agent",
                data={
                    'approval_id': approval_id,
                    'tool': tool_name,
                    'parameters': tool_input,
                    'description': tool_config.get('description', f'Execute {tool_name}')
                }
            )
        
        # Replace the tool with an approval waiting tool
        event.selected_tool = self._create_approval_tool(approval_id, tool_name)
        
        # Update tool_use properly depending on its type
        if hasattr(event.tool_use, 'name'):
            event.tool_use.name = f"approval_wait_{tool_name}"
            event.tool_use.input = {'approval_id': approval_id}
        elif isinstance(event.tool_use, dict):
            event.tool_use["name"] = f"approval_wait_{tool_name}"
            event.tool_use["input"] = {'approval_id': approval_id}
        
        logger.info(f"⏸️ Tool {tool_name} execution paused for approval")
    
    def _create_approval_tool(self, approval_id: str, tool_name: str):
        """
        Create a placeholder tool that waits for approval
        """
        @tool(name=f"approval_wait_{tool_name}")
        async def approval_wait_tool(**kwargs) -> dict:
            """Wait for user approval before executing the actual tool"""
            
            max_wait = 60  # Maximum wait time in seconds
            poll_interval = 0.5  # Check every 500ms
            elapsed = 0
            
            logger.info(f"⏳ Waiting for approval: {approval_id}")
            
            # Send waiting message to UI
            if self.callback_handler:
                await self.callback_handler(
                    type="text_generation",
                    agent="system",
                    data={
                        "text": f"\n⏳ Waiting for approval to execute `{tool_name}`...\n",
                        "chunk": f"\n⏳ Waiting for approval to execute `{tool_name}`...\n"
                    }
                )
            
            # Wait for approval response
            while elapsed < max_wait:
                if approval_id in self.approval_responses:
                    response = self.approval_responses[approval_id]
                    del self.approval_responses[approval_id]
                    
                    if response['approved']:
                        logger.info(f"✅ Tool {tool_name} approved by user")
                        
                        # Execute the original tool
                        original = self.original_tools.get(kwargs.get('approval_id'))
                        if original:
                            original_tool = original['tool']
                            original_input = response.get('modified_params', original['input'])
                            
                            # Execute the original tool with potentially modified parameters
                            if asyncio.iscoroutinefunction(original_tool):
                                result = await original_tool(**original_input)
                            else:
                                result = original_tool(**original_input)
                            
                            # Send approval confirmation
                            if self.callback_handler:
                                await self.callback_handler(
                                    type="tool_approval_response",
                                    agent="system",
                                    data={
                                        'approval_id': approval_id,
                                        'approved': True,
                                        'tool': tool_name
                                    }
                                )
                            
                            return result
                    else:
                        logger.info(f"❌ Tool {tool_name} rejected by user")
                        
                        # Send rejection notification
                        if self.callback_handler:
                            await self.callback_handler(
                                type="tool_rejected",
                                agent="system",
                                data={
                                    'approval_id': approval_id,
                                    'tool': tool_name,
                                    'reason': response.get('reason', 'User rejected')
                                }
                            )
                        
                        return {
                            "status": "error",
                            "content": [{
                                "text": f"Tool execution rejected: {response.get('reason', 'User rejected')}"
                            }]
                        }
                
                await asyncio.sleep(poll_interval)
                elapsed += poll_interval
            
            # Timeout - auto-reject
            logger.warning(f"⏱️ Approval timeout for {tool_name}")
            return {
                "status": "error",
                "content": [{
                    "text": f"Tool approval timed out after {max_wait} seconds"
                }]
            }
        
        return approval_wait_tool
    
    async def _process_tool_result(self, event: AfterToolInvocationEvent) -> None:
        """
        Process tool results after execution
        Can modify results if needed
        """
        tool_use = event.tool_use
        tool_name = tool_use.name if hasattr(tool_use, 'name') else tool_use.get("name", "") if isinstance(tool_use, dict) else ""
        
        # If this was an approval wait tool, clean up
        if tool_name.startswith("approval_wait_"):
            tool_use_id = tool_use.toolUseId if hasattr(tool_use, 'toolUseId') else tool_use.get("toolUseId") if isinstance(tool_use, dict) else None
            if tool_use_id in self.original_tools:
                del self.original_tools[tool_use_id]
    
    def approve_tool(self, approval_id: str, approved: bool, modified_params: Optional[Dict] = None, reason: Optional[str] = None):
        """
        Approve or reject a pending tool execution
        
        Args:
            approval_id: ID of the approval request
            approved: Whether to approve the tool execution
            modified_params: Optional modified parameters for the tool
            reason: Optional reason for rejection
        """
        if approval_id in self.pending_approvals:
            self.approval_responses[approval_id] = {
                'approved': approved,
                'modified_params': modified_params,
                'reason': reason,
                'timestamp': datetime.utcnow().isoformat()
            }
            
            del self.pending_approvals[approval_id]
            
            logger.info(f"{'✅ Approved' if approved else '❌ Rejected'} tool execution: {approval_id}")
        else:
            logger.warning(f"Approval ID not found: {approval_id}")
    
    def get_pending_approvals(self) -> Dict[str, Dict]:
        """Get all pending approval requests"""
        return self.pending_approvals.copy()


# Global instance for managing approvals across agents
global_approval_manager = None


def get_approval_manager(callback_handler: Optional[Callable] = None) -> ToolApprovalInterceptor:
    """Get or create the global approval manager"""
    global global_approval_manager
    
    if global_approval_manager is None:
        global_approval_manager = ToolApprovalInterceptor(callback_handler=callback_handler)
    elif callback_handler:
        # Update callback handler if provided
        global_approval_manager.callback_handler = callback_handler
    
    return global_approval_manager


def create_approval_enabled_agent(
    agent_class,
    callback_handler: Optional[Callable] = None,
    **agent_kwargs
) -> Any:
    """
    Create an agent with tool approval enabled
    
    Args:
        agent_class: The Agent class to instantiate
        callback_handler: Callback for approval requests
        **agent_kwargs: Arguments to pass to the Agent constructor
    """
    if not STRANDS_AVAILABLE:
        logger.warning("Strands not available, creating agent without approval")
        return agent_class(**agent_kwargs)
    
    # Get or create approval manager
    approval_manager = get_approval_manager(callback_handler)
    
    # Add approval hook to agent hooks
    hooks = agent_kwargs.get('hooks', [])
    if approval_manager not in hooks:
        hooks.append(approval_manager)
    
    agent_kwargs['hooks'] = hooks
    
    # Create agent with approval hooks
    agent = agent_class(**agent_kwargs)
    
    logger.info(f"Created agent with tool approval enabled")
    
    return agent