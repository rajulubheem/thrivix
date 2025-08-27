"""
API endpoints for dynamic tool discovery and management
"""
from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import structlog

from app.tools.strands_tool_registry import get_dynamic_tools, ToolCapability

logger = structlog.get_logger()
router = APIRouter()


class ToolInfo(BaseModel):
    """Tool information response"""
    name: str
    description: str
    capabilities: List[str]
    requires_approval: bool
    enabled: bool
    input_schema: Optional[Dict[str, Any]] = None


class ToolsResponse(BaseModel):
    """Response for tools list"""
    tools: List[ToolInfo]
    count: int
    capabilities: List[str]


class ToolExecuteRequest(BaseModel):
    """Request for tool execution"""
    tool_name: str
    parameters: Dict[str, Any]


class CapabilityRequest(BaseModel):
    """Request for tools by capability"""
    capabilities: List[str]


@router.get("/available", response_model=ToolsResponse)
async def get_available_tools():
    """
    Get all available tools with their capabilities
    This endpoint is used by the frontend to show available tools
    """
    try:
        registry = await get_dynamic_tools()
        
        # Get all tool information
        tools_info = registry.get_tool_info()
        
        # Get all available capabilities
        all_capabilities = registry.get_all_capabilities()
        
        # Convert to response format
        tools = []
        for tool in tools_info:
            tools.append(ToolInfo(
                name=tool["name"],
                description=tool["description"],
                capabilities=tool["capabilities"],
                requires_approval=tool["requires_approval"],
                enabled=tool["enabled"],
                input_schema=tool.get("input_schema")
            ))
        
        return ToolsResponse(
            tools=tools,
            count=len(tools),
            capabilities=all_capabilities
        )
        
    except Exception as e:
        logger.error(f"Error getting available tools: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/by-capability", response_model=List[ToolInfo])
async def get_tools_by_capability(request: CapabilityRequest):
    """
    Get tools that match specific capabilities
    Used by the orchestrator to find appropriate tools
    """
    try:
        registry = await get_dynamic_tools()
        
        # Get tools for the requested capabilities
        tools = registry.get_tools_for_capabilities(request.capabilities)
        
        # Convert to response format
        result = []
        for tool in tools:
            result.append(ToolInfo(
                name=tool["name"],
                description=tool["description"],
                capabilities=tool["capabilities"],
                requires_approval=tool["requires_approval"],
                enabled=tool["enabled"]
            ))
        
        return result
        
    except Exception as e:
        logger.error(f"Error getting tools by capability: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/execute")
async def execute_tool(request: ToolExecuteRequest):
    """
    Execute a tool with given parameters
    This is for testing purposes
    """
    try:
        registry = await get_dynamic_tools()
        
        result = await registry.execute_tool(
            request.tool_name,
            request.parameters
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Error executing tool {request.tool_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/capabilities")
async def get_all_capabilities():
    """
    Get all available tool capabilities
    """
    try:
        registry = await get_dynamic_tools()
        capabilities = registry.get_all_capabilities()
        
        return {
            "capabilities": capabilities,
            "count": len(capabilities)
        }
        
    except Exception as e:
        logger.error(f"Error getting capabilities: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{tool_name}")
async def get_tool_details(tool_name: str):
    """
    Get detailed information about a specific tool
    """
    try:
        registry = await get_dynamic_tools()
        
        # Find the tool
        tools = registry.get_tool_info()
        for tool in tools:
            if tool["name"] == tool_name:
                return tool
        
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting tool details: {e}")
        raise HTTPException(status_code=500, detail=str(e))