"""
Tools Hub API
Lists available tools (Strands + local) and allows safe test execution.
"""
from fastapi import APIRouter, HTTPException
from typing import Any, Dict, List, Optional
import structlog
import asyncio

logger = structlog.get_logger()
router = APIRouter()


def _merge_tool_lists(local_tools: List[Dict[str, Any]], strands_tools: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    merged: List[Dict[str, Any]] = []

    # Normalize strands tools
    strands_norm: List[Dict[str, Any]] = []
    for name, info in (strands_tools or {}).items():
        strands_norm.append({
            "name": name,
            "description": info.get("description", ""),
            "category": info.get("category", ""),
            "source": info.get("source", "strands"),
            "capabilities": [],
            "requires_approval": False,
            "enabled": True,
        })

    # Merge with preference for local when duplicate
    for t in local_tools + strands_norm:
        key = t.get("name")
        if key in seen:
            continue
        seen.add(key)
        merged.append(t)
    return merged


@router.get("/list")
async def list_tools() -> Dict[str, Any]:
    """List available tools from both local registry and Strands registry."""
    try:
        # Local registry
        from app.services.tool_registry import ToolRegistry
        local = ToolRegistry()
        await local.initialize()
        local_list = local.get_tool_info()

        # Strands registry (best-effort)
        try:
            from app.services.dynamic_tool_wrapper import StrandsToolRegistry
            strands_tools = StrandsToolRegistry.get_available_tools()
        except Exception:
            strands_tools = {}

        merged = _merge_tool_lists(local_list, strands_tools)
        # Group by category for convenience
        categories: Dict[str, List[Dict[str, Any]]] = {}
        for t in merged:
            cat = t.get("category") or "general"
            categories.setdefault(cat, []).append(t)

        return {"tools": merged, "categories": categories, "count": len(merged)}
    except Exception as e:
        logger.error(f"Tools list failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test")
async def test_tool(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Execute a tool with provided parameters in a safe way.

    Body: { tool: string, parameters: dict }
    """
    name = (payload or {}).get("tool")
    params = (payload or {}).get("parameters") or {}
    if not name:
        raise HTTPException(status_code=400, detail="tool is required")

    # Try local registry first
    try:
        from app.services.tool_registry import ToolRegistry
        reg = ToolRegistry()
        await reg.initialize()
        tool = reg.get_tool(name)
        if tool:
            result = await reg.execute_tool(name, params)
            return {"source": "local", "tool": name, "result": result}
    except Exception as e:
        logger.warning(f"Local tool test failed for {name}: {e}")

    # Fallback: try Strands tool wrapper in a minimal sandbox
    try:
        from app.services.dynamic_tool_wrapper import DynamicToolWrapper
        wrapper = DynamicToolWrapper(callback_handler=None)
        wrapped = wrapper.wrap_strands_tool(name, agent_name="tool_tester")
        if not wrapped:
            raise RuntimeError(f"Tool '{name}' not found in Strands tools")
        # Call the async @tool function with kwargs
        if asyncio.iscoroutinefunction(wrapped):
            result = await wrapped(**params)
        else:
            # If wrapper returns callable not marked coroutine
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, lambda: wrapped(**params))
        return {"source": "strands", "tool": name, "result": result}
    except Exception as e:
        logger.error(f"Strands tool test failed for {name}: {e}")
        raise HTTPException(status_code=400, detail=str(e))

