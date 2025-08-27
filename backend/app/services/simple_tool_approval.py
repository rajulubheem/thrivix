"""
Simplified Tool Approval Hook for Strands Agents
Direct callback implementation without HookProvider
"""
import asyncio
import json
import uuid
from typing import Any, Dict, Optional, Callable
from datetime import datetime
import structlog
import os

logger = structlog.get_logger()

# Global approval state
pending_approvals = {}
approval_responses = {}
original_tools = {}
tool_settings = {}


def load_tool_settings():
    """Load tool settings from app_settings.json"""
    global tool_settings
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
                    tool_settings[tool_name] = {
                        'requires_approval': tool_config.get('requires_approval', False),
                        'name': tool_config.get('name', tool_name),
                        'description': tool_config.get('description', '')
                    }
                    
            logger.info(f"Loaded tool settings for {len(tool_settings)} tools")
            logger.info(f"Tools requiring approval: {[name for name, config in tool_settings.items() if config.get('requires_approval')]}")
    except Exception as e:
        logger.error(f"Failed to load tool settings: {e}")


# Load settings on module import
load_tool_settings()


async def intercept_tool_call(event, callback_handler=None):
    """
    Intercept tool calls before execution
    This is a direct callback function for BeforeToolInvocationEvent
    """
    try:
        # Access tool information
        tool_use = event.tool_use
        tool_name = tool_use.name if hasattr(tool_use, 'name') else tool_use.get("name", "unknown") if isinstance(tool_use, dict) else "unknown"
        tool_input = tool_use.input if hasattr(tool_use, 'input') else tool_use.get("input", {}) if isinstance(tool_use, dict) else {}
        
        logger.info(f"🔍 Intercepting tool call: {tool_name}")
        logger.info(f"📋 Tool settings: {tool_settings.get(tool_name, {})}")
        
        # Check if tool requires approval
        tool_config = tool_settings.get(tool_name, {})
        requires_approval = tool_config.get('requires_approval', False)
        
        if not requires_approval:
            logger.info(f"✅ Tool {tool_name} does not require approval, executing normally")
            return  # Let the tool execute normally
        
        logger.info(f"🛑 Tool {tool_name} requires approval!")
        
        # Generate approval ID
        approval_id = f"approval_{uuid.uuid4().hex[:8]}"
        
        # Store the original tool for later execution
        original_tools[approval_id] = {
            'tool': event.selected_tool,
            'name': tool_name,
            'input': tool_input
        }
        
        # Create approval request
        approval_request = {
            'id': approval_id,
            'tool': tool_name,
            'parameters': tool_input,
            'timestamp': datetime.utcnow().isoformat(),
            'status': 'pending'
        }
        
        pending_approvals[approval_id] = approval_request
        
        # Send approval request to UI via callback
        if callback_handler:
            logger.info(f"📤 Sending approval request for {tool_name} to UI")
            await callback_handler(
                type="tool_approval_required",
                agent=event.agent.name if hasattr(event, 'agent') and hasattr(event.agent, 'name') else "agent",
                data={
                    'approval_id': approval_id,
                    'tool': tool_name,
                    'parameters': tool_input,
                    'description': tool_config.get('description', f'Execute {tool_name}')
                }
            )
            
            # Also send a visible message in the chat
            await callback_handler(
                type="text_generation",
                agent="system",
                data={
                    "text": f"\n⏳ **Waiting for approval to execute:** `{tool_name}`\n",
                    "chunk": f"\n⏳ **Waiting for approval to execute:** `{tool_name}`\n"
                }
            )
        
        # Replace the tool with a simple rejection for now
        # In production, this would be replaced with an approval_wait tool
        from strands import tool
        
        @tool(name=f"approval_pending_{tool_name}")
        async def approval_pending(**kwargs):
            """Tool execution pending approval"""
            return {
                "status": "error",
                "content": [{
                    "text": f"Tool {tool_name} requires approval. Waiting for user approval (ID: {approval_id})"
                }]
            }
        
        event.selected_tool = approval_pending
        
        # Update tool_use to reflect the pending state
        if hasattr(event.tool_use, 'name'):
            event.tool_use.name = f"approval_pending_{tool_name}"
            event.tool_use.input = {'approval_id': approval_id}
        elif isinstance(event.tool_use, dict):
            event.tool_use["name"] = f"approval_pending_{tool_name}"
            event.tool_use["input"] = {'approval_id': approval_id}
        
        logger.info(f"⏸️ Tool {tool_name} execution replaced with approval pending")
        
    except Exception as e:
        logger.error(f"Error in tool interception: {e}", exc_info=True)


async def process_tool_result(event):
    """
    Process tool results after execution
    This is a direct callback function for AfterToolInvocationEvent
    """
    try:
        tool_use = event.tool_use
        tool_name = tool_use.name if hasattr(tool_use, 'name') else tool_use.get("name", "") if isinstance(tool_use, dict) else ""
        
        # Clean up if this was an approval pending tool
        if tool_name.startswith("approval_pending_"):
            logger.info(f"📋 Processed approval pending tool: {tool_name}")
            
    except Exception as e:
        logger.error(f"Error in tool result processing: {e}", exc_info=True)


def approve_tool(approval_id: str, approved: bool, modified_params: Optional[Dict] = None, reason: Optional[str] = None):
    """
    Approve or reject a pending tool execution
    """
    if approval_id in pending_approvals:
        approval_responses[approval_id] = {
            'approved': approved,
            'modified_params': modified_params,
            'reason': reason,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        del pending_approvals[approval_id]
        
        logger.info(f"{'✅ Approved' if approved else '❌ Rejected'} tool execution: {approval_id}")
        return True
    else:
        logger.warning(f"Approval ID not found: {approval_id}")
        return False


def get_pending_approvals() -> Dict[str, Dict]:
    """Get all pending approval requests"""
    return pending_approvals.copy()


# Synchronous versions for hook callbacks
async def intercept_tool_call_sync(event, callback_handler=None):
    """Async wrapper for synchronous hook callback"""
    return await intercept_tool_call(event, callback_handler)


async def process_tool_result_sync(event):
    """Async wrapper for synchronous hook callback"""
    return await process_tool_result(event)