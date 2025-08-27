"""
Tool Approval Configuration
Adds human-in-the-loop approval for sensitive tools
"""

import os
from typing import Dict, Any, Optional, Callable
import structlog

logger = structlog.get_logger()

# Tools that require approval
SENSITIVE_TOOLS = [
    'file_write',
    'editor', 
    'shell',
    'python_repl',
    'code_interpreter',
    'use_aws',
    'environment',
    'tavily_web_search',  # MCP web search tool
    'tavily_search',      # Direct Tavily tool
    'http_request'        # Web requests
]

# Tools that are always safe
SAFE_TOOLS = [
    'file_read',
    'current_time',
    'calculator',
    'think',
    'tavily_search',
    'http_request'  # Could be sensitive, but usually safe for GET
]

class ToolApprovalWrapper:
    """Wraps tools to add approval mechanism"""
    
    def __init__(self, original_tool: Any, tool_name: str, require_approval: bool = True):
        self.original_tool = original_tool
        self.tool_name = tool_name
        self.require_approval = require_approval
        self.approval_callback: Optional[Callable] = None
        
    def set_approval_callback(self, callback: Callable):
        """Set callback for approval requests"""
        self.approval_callback = callback
        
    async def __call__(self, *args, **kwargs):
        """Execute tool with approval check"""
        
        if self.require_approval and self.tool_name in SENSITIVE_TOOLS:
            # Check if bypass is enabled (for testing)
            if os.getenv("BYPASS_TOOL_CONSENT", "false").lower() == "true":
                logger.warning(f"Bypassing approval for {self.tool_name} (BYPASS_TOOL_CONSENT=true)")
            else:
                # Request approval
                logger.info(f"Requesting approval for tool: {self.tool_name}")
                
                if self.approval_callback:
                    # Send approval request through callback
                    approval_data = {
                        "tool": self.tool_name,
                        "parameters": kwargs,
                        "message": f"Agent requests to use {self.tool_name}"
                    }
                    
                    approved = await self.approval_callback(approval_data)
                    
                    if not approved:
                        logger.warning(f"Tool {self.tool_name} execution rejected by user")
                        return {"error": "Tool execution rejected by user"}
                else:
                    # If no callback, log warning but continue (for backwards compatibility)
                    logger.warning(f"No approval callback set for {self.tool_name}, continuing...")
        
        # Execute the original tool
        try:
            result = await self.original_tool(*args, **kwargs) if asyncio.iscoroutinefunction(self.original_tool) else self.original_tool(*args, **kwargs)
            logger.info(f"Tool {self.tool_name} executed successfully")
            return result
        except Exception as e:
            logger.error(f"Tool {self.tool_name} execution failed: {e}")
            raise


def wrap_tools_with_approval(tools: list, approval_callback: Optional[Callable] = None) -> list:
    """
    Wrap a list of tools with approval mechanism
    
    Args:
        tools: List of tool objects
        approval_callback: Callback function for approval requests
        
    Returns:
        List of wrapped tools
    """
    wrapped_tools = []
    
    for tool in tools:
        # Get tool name (handle different tool object structures)
        tool_name = getattr(tool, '__name__', None) or getattr(tool, 'name', 'unknown')
        
        # Check if tool needs approval
        require_approval = tool_name in SENSITIVE_TOOLS
        
        if require_approval:
            logger.info(f"Wrapping tool {tool_name} with approval mechanism")
            wrapper = ToolApprovalWrapper(tool, tool_name, require_approval)
            if approval_callback:
                wrapper.set_approval_callback(approval_callback)
            wrapped_tools.append(wrapper)
        else:
            # Safe tool, use as-is
            wrapped_tools.append(tool)
    
    return wrapped_tools


def should_require_approval(tool_name: str, agent_trust_level: str = "low") -> bool:
    """
    Determine if a tool should require approval based on tool and agent trust
    
    Args:
        tool_name: Name of the tool
        agent_trust_level: Trust level of the agent (low, medium, high)
        
    Returns:
        Boolean indicating if approval is required
    """
    # Always require approval for sensitive tools with low trust
    if tool_name in SENSITIVE_TOOLS and agent_trust_level == "low":
        return True
    
    # Medium trust can use some tools
    if tool_name in SENSITIVE_TOOLS and agent_trust_level == "medium":
        # Allow file operations but not shell/code execution
        if tool_name in ['shell', 'python_repl', 'code_interpreter', 'use_aws']:
            return True
        return False
    
    # High trust agents can use most tools
    if agent_trust_level == "high":
        # Still require approval for very dangerous operations
        if tool_name in ['shell', 'use_aws', 'environment']:
            return True
        return False
    
    # Safe tools never require approval
    if tool_name in SAFE_TOOLS:
        return False
    
    # Default to requiring approval for unknown tools
    return True


import asyncio