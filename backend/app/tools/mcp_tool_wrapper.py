"""
MCP Tool Wrapper for Strands Agents
Makes MCP tools available to agents with approval support
"""
from typing import Dict, Any, Optional
import json
import asyncio
import structlog
from app.services.mcp_integration import MCPIntegration
from app.services.mcp_tools.tavily_search import tavily_mcp_server

logger = structlog.get_logger()

class MCPToolWrapper:
    """Wrapper to make MCP tools callable by agents"""
    
    def __init__(self, tool_name: str, mcp_integration: Optional[MCPIntegration] = None):
        self.tool_name = tool_name
        self.mcp_integration = mcp_integration
        
    async def __call__(self, *args, **kwargs) -> Dict[str, Any]:
        """Execute MCP tool"""
        try:
            logger.info(f"MCP Tool Wrapper executing: {self.tool_name} with args: {kwargs}")
            
            # Special handling for Tavily
            if self.tool_name == "tavily_web_search":
                result = await tavily_mcp_server.call_tool(self.tool_name, kwargs)
                
                # Parse result
                if "error" in result:
                    return {"error": result["error"]}
                
                # Extract content
                content = result.get("content", [])
                if content and len(content) > 0:
                    text_content = content[0].get("text", "{}")
                    try:
                        parsed = json.loads(text_content)
                        return parsed
                    except:
                        return {"result": text_content}
                        
                return result
            
            # For other MCP tools, use the integration
            if self.mcp_integration:
                result = await self.mcp_integration.execute_tool(
                    tool_name=self.tool_name,
                    arguments=kwargs
                )
                
                if result.success:
                    return result.result
                else:
                    return {"error": result.error}
            
            return {"error": f"MCP tool {self.tool_name} not configured"}
            
        except Exception as e:
            logger.error(f"MCP tool execution error: {e}")
            return {"error": str(e)}


def create_mcp_tool_callable(tool_name: str):
    """Create a callable for an MCP tool"""
    wrapper = MCPToolWrapper(tool_name)
    
    # Make it synchronous for compatibility with agent tools
    def sync_wrapper(**kwargs):
        """Synchronous wrapper for async MCP tool"""
        try:
            # Run async in sync context
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result = loop.run_until_complete(wrapper(**kwargs))
                return result
            finally:
                loop.close()
        except Exception as e:
            logger.error(f"Sync wrapper error: {e}")
            return {"error": str(e)}
    
    # Set attributes for tool discovery
    sync_wrapper.__name__ = tool_name
    sync_wrapper.__doc__ = f"MCP tool: {tool_name}"
    
    return sync_wrapper


# Create callable versions of MCP tools
tavily_web_search = create_mcp_tool_callable("tavily_web_search")

# Export for agent use
__all__ = ["tavily_web_search", "MCPToolWrapper", "create_mcp_tool_callable"]