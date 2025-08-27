"""
Tool Configuration API
Provides endpoints for tool discovery and configuration
"""
from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
from pydantic import BaseModel
import structlog
from app.tools.tool_registry import tool_registry
from app.api.v1.endpoints.settings import load_settings, save_settings
from app.tools.tool_defaults import get_tool_defaults, get_tool_variations, get_tool_usage

router = APIRouter()
logger = structlog.get_logger()

class ToolInfo(BaseModel):
    """Tool information model"""
    id: str
    name: str
    description: str
    category: str
    enabled: bool
    status: str
    icon: str
    requires_approval: bool
    usage_count: int
    error_count: int
    config: Dict[str, Any]
    required_env_vars: List[str]
    default_parameters: Dict[str, Any] = {}
    parameter_variations: List[Dict[str, Any]] = []
    example_usage: str = ""

class ConfigurationResponse(BaseModel):
    """Complete configuration response"""
    tools: List[ToolInfo]
    mcp_servers: List[Dict[str, Any]]

@router.get("/configuration", response_model=ConfigurationResponse)
async def get_configuration():
    """Get complete tool configuration including all available tools"""
    try:
        # Get tools from registry
        registry_tools = tool_registry.list_tools()
        
        # Load saved settings to get enabled/disabled status
        settings = load_settings()
        saved_tools = settings.tools
        
        # Merge registry tools with saved settings
        tools_list = []
        for tool_info in registry_tools:
            tool_id = tool_info['id']
            
            # Check if tool has saved settings
            if tool_id in saved_tools:
                saved_config = saved_tools[tool_id]
                tool_info['enabled'] = saved_config.enabled
                tool_info['requires_approval'] = saved_config.requires_approval
            
            # Set status based on enabled flag
            tool_info['status'] = 'enabled' if tool_info['enabled'] else 'disabled'
            
            # Add default parameters and examples
            tool_info['default_parameters'] = get_tool_defaults(tool_id)
            tool_info['parameter_variations'] = get_tool_variations(tool_id)
            tool_info['example_usage'] = get_tool_usage(tool_id)
            
            tools_list.append(ToolInfo(**tool_info))
        
        # Get MCP servers (empty for now, will be populated from MCP service)
        mcp_servers = []
        
        return ConfigurationResponse(
            tools=tools_list,
            mcp_servers=mcp_servers
        )
    except Exception as e:
        logger.error(f"Failed to get configuration: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tools", response_model=List[ToolInfo])
async def get_all_tools():
    """Get all available tools"""
    try:
        tools = tool_registry.list_tools()
        
        # Load settings to get enabled status
        settings = load_settings()
        
        tools_list = []
        for tool_info in tools:
            tool_id = tool_info['id']
            
            # Check saved settings
            if tool_id in settings.tools:
                saved_config = settings.tools[tool_id]
                tool_info['enabled'] = saved_config.enabled
                tool_info['requires_approval'] = saved_config.requires_approval
            
            tool_info['status'] = 'enabled' if tool_info['enabled'] else 'disabled'
            
            # Add default parameters and examples
            tool_info['default_parameters'] = get_tool_defaults(tool_id)
            tool_info['parameter_variations'] = get_tool_variations(tool_id)
            tool_info['example_usage'] = get_tool_usage(tool_id)
            
            tools_list.append(ToolInfo(**tool_info))
        
        return tools_list
    except Exception as e:
        logger.error(f"Failed to get tools: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/tools/{tool_id}")
async def update_tool_config(tool_id: str, enabled: bool = None, requires_approval: bool = None):
    """Update tool configuration"""
    try:
        settings = load_settings()
        
        # Create tool config if it doesn't exist
        if tool_id not in settings.tools:
            # Get tool info from registry
            tool_info = None
            for tool in tool_registry.list_tools():
                if tool['id'] == tool_id:
                    tool_info = tool
                    break
            
            if not tool_info:
                raise HTTPException(status_code=404, detail=f"Tool {tool_id} not found")
            
            # Create new config
            from app.api.v1.endpoints.settings import ToolConfig
            settings.tools[tool_id] = ToolConfig(
                name=tool_id,
                enabled=enabled if enabled is not None else True,
                requires_approval=requires_approval if requires_approval is not None else tool_info['requires_approval'],
                description=tool_info['description'],
                category=tool_info['category']
            )
        else:
            # Update existing config
            if enabled is not None:
                settings.tools[tool_id].enabled = enabled
            if requires_approval is not None:
                settings.tools[tool_id].requires_approval = requires_approval
        
        # Save settings
        save_settings(settings)
        
        # Return updated tool info
        tool_config = settings.tools[tool_id]
        return {
            "id": tool_id,
            "name": tool_id,
            "enabled": tool_config.enabled,
            "requires_approval": tool_config.requires_approval,
            "status": "enabled" if tool_config.enabled else "disabled",
            "description": tool_config.description,
            "category": tool_config.category
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update tool config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/categories")
async def get_tool_categories():
    """Get all tool categories"""
    try:
        categories = tool_registry.get_categories()
        
        # Format for frontend
        category_info = []
        icons = {
            'file_operations': '📁',
            'web_search': '🌐',
            'system': '⚙️',
            'code_execution': '💻',
            'data_analysis': '📊',
            'utilities': '🛠️'
        }
        
        for category, tools in categories.items():
            category_info.append({
                "id": category,
                "name": category.replace('_', ' ').title(),
                "icon": icons.get(category, '🔧'),
                "tool_count": len(tools),
                "tools": tools
            })
        
        return category_info
    except Exception as e:
        logger.error(f"Failed to get categories: {e}")
        raise HTTPException(status_code=500, detail=str(e))