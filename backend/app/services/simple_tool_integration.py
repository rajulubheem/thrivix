"""
Simple Tool Integration for Tavily Search
Focus on getting it working without complex MCP dependencies
"""
import os
import structlog
from typing import Dict, Any, Optional

logger = structlog.get_logger()


class SimpleToolIntegration:
    """Simple tool integration without MCP complexity"""
    
    def __init__(self):
        self.registered_tools = {}
        
    async def initialize_tavily(self):
        """Initialize Tavily search tool"""
        try:
            # Check if API key exists
            if not os.getenv("TAVILY_API_KEY"):
                logger.warning("TAVILY_API_KEY not set - Tavily search will not work")
                logger.info("Get a free API key at: https://tavily.com/")
                return False
            
            # Import the Tavily tool
            from app.tools.strands_tavily_search import tavily_search, TOOL_SPEC
            
            # Register the tool
            self.registered_tools["tavily_search"] = {
                "spec": TOOL_SPEC,
                "handler": tavily_search,
                "enabled": True
            }
            
            logger.info("✅ Tavily search tool initialized successfully")
            logger.info(f"Registered tools: {list(self.registered_tools.keys())}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize Tavily: {e}")
            return False
    
    def get_tool(self, tool_name: str) -> Optional[Dict[str, Any]]:
        """Get a registered tool by name"""
        return self.registered_tools.get(tool_name)
    
    async def execute_tool(self, tool_name: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool by name"""
        tool = self.get_tool(tool_name)
        if not tool:
            return {
                "success": False,
                "error": f"Tool '{tool_name}' not found",
                "available_tools": list(self.registered_tools.keys())
            }
        
        if not tool.get("enabled"):
            return {
                "success": False,
                "error": f"Tool '{tool_name}' is disabled"
            }
        
        try:
            handler = tool["handler"]
            # Call the tool handler
            result = handler(**parameters)
            return result
        except Exception as e:
            logger.error(f"Tool execution error for {tool_name}: {e}")
            return {
                "success": False,
                "error": str(e)
            }


# Global instance
tool_integration = SimpleToolIntegration()


async def setup_tools():
    """Initialize all tools on startup"""
    await tool_integration.initialize_tavily()
    return tool_integration