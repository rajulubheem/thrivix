"""
Tool Help API
Provides help and discovery for agent tools
"""
from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import structlog
from app.services.tool_discovery import ToolDiscoveryService, ToolValidator

router = APIRouter()
logger = structlog.get_logger()

class TaskRequest(BaseModel):
    task: str
    
class ToolCallRequest(BaseModel):
    tool_name: str
    parameters: Dict[str, Any]

@router.get("/catalog")
async def get_tool_catalog() -> Dict[str, Any]:
    """Get complete tool catalog organized by category"""
    try:
        catalog = ToolDiscoveryService.get_tool_catalog()
        
        # Calculate statistics
        total_tools = sum(
            len(cat.get("tools", {})) 
            for cat in catalog.values()
        )
        
        return {
            "total_tools": total_tools,
            "categories": list(catalog.keys()),
            "catalog": catalog
        }
    except Exception as e:
        logger.error(f"Error getting tool catalog: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tool/{tool_name}")
async def get_tool_help(tool_name: str) -> Dict[str, Any]:
    """Get detailed help for a specific tool"""
    try:
        tool_help = ToolDiscoveryService.get_tool_help(tool_name)
        if not tool_help:
            raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")
        
        return tool_help
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting tool help: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/suggest")
async def suggest_tools(request: TaskRequest) -> Dict[str, Any]:
    """Suggest appropriate tools for a task"""
    try:
        suggestions = ToolDiscoveryService.suggest_tools_for_task(request.task)
        
        return {
            "task": request.task,
            "suggested_tools": suggestions,
            "count": len(suggestions)
        }
    except Exception as e:
        logger.error(f"Error suggesting tools: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/validate")
async def validate_tool_call(request: ToolCallRequest) -> Dict[str, Any]:
    """Validate a tool call and its parameters"""
    try:
        is_valid, message = ToolValidator.validate_tool_call(
            request.tool_name,
            request.parameters
        )
        
        response = {
            "tool_name": request.tool_name,
            "parameters": request.parameters,
            "is_valid": is_valid,
            "message": message
        }
        
        # Add suggestions if invalid
        if not is_valid:
            tool_help = ToolDiscoveryService.get_tool_help(request.tool_name)
            if tool_help:
                response["correct_usage"] = tool_help
            
            # Check for common mistakes
            if "file_read" in request.tool_name and "content" in request.parameters:
                response["suggestion"] = "Use 'file_write' to save content to a file"
                response["corrected_call"] = {
                    "tool": "file_write",
                    "parameters": request.parameters
                }
        
        return response
    except Exception as e:
        logger.error(f"Error validating tool call: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/agent/{agent_name}/tools")
async def get_agent_tools(agent_name: str, tools: Optional[str] = None) -> Dict[str, Any]:
    """Get formatted tool guide for an agent"""
    try:
        # Parse tools from query parameter
        tool_list = []
        if tools:
            tool_list = [t.strip() for t in tools.split(",")]
        
        if not tool_list:
            return {
                "agent": agent_name,
                "message": "No tools specified",
                "guide": ""
            }
        
        guide = ToolDiscoveryService.format_tool_usage_guide(agent_name, tool_list)
        
        return {
            "agent": agent_name,
            "tools": tool_list,
            "guide": guide,
            "tool_count": len(tool_list)
        }
    except Exception as e:
        logger.error(f"Error getting agent tools: {e}")
        raise HTTPException(status_code=500, detail=str(e))