"""
Enhanced Fixed Streaming Swarm Service with detailed monitoring
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
import re
from strands import Agent, tool
from strands.multiagent import Swarm
from strands.models.openai import OpenAIModel
from app.schemas.swarm import SwarmExecutionRequest, SwarmExecutionResponse, ExecutionStatus

logger = structlog.get_logger()

# Configure Strands logging to capture events
strands_logger = logging.getLogger("strands")
strands_logger.setLevel(logging.DEBUG)


class EnhancedStreamingSwarmService:
    """
    Enhanced Swarm with detailed activity monitoring
    """
    
    def __init__(self):
        self.active_executions = {}
        self._initialized = False
        
    async def _ensure_initialized(self):
        """Initialize the service"""
        if not self._initialized:
            self._initialized = True
            logger.info("✅ Enhanced Streaming Swarm Service initialized")
    
    def _create_tools(self, stream_queue: queue.Queue):
        """Create Strands-compatible tools with streaming"""
        
        @tool
        def tavily_search(query: str) -> str:
            """Search the web for information using Tavily.
            
            Args:
                query: The search query string
            """
            import os
            from tavily import TavilyClient
            
            # Stream the search action
            stream_queue.put({
                "type": "tool_execution",
                "timestamp": datetime.utcnow().isoformat(),
                "tool": "tavily_search",
                "params": {"query": query},
                "status": "starting"
            })
            
            try:
                client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
                # Add search_depth and include_answer for better results
                response = client.search(
                    query=query + " 2024 2025 latest current today",  # Add current keywords
                    max_results=5,
                    search_depth="advanced",
                    include_answer=True
                )
                
                result_text = f"Search results for '{query}':\n\n"
                
                if response.get("answer"):
                    result_text += f"Quick Answer: {response['answer']}\n\n"
                
                results_summary = []
                for idx, r in enumerate(response.get("results", []), 1):
                    title = r.get('title', 'No title')
                    url = r.get('url', '')
                    content = r.get('content', '')[:300]
                    result_text += f"{idx}. {title}\n"
                    result_text += f"   URL: {url}\n"
                    result_text += f"   {content}...\n\n"
                    results_summary.append(title)
                
                # Stream the results
                stream_queue.put({
                    "type": "tool_result",
                    "timestamp": datetime.utcnow().isoformat(),
                    "tool": "tavily_search",
                    "status": "success",
                    "summary": f"Found {len(results_summary)} results: {', '.join(results_summary[:3])}"
                })
                
                return result_text
            except Exception as e:
                stream_queue.put({
                    "type": "tool_result",
                    "timestamp": datetime.utcnow().isoformat(),
                    "tool": "tavily_search",
                    "status": "error",
                    "error": str(e)
                })
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
            
            stream_queue.put({
                "type": "tool_execution",
                "timestamp": datetime.utcnow().isoformat(),
                "tool": "python_repl",
                "params": {"code": code[:100] + "..." if len(code) > 100 else code},
                "status": "starting"
            })
            
            try:
                output = io.StringIO()
                with contextlib.redirect_stdout(output):
                    exec(code)
                result = output.getvalue()
                
                stream_queue.put({
                    "type": "tool_result",
                    "timestamp": datetime.utcnow().isoformat(),
                    "tool": "python_repl",
                    "status": "success",
                    "summary": "Code executed successfully"
                })
                
                return result if result else "Code executed successfully (no output)"
            except Exception as e:
                stream_queue.put({
                    "type": "tool_result",
                    "timestamp": datetime.utcnow().isoformat(),
                    "tool": "python_repl",
                    "status": "error",
                    "error": str(e)
                })
                return f"Error executing code: {str(e)}"
        
        return {
            "tavily_search": tavily_search,
            "python_repl": python_repl
        }
    
    def _create_swarm_agents(self, task: str, agent_configs: Dict, stream_queue: queue.Queue, conversation_history: List[Dict] = None):
        """Create agents with proper tools and monitoring"""
        agents = []
        tools_map = self._create_tools(stream_queue)
        
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
            
            stream_queue.put({
                "type": "agent_created",
                "timestamp": datetime.utcnow().isoformat(),
                "agent": agent_name,
                "tools": agent.tool_names,
                "role": config.get("role_description", "Agent")
            })
        
        return agents
    
    class DetailedMonitor(logging.Handler):
        """Detailed monitoring of swarm execution"""
        def __init__(self, stream_queue: queue.Queue, agents_map: Dict[str, str]):
            super().__init__()
            self.stream_queue = stream_queue
            self.agents_map = agents_map
            self.current_agent = None
            self.iteration_count = 0
            
        def emit(self, record):
            """Capture and parse detailed log messages"""
            msg = record.getMessage()
            msg_lower = msg.lower()
            
            # Extract iteration info
            iteration_match = re.search(r"iteration=<(\d+)>", msg)
            if iteration_match:
                self.iteration_count = int(iteration_match.group(1))
            
            # Extract current agent/node
            node_match = re.search(r"current_node=<(\w+)>", msg)
            if node_match:
                self.current_agent = node_match.group(1)
                self.stream_queue.put({
                    "type": "agent_active",
                    "timestamp": datetime.utcnow().isoformat(),
                    "agent": self.current_agent,
                    "iteration": self.iteration_count,
                    "message": f"{self.current_agent} is now active (iteration {self.iteration_count})"
                })
            
            # Detect planning/thinking
            if "planning" in msg_lower or "thinking" in msg_lower or "analyzing" in msg_lower:
                self.stream_queue.put({
                    "type": "agent_planning",
                    "timestamp": datetime.utcnow().isoformat(),
                    "agent": self.current_agent or "unknown",
                    "message": "Planning next steps..."
                })
            
            # Detect tool usage patterns
            if "tool #" in msg_lower:
                tool_num_match = re.search(r"tool #(\d+):\s*(\w+)", msg, re.IGNORECASE)
                if tool_num_match:
                    tool_num = tool_num_match.group(1)
                    tool_name = tool_num_match.group(2)
                    self.stream_queue.put({
                        "type": "tool_invocation",
                        "timestamp": datetime.utcnow().isoformat(),
                        "agent": self.current_agent or "unknown",
                        "tool": tool_name,
                        "tool_number": tool_num,
                        "message": f"Invoking tool #{tool_num}: {tool_name}"
                    })
            
            # Detect handoffs
            if "handoff" in msg_lower:
                # Try to extract handoff details
                handoff_match = re.search(r"handoff.*?to\s+(\w+)", msg, re.IGNORECASE)
                if handoff_match:
                    target_agent = handoff_match.group(1)
                    self.stream_queue.put({
                        "type": "handoff",
                        "timestamp": datetime.utcnow().isoformat(),
                        "from_agent": self.current_agent or "unknown",
                        "to_agent": target_agent,
                        "message": f"Handing off task from {self.current_agent} to {target_agent}"
                    })
            
            # Detect completion
            if "completed" in msg_lower and "node" in msg_lower:
                self.stream_queue.put({
                    "type": "agent_completed",
                    "timestamp": datetime.utcnow().isoformat(),
                    "agent": self.current_agent or "unknown",
                    "message": f"{self.current_agent} completed its task"
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
        Execute swarm with detailed streaming events
        """
        await self._ensure_initialized()
        
        # Default agent configs if not provided
        if not agent_configs:
            agent_configs = self.get_default_agent_configs("general")
        
        # Create thread-safe queue for streaming
        stream_queue = queue.Queue()
        
        # Create agents map for monitoring
        agents_map = {name: config.get("role_description", name) for name, config in agent_configs.items()}
        
        # Set up detailed monitoring
        monitor = self.DetailedMonitor(stream_queue, agents_map)
        strands_logger.addHandler(monitor)
        
        try:
            # Send initialization event with details
            yield {
                "type": "swarm_init",
                "execution_id": execution_id,
                "timestamp": datetime.utcnow().isoformat(),
                "agents": list(agent_configs.keys()),
                "task": task,
                "config": {
                    "max_handoffs": max_handoffs,
                    "max_iterations": max_iterations,
                    "task_type": "research" if "research" in task.lower() else "general"
                }
            }
            
            # Send planning event
            yield {
                "type": "swarm_planning",
                "timestamp": datetime.utcnow().isoformat(),
                "message": f"Planning execution strategy for: {task[:100]}...",
                "agents_available": list(agents_map.keys())
            }
            
            # Create agents
            agents = self._create_swarm_agents(task, agent_configs, stream_queue, conversation_history)
            
            # Create the Strands Swarm
            swarm = Swarm(
                agents,
                max_handoffs=max_handoffs,
                max_iterations=max_iterations,
                execution_timeout=300.0,
                node_timeout=60.0,
            )
            
            # Send swarm ready event
            yield {
                "type": "swarm_ready",
                "timestamp": datetime.utcnow().isoformat(),
                "message": "Swarm initialized and ready to execute"
            }
            
            # Run swarm in thread
            result_container = {"result": None, "error": None, "completed": False}
            
            def run_swarm():
                try:
                    logger.info(f"🐝 Starting swarm execution for: {task[:100]}")
                    
                    stream_queue.put({
                        "type": "execution_started",
                        "timestamp": datetime.utcnow().isoformat(),
                        "message": "Swarm execution started"
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
            last_heartbeat = time.time()
            
            while not result_container["completed"]:
                # Process all queued events
                events_processed = 0
                try:
                    while not stream_queue.empty() and events_processed < 10:
                        event = stream_queue.get_nowait()
                        yield event
                        events_processed += 1
                except queue.Empty:
                    pass
                
                # Send periodic status update
                if time.time() - last_heartbeat > 3:
                    if swarm_thread.is_alive():
                        yield {
                            "type": "status_update",
                            "timestamp": datetime.utcnow().isoformat(),
                            "status": "running",
                            "message": "Swarm is processing..."
                        }
                    last_heartbeat = time.time()
                
                # Small sleep to prevent busy waiting
                await asyncio.sleep(0.1)
            
            # Process remaining events
            while not stream_queue.empty():
                try:
                    event = stream_queue.get_nowait()
                    yield event
                except queue.Empty:
                    break
            
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
                
                # Extract detailed output
                output = self._extract_detailed_output(result)
                
                yield {
                    "type": "complete",
                    "timestamp": datetime.utcnow().isoformat(),
                    "execution_id": execution_id,
                    "output": output,
                    "status": "completed",
                    "summary": {
                        "total_iterations": monitor.iteration_count,
                        "agents_used": list(set([a for a in agents_map.keys()]))
                    }
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
    
    def _extract_detailed_output(self, result) -> str:
        """Extract detailed output from swarm result"""
        output = "Task completed"
        
        try:
            if hasattr(result, 'results'):
                for node_name, node_result in result.results.items():
                    if hasattr(node_result, 'result'):
                        agent_result = node_result.result
                        if hasattr(agent_result, 'message'):
                            message = agent_result.message
                            
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
                            
                            if output != "Task completed":
                                break
            
            logger.info(f"Extracted output: {output[:200]}")
            
        except Exception as e:
            logger.error(f"Error extracting result: {e}")
        
        return output
    
    def get_default_agent_configs(self, task_type: str = "general") -> Dict:
        """Get default agent configurations with role descriptions"""
        
        if task_type == "research":
            return {
                "researcher": {
                    "system_prompt": """You are a research specialist in the swarm.
                    Your role is to gather the most current and comprehensive information.
                    
                    CRITICAL: Always search for 2024/2025 data. Add "latest", "current", "today" to queries.
                    Use tavily_search multiple times if needed to get complete information.
                    Focus on: current prices, latest news, recent developments, today's data.
                    
                    Once you have comprehensive current data, hand off to analyst.""",
                    "tools": ["tavily_search"],
                    "model": "gpt-4o-mini",
                    "temperature": 0.7,
                    "role_description": "Research Specialist - Gathers current data"
                },
                "analyst": {
                    "system_prompt": """You are an analyst in the swarm.
                    Your role is to analyze data and create comprehensive reports.
                    
                    CRITICAL: Ensure all data in your report is current (2024/2025).
                    If you receive old data, use tavily_search to get newer information.
                    Always specify dates and mark information as current/latest.
                    
                    Create a well-structured report with clear sections and current data.""",
                    "tools": ["tavily_search"],
                    "model": "gpt-4o-mini",
                    "temperature": 0.5,
                    "role_description": "Data Analyst - Creates comprehensive reports"
                }
            }
        else:  # general
            return {
                "coordinator": {
                    "system_prompt": """You are the task coordinator in the swarm.
                    Your role is to understand requirements and begin execution.
                    
                    IMMEDIATELY use your tools to start working:
                    - For research: Use tavily_search with current/latest keywords
                    - For calculations: Use python_repl
                    
                    Gather initial data before handing off to specialist.""",
                    "tools": ["tavily_search", "python_repl"],
                    "model": "gpt-4o-mini",
                    "temperature": 0.5,
                    "role_description": "Task Coordinator - Plans and initiates execution"
                },
                "specialist": {
                    "system_prompt": """You are a specialist in the swarm.
                    Your role is to complete the task with precision.
                    
                    Use all available tools to deliver comprehensive results.
                    Focus on current data and complete execution.
                    Provide detailed output with sources.""",
                    "tools": ["tavily_search", "python_repl"],
                    "model": "gpt-4o-mini",
                    "temperature": 0.5,
                    "role_description": "Task Specialist - Completes detailed execution"
                }
            }


# Singleton instance
_enhanced_streaming_swarm_service = None

async def get_enhanced_streaming_swarm_service() -> EnhancedStreamingSwarmService:
    """Get or create the Enhanced Streaming Swarm Service instance"""
    global _enhanced_streaming_swarm_service
    if _enhanced_streaming_swarm_service is None:
        _enhanced_streaming_swarm_service = EnhancedStreamingSwarmService()
        await _enhanced_streaming_swarm_service._ensure_initialized()
    return _enhanced_streaming_swarm_service