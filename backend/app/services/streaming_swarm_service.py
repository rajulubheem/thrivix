"""
Streaming True Swarm Service
Implements True Strands Swarm with streaming capabilities
"""

import asyncio
import logging
import json
import uuid
from typing import List, Dict, Any, Optional, Callable, AsyncGenerator
from datetime import datetime
import structlog
import os
import threading
import queue
import time
from strands import Agent
from strands.multiagent import Swarm
from strands.models.openai import OpenAIModel
from app.schemas.swarm import SwarmExecutionRequest, SwarmExecutionResponse, ExecutionStatus

logger = structlog.get_logger()

# Configure Strands logging to capture events
strands_logger = logging.getLogger("strands")
strands_logger.setLevel(logging.DEBUG)


class StreamingSwarmService:
    """
    True Swarm with streaming support through:
    1. Tool-level streaming (immediate visibility)
    2. Log capture and parsing
    3. Periodic status updates
    """
    
    def __init__(self):
        self.active_executions = {}
        self._initialized = False
        
    async def _ensure_initialized(self):
        """Initialize the service"""
        if not self._initialized:
            self._initialized = True
            logger.info("✅ Streaming Swarm Service initialized")
    
    def _create_streaming_tool(self, tool_func: Callable, agent_name: str, stream_queue: queue.Queue):
        """Wrap a Strands tool with streaming capabilities"""
        from strands import tool
        
        # Get the original function from the tool if it's already decorated
        if hasattr(tool_func, '__wrapped__'):
            original_func = tool_func.__wrapped__
            tool_name = tool_func.__name__
        else:
            original_func = tool_func
            tool_name = tool_func.__name__
        
        # Create a new wrapper that includes streaming
        def streaming_wrapper(**kwargs):
            # Stream tool invocation
            stream_queue.put({
                "type": "tool_call",
                "timestamp": datetime.utcnow().isoformat(),
                "agent": agent_name,
                "tool": tool_name,
                "params": kwargs
            })
            
            try:
                # Execute the actual tool
                result = original_func(**kwargs)
                
                # Stream tool result
                stream_queue.put({
                    "type": "tool_result",
                    "timestamp": datetime.utcnow().isoformat(),
                    "agent": agent_name,
                    "tool": tool_name,
                    "success": True,
                    "result": str(result)[:500] if result else "Success"
                })
                
                return result
            except Exception as e:
                # Stream tool error
                stream_queue.put({
                    "type": "tool_error",
                    "timestamp": datetime.utcnow().isoformat(),
                    "agent": agent_name,
                    "tool": tool_name,
                    "error": str(e)
                })
                raise
        
        # Preserve metadata
        streaming_wrapper.__name__ = tool_name
        streaming_wrapper.__doc__ = getattr(tool_func, '__doc__', f"Tool: {tool_name}")
        
        # Re-apply the @tool decorator to make it a proper Strands tool
        return tool(streaming_wrapper)
    
    def _get_tool_function(self, tool_name: str):
        """Get the actual tool implementation for Strands"""
        try:
            if tool_name == "tavily_search":
                # Create a Strands-compatible tavily search tool
                from strands import tool
                
                @tool
                def tavily_search(query: str) -> str:
                    """Search the web for information using Tavily.
                    
                    Args:
                        query: The search query string
                    
                    Returns:
                        Search results as formatted text
                    """
                    import os
                    from tavily import TavilyClient
                    
                    try:
                        client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
                        response = client.search(query=query, max_results=5)
                        
                        result_text = f"Search results for '{query}':\n\n"
                        
                        # Format the answer if available
                        if response.get("answer"):
                            result_text += f"Answer: {response['answer']}\n\n"
                        
                        # Format the search results
                        for idx, r in enumerate(response.get("results", []), 1):
                            result_text += f"{idx}. {r.get('title', 'No title')}\n"
                            result_text += f"   URL: {r.get('url', '')}\n"
                            result_text += f"   {r.get('content', '')[:300]}...\n\n"
                        
                        return result_text
                    except Exception as e:
                        return f"Error searching: {str(e)}"
                
                return tavily_search
                
            elif tool_name == "python_repl":
                from strands import tool
                
                @tool
                def python_repl(code: str) -> str:
                    """Execute Python code and return output"""
                    import io
                    import sys
                    import contextlib
                    
                    try:
                        output = io.StringIO()
                        with contextlib.redirect_stdout(output):
                            exec(code)
                        result = output.getvalue()
                        return result if result else "Code executed successfully (no output)"
                    except Exception as e:
                        return f"Error executing code: {str(e)}"
                
                return python_repl
            
            elif tool_name == "file_write":
                from strands import tool
                
                @tool
                def file_write(filename: str, content: str) -> str:
                    """Write content to a file"""
                    try:
                        import os
                        # Write to temp directory for safety
                        temp_dir = "/tmp/swarm_files"
                        os.makedirs(temp_dir, exist_ok=True)
                        filepath = os.path.join(temp_dir, filename)
                        
                        with open(filepath, 'w') as f:
                            f.write(content)
                        
                        return f"File '{filename}' written successfully to {filepath}"
                    except Exception as e:
                        return f"Error writing file: {str(e)}"
                
                return file_write
            
            elif tool_name == "file_read":
                from strands import tool
                
                @tool
                def file_read(filename: str) -> str:
                    """Read content from a file"""
                    try:
                        import os
                        temp_dir = "/tmp/swarm_files"
                        filepath = os.path.join(temp_dir, filename)
                        
                        if not os.path.exists(filepath):
                            return f"File '{filename}' not found"
                        
                        with open(filepath, 'r') as f:
                            content = f.read()
                        
                        return f"Content of '{filename}':\n{content}"
                    except Exception as e:
                        return f"Error reading file: {str(e)}"
                
                return file_read
                
        except Exception as e:
            logger.warning(f"Could not create tool {tool_name}: {e}")
        return None
    
    def _create_swarm_agents(self, task: str, agent_configs: Dict, stream_queue: queue.Queue, conversation_history: List[Dict] = None):
        """Create agents with streaming-wrapped tools"""
        agents = []
        
        for agent_name, config in agent_configs.items():
            # Get and wrap tools with streaming
            tools = []
            for tool_name in config.get("tools", []):
                tool_func = self._get_tool_function(tool_name)
                if tool_func:
                    # Wrap the tool with streaming capabilities
                    streaming_tool = self._create_streaming_tool(
                        tool_func, agent_name, stream_queue
                    )
                    tools.append(streaming_tool)
            
            # Add conversation context to system prompt if available
            system_prompt = config["system_prompt"]
            if conversation_history and len(conversation_history) > 0:
                context = "\n\n=== CONVERSATION HISTORY ===\n"
                for msg in conversation_history[-5:]:  # Last 5 messages
                    role = msg.get("role", "unknown")
                    content = msg.get("content", "")[:200]  # Truncate
                    context += f"{role.upper()}: {content}\n"
                context += "=== END HISTORY ===\n\n"
                system_prompt = context + system_prompt
            
            # Create OpenAI model
            model = OpenAIModel(
                client_args={"api_key": os.getenv("OPENAI_API_KEY")},
                model_id=config.get("model", "gpt-4o-mini"),
                params={
                    "temperature": config.get("temperature", 0.7),
                    "max_tokens": config.get("max_tokens", 4000)
                }
            )
            
            # Create agent
            agent = Agent(
                name=agent_name,
                model=model,
                system_prompt=system_prompt,
                tools=tools
            )
            agents.append(agent)
            
            # Log the actual tools loaded
            if hasattr(agent, 'tool_names'):
                logger.info(f"Created agent: {agent_name} with tools: {agent.tool_names}")
            else:
                logger.info(f"Created streaming agent: {agent_name} with {len(tools)} tools provided")
        
        return agents
    
    class SwarmLogHandler(logging.Handler):
        """Capture Strands logs for streaming"""
        def __init__(self, stream_queue: queue.Queue, agents_map: Dict[str, str]):
            super().__init__()
            self.stream_queue = stream_queue
            self.agents_map = agents_map  # Map agent names for better display
            
        def emit(self, record):
            msg = record.getMessage()
            
            # Parse Strands log messages
            if "handoff" in msg.lower():
                # Try to extract agent names from the message
                # Pattern: "Handoff from X to Y" or similar
                import re
                handoff_pattern = r"handoff.*?from\s+(\w+).*?to\s+(\w+)"
                match = re.search(handoff_pattern, msg, re.IGNORECASE)
                
                if match:
                    from_agent = match.group(1)
                    to_agent = match.group(2)
                else:
                    # Fallback: try to extract any agent names
                    from_agent = "unknown"
                    to_agent = "unknown"
                    for agent_name in self.agents_map.keys():
                        if agent_name in msg.lower():
                            if from_agent == "unknown":
                                from_agent = agent_name
                            else:
                                to_agent = agent_name
                
                self.stream_queue.put({
                    "type": "handoff",
                    "timestamp": datetime.utcnow().isoformat(),
                    "from_agent": from_agent,
                    "to_agent": to_agent,
                    "message": msg
                })
            elif "executing" in msg.lower() and "node" in msg.lower():
                # Extract agent name from "Executing node: agent_name"
                import re
                node_pattern = r"executing\s+node[:\s]+(\w+)"
                match = re.search(node_pattern, msg, re.IGNORECASE)
                agent_name = match.group(1) if match else "unknown"
                
                self.stream_queue.put({
                    "type": "agent_thinking",
                    "timestamp": datetime.utcnow().isoformat(),
                    "agent": agent_name,
                    "message": msg
                })
            elif "completed" in msg.lower():
                # Extract agent name if possible
                agent_name = "unknown"
                for name in self.agents_map.keys():
                    if name in msg.lower():
                        agent_name = name
                        break
                
                self.stream_queue.put({
                    "type": "agent_complete",
                    "timestamp": datetime.utcnow().isoformat(),
                    "agent": agent_name,
                    "message": msg
                })
    
    async def execute_streaming_swarm(
        self,
        execution_id: str,
        task: str,
        agent_configs: Optional[Dict] = None,
        max_handoffs: int = 10,
        max_iterations: int = 20,
        conversation_history: Optional[List[Dict]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Execute swarm with streaming events
        Yields events as they occur
        """
        await self._ensure_initialized()
        
        # Default agent configs if not provided
        if not agent_configs:
            agent_configs = {
                "researcher": {
                    "system_prompt": "You are a research specialist. Use web search to find information. Hand off to analyst when done.",
                    "tools": ["tavily_search"],
                    "model": "gpt-4o-mini"
                },
                "analyst": {
                    "system_prompt": "You are an analyst. Analyze findings and provide insights.",
                    "tools": [],
                    "model": "gpt-4o-mini"
                }
            }
        
        # Create thread-safe queue for streaming
        stream_queue = queue.Queue()
        
        # Create agents map for log handler
        agents_map = {name: name for name in agent_configs.keys()}
        
        # Add log handler to capture Strands events
        log_handler = self.SwarmLogHandler(stream_queue, agents_map)
        strands_logger.addHandler(log_handler)
        
        try:
            # Send initialization event
            yield {
                "type": "swarm_init",
                "execution_id": execution_id,
                "timestamp": datetime.utcnow().isoformat(),
                "agents": list(agent_configs.keys()),
                "task": task
            }
            
            # Create agents with streaming tools
            agents = self._create_swarm_agents(task, agent_configs, stream_queue, conversation_history)
            
            # Create the Strands Swarm
            swarm = Swarm(
                agents,
                max_handoffs=max_handoffs,
                max_iterations=max_iterations,
                execution_timeout=300.0,  # 5 minutes
                node_timeout=60.0,  # 1 minute per agent
            )
            
            # Run swarm in thread
            result_container = {"result": None, "error": None, "completed": False}
            
            def run_swarm():
                try:
                    logger.info(f"🐝 Starting swarm execution for: {task[:100]}")
                    result = swarm(task)
                    result_container["result"] = result
                    result_container["completed"] = True
                    logger.info("✅ Swarm execution completed")
                except Exception as e:
                    logger.error(f"Swarm execution failed: {e}")
                    result_container["error"] = str(e)
                    result_container["completed"] = True
            
            # Start swarm execution
            swarm_thread = threading.Thread(target=run_swarm)
            swarm_thread.start()
            
            # Stream events while swarm is running
            last_heartbeat = time.time()
            
            while not result_container["completed"]:
                # Check for queued events
                try:
                    while not stream_queue.empty():
                        event = stream_queue.get_nowait()
                        yield event
                except queue.Empty:
                    pass
                
                # Send periodic heartbeat
                if time.time() - last_heartbeat > 2:
                    yield {
                        "type": "heartbeat",
                        "timestamp": datetime.utcnow().isoformat(),
                        "status": "running"
                    }
                    last_heartbeat = time.time()
                
                # Small sleep to prevent busy waiting
                await asyncio.sleep(0.1)
            
            # Wait for thread to complete
            swarm_thread.join(timeout=1)
            
            # Process final result
            if result_container["error"]:
                yield {
                    "type": "error",
                    "timestamp": datetime.utcnow().isoformat(),
                    "error": result_container["error"]
                }
            elif result_container["result"]:
                result = result_container["result"]
                
                # Extract meaningful output
                output = "Task completed successfully"
                
                # Try different ways to extract the result
                if hasattr(result, 'result'):
                    # Direct result attribute
                    if isinstance(result.result, str):
                        output = result.result
                    elif hasattr(result.result, 'message'):
                        if isinstance(result.result.message, str):
                            output = result.result.message
                        elif isinstance(result.result.message, dict):
                            if 'content' in result.result.message:
                                content = result.result.message['content']
                                if isinstance(content, str):
                                    output = content
                                elif isinstance(content, list) and len(content) > 0:
                                    if isinstance(content[0], dict):
                                        output = content[0].get('text', str(content[0]))
                                    else:
                                        output = str(content[0])
                
                # Try to get results from node results
                if hasattr(result, 'results') and output == "Task completed successfully":
                    for agent_name, node_result in result.results.items():
                        if hasattr(node_result, 'result'):
                            if isinstance(node_result.result, str):
                                output = node_result.result
                                break
                            elif hasattr(node_result.result, 'message'):
                                message = node_result.result.message
                                if isinstance(message, str):
                                    output = message
                                    break
                                elif isinstance(message, dict) and 'content' in message:
                                    content = message['content']
                                    if isinstance(content, str):
                                        output = content
                                        break
                                    elif isinstance(content, list) and len(content) > 0:
                                        output = str(content[0].get('text', content[0]) if isinstance(content[0], dict) else content[0])
                                        break
                
                # Log the full result for debugging
                logger.info(f"Swarm complete. Output extracted: {output[:200]}")
                
                yield {
                    "type": "complete",
                    "timestamp": datetime.utcnow().isoformat(),
                    "execution_id": execution_id,
                    "output": output,
                    "status": "completed"
                }
            
        except Exception as e:
            logger.error(f"Streaming swarm failed: {e}", exc_info=True)
            yield {
                "type": "error",
                "timestamp": datetime.utcnow().isoformat(),
                "error": str(e)
            }
        finally:
            # Clean up log handler
            strands_logger.removeHandler(log_handler)
    
    def get_default_agent_configs(self, task_type: str = "general") -> Dict:
        """Get default agent configurations based on task type"""
        
        if task_type == "research":
            return {
                "researcher": {
                    "system_prompt": """You are a research specialist in the swarm.
                    Your PRIMARY role is to use the tavily_search tool to gather information.
                    
                    IMPORTANT: You MUST use tavily_search to find information about the topic.
                    Do NOT just hand off without searching first.
                    
                    Steps:
                    1. Use tavily_search with relevant queries
                    2. Gather comprehensive data from multiple searches if needed
                    3. Once you have sufficient information, hand off to analyst with your findings
                    
                    Remember: Always search BEFORE handing off.""",
                    "tools": ["tavily_search"],
                    "model": "gpt-4o-mini",
                    "temperature": 0.7
                },
                "analyst": {
                    "system_prompt": """You are an analyst in the swarm.
                    Your role is to analyze research findings and create a final report.
                    
                    If you receive research data, synthesize it into a comprehensive report.
                    If you need more information, use tavily_search yourself.
                    
                    When you have enough information, provide the final report.
                    Do NOT hand off again unless absolutely necessary.""",
                    "tools": ["tavily_search"],
                    "model": "gpt-4o-mini",
                    "temperature": 0.5
                }
            }
        elif task_type == "coding":
            return {
                "architect": {
                    "system_prompt": """You are the system architect in the swarm.
                    Design the solution architecture and define requirements.
                    Create a clear plan with data models and interfaces.
                    Use Python to prototype or validate concepts if needed.
                    Hand off to the coder with clear specifications.""",
                    "tools": ["python_repl"],
                    "model": "gpt-4o-mini",
                    "temperature": 0.3
                },
                "coder": {
                    "system_prompt": """You are the coder in the swarm.
                    Implement the solution based on the architecture.
                    Write clean, efficient, and well-documented code.
                    Test your implementation thoroughly.
                    Save important code to files for review.
                    Hand off to reviewer when implementation is complete.""",
                    "tools": ["python_repl", "file_write"],
                    "model": "gpt-4o-mini",
                    "temperature": 0.2
                },
                "reviewer": {
                    "system_prompt": """You are the code reviewer in the swarm.
                    Review the implementation for quality and correctness.
                    Check for bugs, performance issues, and improvements.
                    Read saved files to examine the code.
                    Provide constructive feedback and final assessment.""",
                    "tools": ["file_read", "python_repl"],
                    "model": "gpt-4o-mini",
                    "temperature": 0.3
                }
            }
        else:  # general
            return {
                "coordinator": {
                    "system_prompt": """You are the task coordinator in the swarm.
                    
                    Your FIRST action should be to USE YOUR TOOLS to start working on the task:
                    - For research tasks: Use tavily_search immediately
                    - For computation tasks: Use python_repl immediately
                    
                    Only hand off to specialist AFTER you've done initial work.
                    Include your findings when handing off.
                    
                    IMPORTANT: Do NOT just hand off without using tools first.""",
                    "tools": ["tavily_search", "python_repl"],
                    "model": "gpt-4o-mini",
                    "temperature": 0.5
                },
                "specialist": {
                    "system_prompt": """You are a specialist in the swarm.
                    
                    Your job is to COMPLETE the task using your tools:
                    - Use tavily_search for research
                    - Use python_repl for calculations
                    - Use file_write to save results
                    
                    When you have results, provide them directly.
                    Do NOT hand back unless you've hit a blocker.
                    
                    IMPORTANT: USE YOUR TOOLS to complete the work.""",
                    "tools": ["tavily_search", "python_repl", "file_write", "file_read"],
                    "model": "gpt-4o-mini",
                    "temperature": 0.5
                }
            }


# Singleton instance
_streaming_swarm_service = None

async def get_streaming_swarm_service() -> StreamingSwarmService:
    """Get or create the Streaming Swarm Service instance"""
    global _streaming_swarm_service
    if _streaming_swarm_service is None:
        _streaming_swarm_service = StreamingSwarmService()
        await _streaming_swarm_service._ensure_initialized()
    return _streaming_swarm_service