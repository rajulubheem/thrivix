"""
Global Tool Registry for Agents
Provides actual tool functions that agents can call
"""
import os
import json
import asyncio
from typing import Dict, Any, Optional, Callable, List
import structlog

logger = structlog.get_logger()


class ToolRegistry:
    """Central registry for all agent tools with dynamic capability mapping"""
    
    def __init__(self):
        self.tools: Dict[str, Dict[str, Any]] = {}
        self.capabilities: Dict[str, List[str]] = {}  # capability -> [tool_names]
        self.tool_capabilities: Dict[str, List[str]] = {}  # tool_name -> [capabilities]
        self._initialized = False
        
    async def initialize(self):
        """Initialize all available tools"""
        if self._initialized:
            return
            
        # Register Tavily search tool
        await self._register_tavily_tool()
        
        # Register file tools
        self._register_file_tools()
        
        self._initialized = True
        logger.info(f"✅ Tool Registry initialized with {len(self.tools)} tools")
        
    async def _register_tavily_tool(self):
        """Register Tavily search tool"""
        try:
            from app.tools.strands_tavily_search import tavily_search, TOOL_SPEC
            
            # Check if API key is available
            if not os.getenv("TAVILY_API_KEY"):
                logger.warning("TAVILY_API_KEY not set - Tavily tool will not work")
                
            self.tools["tavily_search"] = {
                "spec": TOOL_SPEC,
                "handler": tavily_search,
                "async": False,
                "requires_approval": True,
                "description": "Search the web for current information using Tavily API",
                "capabilities": ["web_search", "research", "current_information"]
            }
            
            # Also register with alternate names
            self.tools["web_search"] = self.tools["tavily_search"]
            self.tools["tavily_web_search"] = self.tools["tavily_search"]
            
            # Register capabilities
            self._register_tool_capabilities("tavily_search", ["web_search", "research", "current_information"])
            
            logger.info("✅ Tavily search tool registered")
            
        except Exception as e:
            logger.error(f"Failed to register Tavily tool: {e}")
            
    def _register_file_tools(self):
        """Register file operation tools"""
        
        # File write tool (using virtual filesystem)
        def file_write(path: str, content: str) -> Dict[str, Any]:
            """Write content to a virtual file"""
            from app.services.enhanced_swarm_service import GLOBAL_VIRTUAL_FILES
            
            GLOBAL_VIRTUAL_FILES[path] = content
            return {
                "success": True,
                "message": f"File written: {path}",
                "size": len(content)
            }
            
        self.tools["file_write"] = {
            "spec": {
                "name": "file_write",
                "description": "Write content to a file",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "File path"},
                        "content": {"type": "string", "description": "File content"}
                    },
                    "required": ["path", "content"]
                }
            },
            "handler": file_write,
            "async": False,
            "requires_approval": True,
            "description": "Write content to a file",
            "capabilities": ["file_operations", "code_generation", "documentation"]
        }
        
        # Register capabilities
        self._register_tool_capabilities("file_write", ["file_operations", "code_generation", "documentation"])
        
        # File read tool
        def file_read(path: str) -> Dict[str, Any]:
            """Read content from a virtual file"""
            from app.services.enhanced_swarm_service import GLOBAL_VIRTUAL_FILES
            
            if path in GLOBAL_VIRTUAL_FILES:
                return {
                    "success": True,
                    "content": GLOBAL_VIRTUAL_FILES[path]
                }
            else:
                return {
                    "success": False,
                    "error": f"File not found: {path}"
                }
                
        self.tools["file_read"] = {
            "spec": {
                "name": "file_read",
                "description": "Read content from a file",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "File path"}
                    },
                    "required": ["path"]
                }
            },
            "handler": file_read,
            "async": False,
            "requires_approval": False,
            "description": "Read content from a file",
            "capabilities": ["file_operations", "code_analysis", "research"]
        }
        
        # Register capabilities
        self._register_tool_capabilities("file_read", ["file_operations", "code_analysis", "research"])
        
    def get_tool(self, name: str) -> Optional[Dict[str, Any]]:
        """Get a tool by name"""
        return self.tools.get(name)
        
    def list_tools(self) -> Dict[str, str]:
        """List all available tools with descriptions"""
        return {
            name: tool.get("description", "No description")
            for name, tool in self.tools.items()
        }
        
    async def execute_tool(self, name: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool by name"""
        tool = self.get_tool(name)
        if not tool:
            return {
                "success": False,
                "error": f"Tool '{name}' not found",
                "available_tools": list(self.tools.keys())
            }
            
        try:
            handler = tool["handler"]
            
            # Execute the tool
            if tool.get("async"):
                result = await handler(**parameters)
            else:
                # Run sync tool in executor
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(None, handler, parameters)
                
            return result
            
        except Exception as e:
            logger.error(f"Tool execution error for {name}: {e}")
            return {
                "success": False,
                "error": str(e)
            }
            
    def _register_tool_capabilities(self, tool_name: str, capabilities: List[str]):
        """Register capabilities for a tool"""
        # Map tool to its capabilities
        self.tool_capabilities[tool_name] = capabilities
        
        # Map each capability to this tool
        for capability in capabilities:
            if capability not in self.capabilities:
                self.capabilities[capability] = []
            if tool_name not in self.capabilities[capability]:
                self.capabilities[capability].append(tool_name)
    
    def get_tools_by_capability(self, capability: str) -> List[str]:
        """Get all tools that provide a specific capability"""
        return self.capabilities.get(capability, [])
    
    def get_tools_for_capabilities(self, required_capabilities: List[str]) -> Dict[str, Any]:
        """Get all tools that match the required capabilities"""
        matching_tools = {}
        
        for capability in required_capabilities:
            tool_names = self.get_tools_by_capability(capability)
            for tool_name in tool_names:
                if tool_name not in matching_tools and tool_name in self.tools:
                    matching_tools[tool_name] = self.tools[tool_name]
        
        return matching_tools
    
    def get_all_capabilities(self) -> Dict[str, List[str]]:
        """Get all available capabilities and their associated tools"""
        return self.capabilities.copy()
    
    def get_tool_info(self) -> List[Dict[str, Any]]:
        """Get detailed information about all tools"""
        tool_info = []
        seen = set()  # Track seen tools to avoid duplicates
        
        for name, tool in self.tools.items():
            # Skip duplicate tool entries (aliases)
            tool_id = id(tool)
            if tool_id in seen:
                continue
            seen.add(tool_id)
            
            tool_info.append({
                "name": name,
                "description": tool.get("description", "No description"),
                "capabilities": tool.get("capabilities", []),
                "requires_approval": tool.get("requires_approval", False),
                "enabled": True  # Can be extended with configuration
            })
        
        return tool_info
    
    def get_tools_for_agent(self, agent_name: str) -> Dict[str, Any]:
        """Get tools available for a specific agent"""
        # Web researcher gets search tools
        if "web_researcher" in agent_name or "search" in agent_name:
            return {
                "tavily_search": self.tools.get("tavily_search"),
                "web_search": self.tools.get("web_search")
            }
        
        # Developer agents get file tools
        if "developer" in agent_name or "api" in agent_name:
            return {
                "file_write": self.tools.get("file_write"),
                "file_read": self.tools.get("file_read")
            }
            
        # Default tools for all agents
        return {
            "file_write": self.tools.get("file_write"),
            "file_read": self.tools.get("file_read")
        }


# Global instance
tool_registry = ToolRegistry()


async def setup_tool_registry():
    """Initialize the tool registry"""
    await tool_registry.initialize()
    return tool_registry