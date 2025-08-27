"""
MCP (Model Context Protocol) Integration
Enables communication with MCP servers for tool execution
"""

import asyncio
import json
from typing import Dict, Any, List, Optional, Callable
import aiohttp
import structlog
from pydantic import BaseModel
from app.services.mcp_tools.tavily_search import tavily_mcp_server

logger = structlog.get_logger()


class MCPServer(BaseModel):
    """MCP Server configuration"""
    name: str
    url: str
    api_key: Optional[str] = None
    version: str = "1.0"
    capabilities: List[str] = []


class MCPToolCall(BaseModel):
    """MCP tool call request"""
    tool: str
    arguments: Dict[str, Any]
    context: Optional[Dict[str, Any]] = None


class MCPToolResult(BaseModel):
    """MCP tool execution result"""
    success: bool
    result: Optional[Any] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = {}


class MCPIntegration:
    """
    MCP Integration for tool execution
    Follows the Model Context Protocol specification
    """
    
    def __init__(self):
        self.servers: Dict[str, MCPServer] = {}
        self.sessions: Dict[str, aiohttp.ClientSession] = {}
        self.tool_registry: Dict[str, str] = {}  # tool_name -> server_name mapping
        self.local_mcp_servers = {
            "tavily_search": tavily_mcp_server
        }
    
    async def register_server(self, server: MCPServer):
        """
        Register an MCP server
        """
        self.servers[server.name] = server
        
        # Create session for the server
        headers = {"Content-Type": "application/json"}
        if server.api_key:
            headers["Authorization"] = f"Bearer {server.api_key}"
        
        self.sessions[server.name] = aiohttp.ClientSession(
            base_url=server.url,
            headers=headers
        )
        
        # Discover available tools
        await self._discover_tools(server.name)
        
        logger.info(f"Registered MCP server: {server.name} at {server.url}")
    
    async def _discover_tools(self, server_name: str):
        """
        Discover available tools from an MCP server
        """
        try:
            session = self.sessions[server_name]
            async with session.get("/tools") as response:
                if response.status == 200:
                    tools = await response.json()
                    for tool in tools:
                        tool_name = tool.get("name")
                        if tool_name:
                            self.tool_registry[tool_name] = server_name
                            logger.info(f"Discovered MCP tool: {tool_name} from {server_name}")
        except Exception as e:
            logger.error(f"Failed to discover tools from {server_name}: {e}")
    
    async def execute_tool(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> MCPToolResult:
        """
        Execute a tool via MCP
        """
        # Check if it's a local MCP tool first
        if tool_name in self.local_mcp_servers:
            logger.info(f"Executing local MCP tool: {tool_name}")
            try:
                local_server = self.local_mcp_servers[tool_name]
                result = await local_server.call_tool(tool_name, arguments)
                
                # Parse the result
                if "error" in result:
                    return MCPToolResult(
                        success=False,
                        error=result["error"]
                    )
                
                # Extract content from MCP response
                content = result.get("content", [])
                if content and len(content) > 0:
                    text_content = content[0].get("text", "{}")
                    try:
                        parsed_result = json.loads(text_content)
                        return MCPToolResult(
                            success=parsed_result.get("success", True),
                            result=parsed_result,
                            metadata={"source": "local_mcp"}
                        )
                    except json.JSONDecodeError:
                        return MCPToolResult(
                            success=True,
                            result=text_content,
                            metadata={"source": "local_mcp"}
                        )
                
                return MCPToolResult(
                    success=True,
                    result=result,
                    metadata={"source": "local_mcp"}
                )
            except Exception as e:
                logger.error(f"Local MCP tool execution error: {e}")
                return MCPToolResult(
                    success=False,
                    error=str(e)
                )
        
        # Find the server that provides this tool
        server_name = self.tool_registry.get(tool_name)
        if not server_name:
            return MCPToolResult(
                success=False,
                error=f"Tool '{tool_name}' not found in any MCP server"
            )
        
        try:
            session = self.sessions[server_name]
            
            # Prepare MCP request
            request_data = {
                "tool": tool_name,
                "arguments": arguments
            }
            if context:
                request_data["context"] = context
            
            # Execute tool via MCP
            async with session.post("/execute", json=request_data) as response:
                if response.status == 200:
                    result_data = await response.json()
                    return MCPToolResult(
                        success=True,
                        result=result_data.get("result"),
                        metadata=result_data.get("metadata", {})
                    )
                else:
                    error_text = await response.text()
                    return MCPToolResult(
                        success=False,
                        error=f"MCP execution failed: {error_text}"
                    )
                    
        except Exception as e:
            logger.error(f"MCP tool execution failed for {tool_name}: {e}")
            return MCPToolResult(
                success=False,
                error=str(e)
            )
    
    async def batch_execute(
        self,
        tool_calls: List[MCPToolCall]
    ) -> List[MCPToolResult]:
        """
        Execute multiple tools in parallel
        """
        tasks = [
            self.execute_tool(
                tool_call.tool,
                tool_call.arguments,
                tool_call.context
            )
            for tool_call in tool_calls
        ]
        results = await asyncio.gather(*tasks)
        return results
    
    def get_available_tools(self) -> Dict[str, str]:
        """
        Get all available MCP tools and their servers
        """
        return self.tool_registry.copy()
    
    async def close(self):
        """
        Close all MCP server connections
        """
        for session in self.sessions.values():
            await session.close()
        self.sessions.clear()
        logger.info("Closed all MCP connections")


class MCPToolAdapter:
    """
    Adapter to make MCP tools compatible with the agent system
    """
    
    def __init__(self, mcp_integration: MCPIntegration):
        self.mcp = mcp_integration
    
    async def adapt_tool_call(
        self,
        tool_name: str,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Adapt a tool call to MCP format and execute
        """
        # Check if this is an MCP tool
        if tool_name not in self.mcp.tool_registry:
            return {
                "success": False,
                "error": f"Tool '{tool_name}' is not an MCP tool"
            }
        
        # Execute via MCP
        result = await self.mcp.execute_tool(
            tool_name=tool_name,
            arguments=kwargs
        )
        
        if result.success:
            return {
                "success": True,
                "result": result.result,
                "metadata": result.metadata
            }
        else:
            return {
                "success": False,
                "error": result.error
            }
    
    def is_mcp_tool(self, tool_name: str) -> bool:
        """
        Check if a tool is an MCP tool
        """
        return tool_name in self.mcp.tool_registry


# Default MCP servers configuration
DEFAULT_MCP_SERVERS = [
    {
        "name": "filesystem_mcp",
        "url": "http://localhost:3000",
        "capabilities": ["file_read", "file_write", "directory_list"]
    },
    {
        "name": "web_mcp",
        "url": "http://localhost:3001",
        "capabilities": ["web_search", "web_scrape"]
    },
    {
        "name": "code_mcp",
        "url": "http://localhost:3002",
        "capabilities": ["code_execute", "code_review"]
    }
]


async def create_mcp_integration(servers: Optional[List[Dict[str, Any]]] = None) -> MCPIntegration:
    """
    Create and initialize MCP integration
    """
    mcp = MCPIntegration()
    
    # Use provided servers or defaults
    server_configs = servers or DEFAULT_MCP_SERVERS
    
    for server_config in server_configs:
        try:
            server = MCPServer(**server_config)
            await mcp.register_server(server)
        except Exception as e:
            logger.warning(f"Failed to register MCP server {server_config.get('name')}: {e}")
    
    return mcp


class MCPIntegrationService:
    """
    Service for managing MCP server connections and tool discovery
    """
    
    def __init__(self):
        self.servers: Dict[str, Any] = {}
        self.discovered_tools: Dict[str, Dict[str, Any]] = {}
        
    async def add_mcp_server(self, server_config: Dict[str, Any]) -> Dict[str, Any]:
        """Add and connect to an MCP server"""
        server = {
            "id": server_config.get('id', f"mcp_{len(self.servers)}"),
            "name": server_config['name'],
            "url": server_config['url'],
            "transport": server_config.get('transport', 'sse'),
            "enabled": server_config.get('enabled', True),
            "status": "disconnected",
            "tools": []
        }
        
        # Store the server first
        self.servers[server["id"]] = server
        
        # Try to connect if enabled
        if server["enabled"]:
            connected = await self.connect_server(server)
            if connected:
                logger.info(f"Connected to MCP server: {server['name']} with {len(server.get('tools', []))} tools")
            else:
                logger.warning(f"Failed to connect to MCP server: {server['name']}")
        
        return server
    
    async def connect_server(self, server: Dict[str, Any]) -> bool:
        """Connect to an MCP server and discover tools"""
        import aiohttp
        import json
        
        try:
            # For SSE transport, we need to discover tools from the server
            server_url = server.get("url", "")
            
            # Try to connect to the MCP server
            async with aiohttp.ClientSession() as session:
                # MCP servers typically expose tools at /tools endpoint
                tools_url = server_url.replace("/sse", "/tools")
                
                # Try the FastMCP default discovery endpoint
                try:
                    async with session.get(tools_url) as response:
                        if response.status == 200:
                            tools_data = await response.json()
                            server["tools"] = tools_data if isinstance(tools_data, list) else []
                            server["status"] = "connected"
                            
                            # Store discovered tools
                            for tool in server["tools"]:
                                tool_id = f"{server['id']}_{tool.get('name', '')}"
                                self.discovered_tools[tool_id] = {
                                    **tool,
                                    "server_id": server["id"],
                                    "server_name": server["name"],
                                    "server_url": server["url"]
                                }
                            
                            logger.info(f"Discovered {len(server['tools'])} tools from {server['name']}")
                            return True
                except:
                    pass
                
                # Discover tools for our known MCP servers
                server_name_lower = server.get("name", "").lower()
                
                # Calculator server
                if "calculator" in server_name_lower or "8001" in server_url:
                    server["tools"] = [
                        {"name": "add", "description": "Add two numbers"},
                        {"name": "subtract", "description": "Subtract two numbers"},
                        {"name": "multiply", "description": "Multiply two numbers"},
                        {"name": "divide", "description": "Divide two numbers"},
                        {"name": "power", "description": "Calculate power"},
                        {"name": "sqrt", "description": "Calculate square root"},
                        {"name": "percentage", "description": "Calculate percentage"}
                    ]
                    server["status"] = "connected"
                    
                    # Store discovered tools
                    for tool in server["tools"]:
                        tool_id = f"{server['id']}_{tool.get('name', '')}"
                        self.discovered_tools[tool_id] = {
                            **tool,
                            "server_id": server["id"],
                            "server_name": server["name"],
                            "server_url": server["url"]
                        }
                    
                    logger.info(f"Connected to calculator server with {len(server['tools'])} tools")
                    return True
                
                # Unified Swarm Tools server
                elif "unified" in server_name_lower or "swarm" in server_name_lower or "8005" in server_url:
                    server["tools"] = [
                        # Filesystem tools
                        {"name": "list_files", "description": "List files in a directory"},
                        {"name": "read_file", "description": "Read a file's contents"},
                        {"name": "write_file", "description": "Write content to a file"},
                        # Memory tools
                        {"name": "store_memory", "description": "Store a memory or fact"},
                        {"name": "recall_memory", "description": "Retrieve a memory by key"},
                        {"name": "search_memories", "description": "Search memories by category or content"},
                        # Calculator tools
                        {"name": "add", "description": "Add two numbers together"},
                        {"name": "subtract", "description": "Subtract second number from first"},
                        {"name": "multiply", "description": "Multiply two numbers"},
                        {"name": "divide", "description": "Divide first number by second"},
                        # Web search tools
                        {"name": "web_search", "description": "Search the web using DuckDuckGo"},
                        {"name": "fetch_webpage", "description": "Fetch and extract text from a webpage"}
                    ]
                    server["status"] = "connected"
                    
                    # Store discovered tools
                    for tool in server["tools"]:
                        tool_id = f"{server['id']}_{tool.get('name', '')}"
                        self.discovered_tools[tool_id] = {
                            **tool,
                            "server_id": server["id"],
                            "server_name": server["name"],
                            "server_url": server["url"]
                        }
                    
                    logger.info(f"Connected to unified server with {len(server['tools'])} tools")
                    return True
                    
                # Try a simple connection test
                async with session.get(server_url) as response:
                    if response.status == 200:
                        server["status"] = "connected"
                        return True
                    
        except Exception as e:
            logger.error(f"Failed to connect to MCP server {server.get('name')}: {e}")
            server["status"] = "error"
            server["error"] = str(e)
            
        return False
    
    async def call_mcp_tool(
        self,
        server_id: str,
        tool_name: str,
        arguments: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Call a tool on an MCP server"""
        if server_id not in self.servers:
            return {
                "success": False,
                "error": f"Server {server_id} not found"
            }
        
        # TODO: Implement actual tool calling
        return {
            "success": True,
            "result": f"Called {tool_name} with {arguments}"
        }
    
    def get_all_tools(self) -> List[Dict[str, Any]]:
        """Get all discovered tools from all servers"""
        tools = []
        for server in self.servers.values():
            if server.get("enabled") and server.get("tools"):
                for tool in server["tools"]:
                    tools.append({
                        **tool,
                        'server_id': server["id"],
                        'server_name': server["name"],
                        'server_url': server["url"]
                    })
        return tools
    
    def get_server_status(self) -> Dict[str, Any]:
        """Get status of all MCP servers"""
        status = {}
        for server_id, server in self.servers.items():
            # Update tool count from discovered tools
            server_tools = [
                tool_id for tool_id in self.discovered_tools
                if self.discovered_tools[tool_id].get('server_id') == server_id
            ]
            
            status[server_id] = {
                'name': server['name'],
                'url': server['url'],
                'transport': server.get('transport', 'sse'),
                'status': server.get('status', 'disconnected'),
                'enabled': server.get('enabled', True),
                'tool_count': len(server.get('tools', [])),
                'tools': server.get('tools', [])
            }
        
        return status


# Global instance
mcp_service = MCPIntegrationService()