"""
Test endpoints for tools
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
import structlog

from app.services.tool_registry import tool_registry as tool_integration

logger = structlog.get_logger()
router = APIRouter()


class ToolTestRequest(BaseModel):
    tool_name: str
    parameters: Dict[str, Any]


class SearchTestRequest(BaseModel):
    query: str
    search_depth: str = "basic"
    max_results: int = 5


@router.get("/list")
async def list_tools():
    """List all available tools"""
    tools = []
    for name, tool in tool_integration.tools.items():
        tools.append({
            "name": name,
            "description": tool.get("description", ""),
            "enabled": True
        })
    
    return {
        "tools": tools,
        "count": len(tools)
    }


@router.post("/execute")
async def execute_tool(request: ToolTestRequest):
    """Execute a tool with parameters"""
    try:
        result = await tool_integration.execute_tool(
            request.tool_name,
            request.parameters
        )
        return result
    except Exception as e:
        logger.error(f"Tool execution error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search")
async def test_search(request: SearchTestRequest):
    """Test Tavily search directly"""
    try:
        result = await tool_integration.execute_tool(
            "tavily_search",
            {
                "query": request.query,
                "search_depth": request.search_depth,
                "max_results": request.max_results
            }
        )
        return result
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))