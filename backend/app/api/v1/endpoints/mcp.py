"""
MCP Server Management Endpoints
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import structlog
import time

from app.services.mcp_integration import mcp_service

router = APIRouter()
logger = structlog.get_logger()

class MCPServerConfig(BaseModel):
    """MCP Server configuration request"""
    name: str
    url: str
    transport: str = "sse"  # 'sse' or 'streamable_http'
    enabled: bool = True

class MCPToolCall(BaseModel):
    """MCP tool call request"""
    server_id: str
    tool_name: str
    arguments: Dict[str, Any]

class MCPToolTestRequest(BaseModel):
    """MCP tool test request"""
    server_name: str
    tool_name: str
    parameters: Dict[str, Any]

class MCPToolTestResponse(BaseModel):
    """MCP tool test response"""
    success: bool
    result: Optional[Any] = None
    error: Optional[str] = None
    execution_time: float

@router.post("/servers/add", response_model=Dict[str, Any])
async def add_mcp_server(config: MCPServerConfig):
    """Add and connect to an MCP server"""
    try:
        server = await mcp_service.add_mcp_server(config.dict())
        return {
            "success": True,
            "server": {
                "id": server.get("id"),
                "name": server.get("name"),
                "url": server.get("url"),
                "status": server.get("status", "disconnected"),
                "tool_count": len(server.get("tools", []))
            },
            "tools": server.get("tools", [])
        }
    except Exception as e:
        logger.error(f"Failed to add MCP server: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/servers", response_model=Dict[str, Any])
async def get_mcp_servers():
    """Get all MCP servers and their status"""
    return {
        "servers": mcp_service.get_server_status(),
        "total_tools": len(mcp_service.discovered_tools)
    }

@router.get("/tools", response_model=List[Dict[str, Any]])
async def get_mcp_tools():
    """Get all tools from all connected MCP servers"""
    return mcp_service.get_all_tools()

@router.post("/tools/call", response_model=Dict[str, Any])
async def call_mcp_tool(request: MCPToolCall):
    """Call a tool on an MCP server"""
    result = await mcp_service.call_mcp_tool(
        request.server_id,
        request.tool_name,
        request.arguments
    )
    return result

@router.delete("/servers/{server_id}")
async def remove_mcp_server(server_id: str):
    """Remove an MCP server"""
    if server_id in mcp_service.servers:
        del mcp_service.servers[server_id]
        # Remove associated tools
        mcp_service.discovered_tools = {
            k: v for k, v in mcp_service.discovered_tools.items()
            if v.get('server_id') != server_id
        }
        return {"success": True, "message": f"Server {server_id} removed"}
    else:
        raise HTTPException(status_code=404, detail="Server not found")

@router.post("/servers/{server_id}/reconnect")
async def reconnect_mcp_server(server_id: str):
    """Reconnect to an MCP server"""
    if server_id not in mcp_service.servers:
        raise HTTPException(status_code=404, detail="Server not found")
    
    server = mcp_service.servers[server_id]
    success = await mcp_service.connect_server(server)
    
    return {
        "success": success,
        "server": {
            "id": server.get("id", server_id),
            "name": server.get("name"),
            "status": server.get("status", "connected" if success else "disconnected"),
            "tool_count": len(server.get("tools", []))
        }
    }

@router.post("/tools/test", response_model=MCPToolTestResponse)
async def test_mcp_tool(request: MCPToolTestRequest):
    """Test a specific MCP tool with given parameters"""
    start_time = time.time()
    
    try:
        logger.info(f"Testing MCP tool: {request.tool_name} from server: {request.server_name}")
        logger.info(f"Parameters: {request.parameters}")
        
        # Find the server by name
        server_id = None
        for sid, server in mcp_service.servers.items():
            if server.get('name') == request.server_name:
                server_id = sid
                break
        
        if not server_id:
            return MCPToolTestResponse(
                success=False,
                result=None,
                error=f"MCP server '{request.server_name}' not found",
                execution_time=time.time() - start_time
            )
        
        # Check if server is connected
        server_status = mcp_service.get_server_status()
        if server_status.get(server_id, {}).get('status') != 'connected':
            return MCPToolTestResponse(
                success=False,
                result=None,
                error=f"MCP server '{request.server_name}' is not connected",
                execution_time=time.time() - start_time
            )
        
        # Call the tool
        try:
            result = await mcp_service.call_mcp_tool(
                server_id,
                request.tool_name,
                request.parameters
            )
            
            return MCPToolTestResponse(
                success=True,
                result=result,
                error=None,
                execution_time=time.time() - start_time
            )
        except Exception as e:
            logger.error(f"MCP tool execution failed: {e}")
            return MCPToolTestResponse(
                success=False,
                result=None,
                error=f"Tool execution failed: {str(e)}",
                execution_time=time.time() - start_time
            )
            
    except Exception as e:
        logger.error(f"MCP tool test failed: {e}")
        return MCPToolTestResponse(
            success=False,
            result=None,
            error=str(e),
            execution_time=time.time() - start_time
        )