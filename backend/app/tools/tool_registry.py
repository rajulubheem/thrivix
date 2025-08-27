"""
Comprehensive Tool Registry for Strands Agents
Manages and provides access to all available tools
"""
import importlib
import inspect
from typing import Dict, Any, List, Optional, Callable
import structlog
from pathlib import Path

logger = structlog.get_logger()

class ToolRegistry:
    """Central registry for all tools"""
    
    def __init__(self):
        self.tools: Dict[str, Any] = {}
        self.tool_specs: Dict[str, Dict[str, Any]] = {}
        self.categories: Dict[str, List[str]] = {}
        self._initialize_tools()
    
    def _initialize_tools(self):
        """Initialize and register all available tools"""
        
        # Import all tool modules
        tool_modules = {
            # File Operations
            'editor_tool': ['editor', 'EditorTool', 'TOOL_SPEC'],
            'file_tools': ['file_read', 'file_write'],  # Basic file tools
            
            # Web/HTTP
            'http_request_tool': ['http_request', 'HTTPRequestTool', 'TOOL_SPEC'],
            'tavily_tool': ['tavily_search', 'TavilySearchTool', 'TOOL_SPEC'],
            
            # System
            'system_tools': [
                'current_time', 'sleep', 'environment', 'system_info',
                'CURRENT_TIME_SPEC', 'SLEEP_SPEC', 'ENVIRONMENT_SPEC', 'SYSTEM_INFO_SPEC'
            ],
            
            # Math/Calculation
            'calculator_tool': ['calculator', 'CalculatorTool', 'TOOL_SPEC'],
            
            # Code Execution
            'python_repl_tool': ['python_repl', 'PythonReplTool', 'PYTHON_REPL_SPEC'],
            'shell_tool': ['shell_command', 'ShellCommandTool', 'SHELL_COMMAND_SPEC'],
            
            # Utility Tools
            'utility_tools': [
                'journal', 'handoff_to_user', 'stop',
                'JournalTool', 'HandoffToUserTool', 'StopTool',
                'JOURNAL_SPEC', 'HANDOFF_TO_USER_SPEC', 'STOP_SPEC'
            ],
            
            # Advanced Tools
            'advanced_tools': [
                'think', 'batch', 'workflow',
                'ThinkTool', 'BatchTool', 'WorkflowTool',
                'THINK_SPEC', 'BATCH_SPEC', 'WORKFLOW_SPEC'
            ],
            
            # Communication Tools
            'communication_tools': [
                'use_llm', 'a2a_client',
                'UseLLMTool', 'A2AClientTool',
                'USE_LLM_SPEC', 'A2A_CLIENT_SPEC'
            ],
            
            # Extended Utilities
            'extended_utility_tools': [
                'cron', 'rss', 'load_tool',
                'CronTool', 'RSSTool', 'LoadToolTool',
                'CRON_SPEC', 'RSS_SPEC', 'LOAD_TOOL_SPEC'
            ],
            
            # Memory Tools
            'memory_tools': [
                'memory', 'mem0_memory',
                'MemoryTool', 'Mem0MemoryTool',
                'MEMORY_SPEC', 'MEM0_MEMORY_SPEC'
            ],
            
            # Media Tools
            'media_tools': [
                'generate_image', 'image_reader', 'speak', 'diagram',
                'GenerateImageTool', 'ImageReaderTool', 'SpeakTool', 'DiagramTool',
                'GENERATE_IMAGE_SPEC', 'IMAGE_READER_SPEC', 'SPEAK_SPEC', 'DIAGRAM_SPEC'
            ],
            
            # AWS Tools
            'aws_tools': [
                'use_aws', 'retrieve',
                'UseAWSTool', 'RetrieveTool',
                'USE_AWS_SPEC', 'RETRIEVE_SPEC'
            ],
            
            # Planning Tools
            'planning_tools': [
                'task_planner', 'agent_todo', 'recursive_executor',
                'TaskPlannerTool', 'AgentTodoTool', 'RecursiveExecutorTool',
                'TASK_PLANNER_SPEC', 'AGENT_TODO_SPEC', 'RECURSIVE_EXECUTOR_SPEC'
            ],
        }
        
        for module_name, exports in tool_modules.items():
            try:
                # Try to import the module
                module = importlib.import_module(f'app.tools.{module_name}')
                
                # Register tools from the module
                for export_name in exports:
                    if hasattr(module, export_name):
                        obj = getattr(module, export_name)
                        
                        # If it's a tool spec, store it
                        if 'SPEC' in export_name:
                            spec_name = export_name.replace('_SPEC', '').lower()
                            self.tool_specs[spec_name] = obj
                        
                        # If it's a tool instance or class
                        elif hasattr(obj, '__call__') or inspect.isclass(obj):
                            if inspect.isclass(obj):
                                # Instantiate the class
                                tool_instance = obj()
                                tool_name = getattr(tool_instance, 'name', export_name)
                                self.register_tool(tool_name, tool_instance)
                            else:
                                # It's already an instance or function
                                tool_name = getattr(obj, 'name', export_name)
                                self.register_tool(tool_name, obj)
                
                logger.info(f"✅ Loaded tools from {module_name}")
                
            except ImportError as e:
                logger.debug(f"Module {module_name} not available: {e}")
            except Exception as e:
                logger.error(f"Error loading module {module_name}: {e}")
        
        # Register tools by category
        self._categorize_tools()
        
        logger.info(f"🔧 Tool Registry initialized with {len(self.tools)} tools")
    
    def register_tool(self, name: str, tool: Any):
        """Register a tool in the registry"""
        self.tools[name] = tool
        
        # Store tool spec if available
        if hasattr(tool, 'input_schema'):
            self.tool_specs[name] = {
                'name': name,
                'description': getattr(tool, 'description', ''),
                'input_schema': getattr(tool, 'input_schema', {})
            }
    
    def _categorize_tools(self):
        """Organize tools by category"""
        self.categories = {
            'file_operations': ['file_read', 'file_write', 'editor'],
            'web_search': ['tavily_search', 'http_request'],
            'system': ['current_time', 'sleep', 'environment', 'system_info', 'shell_command', 'cron'],
            'code_execution': ['python_repl', 'calculator', 'shell_command'],
            'data_analysis': ['calculator', 'think'],
            'utilities': ['journal', 'handoff_to_user', 'stop', 'load_tool'],
            'advanced': ['think', 'batch', 'workflow'],
            'communication': ['use_llm', 'a2a_client'],
            'content': ['rss'],
            'memory': ['memory', 'mem0_memory'],
            'media': ['generate_image', 'image_reader', 'speak', 'diagram'],
            'aws': ['use_aws', 'retrieve'],
            'planning': ['task_planner', 'agent_todo', 'recursive_executor']
        }
        
        # Add uncategorized tools to utilities
        for tool_name in self.tools:
            categorized = False
            for category, tools in self.categories.items():
                if tool_name in tools:
                    categorized = True
                    break
            if not categorized:
                self.categories['utilities'].append(tool_name)
    
    def get_tool(self, name: str) -> Optional[Any]:
        """Get a tool by name"""
        return self.tools.get(name)
    
    def get_all_tools(self) -> Dict[str, Any]:
        """Get all registered tools"""
        return self.tools.copy()
    
    def get_tool_spec(self, name: str) -> Optional[Dict[str, Any]]:
        """Get tool specification by name"""
        return self.tool_specs.get(name)
    
    def get_all_specs(self) -> Dict[str, Dict[str, Any]]:
        """Get all tool specifications"""
        return self.tool_specs.copy()
    
    def get_tools_by_category(self, category: str) -> List[str]:
        """Get tools in a specific category"""
        return self.categories.get(category, [])
    
    def get_categories(self) -> Dict[str, List[str]]:
        """Get all categories and their tools"""
        return self.categories.copy()
    
    def list_tools(self) -> List[Dict[str, Any]]:
        """List all tools with their metadata"""
        tools_list = []
        
        for name, tool in self.tools.items():
            # Find category
            category = 'utilities'
            for cat, tools in self.categories.items():
                if name in tools:
                    category = cat
                    break
            
            tool_info = {
                'id': name,
                'name': name,
                'description': getattr(tool, 'description', 'No description'),
                'category': category,
                'enabled': True,  # Default to enabled
                'requires_approval': self._requires_approval(name),
                'status': 'enabled',
                'usage_count': 0,  # Would be tracked in production
                'error_count': 0,  # Would be tracked in production
                'config': {},
                'required_env_vars': self._get_required_env_vars(name)
            }
            
            # Add icon based on category
            icons = {
                'file_operations': '📁',
                'web_search': '🌐',
                'system': '⚙️',
                'code_execution': '💻',
                'data_analysis': '📊',
                'utilities': '🛠️'
            }
            tool_info['icon'] = icons.get(category, '🔧')
            
            tools_list.append(tool_info)
        
        return tools_list
    
    def _requires_approval(self, tool_name: str) -> bool:
        """Check if a tool requires approval"""
        # Tools that should require approval for safety
        approval_required = [
            'shell_command', 'python_repl', 'file_write',
            'environment', 'http_request', 'editor'
        ]
        return tool_name in approval_required
    
    def _get_required_env_vars(self, tool_name: str) -> List[str]:
        """Get required environment variables for a tool"""
        env_vars = {
            'tavily_search': ['TAVILY_API_KEY'],
            'http_request': [],  # Optional auth tokens
            'shell': [],
            'shell_command': [],
        }
        return env_vars.get(tool_name, [])
    
    async def execute_tool(self, tool_name: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool with given parameters"""
        tool = self.get_tool(tool_name)
        
        if not tool:
            return {
                'success': False,
                'error': f'Tool {tool_name} not found'
            }
        
        try:
            # Execute the tool
            if hasattr(tool, '__call__'):
                if inspect.iscoroutinefunction(tool.__call__):
                    result = await tool(**parameters)
                else:
                    result = tool(**parameters)
            else:
                return {
                    'success': False,
                    'error': f'Tool {tool_name} is not callable'
                }
            
            return result
            
        except Exception as e:
            logger.error(f"Tool execution error for {tool_name}: {e}")
            return {
                'success': False,
                'error': str(e)
            }

# Create global registry instance
tool_registry = ToolRegistry()

# Export convenience functions
def get_tool(name: str) -> Optional[Any]:
    """Get a tool by name"""
    return tool_registry.get_tool(name)

def get_all_tools() -> Dict[str, Any]:
    """Get all registered tools"""
    return tool_registry.get_all_tools()

def list_tools() -> List[Dict[str, Any]]:
    """List all tools with metadata"""
    return tool_registry.list_tools()

async def execute_tool(tool_name: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Execute a tool"""
    return await tool_registry.execute_tool(tool_name, parameters)

__all__ = [
    'ToolRegistry',
    'tool_registry',
    'get_tool',
    'get_all_tools',
    'list_tools',
    'execute_tool'
]