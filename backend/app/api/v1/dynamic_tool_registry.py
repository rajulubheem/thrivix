"""
Dynamic Tool Registry API
Exposes available tools from strands-tools and custom implementations
"""
from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
import structlog
from app.services.dynamic_tool_wrapper import StrandsToolRegistry

router = APIRouter()
logger = structlog.get_logger()

@router.get("/available-tools")
async def get_available_tools() -> Dict[str, Any]:
    """Get all available tools with metadata"""
    try:
        tools = StrandsToolRegistry.get_available_tools()
        
        # Group by category
        categorized = {}
        for tool_name, tool_info in tools.items():
            category = tool_info["category"]
            if category not in categorized:
                categorized[category] = []
            categorized[category].append({
                "name": tool_name,
                "description": tool_info["description"],
                "source": tool_info["source"]
            })
        
        return {
            "total_tools": len(tools),
            "categories": list(categorized.keys()),
            "tools": tools,
            "tools_by_category": categorized
        }
    except Exception as e:
        logger.error(f"Error getting available tools: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tools/category/{category}")
async def get_tools_by_category(category: str) -> Dict[str, Any]:
    """Get tools for a specific category"""
    try:
        tool_names = StrandsToolRegistry.get_tools_by_category(category)
        tools = StrandsToolRegistry.get_available_tools()
        
        category_tools = [
            {
                "name": name,
                "description": tools[name]["description"],
                "source": tools[name]["source"]
            }
            for name in tool_names
        ]
        
        return {
            "category": category,
            "count": len(category_tools),
            "tools": category_tools
        }
    except Exception as e:
        logger.error(f"Error getting tools for category {category}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tool/{tool_name}")
async def get_tool_info(tool_name: str) -> Dict[str, Any]:
    """Get detailed information about a specific tool"""
    try:
        tools = StrandsToolRegistry.get_available_tools()
        
        if tool_name not in tools:
            raise HTTPException(status_code=404, detail=f"Tool {tool_name} not found")
        
        tool_info = tools[tool_name]
        
        # Try to get more detailed info if available
        try:
            import importlib
            import inspect
            
            # Try to import the tool
            if tool_info["source"] == "strands_tools":
                module = importlib.import_module("strands_tools")
                if hasattr(module, tool_name):
                    tool_func = getattr(module, tool_name)
                    tool_info["docstring"] = inspect.getdoc(tool_func)
                    tool_info["signature"] = str(inspect.signature(tool_func))
        except Exception as e:
            logger.debug(f"Could not get detailed info for {tool_name}: {e}")
        
        return {
            "name": tool_name,
            **tool_info
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting tool info for {tool_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))