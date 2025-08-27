"""
Strands-compatible Tool Registry
Following the Strands tools pattern for dynamic tool discovery
"""
from typing import Dict, Any, List, Optional, Callable
import os
import json
import structlog
from dataclasses import dataclass
from enum import Enum
from datetime import datetime

logger = structlog.get_logger()


class ToolCapability(Enum):
    """Tool capability categories following Strands pattern"""
    WEB_SEARCH = "web_search"
    FILE_OPERATIONS = "file_operations"
    CODE_GENERATION = "code_generation"
    CODE_EXECUTION = "code_execution"  # Added for python_repl and shell
    DATA_ANALYSIS = "data_analysis"
    API_INTERACTION = "api_interaction"
    DOCUMENTATION = "documentation"
    TESTING = "testing"
    DATABASE = "database"
    DEPLOYMENT = "deployment"
    MONITORING = "monitoring"
    COMMUNICATION = "communication"
    AI_TOOLS = "ai_tools"
    PROJECT_MANAGEMENT = "project_management"


@dataclass
class StrandsTool:
    """Strands-compatible tool definition"""
    name: str
    description: str
    handler: Callable
    input_schema: Dict[str, Any]
    capabilities: List[ToolCapability]
    requires_approval: bool = False
    is_async: bool = False
    enabled: bool = True

    def to_dict(self) -> Dict[str, Any]:
        """Convert tool to dictionary format"""
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
            "capabilities": [cap.value for cap in self.capabilities],
            "requires_approval": self.requires_approval,
            "enabled": self.enabled
        }


class StrandsToolRegistry:
    """
    Dynamic tool registry following Strands patterns
    Provides tool discovery, capability mapping, and execution
    """

    def __init__(self):
        self.tools: Dict[str, StrandsTool] = {}
        self.capability_map: Dict[ToolCapability, List[str]] = {}
        self._initialized = False
        self.tool_config_service = None

    async def initialize(self):
        """Initialize and discover all available tools"""
        if self._initialized:
            return

        # Import tool config service
        try:
            from app.services.tool_config_service import tool_config_service
            self.tool_config_service = tool_config_service
        except ImportError:
            logger.warning("Tool config service not available")

        # Register built-in tools
        await self._register_builtin_tools()

        # Discover MCP tools if available
        await self._discover_mcp_tools()

        # Load configuration-based tools
        await self._load_configured_tools()

        self._initialized = True
        logger.info(f"✅ Strands Tool Registry initialized with {len(self.tools)} tools")

    async def _register_builtin_tools(self):
        """Register built-in Strands-compatible tools"""

        # Tavily Search Tool
        if os.getenv("TAVILY_API_KEY"):
            from app.tools.strands_tavily_search import tavily_search

            tavily_tool = StrandsTool(
                name="tavily_search",
                description="Search the web for current information using Tavily API",
                handler=tavily_search,
                input_schema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The search query"
                        },
                        "search_depth": {
                            "type": "string",
                            "enum": ["basic", "advanced"],
                            "default": "basic"
                        },
                        "max_results": {
                            "type": "integer",
                            "default": 5
                        }
                    },
                    "required": ["query"]
                },
                capabilities=[ToolCapability.WEB_SEARCH],
                requires_approval=True
            )

            self._register_tool(tavily_tool)

        # File Operations Tools
        from app.services.enhanced_swarm_service import GLOBAL_VIRTUAL_FILES

        def file_write(path: str, content: str) -> Dict[str, Any]:
            """Write content to a virtual file"""
            GLOBAL_VIRTUAL_FILES[path] = content
            return {
                "success": True,
                "message": f"File written: {path}",
                "size": len(content)
            }

        file_write_tool = StrandsTool(
            name="file_write",
            description="Write content to a file",
            handler=file_write,
            input_schema={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path"},
                    "content": {"type": "string", "description": "File content"}
                },
                "required": ["path", "content"]
            },
            capabilities=[ToolCapability.FILE_OPERATIONS, ToolCapability.CODE_GENERATION],
            requires_approval=True
        )

        self._register_tool(file_write_tool)

        def file_read(path: str) -> Dict[str, Any]:
            """Read content from a virtual file"""
            if path in GLOBAL_VIRTUAL_FILES:
                return {
                    "success": True,
                    "content": GLOBAL_VIRTUAL_FILES[path]
                }
            return {
                "success": False,
                "error": f"File not found: {path}"
            }

        file_read_tool = StrandsTool(
            name="file_read",
            description="Read content from a file",
            handler=file_read,
            input_schema={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path"}
                },
                "required": ["path"]
            },
            capabilities=[ToolCapability.FILE_OPERATIONS],
            requires_approval=False
        )

        self._register_tool(file_read_tool)

        # Python REPL Tool
        import subprocess
        import tempfile
        
        def python_repl(code: str) -> Dict[str, Any]:
            """Execute Python code in a sandboxed environment"""
            try:
                # Create a temporary file for the code
                with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                    f.write(code)
                    temp_file = f.name
                
                # Execute the code with timeout
                result = subprocess.run(
                    ['python3', temp_file],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                # Clean up
                os.unlink(temp_file)
                
                return {
                    "success": True,
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "return_code": result.returncode
                }
            except subprocess.TimeoutExpired:
                return {
                    "success": False,
                    "error": "Code execution timed out after 30 seconds"
                }
            except Exception as e:
                return {
                    "success": False,
                    "error": str(e)
                }
        
        python_repl_tool = StrandsTool(
            name="python_repl",
            description="Execute Python code in a sandboxed environment",
            handler=python_repl,
            input_schema={
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "Python code to execute"}
                },
                "required": ["code"]
            },
            capabilities=[ToolCapability.CODE_EXECUTION],
            requires_approval=True
        )
        
        self._register_tool(python_repl_tool)
        
        # Calculator Tool
        def calculator(expression: str) -> Dict[str, Any]:
            """Evaluate mathematical expressions"""
            try:
                # Use eval safely for mathematical expressions only
                import ast
                import operator as op
                
                # Supported operators
                ops = {
                    ast.Add: op.add, ast.Sub: op.sub, ast.Mult: op.mul,
                    ast.Div: op.truediv, ast.Pow: op.pow, ast.BitXor: op.xor,
                    ast.USub: op.neg, ast.Mod: op.mod
                }
                
                def eval_expr(expr):
                    return eval(expr, {"__builtins__": {}}, {})
                
                result = eval_expr(expression)
                return {
                    "success": True,
                    "result": result,
                    "expression": expression
                }
            except Exception as e:
                return {
                    "success": False,
                    "error": f"Invalid expression: {str(e)}"
                }
        
        calculator_tool = StrandsTool(
            name="calculator",
            description="Perform mathematical calculations",
            handler=calculator,
            input_schema={
                "type": "object",
                "properties": {
                    "expression": {"type": "string", "description": "Mathematical expression to evaluate"}
                },
                "required": ["expression"]
            },
            capabilities=[ToolCapability.DATA_ANALYSIS],
            requires_approval=False
        )
        
        self._register_tool(calculator_tool)
        
        # Code Generator Tool (placeholder that uses file_write)
        def code_generator(language: str, description: str, filename: str) -> Dict[str, Any]:
            """Generate code based on description"""
            code_templates = {
                "python": f"# {description}\n\ndef main():\n    # TODO: Implement {description}\n    pass\n\nif __name__ == '__main__':\n    main()",
                "javascript": f"// {description}\n\nfunction main() {{\n    // TODO: Implement {description}\n}}\n\nmain();",
                "html": f"<!DOCTYPE html>\n<html>\n<head>\n    <title>{description}</title>\n</head>\n<body>\n    <h1>{description}</h1>\n    <!-- TODO: Implement -->\n</body>\n</html>"
            }
            
            code = code_templates.get(language.lower(), f"// {description}\n// TODO: Implement")
            
            # Use file_write to save the code
            GLOBAL_VIRTUAL_FILES[filename] = code
            
            return {
                "success": True,
                "message": f"Generated {language} code for: {description}",
                "filename": filename,
                "code": code
            }
        
        code_generator_tool = StrandsTool(
            name="code_generator",
            description="Generate code templates and boilerplate",
            handler=code_generator,
            input_schema={
                "type": "object",
                "properties": {
                    "language": {"type": "string", "description": "Programming language"},
                    "description": {"type": "string", "description": "What the code should do"},
                    "filename": {"type": "string", "description": "Output filename"}
                },
                "required": ["language", "description", "filename"]
            },
            capabilities=[ToolCapability.CODE_GENERATION],
            requires_approval=False
        )
        
        self._register_tool(code_generator_tool)
        
        # Shell Command Tool (safer version)
        def shell_command(command: str) -> Dict[str, Any]:
            """Execute shell commands (limited to safe commands)"""
            # Whitelist of safe commands
            safe_commands = ['ls', 'pwd', 'date', 'echo', 'cat', 'grep', 'find', 'which']
            
            cmd_parts = command.split()
            if not cmd_parts or cmd_parts[0] not in safe_commands:
                return {
                    "success": False,
                    "error": f"Command '{cmd_parts[0] if cmd_parts else ''}' is not in the safe command list"
                }
            
            try:
                result = subprocess.run(
                    command,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                return {
                    "success": True,
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "return_code": result.returncode
                }
            except subprocess.TimeoutExpired:
                return {
                    "success": False,
                    "error": "Command timed out after 10 seconds"
                }
            except Exception as e:
                return {
                    "success": False,
                    "error": str(e)
                }
        
        shell_tool = StrandsTool(
            name="shell",
            description="Execute safe shell commands",
            handler=shell_command,
            input_schema={
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Shell command to execute"}
                },
                "required": ["command"]
            },
            capabilities=[ToolCapability.CODE_EXECUTION],
            requires_approval=True
        )
        
        self._register_tool(shell_tool)

    async def _discover_mcp_tools(self):
        """Discover and register MCP tools from configured servers"""
        # This will connect to MCP servers and discover their tools
        # For now, we'll skip this as it requires MCP server setup
        pass

    async def _load_configured_tools(self):
        """Load tools from configuration file or database"""
        # This would load tools from a configuration source
        # For now, we'll use the built-in tools
        pass

    def _register_tool(self, tool: StrandsTool):
        """Register a tool and update capability mappings"""
        self.tools[tool.name] = tool

        # Update capability mappings
        for capability in tool.capabilities:
            if capability not in self.capability_map:
                self.capability_map[capability] = []
            if tool.name not in self.capability_map[capability]:
                self.capability_map[capability].append(tool.name)

        logger.info(f"Registered tool: {tool.name} with capabilities: {[c.value for c in tool.capabilities]}")

    def get_available_tools(self,
                           capabilities: Optional[List[ToolCapability]] = None,
                           enabled_only: bool = True) -> Dict[str, StrandsTool]:
        """
        Get available tools, optionally filtered by capabilities

        Args:
            capabilities: List of required capabilities
            enabled_only: Only return enabled tools

        Returns:
            Dictionary of tool name to StrandsTool
        """
        result = {}

        if capabilities:
            # Get tools that match ANY of the required capabilities
            tool_names = set()
            for capability in capabilities:
                if capability in self.capability_map:
                    tool_names.update(self.capability_map[capability])

            for name in tool_names:
                tool = self.tools.get(name)
                if tool and (not enabled_only or tool.enabled):
                    result[name] = tool
        else:
            # Return all tools
            for name, tool in self.tools.items():
                if not enabled_only or tool.enabled:
                    result[name] = tool

        return result

    def get_tools_for_capabilities(self, capabilities: List[str]) -> List[Dict[str, Any]]:
        """
        Get tools that match the given capability strings

        Args:
            capabilities: List of capability strings (from orchestrator)

        Returns:
            List of tool information dictionaries
        """
        # Convert string capabilities to enum
        enum_capabilities = []
        for cap_str in capabilities:
            try:
                # Map orchestrator capability strings to our enums
                capability_mapping = {
                    "file_operations": ToolCapability.FILE_OPERATIONS,
                    "code_generation": ToolCapability.CODE_GENERATION,
                    "web_search": ToolCapability.WEB_SEARCH,
                    "data_analysis": ToolCapability.DATA_ANALYSIS,
                    "api_interaction": ToolCapability.API_INTERACTION,
                    "documentation": ToolCapability.DOCUMENTATION,
                    "testing": ToolCapability.TESTING,
                    "database": ToolCapability.DATABASE,
                    "deployment": ToolCapability.DEPLOYMENT,
                    "monitoring": ToolCapability.MONITORING,
                    "communication": ToolCapability.COMMUNICATION,
                    "ai_tools": ToolCapability.AI_TOOLS,
                    "project_management": ToolCapability.PROJECT_MANAGEMENT
                }

                if cap_str in capability_mapping:
                    enum_capabilities.append(capability_mapping[cap_str])
            except Exception:
                logger.warning(f"Unknown capability: {cap_str}")

        # Get matching tools
        tools = self.get_available_tools(capabilities=enum_capabilities)

        # Convert to list of tool info
        return [tool.to_dict() for tool in tools.values()]

    def get_tool_names_for_capabilities(self, capabilities: List[str]) -> List[str]:
        """Get just the tool names for given capabilities"""
        tools = self.get_tools_for_capabilities(capabilities)
        return [tool["name"] for tool in tools]

    async def execute_tool(self, name: str, parameters: Dict[str, Any], agent_name: Optional[str] = None) -> Dict[str, Any]:
        """Execute a tool by name with configuration checks"""
        tool = self.tools.get(name)
        if not tool:
            return {
                "success": False,
                "error": f"Tool '{name}' not found",
                "available_tools": list(self.tools.keys())
            }

        # Check with tool config service if available
        if self.tool_config_service:
            tool_config = await self.tool_config_service.get_tool(name)
            if tool_config:
                # Check if tool is enabled
                if not tool_config.enabled:
                    return {
                        "success": False,
                        "error": f"Tool '{name}' is disabled in configuration"
                    }

                # Check agent permissions if agent_name provided
                if agent_name and not self.tool_config_service.is_tool_allowed_for_agent(name, agent_name):
                    return {
                        "success": False,
                        "error": f"Tool '{name}' is not allowed for agent '{agent_name}'"
                    }

                # Update tool usage count
                tool_config.usage_count += 1
                tool_config.last_used = datetime.utcnow()
        else:
            # Fallback to tool's own enabled state
            if not tool.enabled:
                return {
                    "success": False,
                    "error": f"Tool '{name}' is disabled"
                }

        try:
            if tool.is_async:
                result = await tool.handler(**parameters)
            else:
                result = tool.handler(**parameters)
            return result
        except Exception as e:
            logger.error(f"Tool execution error for {name}: {e}")

            # Update error count if config service available
            if self.tool_config_service:
                tool_config = await self.tool_config_service.get_tool(name)
                if tool_config:
                    tool_config.error_count += 1
                    tool_config.last_error = str(e)

            return {
                "success": False,
                "error": str(e)
            }

    def get_all_capabilities(self) -> List[str]:
        """Get all available capability strings"""
        return [cap.value for cap in ToolCapability]

    def get_tool_info(self) -> List[Dict[str, Any]]:
        """Get information about all available tools"""
        return [tool.to_dict() for tool in self.tools.values()]

    async def get_enabled_tools_for_agent(self, agent_name: str) -> List[Dict[str, Any]]:
        """Get only enabled tools allowed for a specific agent"""
        if not self.tool_config_service:
            # Fallback to all enabled tools
            return [tool.to_dict() for tool in self.tools.values() if tool.enabled]

        # Get allowed tool IDs from config service
        allowed_tool_ids = self.tool_config_service.get_tools_for_agent(agent_name)

        # Return tool info for allowed tools
        result = []
        for tool_id in allowed_tool_ids:
            if tool_id in self.tools:
                result.append(self.tools[tool_id].to_dict())

        return result


# Global instance
strands_tool_registry = StrandsToolRegistry()


async def get_dynamic_tools() -> StrandsToolRegistry:
    """Get the initialized tool registry"""
    if not strands_tool_registry._initialized:
        await strands_tool_registry.initialize()
    return strands_tool_registry