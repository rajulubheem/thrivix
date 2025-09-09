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
        
        @tool
        async def wrapped_tool(**kwargs):
            """Dynamically wrapped tool with visibility"""
            # Work on local copies to avoid rebinding closure vars
            current_tool_name = tool_name
            current_tool_func = tool_func

            # Extract actual parameters (handle nested kwargs)
            actual_params = kwargs
            if 'kwargs' in kwargs and isinstance(kwargs['kwargs'], (str, dict)):
                # Handle nested kwargs from Strands
                if isinstance(kwargs['kwargs'], str):
                    try:
                        actual_params = json.loads(kwargs['kwargs'])
                    except:
                        actual_params = kwargs
                else:
                    actual_params = kwargs['kwargs']
            
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
                return {"status": "error", "content": [{"text": validation_msg}]}
            
            # Send tool called notification with clean display
            if self.callback_handler:
                tool_msg = f"\n🔧 **Tool Called:** `{current_tool_name}`\n"
                
                # Get clean purpose description
                doc = current_tool_func.__doc__ or f"Execute {current_tool_name}"
                first_line = doc.split('\n')[0].strip()
                tool_msg += f"**Purpose:** {first_line}\n"
                
                # Show clean parameters
                if actual_params:
                    # Format parameters nicely
                    if isinstance(actual_params, dict):
                        param_lines = []
                        for key, value in actual_params.items():
                            if isinstance(value, str) and len(value) > 100:
                                value = value[:100] + "..."
                            param_lines.append(f"  • {key}: {value}")
                        if param_lines:
                            tool_msg += f"**Parameters:**\n" + "\n".join(param_lines) + "\n"
                    else:
                        tool_msg += f"**Parameters:** {str(actual_params)[:200]}\n"
                
                tool_msg += f"⏳ Executing...\n"
                
                await self.callback_handler(
                    type="text_generation",
                    agent=agent_name,
                    data={
                        "chunk": tool_msg,
                        "text": tool_msg
                    }
                )
            
            try:
                # Execute the original tool with correct parameters
                if asyncio.iscoroutinefunction(current_tool_func):
                    # Direct coroutine function
                    result = await current_tool_func(**actual_params)
                elif hasattr(current_tool_func, '__call__'):
                    # Callable instance – inspect its __call__
                    call_attr = current_tool_func.__call__
                    if asyncio.iscoroutinefunction(call_attr):
                        result = await call_attr(**actual_params)
                    else:
                        result = await asyncio.to_thread(call_attr, **actual_params)
                else:
                    # Fallback to thread offload
                    result = await asyncio.to_thread(current_tool_func, **actual_params)
                
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
                            "tool": tool_name,
                            "success": True,
                            "result": result
                        }
                    )
                
                return result
                
            except Exception as e:
                logger.error(f"Tool {tool_name} error: {e}")
                
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
                
                return {"status": "error", "content": [{"text": str(e)}]}
        
        # Copy metadata
        wrapped_tool.__name__ = tool_name
        wrapped_tool.__doc__ = tool_func.__doc__
        
        return wrapped_tool
    
    def wrap_strands_tool(self, tool_name: str, agent_name: str) -> Optional[Callable]:
        """Wrap a tool from strands-tools package"""
        
        try:
            # Try to import from strands_agents_tools
            try:
                module = importlib.import_module('strands_tools')
                if hasattr(module, tool_name):
                    tool_func = getattr(module, tool_name)
                    logger.info(f"✅ Loaded tool {tool_name} from strands_agents_tools")
                    return self.create_visible_wrapper(tool_name, tool_func, agent_name)
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
                        tool_func = getattr(module, tool_name)
                        logger.info(f"✅ Loaded tool {tool_name} from {module_name}")
                        return self.create_visible_wrapper(tool_name, tool_func, agent_name)
                except ImportError as e:
                    logger.warning(f"Could not import {module_name}: {e}")
            
            # Try app.tools modules
            app_tool_modules = [
                'app.tools.python_repl_tool',
                'app.tools.file_tools',
                'app.tools.web_tools',
                'app.tools.system_tools',
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
        
        return tools
    
    @staticmethod
    def get_tools_by_category(category: str) -> List[str]:
        """Get tool names by category"""
        tools = StrandsToolRegistry.get_available_tools()
        return [name for name, info in tools.items() if info["category"] == category]
