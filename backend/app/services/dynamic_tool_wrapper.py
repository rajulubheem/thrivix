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

logger = structlog.get_logger()

class DynamicToolWrapper:
    """Dynamically wraps existing tools for use with Strands agents"""
    
    def __init__(self, callback_handler: Optional[Callable] = None):
        self.callback_handler = callback_handler
        self.wrapped_tools = {}
        self.tool_instances = {}
        
    def create_visible_wrapper(self, tool_name: str, tool_func: Callable, agent_name: str) -> Callable:
        """Create a wrapper that adds visibility to any tool"""
        
        # Get the actual function signature
        sig = inspect.signature(tool_func) if hasattr(tool_func, '__call__') else None
        
        async def _base_wrapped(**kwargs):
            """Dynamically wrapped tool with visibility"""
            # Work on local copies to avoid rebinding closure vars
            current_tool_name = tool_name
            current_tool_func = tool_func

            # Extract actual parameters (handle nested kwargs)
            actual_params = kwargs
            if 'kwargs' in kwargs:
                val = kwargs['kwargs']
                # If the model passes a plain string, coerce to expected shape for common tools
                if isinstance(val, str):
                    # Try to parse JSON, else map to sensible defaults per tool
                    parsed = None
                    try:
                        parsed = json.loads(val)
                    except Exception:
                        parsed = None
                    if isinstance(parsed, dict):
                        actual_params = parsed
                    else:
                        # Heuristics: map single string to required param for common tools
                        if current_tool_name in ("tavily_search", "web_search", "tavily_web_search"):
                            actual_params = {"query": val, "search_depth": "basic", "max_results": 5}
                        elif current_tool_name == "http_request":
                            actual_params = {"method": "GET", "url": val, "timeout": 30}
                        else:
                            # Fallback: provide as generic text if the tool accepts it
                            actual_params = {"text": val}
                elif isinstance(val, dict):
                    actual_params = val
                else:
                    actual_params = kwargs

            # Final normalization for Tavily-family tools
            if current_tool_name in ("tavily_search", "web_search", "tavily_web_search"):
                if not isinstance(actual_params, dict):
                    actual_params = {"query": str(actual_params)}
                # Ensure required keys
                if "query" not in actual_params:
                    # If a single key provided, coerce it to query
                    if len(actual_params) == 1:
                        only_val = next(iter(actual_params.values()))
                        actual_params = {"query": str(only_val)}
                    elif "text" in actual_params:
                        actual_params["query"] = str(actual_params.pop("text"))
                # Defaults
                actual_params.setdefault("search_depth", "basic")
                actual_params.setdefault("max_results", 5)
            
            # Emit structured tool_call for UI (actual tool and wrapper info)
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

            # Validate and fix common tool mistakes
            from app.services.tool_discovery import ToolValidator
            
            # Check if agent is using wrong tool
            if current_tool_name == "file_read" and "content" in actual_params:
                # Agent wants to write but called file_read
                logger.warning(f"Agent {agent_name} called file_read with content - redirecting to file_write")
                current_tool_name = "file_write"
                # Try to get file_write function instead
                if hasattr(self, 'wrapped_tools'):
                    write_key = f"{agent_name}_file_write"
                    if write_key in self.wrapped_tools:
                        current_tool_func = self.wrapped_tools[write_key]

            # Heuristic: if file_read is called with a 'query', delegate to a search tool
            if current_tool_name == "file_read" and "query" in actual_params:
                try:
                    # Prefer tavily_search if available
                    replacement = None
                    if os.getenv("TAVILY_API_KEY"):
                        replacement = self.wrap_strands_tool("tavily_search", agent_name)
                        if replacement:
                            logger.info(f"🔎 Redirecting file_read(query) to tavily_search for {agent_name}")
                            current_tool_name = "tavily_search"
                            current_tool_func = replacement
                    if not replacement:
                        # Try wikipedia_search as a no-key fallback
                        replacement = self.wrap_strands_tool("wikipedia_search", agent_name)
                        if replacement:
                            logger.info(f"🔎 Redirecting file_read(query) to wikipedia_search for {agent_name}")
                            current_tool_name = "wikipedia_search"
                            current_tool_func = replacement
                except Exception as e:
                    logger.warning(f"Heuristic redirect failed: {e}")
            
            # Validate parameters
            is_valid, validation_msg = ToolValidator.validate_tool_call(current_tool_name, actual_params)
            if not is_valid:
                logger.warning(f"Invalid tool call: {validation_msg}")
                if self.callback_handler:
                    error_msg = f"⚠️ **Tool Validation Error**\n"
                    error_msg += f"Tool: `{current_tool_name}`\n"
                    error_msg += f"Issue: {validation_msg}\n"
                    await self.callback_handler(
                        type="text_generation",
                        agent=agent_name,
                        data={
                            "chunk": error_msg,
                            "text": error_msg
                        }
                    )
                    # Emit structured error as tool_result for UI
                    try:
                        await self.callback_handler(
                            type="tool_result",
                            agent=agent_name,
                            data={
                                "tool": current_tool_name,
                                "success": False,
                                "error": validation_msg,
                                "parameters": actual_params,
                                "wrapper": "wrapped_tool"
                            }
                        )
                    except Exception:
                        pass
                return {"status": "error", "content": [{"text": validation_msg}]}
            
            # Send tool called notification with clean display
            if self.callback_handler:
                # Also emit structured call for UI
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
                # Don't send tool information as text content - it's already sent as structured tool_call event
                # This was causing duplicate tool displays in the UI
                # tool_msg = f"\n🔧 **Tool Called:** `{current_tool_name}`\n"
                # ... (commented out to prevent duplicate tool displays)
            
            try:
                # Execute the original tool with correct parameters
                # Adapt to Strands SDK-style tools that expect a 'tool' (ToolUse) argument
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
                    success_msg = f"✅ **Tool `{tool_name}` Executed Successfully**\n"
                    
                    # Show result preview
                    if isinstance(result, dict):
                        if result.get("status") == "success":
                            success_msg += f"**Status:** Success\n"
                            if result.get("content"):
                                content_preview = str(result["content"])[:200]
                                success_msg += f"**Result:** {content_preview}...\n"
                        elif result.get("success"):
                            success_msg += f"**Status:** Success\n"
                            if result.get("result"):
                                result_preview = str(result["result"])[:200]
                                success_msg += f"**Result:** {result_preview}...\n"
                    elif isinstance(result, str):
                        success_msg += f"**Result:** {result[:200]}...\n"
                    
                    await self.callback_handler(
                        type="text_generation",
                        agent=agent_name,
                        data={
                            "chunk": success_msg,
                            "text": success_msg
                        }
                    )
                    
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

                # If we accidentally got a module instead of a callable, try to resolve the function
                try:
                    import types
                    if isinstance(current_tool_func, types.ModuleType) and hasattr(current_tool_func, current_tool_name):
                        fix = getattr(current_tool_func, current_tool_name)
                        if callable(fix):
                            logger.warning(f"Recovered from module-not-callable: invoking {current_tool_name} from submodule")
                            result = await fix(**actual_params) if asyncio.iscoroutinefunction(fix) else await asyncio.to_thread(fix, **actual_params)
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
                except Exception:
                    pass
                
                if self.callback_handler:
                    error_msg = f"❌ **Tool `{tool_name}` Error:** {str(e)}\n"
                    await self.callback_handler(
                        type="text_generation",
                        agent=agent_name,
                        data={
                            "chunk": error_msg,
                            "text": error_msg
                        }
                    )
                    try:
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
                    except Exception:
                        pass
                    try:
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
                    except Exception:
                        pass
                
                return {"status": "error", "content": [{"text": str(e)}]}
        # Rename function to the actual tool name BEFORE decorating
        _base_wrapped.__name__ = tool_name
        _base_wrapped.__doc__ = tool_func.__doc__

        # Apply the Strands @tool decorator now that the name is correct
        visible_tool = tool(_base_wrapped)
        return visible_tool
    
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
