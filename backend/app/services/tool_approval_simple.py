"""
Simple Tool Approval System
Works with Strands' retry behavior by failing gracefully
"""
import json
from typing import Dict, Any, Optional
import structlog
import os

logger = structlog.get_logger()

# Track which tools have been approved for this session
approved_tools = set()
denied_tools = set()

def load_tool_settings():
    """Load tool settings from app_settings.json"""
    tool_settings = {}
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
                    
            logger.info(f"Loaded settings for {len(tool_settings)} tools")
    except Exception as e:
        logger.error(f"Failed to load tool settings: {e}")
    
    return tool_settings

# Load settings on import
TOOL_SETTINGS = load_tool_settings()

def check_tool_approval(tool_name: str, tool_input: Dict[str, Any]) -> tuple[bool, str]:
    """
    Check if a tool is approved to run
    Returns (can_execute, message)
    """
    # Check if this tool requires approval
    tool_config = TOOL_SETTINGS.get(tool_name, {})
    if not tool_config.get('requires_approval', False):
        return True, "Tool does not require approval"
    
    # Create a signature for this tool call
    signature = f"{tool_name}:{json.dumps(sorted(tool_input.items()))}"
    
    # Check if already approved or denied
    if signature in approved_tools:
        logger.info(f"✅ Tool {tool_name} already approved for this session")
        return True, "Tool approved"
    
    if signature in denied_tools:
        logger.info(f"❌ Tool {tool_name} was denied for this session")
        return False, "Tool execution was denied by user"
    
    # Tool requires approval but hasn't been approved yet
    logger.info(f"⏳ Tool {tool_name} requires approval")
    return False, f"Tool '{tool_name}' requires approval. Please approve through the UI and retry."

def approve_tool(tool_name: str, tool_input: Dict[str, Any]):
    """Approve a tool for execution"""
    signature = f"{tool_name}:{json.dumps(sorted(tool_input.items()))}"
    approved_tools.add(signature)
    denied_tools.discard(signature)
    logger.info(f"✅ Tool {tool_name} approved for session")

def deny_tool(tool_name: str, tool_input: Dict[str, Any]):
    """Deny a tool from execution"""
    signature = f"{tool_name}:{json.dumps(sorted(tool_input.items()))}"
    denied_tools.add(signature)
    approved_tools.discard(signature)
    logger.info(f"❌ Tool {tool_name} denied for session")

def reset_approvals():
    """Reset all approvals for a new session"""
    approved_tools.clear()
    denied_tools.clear()
    logger.info("🔄 Approval state reset")