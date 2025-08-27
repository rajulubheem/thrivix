"""
Unified Tool Service
Manages all tools (built-in, MCP, dynamic) and provides a single interface
"""
from typing import Dict, Any, List, Optional, Callable
import structlog
from app.tools.strands_tool_registry import strands_tool_registry, get_dynamic_tools
from app.services.mcp_integration import mcp_service
import json

logger = structlog.get_logger()


class UnifiedToolService:
    """
    Central service for managing all tools in the system
    Provides a unified interface for agents to access tools
    """
    
    def __init__(self):
        self.all_tools: Dict[str, Dict[str, Any]] = {}
        self.tool_handlers: Dict[str, Callable] = {}
        self.tool_categories = {
            "file_operations": ["file_read", "file_write", "list_files", "delete_file"],
            "web_search": ["tavily_search", "web_search", "fetch_webpage"],
            "memory": ["store_memory", "recall_memory", "search_memories"],
            "calculator": ["add", "subtract", "multiply", "divide"],
            "code": ["execute_code", "python_repl"],
            "communication": ["send_email", "slack_message"]
        }
        self._initialized = False
    
    async def initialize(self):
        """Initialize and discover all available tools"""
        if self._initialized:
            return
        
        logger.info("Initializing Unified Tool Service...")
        
        # 1. Get built-in tools from Strands registry
        registry = await get_dynamic_tools()
        for tool_name, tool in registry.tools.items():
            self.all_tools[tool_name] = {
                "name": tool_name,
                "description": tool.description,
                "source": "builtin",
                "category": self._get_category(tool_name),
                "requires_approval": tool.requires_approval,
                "enabled": tool.enabled,
                "handler": tool.handler,
                "input_schema": tool.input_schema,
                "is_async": getattr(tool, 'is_async', False)  # Include async flag
            }
            self.tool_handlers[tool_name] = tool.handler
        
        # 2. Get MCP tools
        mcp_tools = mcp_service.get_all_tools()
        for mcp_tool in mcp_tools:
            tool_name = mcp_tool["name"]
            # Prefix MCP tools to avoid conflicts
            full_name = f"mcp_{tool_name}"
            self.all_tools[full_name] = {
                "name": full_name,
                "description": mcp_tool.get("description", ""),
                "source": "mcp",
                "category": self._get_category(tool_name),
                "requires_approval": True,  # MCP tools should require approval
                "enabled": True,
                "server_id": mcp_tool.get("server_id"),
                "server_name": mcp_tool.get("server_name"),
                "handler": None  # MCP tools are executed differently
            }
        
        self._initialized = True
        logger.info(f"✅ Unified Tool Service initialized with {len(self.all_tools)} tools")
        logger.info(f"🔧 Available tools: {list(self.all_tools.keys())}")
        
        # Debug: Show details of first few tools
        for i, (tool_name, tool_info) in enumerate(list(self.all_tools.items())[:3]):
            logger.info(f"🔧 Tool {i+1}: {tool_name} - {tool_info.get('description', 'No description')}")
            logger.info(f"    Source: {tool_info.get('source')}, Async: {tool_info.get('is_async')}, Handler: {tool_info.get('handler') is not None}")
    
    def _get_category(self, tool_name: str) -> str:
        """Determine category for a tool based on its name"""
        tool_lower = tool_name.lower()
        
        if any(x in tool_lower for x in ["file", "read", "write", "list", "directory"]):
            return "file_operations"
        elif any(x in tool_lower for x in ["search", "web", "fetch", "scrape"]):
            return "web_search"
        elif any(x in tool_lower for x in ["memory", "recall", "store", "remember"]):
            return "memory"
        elif any(x in tool_lower for x in ["add", "subtract", "multiply", "divide", "calculate"]):
            return "calculator"
        elif any(x in tool_lower for x in ["code", "execute", "python", "shell"]):
            return "code"
        elif any(x in tool_lower for x in ["email", "slack", "message", "send"]):
            return "communication"
        else:
            return "utilities"
    
    def get_all_tools(self, enabled_only: bool = True) -> List[Dict[str, Any]]:
        """Get all available tools"""
        tools = []
        for tool_name, tool_info in self.all_tools.items():
            if not enabled_only or tool_info.get("enabled", True):
                tools.append({
                    "id": tool_name,
                    "name": tool_name,
                    "description": tool_info.get("description", ""),
                    "category": tool_info.get("category", "utilities"),
                    "source": tool_info.get("source", "unknown"),
                    "enabled": tool_info.get("enabled", True),
                    "requires_approval": tool_info.get("requires_approval", False)
                })
        return tools
    
    def get_tools_for_agent(self, agent_name: str, capabilities: List[str] = None) -> List[str]:
        """Get tools available for a specific agent"""
        available_tools = []
        
        # If capabilities specified, get tools for those capabilities
        if capabilities:
            for capability in capabilities:
                category_tools = self.tool_categories.get(capability, [])
                for tool_name in category_tools:
                    if tool_name in self.all_tools and self.all_tools[tool_name].get("enabled", True):
                        available_tools.append(tool_name)
        else:
            # Return all enabled tools
            for tool_name, tool_info in self.all_tools.items():
                if tool_info.get("enabled", True):
                    available_tools.append(tool_name)
        
        # Remove duplicates and limit
        return list(set(available_tools))[:10]  # Max 10 tools per agent
    
    async def execute_tool(self, tool_name: str, arguments: Dict[str, Any], agent_name: str = None) -> Dict[str, Any]:
        """Execute a tool with the given arguments"""
        if tool_name not in self.all_tools:
            return {"error": f"Tool '{tool_name}' not found"}
        
        tool_info = self.all_tools[tool_name]
        
        # Note: Approval is handled by the calling service (iterative_agent_service)
        
        # Execute based on source
        if tool_info["source"] == "builtin":
            handler = tool_info.get("handler")
            if handler:
                try:
                    # Check if the tool is async
                    is_async = tool_info.get("is_async", False)
                    
                    if is_async:
                        logger.info(f"Executing ASYNC tool: {tool_name}")
                        result = await handler(**arguments)
                    else:
                        logger.info(f"Executing SYNC tool: {tool_name}")
                        result = handler(**arguments)
                    
                    logger.info(f"Tool {tool_name} executed successfully: {result}")
                    return {"success": True, "result": result}
                except Exception as e:
                    logger.error(f"Tool {tool_name} execution failed: {e}", exc_info=True)
                    return {"error": str(e)}
            else:
                return {"error": "No handler found for tool"}
        
        elif tool_info["source"] == "mcp":
            # Execute MCP tool
            server_id = tool_info.get("server_id")
            if server_id:
                result = await mcp_service.call_mcp_tool(
                    server_id,
                    tool_name.replace("mcp_", ""),  # Remove prefix
                    arguments
                )
                return result
            else:
                return {"error": "MCP server not found"}
        
        else:
            return {"error": f"Unknown tool source: {tool_info['source']}"}
    
    def get_tool_prompt_info(self, tool_names: List[str]) -> str:
        """Generate prompt information for tools"""
        if not tool_names:
            return ""
        
        prompt = "\nAVAILABLE TOOLS:\nYou have access to the following REAL tools:\n\n"
        
        for tool_name in tool_names:
            if tool_name in self.all_tools:
                tool_info = self.all_tools[tool_name]
                prompt += f"**{tool_name}**: {tool_info.get('description', 'No description')}\n"
                
                # Add usage example based on tool type
                if tool_info.get("source") == "builtin":
                    # Add schema-based example
                    schema = tool_info.get("input_schema", {})
                    if schema:
                        props = schema.get("properties", {})
                        example_args = {}
                        for prop_name, prop_info in props.items():
                            if prop_info.get("type") == "string":
                                example_args[prop_name] = f"your {prop_name}"
                            elif prop_info.get("type") == "number":
                                example_args[prop_name] = 0
                            elif prop_info.get("type") == "boolean":
                                example_args[prop_name] = True
                        
                        prompt += f"   To use: [TOOL: {tool_name}]\n"
                        prompt += f"   {json.dumps(example_args, indent=3)}\n"
                        prompt += "   [/TOOL]\n"
                
                prompt += "\n"
        
        prompt += """
IMPORTANT: These are REAL, executable tools. When you need their functionality, use the [TOOL: name] format shown above.
The tool will be executed automatically and results will appear as [TOOL RESULT].
DO NOT simulate or create fake implementations - USE THE ACTUAL TOOLS!
"""
        
        return prompt
    
    def get_configuration_for_ui(self) -> Dict[str, Any]:
        """Get tool configuration for the UI settings page"""
        tools = []
        mcp_servers = {}
        
        # Process all tools
        for tool_name, tool_info in self.all_tools.items():
            if tool_info["source"] == "builtin":
                tools.append({
                    "id": tool_name,
                    "name": tool_name,
                    "description": tool_info.get("description", ""),
                    "category": tool_info.get("category", "utilities"),
                    "enabled": tool_info.get("enabled", True),
                    "status": "enabled" if tool_info.get("enabled", True) else "disabled",
                    "requires_approval": tool_info.get("requires_approval", False),
                    "usage_count": 0,
                    "error_count": 0,
                    "config": {},
                    "required_env_vars": []
                })
        
        # Get MCP servers
        mcp_servers = mcp_service.get_server_status()
        
        return {
            "tools": tools,
            "mcp_servers": list(mcp_servers.values()) if mcp_servers else [],
            "statistics": {
                "total_tools": len(self.all_tools),
                "enabled_tools": len([t for t in self.all_tools.values() if t.get("enabled", True)]),
                "total_mcp_servers": len(mcp_servers),
                "active_mcp_servers": len([s for s in mcp_servers.values() if s.get("status") == "connected"])
            }
        }


# Global instance
unified_tool_service = UnifiedToolService()


async def get_unified_tools():
    """Get the initialized unified tool service"""
    if not unified_tool_service._initialized:
        await unified_tool_service.initialize()
    return unified_tool_service