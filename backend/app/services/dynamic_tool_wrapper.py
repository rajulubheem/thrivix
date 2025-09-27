"""
Dynamic Tool Wrapper for Strands Agents
Wraps existing tools from strands-tools without requiring @tool decorator
"""
import asyncio
import json
import os
from typing import Dict, Any, List, Callable, Optional
import structlog
from strands import tool
import importlib
import inspect
import sys
from pathlib import Path

# Import correct tool definitions
sys.path.append(str(Path(__file__).parent))
try:
    from strands_tool_definitions import STRANDS_TOOL_SCHEMAS, get_tool_schema
except ImportError:
    STRANDS_TOOL_SCHEMAS = {}
    def get_tool_schema(tool_name: str):
        return None

logger = structlog.get_logger()

class DynamicToolWrapper:
    """Dynamically wraps existing tools for use with Strands agents"""
    
    def __init__(self, callback_handler: Optional[Callable] = None):
        self.callback_handler = callback_handler
        self.wrapped_tools = {}
        self.tool_instances = {}
        
    def create_visible_wrapper(self, tool_name: str, tool_func: Callable, agent_name: str) -> Callable:
        """Create a wrapper that adds visibility to any tool"""

        # Get the correct tool schema to build proper function signature
        tool_schema = get_tool_schema(tool_name)

        if tool_schema:
            # Extract parameter information from schema
            params = tool_schema.get('parameters', {})
            properties = params.get('properties', {})
            required = params.get('required', [])

            # Create parameter objects for the function signature
            sig_params = []
            for param_name, param_info in properties.items():
                # Determine if parameter has a default value
                if param_name in required:
                    # Required parameter - no default
                    param = inspect.Parameter(
                        param_name,
                        inspect.Parameter.POSITIONAL_OR_KEYWORD,
                        annotation=str
                    )
                else:
                    # Optional parameter - use default if specified
                    default_value = param_info.get('default', None)
                    param = inspect.Parameter(
                        param_name,
                        inspect.Parameter.POSITIONAL_OR_KEYWORD,
                        default=default_value,
                        annotation=str
                    )
                sig_params.append(param)

            # Create the new signature
            new_signature = inspect.Signature(sig_params)

            # Create a wrapper function with the correct signature
            async def _base_wrapped(*args, **kwargs):
                # Convert args to kwargs using parameter names
                bound_args = new_signature.bind(*args, **kwargs)
                bound_args.apply_defaults()
                actual_params = dict(bound_args.arguments)

                # Execute the tool with proper parameters
                return await self._execute_tool(tool_name, tool_func, agent_name, actual_params)

            # Apply the correct signature to the wrapper
            _base_wrapped.__signature__ = new_signature

        else:
            # Fallback if no schema available - use simple kwargs
            async def _base_wrapped(**kwargs):
                return await self._execute_tool(tool_name, tool_func, agent_name, kwargs)

        # Set function name and doc
        _base_wrapped.__name__ = tool_name
        _base_wrapped.__doc__ = tool_func.__doc__

        # Apply the Strands @tool decorator
        visible_tool = tool(_base_wrapped)

        # Log successful creation
        if tool_schema:
            param_names = list(tool_schema.get('parameters', {}).get('properties', {}).keys())
            logger.info(f"✅ Created tool {tool_name} with correct signature (parameters: {param_names})")
        else:
            logger.warning(f"⚠️ Created tool {tool_name} without schema")

        return visible_tool

    async def _execute_tool(self, tool_name: str, tool_func: Callable, agent_name: str, actual_params: Dict[str, Any]):
        """Execute a tool with proper error handling and logging"""
        current_tool_name = tool_name
        current_tool_func = tool_func

        # Emit tool call for UI
        if self.callback_handler:
            try:
                await self.callback_handler(
                    type="tool_call",
                    agent=agent_name,
                    data={
                        "tool": current_tool_name,
                        "wrapper": "wrapped_tool",
                        "parameters": actual_params
                    }
                )
            except Exception:
                pass

        try:
            # Execute the original tool with correct parameters
            def _build_tool_use(params: Dict[str, Any]) -> Dict[str, Any]:
                return {
                    "toolUseId": f"call_{int(asyncio.get_event_loop().time()*1000)}",
                    "input": params or {}
                }

            # Determine call signature
            call_target = current_tool_func
            is_async = asyncio.iscoroutinefunction(call_target)
            if not is_async and hasattr(current_tool_func, '__call__'):
                call_attr = current_tool_func.__call__
                call_target = call_attr
                is_async = asyncio.iscoroutinefunction(call_attr)

            try:
                sig = inspect.signature(call_target)
            except Exception:
                sig = None

            if sig:
                params = list(sig.parameters.values())
            else:
                params = []

            # If first param is named 'tool', adapt to ToolUse API
            if params and params[0].name == 'tool':
                tool_use = _build_tool_use(actual_params if isinstance(actual_params, dict) else {})
                if is_async:
                    result = await call_target(tool=tool_use)
                else:
                    result = await asyncio.to_thread(call_target, tool=tool_use)
            else:
                # Regular kwargs style
                if is_async:
                    result = await call_target(**(actual_params if isinstance(actual_params, dict) else {}))
                else:
                    result = await asyncio.to_thread(call_target, **(actual_params if isinstance(actual_params, dict) else {}))

            # Send success notification
            if self.callback_handler:
                await self.callback_handler(
                    type="tool_result",
                    agent=agent_name,
                    data={
                        "tool": current_tool_name,
                        "success": True,
                        "result": result,
                        "parameters": actual_params,
                        "wrapper": "wrapped_tool"
                    }
                )

            return result

        except Exception as e:
            logger.error(f"Tool {tool_name} error: {e}")

            if self.callback_handler:
                await self.callback_handler(
                    type="tool_result",
                    agent=agent_name,
                    data={
                        "tool": current_tool_name,
                        "success": False,
                        "error": str(e),
                        "parameters": actual_params,
                        "wrapper": "wrapped_tool"
                    }
                )

            return {"status": "error", "content": [{"text": str(e)}]}

    def wrap_strands_tool(self, tool_name: str, agent_name: str) -> Optional[Callable]:
        """Wrap a tool from strands-tools package"""

        try:
            # First try to load from strands registry (for ALL dynamic tools)
            try:
                from app.tools.strands_tool_registry import get_dynamic_tools
                import asyncio

                # Get or create event loop
                try:
                    loop = asyncio.get_running_loop()
                except RuntimeError:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)

                # Get the registry
                registry = loop.run_until_complete(get_dynamic_tools())
                if registry and hasattr(registry, 'tools') and tool_name in registry.tools:
                    tool_obj = registry.tools[tool_name]
                    if hasattr(tool_obj, 'handler'):
                        logger.info(f"✅ Loaded tool {tool_name} from strands registry")
                        return self.create_visible_wrapper(tool_name, tool_obj.handler, agent_name)
            except Exception as e:
                logger.debug(f"Could not load {tool_name} from strands registry: {e}")

            # Fallback: Check local tools directory
            if tool_name == 'tavily_search':
                try:
                    from tools.tavily_search_tool import tavily_search
                    logger.info(f"✅ Loaded tool {tool_name} from tools.tavily_search_tool")
                    return self.create_visible_wrapper(tool_name, tavily_search, agent_name)
                except ImportError:
                    pass

            # Prefer app.tools implementations first (stable call signatures)
            app_tool_modules = [
                'app.tools.python_repl_tool',
                'app.tools.file_tools',
                'app.tools.web_tools',
                'app.tools.system_tools',
                'app.tools.strands_tavily_search',  # Add this for tavily_search
                'app.tools.tavily_search_tool',  # And this one
            ]

            for module_name in app_tool_modules:
                try:
                    module = importlib.import_module(module_name)
                    if hasattr(module, tool_name):
                        tool_func = getattr(module, tool_name)
                        logger.info(f"✅ Loaded tool {tool_name} from {module_name}")
                        return self.create_visible_wrapper(tool_name, tool_func, agent_name)
                except ImportError:
                    continue

            # Try to import from strands_agents_tools
            try:
                import types
                module = importlib.import_module('strands_tools')
                if hasattr(module, tool_name):
                    obj = getattr(module, tool_name)
                    # Some distributions expose a submodule named after the tool
                    if isinstance(obj, types.ModuleType) and hasattr(obj, tool_name):
                        obj = getattr(obj, tool_name)
                    if callable(obj):
                        logger.info(f"✅ Loaded tool {tool_name} from strands_agents_tools")
                        return self.create_visible_wrapper(tool_name, obj, agent_name)
            except ImportError:
                pass

            # Try specific modules
            tool_modules = {
                'file_read': 'strands_tools',
                'file_write': 'strands_tools',
                'editor': 'strands_tools',
                'http_request': 'strands_tools',
                'python_repl': 'strands_tools',
                'shell': 'strands_tools',
                'calculator': 'strands_tools',
                'current_time': 'strands_tools',
                'sleep': 'strands_tools',
                'environment': 'strands_tools',
                'system_info': 'strands_tools',
                'journal': 'strands_tools',
                'handoff_to_user': 'strands_tools',
                'stop': 'strands_tools',
                'think': 'strands_tools',
                'batch': 'strands_tools',
                'workflow': 'strands_tools',
                'use_llm': 'strands_tools',
                'memory': 'strands_tools',
                'mem0_memory': 'strands_tools',
                'generate_image': 'strands_tools',
                'image_reader': 'strands_tools',
                'speak': 'strands_tools',
                'diagram': 'strands_tools',
                'use_aws': 'strands_tools',
                'retrieve': 'strands_tools',
                'task_planner': 'strands_tools',
                'agent_todo': 'strands_tools',
                'recursive_executor': 'strands_tools',
            }

            if tool_name in tool_modules:
                module_name = tool_modules[tool_name]
                try:
                    module = importlib.import_module(module_name)
                    if hasattr(module, tool_name):
                        obj = getattr(module, tool_name)
                        if isinstance(obj, types.ModuleType) and hasattr(obj, tool_name):
                            obj = getattr(obj, tool_name)
                        if callable(obj):
                            logger.info(f"✅ Loaded tool {tool_name} from {module_name}")
                            return self.create_visible_wrapper(tool_name, obj, agent_name)
                except ImportError as e:
                    logger.warning(f"Could not import {module_name}: {e}")

            # (already tried app.tools above)

            logger.warning(f"Tool {tool_name} not found in available modules")
            return None

        except Exception as e:
            logger.error(f"Error wrapping tool {tool_name}: {e}")
            return None

    def get_tools_for_agent(self, agent_name: str, tool_names: List[str]) -> List[Callable]:
        """Get wrapped tools for an agent"""

        wrapped_tools = []

        for tool_name in tool_names:
            # Check if we already have this tool wrapped
            cache_key = f"{agent_name}_{tool_name}"
            if cache_key in self.wrapped_tools:
                wrapped_tools.append(self.wrapped_tools[cache_key])
                continue

            # Try to wrap the tool
            wrapped_tool = self.wrap_strands_tool(tool_name, agent_name)
            if wrapped_tool:
                self.wrapped_tools[cache_key] = wrapped_tool
                wrapped_tools.append(wrapped_tool)
                logger.info(f"✅ Added tool {tool_name} to agent {agent_name}")
            else:
                logger.warning(f"⚠️ Could not add tool {tool_name} to agent {agent_name}")

        return wrapped_tools


class StrandsToolRegistry:
    """Registry for all available Strands tools"""

    @staticmethod
    def get_available_tools() -> Dict[str, Dict[str, Any]]:
        """Get all available tools with their metadata"""

        tools = {
            # File Operations
            "file_read": {
                "description": "Read content from a file",
                "category": "file_operations",
                "source": "strands_tools"
            },
            "file_write": {
                "description": "Write content to a file",
                "category": "file_operations",
                "source": "strands_tools"
            },
            "editor": {
                "description": "Advanced file editor with syntax highlighting",
                "category": "file_operations",
                "source": "strands_tools"
            },

            # Web & Network
            "http_request": {
                "description": "Make HTTP/HTTPS requests to APIs and websites",
                "category": "web",
                "source": "strands_tools"
            },
            "tavily_search": {
                "description": "Search the web using Tavily API",
                "category": "web",
                "source": "custom"
            },

            # Code Execution
            "python_repl": {
                "description": "Execute Python code in a sandboxed environment",
                "category": "code_execution",
                "source": "strands_tools"
            },
            "shell": {
                "description": "Execute shell commands",
                "category": "code_execution",
                "source": "strands_tools"
            },
            "calculator": {
                "description": "Perform mathematical calculations",
                "category": "code_execution",
                "source": "strands_tools"
            },

            # System & Utilities
            "current_time": {
                "description": "Get current time in any timezone",
                "category": "utilities",
                "source": "strands_tools"
            },
            "sleep": {
                "description": "Pause execution for specified seconds",
                "category": "utilities",
                "source": "strands_tools"
            },
            "environment": {
                "description": "Manage environment variables",
                "category": "utilities",
                "source": "strands_tools"
            },
            "system_info": {
                "description": "Get system information",
                "category": "utilities",
                "source": "strands_tools"
            },

            # Advanced Tools
            "think": {
                "description": "Advanced reasoning and problem analysis",
                "category": "reasoning",
                "source": "strands_tools"
            },
            "batch": {
                "description": "Execute multiple tools in parallel",
                "category": "advanced",
                "source": "strands_tools"
            },
            "workflow": {
                "description": "Define and execute multi-step workflows",
                "category": "advanced",
                "source": "strands_tools"
            },
            "use_llm": {
                "description": "Create nested AI loops",
                "category": "advanced",
                "source": "strands_tools"
            },

            # Memory & Storage
            "memory": {
                "description": "Store and retrieve information",
                "category": "memory",
                "source": "strands_tools"
            },
            "journal": {
                "description": "Create structured logs and notes",
                "category": "memory",
                "source": "strands_tools"
            },

            # Media
            "generate_image": {
                "description": "Generate images using AI",
                "category": "media",
                "source": "strands_tools"
            },
            "image_reader": {
                "description": "Analyze and extract info from images",
                "category": "media",
                "source": "strands_tools"
            },
            "speak": {
                "description": "Convert text to speech",
                "category": "media",
                "source": "strands_tools"
            },
            "diagram": {
                "description": "Create diagrams from descriptions",
                "category": "media",
                "source": "strands_tools"
            },

            # Planning
            "task_planner": {
                "description": "Create comprehensive task plans",
                "category": "planning",
                "source": "strands_tools"
            },
            "agent_todo": {
                "description": "Manage todos for agents",
                "category": "planning",
                "source": "strands_tools"
            },
            "recursive_executor": {
                "description": "Execute tasks recursively",
                "category": "planning",
                "source": "strands_tools"
            },
        }

        # Best-effort discovery: enumerate callable tools in strands_tools
        try:
            module = importlib.import_module('strands_tools')
            for attr in dir(module):
                if attr.startswith('_'):
                    continue
                if attr in tools:
                    continue
                try:
                    obj = getattr(module, attr)
                    if callable(obj):
                        desc = (obj.__doc__ or '').strip().split('\n')[0]
                        tools[attr] = {
                            "description": desc or f"Strands tool {attr}",
                            "category": "unknown",
                            "source": "strands_tools"
                        }
                except Exception:
                    continue
            # Deep scan: walk submodules for callable tools
            try:
                import pkgutil
                visited = set()
                for finder, name, ispkg in pkgutil.walk_packages(module.__path__, module.__name__ + "."):
                    if name in visited:
                        continue
                    visited.add(name)
                    # Avoid heavy/private modules
                    base = name.split('.')[-1]
                    if base.startswith('_'):
                        continue
                    try:
                        sub = importlib.import_module(name)
                    except Exception:
                        continue
                    for attr in dir(sub):
                        if attr.startswith('_'):
                            continue
                        key = attr
                        if key in tools:
                            continue
                        try:
                            obj = getattr(sub, attr)
                            if callable(obj):
                                desc = (obj.__doc__ or '').strip().split('\n')[0]
                                tools[key] = {
                                    "description": desc or f"Strands tool {key}",
                                    "category": "unknown",
                                    "source": "strands_tools"
                                }
                        except Exception:
                            continue
            except Exception:
                pass
        except Exception:
            # strands_tools not installed or import error
            pass

        return tools

    @staticmethod
    def get_tools_by_category(category: str) -> List[str]:
        """Get tool names by category"""
        tools = StrandsToolRegistry.get_available_tools()
        return [name for name, info in tools.items() if info["category"] == category]
