"""
Tool Debug API
Debug and test tool availability for agents
"""
from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
import os
import structlog
from app.services.enhanced_swarm_service import create_tavily_tool, create_file_tools, create_python_repl_tool

router = APIRouter()
logger = structlog.get_logger()

@router.get("/check-tools")
async def check_tool_availability() -> Dict[str, Any]:
    """Check which tools are available and working"""
    
    tools_status = {}
    
    # Check Tavily
    tavily_available = bool(os.getenv("TAVILY_API_KEY"))
    tools_status["tavily_search"] = {
        "available": tavily_available,
        "reason": "API key present" if tavily_available else "TAVILY_API_KEY not set",
        "api_key_preview": os.getenv("TAVILY_API_KEY", "")[:10] + "..." if tavily_available else None
    }
    
    # Check file tools
    try:
        file_write, file_read = create_file_tools("test_agent", None)
        tools_status["file_write"] = {
            "available": True,
            "reason": "Successfully created",
            "has_callable": callable(file_write)
        }
        tools_status["file_read"] = {
            "available": True,
            "reason": "Successfully created",
            "has_callable": callable(file_read)
        }
    except Exception as e:
        tools_status["file_write"] = {"available": False, "reason": str(e)}
        tools_status["file_read"] = {"available": False, "reason": str(e)}
    
    # Check Python REPL
    try:
        python_tool = create_python_repl_tool("test_agent", None)
        tools_status["python_repl"] = {
            "available": True,
            "reason": "Successfully created",
            "has_callable": callable(python_tool)
        }
    except Exception as e:
        tools_status["python_repl"] = {"available": False, "reason": str(e)}
    
    # Check strands_tools availability
    try:
        import strands_tools
        available_strands = dir(strands_tools)
        tools_status["strands_tools"] = {
            "available": True,
            "module_found": True,
            "tools_count": len([t for t in available_strands if not t.startswith('_')])
        }
    except ImportError as e:
        tools_status["strands_tools"] = {
            "available": False,
            "module_found": False,
            "reason": str(e)
        }
    
    return {
        "tools": tools_status,
        "summary": {
            "total_checked": len(tools_status),
            "available": sum(1 for t in tools_status.values() if t.get("available", False)),
            "unavailable": sum(1 for t in tools_status.values() if not t.get("available", False))
        }
    }

@router.post("/test-tool/{tool_name}")
async def test_tool_execution(tool_name: str, parameters: Dict[str, Any] = {}) -> Dict[str, Any]:
    """Test executing a specific tool"""
    
    try:
        if tool_name == "tavily_search":
            if not os.getenv("TAVILY_API_KEY"):
                return {"success": False, "error": "TAVILY_API_KEY not set"}
            
            tool = create_tavily_tool("test_agent", None)
            result = await tool(query=parameters.get("query", "test query"))
            return {"success": True, "result": result}
            
        elif tool_name == "file_write":
            file_write, _ = create_file_tools("test_agent", None)
            result = await file_write(
                path=parameters.get("path", "test.txt"),
                content=parameters.get("content", "test content")
            )
            return {"success": True, "result": result}
            
        elif tool_name == "file_read":
            _, file_read = create_file_tools("test_agent", None)
            result = await file_read(path=parameters.get("path", "test.txt"))
            return {"success": True, "result": result}
            
        elif tool_name == "python_repl":
            tool = create_python_repl_tool("test_agent", None)
            result = await tool(code=parameters.get("code", "print('hello')"))
            return {"success": True, "result": result}
            
        else:
            return {"success": False, "error": f"Unknown tool: {tool_name}"}
            
    except Exception as e:
        logger.error(f"Tool test failed: {e}")
        return {"success": False, "error": str(e), "type": type(e).__name__}