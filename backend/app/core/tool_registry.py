"""
Strands Tools Registry - Central management of all available tools
Based on official Strands Agents Tools documentation
"""
import os
from typing import Dict, List, Any, Optional
import structlog

logger = structlog.get_logger()

# Import all tools from strands_agents_tools
try:
    from strands_tools import (
        # File Operations
        file_read,
        file_write,
        editor,
        
        # System & Execution
        shell,
        python_repl,
        code_interpreter,
        
        # Web & HTTP
        http_request,
        tavily_search,
        tavily_extract,
        tavily_crawl,
        tavily_map,
        
        # AWS & Cloud
        use_aws,
        retrieve,
        generate_image,
        generate_image_stability,
        nova_reels,
        
        # Memory & Storage
        memory,
        mem0_memory,
        agent_core_memory,
        journal,
        
        # Math & Analysis
        calculator,
        
        # Communication
        slack,
        speak,
        
        # Workflow & Coordination
        workflow,
        swarm,
        batch,
        handoff_to_user,
        stop,
        
        # Time & Scheduling
        current_time,
        sleep,
        cron,
        
        # Advanced Features
        think,
        use_llm,
        load_tool,
        environment,
        image_reader,
        agent_graph,
        diagram,
        rss,
        
        # Browser & Computer
        # browser,  # Requires special initialization
        # use_computer,  # Requires special initialization
        
        # MCP Client (use with caution)
        # mcp_client,  # Security risk - enable only if needed
    )
    STRANDS_TOOLS_AVAILABLE = True
    logger.info("Successfully imported strands_tools")
except ImportError as e:
    logger.warning(f"strands_tools not fully available: {e}")
    STRANDS_TOOLS_AVAILABLE = False
    # Create dummy tools for development
    file_read = file_write = editor = None
    shell = python_repl = code_interpreter = None
    http_request = tavily_search = None
    use_aws = retrieve = None
    calculator = workflow = swarm = None


class ToolRegistry:
    """Central registry for all Strands tools"""
    
    def __init__(self):
        self.tools = {}
        self.tool_descriptions = {}
        self._initialize_tools()
    
    def _initialize_tools(self):
        """Initialize all available tools"""
        
        if not STRANDS_TOOLS_AVAILABLE:
            logger.warning("Strands tools not available. Install with: pip install strands-agents-tools")
            return
        
        # Core file operations
        self.register_tool("file_read", file_read, 
            "Read files with syntax highlighting and search capabilities")
        self.register_tool("file_write", file_write,
            "Write content to files with safety checks")
        self.register_tool("editor", editor,
            "Advanced file editing with pattern replacement")
        
        # Execution tools (check platform compatibility)
        if os.name != 'nt':  # Not Windows
            self.register_tool("shell", shell,
                "Execute shell commands securely")
            self.register_tool("python_repl", python_repl,
                "Execute Python code with state persistence")
        
        # Web and API tools
        self.register_tool("http_request", http_request,
            "Make HTTP requests with authentication support")
        
        # Tavily search tools (require API key)
        if os.getenv("TAVILY_API_KEY"):
            self.register_tool("tavily_search", tavily_search,
                "Real-time web search optimized for AI")
            self.register_tool("tavily_extract", tavily_extract,
                "Extract clean content from web pages")
            self.register_tool("tavily_crawl", tavily_crawl,
                "Crawl websites intelligently")
            self.register_tool("tavily_map", tavily_map,
                "Map website structure")
        
        # AWS tools (require AWS credentials)
        if os.getenv("AWS_REGION"):
            self.register_tool("use_aws", use_aws,
                "Interact with AWS services")
            self.register_tool("retrieve", retrieve,
                "Retrieve from Bedrock Knowledge Bases")
        
        # Math and analysis
        self.register_tool("calculator", calculator,
            "Advanced mathematical calculations")
        
        # Workflow and coordination
        self.register_tool("workflow", workflow,
            "Define and execute multi-step workflows")
        self.register_tool("swarm", swarm,
            "Coordinate multiple agents for parallel problem solving")
        self.register_tool("batch", batch,
            "Execute multiple tools in parallel")
        
        # Control flow
        self.register_tool("handoff_to_user", handoff_to_user,
            "Hand off control to user for input")
        self.register_tool("stop", stop,
            "Gracefully terminate execution")
        
        # Time and scheduling
        self.register_tool("current_time", current_time,
            "Get current time in any timezone")
        self.register_tool("sleep", sleep,
            "Pause execution for specified duration")
        
        # Advanced reasoning
        self.register_tool("think", think,
            "Multi-step reasoning and analysis")
        self.register_tool("use_llm", use_llm,
            "Create nested AI loops")
        
        # Environment and configuration
        self.register_tool("environment", environment,
            "Manage environment variables")
        
        # Communication
        self.register_tool("speak", speak,
            "Output with rich formatting and TTS")
        
        # Data and documents
        self.register_tool("journal", journal,
            "Create structured logs and documentation")
        
        # Visualization
        self.register_tool("diagram", diagram,
            "Create architecture and UML diagrams")
        self.register_tool("agent_graph", agent_graph,
            "Visualize agent relationships")
        
        logger.info(f"Initialized {len(self.tools)} tools")
    
    def register_tool(self, name: str, tool: Any, description: str):
        """Register a tool with the registry"""
        if tool is not None:
            self.tools[name] = tool
            self.tool_descriptions[name] = description
            logger.debug(f"Registered tool: {name}")
    
    def get_tool(self, name: str) -> Optional[Any]:
        """Get a tool by name"""
        return self.tools.get(name)
    
    def get_tools_for_role(self, role: str) -> List[Any]:
        """Get appropriate tools for a specific agent role"""
        
        role_tool_mapping = {
            "researcher": [
                "file_read", "http_request", "tavily_search", 
                "tavily_extract", "calculator", "think"
            ],
            "architect": [
                "diagram", "file_write", "editor", "think",
                "agent_graph", "workflow"
            ],
            "developer": [
                "file_read", "file_write", "editor", "python_repl",
                "shell", "http_request", "calculator"
            ],
            "api_specialist": [
                "http_request", "file_write", "editor",
                "tavily_extract", "diagram"
            ],
            "data_scientist": [
                "python_repl", "calculator", "file_read",
                "file_write", "retrieve", "think"
            ],
            "devops": [
                "shell", "use_aws", "file_write", "editor",
                "environment", "cron"
            ],
            "tester": [
                "file_read", "python_repl", "shell",
                "http_request", "calculator"
            ],
            "reviewer": [
                "file_read", "think", "journal",
                "diagram", "speak"
            ],
            "documentation": [
                "file_read", "file_write", "editor",
                "journal", "diagram", "tavily_extract"
            ],
            "project_manager": [
                "workflow", "swarm", "agent_graph",
                "journal", "current_time", "think"
            ]
        }
        
        tool_names = role_tool_mapping.get(role, [])
        tools = []
        
        for tool_name in tool_names:
            tool = self.get_tool(tool_name)
            if tool:
                tools.append(tool)
        
        # Always add these essential tools if available
        essential_tools = ["handoff_to_user", "stop", "current_time"]
        for tool_name in essential_tools:
            tool = self.get_tool(tool_name)
            if tool and tool not in tools:
                tools.append(tool)
        
        return tools
    
    def get_all_tools(self) -> Dict[str, Any]:
        """Get all registered tools"""
        return self.tools.copy()
    
    def get_tool_names(self) -> List[str]:
        """Get names of all registered tools"""
        return list(self.tools.keys())
    
    def get_tool_info(self) -> Dict[str, str]:
        """Get tool names and descriptions"""
        return self.tool_descriptions.copy()


# Singleton instance
tool_registry = ToolRegistry()


def get_tools_for_agent(agent_role: str) -> List[Any]:
    """Helper function to get tools for an agent role"""
    return tool_registry.get_tools_for_role(agent_role)


def get_tool_by_name(name: str) -> Optional[Any]:
    """Helper function to get a specific tool"""
    return tool_registry.get_tool(name)