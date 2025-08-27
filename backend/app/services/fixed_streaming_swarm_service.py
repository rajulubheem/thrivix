"""
Fixed Streaming Swarm Service - Properly handles Strands tools
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
from strands import Agent, tool
from strands.multiagent import Swarm
from strands.models.openai import OpenAIModel
from app.schemas.swarm import SwarmExecutionRequest, SwarmExecutionResponse, ExecutionStatus

logger = structlog.get_logger()

# Configure Strands logging to capture events
strands_logger = logging.getLogger("strands")
strands_logger.setLevel(logging.DEBUG)


class FixedStreamingSwarmService:
    """
    Fixed Swarm implementation with proper tool handling
    """
    
    def __init__(self):
        self.active_executions = {}
        self._initialized = False
        
    async def _ensure_initialized(self):
        """Initialize the service"""
        if not self._initialized:
            self._initialized = True
            logger.info("✅ Fixed Streaming Swarm Service initialized")
    
    def _create_tools(self):
        """Create Strands-compatible tools"""
        
        @tool
        def tavily_search(query: str) -> str:
            """Search the web for information using Tavily.
            
            Args:
                query: The search query string
            """
            import os
            from tavily import TavilyClient
            
            try:
                client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
                # Add search_depth and include_answer for better results
                response = client.search(
                    query=query + " 2024 2025 latest current",  # Add current year keywords
                    max_results=5,
                    search_depth="advanced",  # Use advanced search for better results
                    include_answer=True
                )
                
                result_text = f"Search results for '{query}':\n\n"
                
                if response.get("answer"):
                    result_text += f"Answer: {response['answer']}\n\n"
                
                for idx, r in enumerate(response.get("results", []), 1):
                    result_text += f"{idx}. {r.get('title', 'No title')}\n"
                    result_text += f"   URL: {r.get('url', '')}\n"
                    result_text += f"   {r.get('content', '')[:300]}...\n\n"
                
                return result_text
            except Exception as e:
                return f"Error searching: {str(e)}"
        
        @tool
        def python_repl(code: str) -> str:
            """Execute Python code and return output.
            
            Args:
                code: Python code to execute
            """
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
        
        @tool
        def file_write(filename: str, content: str) -> str:
            """Write content to a file.
            
            Args:
                filename: Name of the file to write
                content: Content to write to the file
            """
            try:
                import os
                temp_dir = "/tmp/swarm_files"
                os.makedirs(temp_dir, exist_ok=True)
                filepath = os.path.join(temp_dir, filename)
                
                with open(filepath, 'w') as f:
                    f.write(content)
                
                return f"File '{filename}' written successfully to {filepath}"
            except Exception as e:
                return f"Error writing file: {str(e)}"
        
        @tool
        def file_read(filename: str) -> str:
            """Read content from a file.
            
            Args:
                filename: Name of the file to read
            """
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
        
        return {
            "tavily_search": tavily_search,
            "python_repl": python_repl,
            "file_write": file_write,
            "file_read": file_read
        }
    
    def _create_swarm_agents(self, task: str, agent_configs: Dict, stream_queue: queue.Queue, conversation_history: List[Dict] = None):
        """Create agents with proper tools"""
        agents = []
        tools_map = self._create_tools()
        
        for agent_name, config in agent_configs.items():
            # Get tools for this agent
            agent_tools = []
            for tool_name in config.get("tools", []):
                if tool_name in tools_map:
                    agent_tools.append(tools_map[tool_name])
                    logger.info(f"Added tool {tool_name} to agent {agent_name}")
            
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
                tools=agent_tools
            )
            agents.append(agent)
            
            logger.info(f"Created agent: {agent_name} with {len(agent_tools)} tools: {agent.tool_names}")
        
        return agents
    
    class SwarmMonitor(logging.Handler):
        """Monitor and capture swarm execution events"""
        def __init__(self, stream_queue: queue.Queue):
            super().__init__()
            self.stream_queue = stream_queue
            self.last_update = time.time()
            
        def emit(self, record):
            """Capture log messages from Strands"""
            msg = record.getMessage().lower()
            
            # Detect tool usage
            if "tool #" in msg or "tool_use" in msg:
                # Extract tool information
                if "tavily_search" in msg:
                    self.stream_queue.put({
                        "type": "tool_call",
                        "timestamp": datetime.utcnow().isoformat(),
                        "tool": "tavily_search",
                        "message": "Searching the web..."
                    })
                elif "python_repl" in msg:
                    self.stream_queue.put({
                        "type": "tool_call",
                        "timestamp": datetime.utcnow().isoformat(),
                        "tool": "python_repl",
                        "message": "Executing Python code..."
                    })
                elif "handoff" in msg:
                    self.stream_queue.put({
                        "type": "handoff",
                        "timestamp": datetime.utcnow().isoformat(),
                        "message": "Agent handoff occurring..."
                    })
            
            # Detect agent activity
            elif "executing node" in msg or "current_node" in msg:
                import re
                match = re.search(r"current_node=<(\w+)>", record.getMessage())
                if match:
                    agent_name = match.group(1)
                    self.stream_queue.put({
                        "type": "agent_thinking",
                        "timestamp": datetime.utcnow().isoformat(),
                        "agent": agent_name,
                        "message": f"{agent_name} is working..."
                    })
        
        def check_and_send_update(self, swarm_thread):
            """Send periodic updates"""
            if time.time() - self.last_update > 2:
                if swarm_thread.is_alive():
                    self.stream_queue.put({
                        "type": "heartbeat",
                        "timestamp": datetime.utcnow().isoformat(),
                        "status": "running"
                    })
                self.last_update = time.time()
    
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
        """
        await self._ensure_initialized()
        
        # Default agent configs if not provided
        if not agent_configs:
            agent_configs = self.get_default_agent_configs("general")
        
        # Create thread-safe queue for streaming
        stream_queue = queue.Queue()
        
        # Set up monitoring
        monitor = self.SwarmMonitor(stream_queue)
        strands_logger.addHandler(monitor)
        
        try:
            # Send initialization event
            yield {
                "type": "swarm_init",
                "execution_id": execution_id,
                "timestamp": datetime.utcnow().isoformat(),
                "agents": list(agent_configs.keys()),
                "task": task
            }
            
            # Create agents
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
                    
                    # Add progress updates to queue
                    stream_queue.put({
                        "type": "agent_thinking",
                        "timestamp": datetime.utcnow().isoformat(),
                        "agent": agents[0].name,
                        "message": "Starting task execution..."
                    })
                    
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
            while not result_container["completed"]:
                # Check for queued events
                try:
                    while not stream_queue.empty():
                        event = stream_queue.get_nowait()
                        yield event
                except queue.Empty:
                    pass
                
                # Send periodic heartbeat
                monitor.check_and_send_update(swarm_thread)
                
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
                output = self._extract_result_output(result)
                
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
            # Clean up monitor
            if 'monitor' in locals():
                strands_logger.removeHandler(monitor)
    
    def _extract_result_output(self, result) -> str:
        """Extract meaningful output from swarm result"""
        output = "Task completed"
        
        try:
            # Check if result has results attribute
            if hasattr(result, 'results'):
                # Iterate through node results
                for node_name, node_result in result.results.items():
                    if hasattr(node_result, 'result'):
                        agent_result = node_result.result
                        if hasattr(agent_result, 'message'):
                            message = agent_result.message
                            
                            # Extract text from message
                            if isinstance(message, dict):
                                if 'content' in message:
                                    content = message['content']
                                    if isinstance(content, list):
                                        for item in content:
                                            if isinstance(item, dict) and 'text' in item:
                                                output = item['text']
                                                break
                                    elif isinstance(content, str):
                                        output = content
                            elif isinstance(message, str):
                                output = message
                            
                            # If we found meaningful output, use it
                            if output != "Task completed":
                                break
            
            logger.info(f"Extracted output: {output[:200]}")
            
        except Exception as e:
            logger.error(f"Error extracting result: {e}")
        
        return output
    
    def get_default_agent_configs(self, task_type: str = "general") -> Dict:
        """Get default agent configurations based on task type"""
        
        if task_type == "research":
            return {
                "researcher": {
                    "system_prompt": """You are a research specialist.
                    IMPORTANT: Always search for the MOST CURRENT and LATEST information.
                    Add "2024", "2025", "current", "latest", "today" to your search queries.
                    USE the tavily_search tool to find up-to-date information.
                    Search multiple times if needed to get comprehensive current data.
                    Once you have current results, hand off to analyst with your findings.""",
                    "tools": ["tavily_search"],
                    "model": "gpt-4o-mini",
                    "temperature": 0.7
                },
                "analyst": {
                    "system_prompt": """You are an analyst.
                    Analyze the research findings and create a report with CURRENT data.
                    If the data seems old, use tavily_search to get more recent information.
                    Always include dates and specify that the information is current.
                    Provide a comprehensive report with the latest available data.""",
                    "tools": ["tavily_search"],
                    "model": "gpt-4o-mini",
                    "temperature": 0.5
                }
            }
        else:  # general
            return {
                "coordinator": {
                    "system_prompt": """You are the coordinator.
                    USE your tools to work on the task:
                    - Use tavily_search for research
                    - Use python_repl for calculations
                    Hand off to specialist only after initial work.""",
                    "tools": ["tavily_search", "python_repl"],
                    "model": "gpt-4o-mini",
                    "temperature": 0.5
                },
                "specialist": {
                    "system_prompt": """You are a specialist.
                    Complete the task using your tools.
                    Provide comprehensive results.""",
                    "tools": ["tavily_search", "python_repl", "file_write", "file_read"],
                    "model": "gpt-4o-mini",
                    "temperature": 0.5
                }
            }


# Singleton instance
_fixed_streaming_swarm_service = None

async def get_fixed_streaming_swarm_service() -> FixedStreamingSwarmService:
    """Get or create the Fixed Streaming Swarm Service instance"""
    global _fixed_streaming_swarm_service
    if _fixed_streaming_swarm_service is None:
        _fixed_streaming_swarm_service = FixedStreamingSwarmService()
        await _fixed_streaming_swarm_service._ensure_initialized()
    return _fixed_streaming_swarm_service