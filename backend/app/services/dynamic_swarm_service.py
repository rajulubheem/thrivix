"""
Dynamic Swarm Service - Creates agents dynamically based on task requirements
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
from strands_tools import swarm as swarm_tool  # For dynamic swarm creation

logger = structlog.get_logger()
strands_logger = logging.getLogger("strands")
strands_logger.setLevel(logging.DEBUG)


class DynamicSwarmService:
    """
    Dynamic Swarm that creates agents based on task analysis
    """
    
    def __init__(self):
        self.active_executions = {}
        self._initialized = False
        
    async def _ensure_initialized(self):
        """Initialize the service"""
        if not self._initialized:
            self._initialized = True
            logger.info("✅ Dynamic Swarm Service initialized")
    
    def _analyze_task_requirements(self, task: str) -> Dict[str, Any]:
        """Analyze the task to determine what types of agents are needed"""
        task_lower = task.lower()
        
        # Determine task complexity and requirements
        requirements = {
            "needs_research": any(word in task_lower for word in ["research", "find", "search", "analyze", "report", "investigate"]),
            "needs_coding": any(word in task_lower for word in ["code", "implement", "build", "develop", "program", "api", "function"]),
            "needs_data_analysis": any(word in task_lower for word in ["data", "statistics", "metrics", "analyze", "chart", "graph"]),
            "needs_design": any(word in task_lower for word in ["design", "architecture", "system", "structure", "plan"]),
            "needs_review": any(word in task_lower for word in ["review", "check", "validate", "test", "quality"]),
            "needs_writing": any(word in task_lower for word in ["write", "document", "report", "summary", "explain"]),
            "needs_math": any(word in task_lower for word in ["calculate", "compute", "math", "equation", "formula"]),
            "needs_visualization": any(word in task_lower for word in ["visualize", "chart", "graph", "plot", "diagram"]),
            "is_complex": len(task) > 100 or task.count(",") > 2 or "comprehensive" in task_lower
        }
        
        return requirements
    
    def _create_dynamic_agents(self, task: str, stream_queue: queue.Queue) -> List[Agent]:
        """Dynamically create agents based on task requirements"""
        requirements = self._analyze_task_requirements(task)
        agents = []
        
        # Create base model configuration
        model = OpenAIModel(
            client_args={"api_key": os.getenv("OPENAI_API_KEY")},
            model_id="gpt-4o-mini",
            params={"temperature": 0.7, "max_tokens": 4000}
        )
        
        # Always include a coordinator for complex tasks
        if requirements["is_complex"]:
            coordinator = Agent(
                name="coordinator",
                model=model,
                system_prompt="""You are the swarm coordinator.
                Analyze the task and coordinate with specialized agents.
                Break down complex tasks and delegate to appropriate specialists.
                Synthesize results from multiple agents.""",
                tools=[]
            )
            agents.append(coordinator)
            stream_queue.put({
                "type": "agent_created",
                "timestamp": datetime.utcnow().isoformat(),
                "agent": "coordinator",
                "role": "Task Coordinator",
                "reason": "Complex task requiring coordination"
            })
        
        # Create specialized agents based on requirements
        if requirements["needs_research"]:
            # Create research team
            researchers = [
                Agent(
                    name="lead_researcher",
                    model=model,
                    system_prompt="""You are the lead researcher.
                    Search for comprehensive, current information.
                    Focus on finding 2024/2025 data and latest developments.
                    Coordinate with other researchers for different aspects.""",
                    tools=[self._create_search_tool(stream_queue)]
                ),
                Agent(
                    name="fact_checker",
                    model=model,
                    system_prompt="""You are a fact checker.
                    Verify information accuracy and find authoritative sources.
                    Cross-reference data from multiple sources.""",
                    tools=[self._create_search_tool(stream_queue)]
                ),
                Agent(
                    name="trend_analyst",
                    model=model,
                    system_prompt="""You are a trend analyst.
                    Identify patterns, trends, and future projections.
                    Analyze market movements and industry developments.""",
                    tools=[self._create_search_tool(stream_queue)]
                )
            ]
            agents.extend(researchers)
            for r in researchers:
                stream_queue.put({
                    "type": "agent_created",
                    "timestamp": datetime.utcnow().isoformat(),
                    "agent": r.name,
                    "role": "Research Team",
                    "reason": "Research requirements detected"
                })
        
        if requirements["needs_data_analysis"]:
            # Create data analysis team
            data_agents = [
                Agent(
                    name="data_collector",
                    model=model,
                    system_prompt="""You are a data collection specialist.
                    Gather relevant data from various sources.
                    Organize and structure data for analysis.""",
                    tools=[self._create_search_tool(stream_queue), self._create_python_tool(stream_queue)]
                ),
                Agent(
                    name="statistician",
                    model=model,
                    system_prompt="""You are a statistician.
                    Perform statistical analysis and calculations.
                    Identify significant patterns and correlations.""",
                    tools=[self._create_python_tool(stream_queue)]
                ),
                Agent(
                    name="insight_generator",
                    model=model,
                    system_prompt="""You are an insight generator.
                    Transform data analysis into actionable insights.
                    Create clear conclusions and recommendations.""",
                    tools=[]
                )
            ]
            agents.extend(data_agents)
            for a in data_agents:
                stream_queue.put({
                    "type": "agent_created",
                    "timestamp": datetime.utcnow().isoformat(),
                    "agent": a.name,
                    "role": "Data Analysis Team",
                    "reason": "Data analysis requirements detected"
                })
        
        if requirements["needs_coding"]:
            # Create development team
            dev_agents = [
                Agent(
                    name="architect",
                    model=model,
                    system_prompt="""You are a system architect.
                    Design system architecture and define interfaces.
                    Create technical specifications and data models.""",
                    tools=[]
                ),
                Agent(
                    name="developer",
                    model=model,
                    system_prompt="""You are a software developer.
                    Implement solutions based on specifications.
                    Write clean, efficient, documented code.""",
                    tools=[self._create_python_tool(stream_queue)]
                ),
                Agent(
                    name="tester",
                    model=model,
                    system_prompt="""You are a QA specialist.
                    Test implementations and find bugs.
                    Ensure code quality and functionality.""",
                    tools=[self._create_python_tool(stream_queue)]
                ),
                Agent(
                    name="code_reviewer",
                    model=model,
                    system_prompt="""You are a code reviewer.
                    Review code for best practices and improvements.
                    Ensure security and performance standards.""",
                    tools=[]
                )
            ]
            agents.extend(dev_agents)
            for a in dev_agents:
                stream_queue.put({
                    "type": "agent_created",
                    "timestamp": datetime.utcnow().isoformat(),
                    "agent": a.name,
                    "role": "Development Team",
                    "reason": "Coding requirements detected"
                })
        
        if requirements["needs_writing"]:
            # Create writing team
            writers = [
                Agent(
                    name="content_strategist",
                    model=model,
                    system_prompt="""You are a content strategist.
                    Plan document structure and content flow.
                    Ensure comprehensive coverage of topics.""",
                    tools=[]
                ),
                Agent(
                    name="technical_writer",
                    model=model,
                    system_prompt="""You are a technical writer.
                    Create clear, detailed documentation.
                    Explain complex concepts simply.""",
                    tools=[]
                ),
                Agent(
                    name="editor",
                    model=model,
                    system_prompt="""You are an editor.
                    Review and polish content for clarity.
                    Ensure consistency and quality.""",
                    tools=[]
                )
            ]
            agents.extend(writers)
            for w in writers:
                stream_queue.put({
                    "type": "agent_created",
                    "timestamp": datetime.utcnow().isoformat(),
                    "agent": w.name,
                    "role": "Writing Team",
                    "reason": "Writing requirements detected"
                })
        
        if requirements["needs_visualization"]:
            visualizer = Agent(
                name="visualizer",
                model=model,
                system_prompt="""You are a data visualization specialist.
                Create charts, graphs, and diagrams.
                Make data visually compelling and easy to understand.""",
                tools=[self._create_python_tool(stream_queue)]
            )
            agents.append(visualizer)
            stream_queue.put({
                "type": "agent_created",
                "timestamp": datetime.utcnow().isoformat(),
                "agent": "visualizer",
                "role": "Visualization Specialist",
                "reason": "Visualization requirements detected"
            })
        
        # Always add a synthesizer for final output
        synthesizer = Agent(
            name="synthesizer",
            model=model,
            system_prompt="""You are the final synthesizer.
            Combine all findings into a comprehensive output.
            Ensure completeness and quality of the final result.
            Create executive summaries and key takeaways.""",
            tools=[]
        )
        agents.append(synthesizer)
        stream_queue.put({
            "type": "agent_created",
            "timestamp": datetime.utcnow().isoformat(),
            "agent": "synthesizer",
            "role": "Final Synthesizer",
            "reason": "Needed for final output synthesis"
        })
        
        # If no specific requirements detected, create a general team
        if len(agents) < 3:
            general_agents = [
                Agent(
                    name="researcher",
                    model=model,
                    system_prompt="You are a general researcher. Find relevant information.",
                    tools=[self._create_search_tool(stream_queue)]
                ),
                Agent(
                    name="analyst",
                    model=model,
                    system_prompt="You are an analyst. Analyze findings and provide insights.",
                    tools=[]
                ),
                Agent(
                    name="specialist",
                    model=model,
                    system_prompt="You are a specialist. Complete specific tasks thoroughly.",
                    tools=[self._create_search_tool(stream_queue), self._create_python_tool(stream_queue)]
                )
            ]
            agents.extend(general_agents)
            for a in general_agents:
                stream_queue.put({
                    "type": "agent_created",
                    "timestamp": datetime.utcnow().isoformat(),
                    "agent": a.name,
                    "role": "General Team",
                    "reason": "Default team for general tasks"
                })
        
        logger.info(f"Created {len(agents)} agents dynamically for task")
        return agents
    
    def _create_search_tool(self, stream_queue: queue.Queue):
        """Create search tool with streaming"""
        @tool
        def tavily_search(query: str) -> str:
            """Search the web for information."""
            import os
            from tavily import TavilyClient
            
            stream_queue.put({
                "type": "tool_execution",
                "timestamp": datetime.utcnow().isoformat(),
                "tool": "tavily_search",
                "params": {"query": query}
            })
            
            try:
                client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
                response = client.search(
                    query=query + " 2024 2025 latest current",
                    max_results=5,
                    search_depth="advanced",
                    include_answer=True
                )
                
                result_text = f"Search results for '{query}':\n\n"
                if response.get("answer"):
                    result_text += f"Answer: {response['answer']}\n\n"
                
                for idx, r in enumerate(response.get("results", []), 1):
                    result_text += f"{idx}. {r.get('title', '')}\n"
                    result_text += f"   {r.get('content', '')[:300]}...\n\n"
                
                stream_queue.put({
                    "type": "tool_result",
                    "timestamp": datetime.utcnow().isoformat(),
                    "tool": "tavily_search",
                    "status": "success"
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
                return f"Error: {str(e)}"
        
        return tavily_search
    
    def _create_python_tool(self, stream_queue: queue.Queue):
        """Create Python execution tool"""
        @tool
        def python_repl(code: str) -> str:
            """Execute Python code."""
            import io
            import sys
            import contextlib
            
            stream_queue.put({
                "type": "tool_execution",
                "timestamp": datetime.utcnow().isoformat(),
                "tool": "python_repl",
                "params": {"code": code[:100] + "..."}
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
                    "status": "success"
                })
                
                return result if result else "Code executed successfully"
            except Exception as e:
                stream_queue.put({
                    "type": "tool_result",
                    "timestamp": datetime.utcnow().isoformat(),
                    "tool": "python_repl",
                    "status": "error"
                })
                return f"Error: {str(e)}"
        
        return python_repl
    
    async def execute_dynamic_swarm(
        self,
        execution_id: str,
        task: str,
        max_handoffs: int = 30,  # More handoffs for larger teams
        max_iterations: int = 50,  # More iterations for complex tasks
        conversation_history: Optional[List[Dict]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Execute dynamic swarm with task-specific agents"""
        await self._ensure_initialized()
        
        stream_queue = queue.Queue()
        
        try:
            # Analyze task
            requirements = self._analyze_task_requirements(task)
            
            yield {
                "type": "task_analysis",
                "timestamp": datetime.utcnow().isoformat(),
                "task": task,
                "requirements": requirements,
                "message": f"Analyzing task requirements..."
            }
            
            # Create agents dynamically
            yield {
                "type": "creating_agents",
                "timestamp": datetime.utcnow().isoformat(),
                "message": "Creating specialized agent teams based on task requirements..."
            }
            
            agents = self._create_dynamic_agents(task, stream_queue)
            
            yield {
                "type": "swarm_init",
                "execution_id": execution_id,
                "timestamp": datetime.utcnow().isoformat(),
                "agents": [a.name for a in agents],
                "agent_count": len(agents),
                "task": task,
                "message": f"Created {len(agents)} specialized agents"
            }
            
            # Create the swarm
            swarm = Swarm(
                agents,
                max_handoffs=max_handoffs,
                max_iterations=max_iterations,
                execution_timeout=600.0,  # 10 minutes for complex tasks
                node_timeout=120.0,  # 2 minutes per agent
                repetitive_handoff_detection_window=10,
                repetitive_handoff_min_unique_agents=4
            )
            
            yield {
                "type": "swarm_ready",
                "timestamp": datetime.utcnow().isoformat(),
                "message": f"Swarm ready with {len(agents)} agents organized into specialized teams"
            }
            
            # Run swarm
            result_container = {"result": None, "error": None, "completed": False}
            
            def run_swarm():
                try:
                    logger.info(f"Starting dynamic swarm with {len(agents)} agents")
                    result = swarm(task)
                    result_container["result"] = result
                    result_container["completed"] = True
                except Exception as e:
                    logger.error(f"Swarm failed: {e}")
                    result_container["error"] = str(e)
                    result_container["completed"] = True
            
            swarm_thread = threading.Thread(target=run_swarm)
            swarm_thread.start()
            
            # Monitor execution
            monitor = SwarmMonitor(stream_queue, agents)
            strands_logger.addHandler(monitor)
            
            last_update = time.time()
            
            while not result_container["completed"]:
                # Process events
                events = 0
                while not stream_queue.empty() and events < 10:
                    try:
                        event = stream_queue.get_nowait()
                        yield event
                        events += 1
                    except queue.Empty:
                        break
                
                # Status update
                if time.time() - last_update > 3:
                    if swarm_thread.is_alive():
                        yield {
                            "type": "status",
                            "timestamp": datetime.utcnow().isoformat(),
                            "message": f"Swarm processing with {len(agents)} agents..."
                        }
                    last_update = time.time()
                
                await asyncio.sleep(0.1)
            
            # Clean up remaining events
            while not stream_queue.empty():
                try:
                    yield stream_queue.get_nowait()
                except queue.Empty:
                    break
            
            swarm_thread.join(timeout=1)
            
            # Process result
            if result_container["error"]:
                yield {
                    "type": "error",
                    "timestamp": datetime.utcnow().isoformat(),
                    "error": result_container["error"]
                }
            elif result_container["result"]:
                output = self._extract_output(result_container["result"])
                
                yield {
                    "type": "complete",
                    "timestamp": datetime.utcnow().isoformat(),
                    "execution_id": execution_id,
                    "output": output,
                    "agents_used": len(agents),
                    "status": "completed"
                }
        
        finally:
            if 'monitor' in locals():
                strands_logger.removeHandler(monitor)
    
    def _extract_output(self, result) -> str:
        """Extract final output from swarm result"""
        try:
            if hasattr(result, 'results'):
                # Try synthesizer first
                if 'synthesizer' in result.results:
                    node_result = result.results['synthesizer']
                    if hasattr(node_result, 'result'):
                        return self._extract_message(node_result.result)
                
                # Then try other agents
                for node_name, node_result in result.results.items():
                    if hasattr(node_result, 'result'):
                        output = self._extract_message(node_result.result)
                        if output and output != "Task completed":
                            return output
        except Exception as e:
            logger.error(f"Error extracting output: {e}")
        
        return "Task completed"
    
    def _extract_message(self, agent_result) -> str:
        """Extract message from agent result"""
        if hasattr(agent_result, 'message'):
            message = agent_result.message
            if isinstance(message, dict) and 'content' in message:
                content = message['content']
                if isinstance(content, list) and len(content) > 0:
                    if isinstance(content[0], dict) and 'text' in content[0]:
                        return content[0]['text']
                elif isinstance(content, str):
                    return content
            elif isinstance(message, str):
                return message
        return ""


class SwarmMonitor(logging.Handler):
    """Monitor swarm execution"""
    def __init__(self, stream_queue: queue.Queue, agents: List[Agent]):
        super().__init__()
        self.stream_queue = stream_queue
        self.agent_names = [a.name for a in agents]
        
    def emit(self, record):
        msg = record.getMessage()
        
        # Detect agent activity
        for agent_name in self.agent_names:
            if agent_name in msg:
                if "executing" in msg.lower():
                    self.stream_queue.put({
                        "type": "agent_active",
                        "timestamp": datetime.utcnow().isoformat(),
                        "agent": agent_name,
                        "message": f"{agent_name} is executing"
                    })
                elif "handoff" in msg.lower():
                    self.stream_queue.put({
                        "type": "handoff",
                        "timestamp": datetime.utcnow().isoformat(),
                        "message": f"Handoff involving {agent_name}"
                    })


# Singleton
_dynamic_swarm_service = None

async def get_dynamic_swarm_service() -> DynamicSwarmService:
    global _dynamic_swarm_service
    if _dynamic_swarm_service is None:
        _dynamic_swarm_service = DynamicSwarmService()
        await _dynamic_swarm_service._ensure_initialized()
    return _dynamic_swarm_service