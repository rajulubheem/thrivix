"""
MCP Integration for Strands Agents following official documentation
"""
import os
import asyncio
from typing import Dict, Any, List, Optional
import structlog
from mcp.client import MCPClient
import json

logger = structlog.get_logger()


class StrandsMCPIntegration:
    """
    MCP Integration following Strands documentation pattern
    https://strandsagents.com/latest/documentation/docs/examples/python/mcp_calculator/
    """
    
    def __init__(self):
        self.mcp_clients: Dict[str, MCPClient] = {}
        self.registered_tools: Dict[str, Any] = {}
        
    async def register_mcp_server(self, name: str, server_path: str):
        """Register an MCP server with the integration"""
        try:
            # Create MCP client connection
            client = MCPClient()
            
            # Connect to the MCP server
            await client.connect(server_path)
            
            # Store the client
            self.mcp_clients[name] = client
            
            # Get available tools from the server
            tools = await client.list_tools()
            
            # Register tools for use
            for tool in tools:
                tool_name = tool.get("name")
                self.registered_tools[tool_name] = {
                    "server": name,
                    "client": client,
                    "metadata": tool
                }
                logger.info(f"Registered MCP tool: {tool_name} from {name}")
                
        except Exception as e:
            logger.error(f"Failed to register MCP server {name}: {e}")
            raise
    
    async def execute_mcp_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute an MCP tool through the proper client"""
        if tool_name not in self.registered_tools:
            return {
                "error": f"Tool {tool_name} not found",
                "available_tools": list(self.registered_tools.keys())
            }
        
        tool_info = self.registered_tools[tool_name]
        client = tool_info["client"]
        
        try:
            # Execute tool through MCP client
            result = await client.call_tool(tool_name, arguments)
            return result
        except Exception as e:
            logger.error(f"MCP tool execution error for {tool_name}: {e}")
            return {"error": str(e)}
    
    def create_agent_with_mcp_tools(self, agent_name: str, system_prompt: str, tool_names: List[str]) -> Dict[str, Any]:
        """
        Create an agent configuration with MCP tools
        """
        # Create callable wrappers for MCP tools
        tools = {}
        for tool_name in tool_names:
            if tool_name in self.registered_tools:
                # Create a callable wrapper for the tool
                tools[tool_name] = self._create_tool_wrapper(tool_name)
        
        # Return agent configuration
        return {
            "name": agent_name,
            "system_prompt": system_prompt,
            "tools": tools,
            "tool_names": tool_names
        }
    
    def _create_tool_wrapper(self, tool_name: str):
        """Create a callable wrapper for an MCP tool"""
        async def tool_wrapper(**kwargs):
            return await self.execute_mcp_tool(tool_name, kwargs)
        
        # Set metadata
        tool_wrapper.__name__ = tool_name
        tool_wrapper.__doc__ = self.registered_tools[tool_name]["metadata"].get("description", "")
        
        return tool_wrapper
    
    async def initialize_tavily_mcp(self):
        """Initialize Tavily tool following Strands pattern"""
        try:
            # Import the Tavily tool
            from app.tools.strands_tavily_search import tavily_search, TOOL_SPEC
            
            # Register Tavily as an available tool
            self.registered_tools["tavily_search"] = {
                "server": "local",
                "client": None,  # Direct integration
                "metadata": TOOL_SPEC,
                "callable": tavily_search
            }
            
            # Also register with alternate name for compatibility
            self.registered_tools["tavily_web_search"] = self.registered_tools["tavily_search"]
            
            logger.info("✅ Tavily tool integration initialized")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize Tavily tool: {e}")
            return False


# Global instance
strands_mcp = StrandsMCPIntegration()


async def setup_mcp_tools():
    """Initialize MCP tools on startup"""
    await strands_mcp.initialize_tavily_mcp()
    return strands_mcp