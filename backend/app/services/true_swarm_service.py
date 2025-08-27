"""
True Swarm Service using Strands native Swarm pattern
This implements real swarm intelligence with autonomous agent collaboration
"""

import logging
import asyncio
from typing import List, Dict, Any, Optional, Callable
from datetime import datetime
import structlog
import os
from strands import Agent
from strands.multiagent import Swarm
from strands.models.openai import OpenAIModel
from app.schemas.swarm import SwarmExecutionRequest, SwarmExecutionResponse, ExecutionStatus
from app.services.unified_tool_service import get_unified_tools
from app.tools.strands_tool_registry import get_dynamic_tools

# Configure logging for Strands
logging.getLogger("strands.multiagent").setLevel(logging.DEBUG)
logging.basicConfig(
    format="%(levelname)s | %(name)s | %(message)s",
    handlers=[logging.StreamHandler()]
)

logger = structlog.get_logger()


class TrueSwarmService:
    """
    True Swarm implementation using Strands native Swarm pattern
    Features:
    - Self-organizing agent teams with shared working memory
    - Tool-based coordination between agents
    - Autonomous agent collaboration without central control
    - Dynamic task distribution based on agent capabilities
    - Collective intelligence through shared context
    """
    
    def __init__(self):
        self.swarms = {}  # Cache swarms by configuration
        self.unified_tools = None
        self._initialized = False
        
    async def _ensure_initialized(self):
        """Initialize the service with tools"""
        if not self._initialized:
            self.unified_tools = await get_unified_tools()
            self._initialized = True
            logger.info("✅ True Swarm Service initialized")
    
    def _create_tool_function(self, tool_name: str, tool_info: Dict):
        """Create a wrapped tool function for Strands agents"""
        # Check if we have the actual tool implementation
        if tool_name == "tavily_search":
            # Use the actual tavily search implementation
            from app.tools.tavily_tool import tavily_search
            return tavily_search
        elif tool_name == "file_write":
            from app.tools.file_tools import file_write
            return file_write
        elif tool_name == "file_read":
            from app.tools.file_tools import file_read
            return file_read
        elif tool_name == "python_repl":
            from app.tools.python_repl_tool import python_repl
            return python_repl
        
        # Fallback to handler if available
        tool_handler = tool_info.get("handler")
        if not tool_handler:
            logger.warning(f"No handler for tool {tool_name}")
            return None
            
        async def wrapped_tool(**kwargs):
            try:
                # Check if handler is async
                import asyncio
                if asyncio.iscoroutinefunction(tool_handler):
                    result = await tool_handler(**kwargs)
                else:
                    result = tool_handler(**kwargs)
                return result
            except Exception as e:
                logger.error(f"Tool {tool_name} failed: {e}")
                return {"error": str(e)}
        
        # Set function metadata for Strands
        wrapped_tool.__name__ = tool_name
        wrapped_tool.__doc__ = tool_info.get("description", f"Tool: {tool_name}")
        return wrapped_tool
    
    async def create_swarm_agents(self, task: str, agent_configs: Optional[Dict] = None) -> List[Agent]:
        """
        Create specialized agents for the swarm based on task requirements
        """
        await self._ensure_initialized()
        
        # Default agent configurations for different specializations
        default_configs = {
            "researcher": {
                "system_prompt": """You are a research specialist in a swarm team. Your role is to:
                - Gather information from various sources
                - Analyze requirements and context
                - Provide comprehensive research findings to the team
                - Use web search tools to find current information
                - Share your findings in the shared context for other agents
                
                You have access to the full task context and can see what other agents have done.
                Hand off to the architect when research is complete.""",
                "tools": ["tavily_search", "file_read"],
                "model": "gpt-4o-mini"
            },
            "architect": {
                "system_prompt": """You are a system architecture specialist in a swarm team. Your role is to:
                - Design system architecture based on requirements
                - Create technical specifications
                - Define interfaces and data models
                - Plan the implementation approach
                - Review research findings from the researcher
                
                You can see all previous work and should build upon it.
                Hand off to the coder when design is ready.""",
                "tools": ["file_write"],
                "model": "gpt-4o-mini"
            },
            "coder": {
                "system_prompt": """You are a coding specialist in a swarm team. Your role is to:
                - Implement solutions based on architecture designs
                - Write clean, efficient code
                - Create necessary files and modules
                - Follow best practices and patterns
                - Use the architecture provided by the architect
                
                You have full context of what researcher and architect have done.
                Hand off to the reviewer when implementation is complete.""",
                "tools": ["file_write", "file_read", "python_repl"],
                "model": "gpt-4o-mini"
            },
            "reviewer": {
                "system_prompt": """You are a code review specialist in a swarm team. Your role is to:
                - Review code for quality and correctness
                - Suggest improvements
                - Verify implementation matches requirements
                - Ensure best practices are followed
                - Provide final summary of the work
                
                You can see all the work done by researcher, architect, and coder.
                Provide comprehensive feedback and final assessment.""",
                "tools": ["file_read"],
                "model": "gpt-4o-mini"
            },
            "analyst": {
                "system_prompt": """You are a data analyst specialist in a swarm team. Your role is to:
                - Analyze data and patterns
                - Create visualizations and reports
                - Perform calculations and statistical analysis
                - Extract insights from information
                - Work with numerical and financial data
                
                Collaborate with other agents and share your analysis.""",
                "tools": ["python_repl", "tavily_search"],
                "model": "gpt-4o-mini"
            }
        }
        
        # Use provided configs or defaults
        configs = agent_configs or default_configs
        
        # Create Strands agents
        agents = []
        for agent_name, config in configs.items():
            # Get tools from unified service
            tool_functions = []
            requested_tools = config.get("tools", [])
            
            # Get all available tools
            all_tools = self.unified_tools.get_all_tools(enabled_only=True)
            tool_map = {tool["name"]: tool for tool in all_tools}
            
            for tool_name in requested_tools:
                if tool_name in tool_map:
                    tool_info = tool_map[tool_name]
                    wrapped_tool = self._create_tool_function(tool_name, tool_info)
                    if wrapped_tool:
                        tool_functions.append(wrapped_tool)
                else:
                    # Try to load the tool directly
                    wrapped_tool = self._create_tool_function(tool_name, {})
                    if wrapped_tool:
                        tool_functions.append(wrapped_tool)
                    else:
                        logger.warning(f"Tool {tool_name} not found in registry")
            
            # Create OpenAI model for the agent
            model = OpenAIModel(
                client_args={"api_key": os.getenv("OPENAI_API_KEY")},
                model_id=config.get("model", "gpt-4o-mini"),
                params={
                    "temperature": config.get("temperature", 0.7),
                    "max_tokens": config.get("max_tokens", 4000)
                }
            )
            
            # Create the agent
            agent = Agent(
                name=agent_name,
                model=model,
                system_prompt=config["system_prompt"],
                tools=tool_functions
            )
            agents.append(agent)
            logger.info(f"Created agent: {agent_name} with {len(tool_functions)} tools")
        
        return agents
    
    async def execute_swarm(
        self,
        task: str,
        agent_configs: Optional[Dict] = None,
        max_handoffs: int = 20,
        max_iterations: int = 20,
        callback: Optional[Callable] = None
    ) -> Dict[str, Any]:
        """
        Execute a true swarm with autonomous agent collaboration
        """
        await self._ensure_initialized()
        
        try:
            # Create swarm agents
            agents = await self.create_swarm_agents(task, agent_configs)
            
            if callback:
                await callback({
                    "type": "swarm_initialized",
                    "agents": [agent.name for agent in agents],
                    "task": task
                })
            
            # Create the Strands Swarm
            # First argument is the list of agents (positional)
            swarm = Swarm(
                agents,  # Positional argument
                max_handoffs=max_handoffs,
                max_iterations=max_iterations,
                execution_timeout=900.0,  # 15 minutes
                node_timeout=300.0,       # 5 minutes per agent
                repetitive_handoff_detection_window=8,
                repetitive_handoff_min_unique_agents=3
            )
            
            logger.info(f"🐝 Executing swarm with {len(agents)} agents on task: {task[:100]}...")
            
            # Execute the swarm (this is synchronous in Strands)
            # We'll run it in a thread pool to avoid blocking
            result = await asyncio.to_thread(swarm, task)
            
            # Extract results
            response = {
                "status": str(result.status),
                "final_output": result.output if hasattr(result, 'output') else str(result),
                "node_history": [],
                "handoffs": 0,
                "total_iterations": 0
            }
            
            # Process node history if available
            if hasattr(result, 'node_history'):
                response["node_history"] = [
                    {
                        "node_id": node.node_id if hasattr(node, 'node_id') else str(node),
                        "agent": node.agent_name if hasattr(node, 'agent_name') else "unknown",
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    for node in result.node_history
                ]
                response["handoffs"] = len(result.node_history) - 1
                response["total_iterations"] = len(result.node_history)
            
            logger.info(f"✅ Swarm execution completed with {response['handoffs']} handoffs")
            
            if callback:
                await callback({
                    "type": "swarm_completed",
                    "result": response
                })
            
            return response
            
        except Exception as e:
            logger.error(f"Swarm execution failed: {e}", exc_info=True)
            
            if callback:
                await callback({
                    "type": "swarm_failed",
                    "error": str(e)
                })
            
            return {
                "status": "failed",
                "error": str(e),
                "node_history": [],
                "handoffs": 0
            }
    
    async def execute_streaming_swarm(
        self,
        task: str,
        agent_configs: Optional[Dict] = None,
        max_handoffs: int = 20,
        stream_callback: Optional[Callable] = None
    ) -> Dict[str, Any]:
        """
        Execute swarm with streaming support
        Note: Strands Swarm doesn't natively support streaming,
        so we'll need to implement custom streaming logic
        """
        # This is a placeholder for streaming implementation
        # We'll need to explore how to intercept agent communications
        # and stream them in real-time
        
        logger.info("Streaming swarm execution not yet implemented")
        
        # For now, fall back to regular execution
        return await self.execute_swarm(
            task=task,
            agent_configs=agent_configs,
            max_handoffs=max_handoffs,
            callback=stream_callback
        )


# Singleton instance
_true_swarm_service = None

async def get_true_swarm_service() -> TrueSwarmService:
    """Get or create the True Swarm Service instance"""
    global _true_swarm_service
    if _true_swarm_service is None:
        _true_swarm_service = TrueSwarmService()
        await _true_swarm_service._ensure_initialized()
    return _true_swarm_service