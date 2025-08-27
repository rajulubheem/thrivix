"""
Improved Dynamic Swarm Service - Creates focused agent teams that actually use tools
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

logger = structlog.get_logger()
strands_logger = logging.getLogger("strands")
strands_logger.setLevel(logging.DEBUG)


class ImprovedDynamicSwarmService:
    """
    Improved Dynamic Swarm with focused agents that use tools
    """
    
    def __init__(self):
        self.active_executions = {}
        self._initialized = False
        
    async def _ensure_initialized(self):
        """Initialize the service"""
        if not self._initialized:
            self._initialized = True
            logger.info("✅ Improved Dynamic Swarm Service initialized")
    
    def _analyze_task_requirements(self, task: str) -> Dict[str, Any]:
        """Analyze task to determine optimal agent configuration"""
        task_lower = task.lower()
        
        requirements = {
            "primary_focus": self._determine_primary_focus(task_lower),
            "needs_research": any(word in task_lower for word in ["research", "find", "search", "analyze", "report", "investigate", "current", "latest"]),
            "needs_data": any(word in task_lower for word in ["data", "statistics", "metrics", "numbers", "analysis"]),
            "needs_synthesis": any(word in task_lower for word in ["comprehensive", "report", "summary", "document"]),
            "complexity": "high" if len(task) > 100 or "comprehensive" in task_lower else "medium"
        }
        
        return requirements
    
    def _determine_primary_focus(self, task_lower: str) -> str:
        """Determine the primary focus of the task"""
        if "code" in task_lower or "implement" in task_lower:
            return "coding"
        elif "research" in task_lower or "report" in task_lower:
            return "research"
        elif "data" in task_lower or "analyz" in task_lower:
            return "analysis"
        else:
            return "general"
    
    def _create_focused_agents(self, task: str, requirements: Dict, stream_queue: queue.Queue) -> List[Agent]:
        """Create a focused set of agents based on requirements"""
        agents = []
        model = OpenAIModel(
            client_args={"api_key": os.getenv("OPENAI_API_KEY")},
            model_id="gpt-4o-mini",
            params={"temperature": 0.7, "max_tokens": 4000}
        )
        
        # Always start with a primary researcher for research tasks
        if requirements["needs_research"]:
            primary_researcher = Agent(
                name="primary_researcher",
                model=model,
                system_prompt="""You are the primary researcher.
                YOUR FIRST ACTION: Use tavily_search IMMEDIATELY to find current information.
                
                CRITICAL INSTRUCTIONS:
                1. ALWAYS use tavily_search before any handoff
                2. Search multiple times with different queries for comprehensive coverage
                3. Focus on 2024/2025 data - add "latest", "current", "2024", "2025" to queries
                4. Search for: overview, current trends, applications, statistics, future outlook
                5. After gathering data, hand off to deep_researcher with your findings
                
                Example workflow:
                - Search: "[topic] overview 2024"
                - Search: "[topic] latest trends 2025"
                - Search: "[topic] applications current"
                - Search: "[topic] statistics data 2024"
                - Summarize findings for next agent""",
                tools=[self._create_search_tool(stream_queue)]
            )
            agents.append(primary_researcher)
            stream_queue.put({
                "type": "agent_created",
                "timestamp": datetime.utcnow().isoformat(),
                "agent": "primary_researcher",
                "role": "Lead Researcher - Gathers comprehensive data",
                "tools": ["tavily_search"]
            })
            
            # Add supplementary researcher for complex tasks
            if requirements["complexity"] == "high":
                deep_researcher = Agent(
                    name="deep_researcher",
                    model=model,
                    system_prompt="""You are a deep research specialist.
                    Focus on finding detailed, specific information.
                    
                    MUST DO:
                    1. Use tavily_search for in-depth queries
                    2. Find technical details, case studies, expert opinions
                    3. Search for challenges, limitations, controversies
                    4. Verify facts with multiple searches
                    5. Hand off to report_compiler with all findings
                    
                    After thorough investigation, summarize for report compilation.""",
                    tools=[self._create_search_tool(stream_queue)]
                )
                agents.append(deep_researcher)
                stream_queue.put({
                    "type": "agent_created",
                    "timestamp": datetime.utcnow().isoformat(),
                    "agent": "deep_researcher",
                    "role": "Deep Research - Detailed investigation",
                    "tools": ["tavily_search"]
                })
        
        # Add data analyst if needed
        if requirements["needs_data"]:
            data_analyst = Agent(
                name="data_analyst",
                model=model,
                system_prompt="""You are a data analyst.
                Analyze the research findings for patterns and insights.
                
                If you need more data, use tavily_search.
                If you need calculations, use python_repl.
                
                Focus on:
                - Key statistics and metrics
                - Trends and patterns
                - Data-driven insights
                - Quantitative analysis""",
                tools=[self._create_search_tool(stream_queue), self._create_python_tool(stream_queue)]
            )
            agents.append(data_analyst)
            stream_queue.put({
                "type": "agent_created",
                "timestamp": datetime.utcnow().isoformat(),
                "agent": "data_analyst",
                "role": "Data Analyst - Quantitative analysis",
                "tools": ["tavily_search", "python_repl"]
            })
        
        # Add report compiler for synthesis
        if requirements["needs_synthesis"]:
            report_compiler = Agent(
                name="report_compiler",
                model=model,
                system_prompt="""You are the report compiler.
                Compile ALL findings from previous agents into a comprehensive report.
                
                REPORT STRUCTURE:
                1. Executive Summary
                2. Current State (with 2024/2025 data)
                3. Key Findings (with specific numbers/dates)
                4. Applications/Use Cases
                5. Market Analysis (if applicable)
                6. Challenges and Opportunities
                7. Future Outlook
                8. Conclusion
                
                Include ALL data from primary_researcher and deep_researcher.
                Make it detailed and professional.
                Compile comprehensive report for final synthesis.""",
                tools=[]
            )
            agents.append(report_compiler)
            stream_queue.put({
                "type": "agent_created",
                "timestamp": datetime.utcnow().isoformat(),
                "agent": "report_compiler",
                "role": "Report Compiler - Creates final output",
                "tools": []
            })
        
        # Always add a final synthesizer
        final_synthesizer = Agent(
            name="final_synthesizer",
            model=model,
            system_prompt="""You are the final synthesizer.
            Review and enhance the compiled report.
            
            CHECK:
            - All sections are complete
            - Data is current (2024/2025)
            - Information is accurate
            - Format is professional
            
            Add any missing information using tavily_search if needed.
            Output the COMPLETE, FINAL report with all information.""",
            tools=[self._create_search_tool(stream_queue)]
        )
        agents.append(final_synthesizer)
        stream_queue.put({
            "type": "agent_created",
            "timestamp": datetime.utcnow().isoformat(),
            "agent": "final_synthesizer",
            "role": "Final Synthesizer - Quality assurance",
            "tools": ["tavily_search"]
        })
        
        logger.info(f"Created {len(agents)} focused agents for task")
        return agents
    
    def _create_search_tool(self, stream_queue: queue.Queue):
        """Create an enhanced search tool"""
        @tool
        def tavily_search(query: str) -> str:
            """Search the web for current information.
            
            Args:
                query: Search query - automatically enhanced with current year
            """
            import os
            from tavily import TavilyClient
            
            # Enhance query with current terms
            enhanced_query = f"{query} 2024 2025 latest current today"
            
            stream_queue.put({
                "type": "tool_execution",
                "timestamp": datetime.utcnow().isoformat(),
                "tool": "tavily_search",
                "params": {"query": query},
                "status": "searching"
            })
            
            try:
                client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
                response = client.search(
                    query=enhanced_query,
                    max_results=5,
                    search_depth="advanced",
                    include_answer=True,
                    include_raw_content=False,
                    include_images=False
                )
                
                result_text = f"=== Search Results for: {query} ===\n\n"
                
                # Include direct answer if available
                if response.get("answer"):
                    result_text += f"DIRECT ANSWER: {response['answer']}\n\n"
                
                # Format search results
                result_text += "DETAILED RESULTS:\n"
                for idx, r in enumerate(response.get("results", []), 1):
                    title = r.get('title', 'No title')
                    url = r.get('url', '')
                    content = r.get('content', '')
                    
                    result_text += f"\n{idx}. {title}\n"
                    result_text += f"   Source: {url}\n"
                    result_text += f"   Content: {content}\n"
                
                stream_queue.put({
                    "type": "tool_result",
                    "timestamp": datetime.utcnow().isoformat(),
                    "tool": "tavily_search",
                    "status": "success",
                    "results_count": len(response.get("results", [])),
                    "has_answer": bool(response.get("answer"))
                })
                
                return result_text
                
            except Exception as e:
                error_msg = f"Search error: {str(e)}"
                stream_queue.put({
                    "type": "tool_result",
                    "timestamp": datetime.utcnow().isoformat(),
                    "tool": "tavily_search",
                    "status": "error",
                    "error": str(e)
                })
                return error_msg
        
        return tavily_search
    
    def _create_python_tool(self, stream_queue: queue.Queue):
        """Create Python execution tool"""
        @tool
        def python_repl(code: str) -> str:
            """Execute Python code for calculations and analysis.
            
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
                "status": "executing"
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
                    "status": "error",
                    "error": str(e)
                })
                return f"Error: {str(e)}"
        
        return python_repl
    
    async def execute_improved_swarm(
        self,
        execution_id: str,
        task: str,
        conversation_history: Optional[List[Dict]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Execute improved dynamic swarm"""
        await self._ensure_initialized()
        
        stream_queue = queue.Queue()
        
        try:
            # Analyze task
            requirements = self._analyze_task_requirements(task)
            
            yield {
                "type": "task_analysis",
                "timestamp": datetime.utcnow().isoformat(),
                "primary_focus": requirements["primary_focus"],
                "complexity": requirements["complexity"],
                "message": f"Task analysis complete: {requirements['primary_focus']} focus with {requirements['complexity']} complexity"
            }
            
            # Create focused agents
            agents = self._create_focused_agents(task, requirements, stream_queue)
            
            yield {
                "type": "swarm_init",
                "timestamp": datetime.utcnow().isoformat(),
                "execution_id": execution_id,
                "agents": [a.name for a in agents],
                "agent_count": len(agents),
                "message": f"Created {len(agents)} focused agents"
            }
            
            # Configure swarm with appropriate limits
            swarm = Swarm(
                agents,
                max_handoffs=len(agents) * 3,  # Limited handoffs
                max_iterations=len(agents) * 5,  # Limited iterations
                execution_timeout=300.0,  # 5 minutes
                node_timeout=60.0,  # 1 minute per agent
                repetitive_handoff_detection_window=3,
                repetitive_handoff_min_unique_agents=2
            )
            
            yield {
                "type": "swarm_ready",
                "timestamp": datetime.utcnow().isoformat(),
                "message": "Swarm configured and ready to execute"
            }
            
            # Execute swarm
            result_container = {"result": None, "error": None, "completed": False}
            
            def run_swarm():
                try:
                    logger.info(f"Executing focused swarm with {len(agents)} agents")
                    result = swarm(task)
                    result_container["result"] = result
                    result_container["completed"] = True
                except Exception as e:
                    logger.error(f"Swarm execution failed: {e}")
                    result_container["error"] = str(e)
                    result_container["completed"] = True
            
            swarm_thread = threading.Thread(target=run_swarm)
            swarm_thread.start()
            
            # Monitor execution
            last_update = time.time()
            tool_count = 0
            
            while not result_container["completed"]:
                # Process events
                events_processed = 0
                while not stream_queue.empty() and events_processed < 10:
                    try:
                        event = stream_queue.get_nowait()
                        yield event
                        
                        # Track tool usage
                        if event.get("type") == "tool_execution":
                            tool_count += 1
                        
                        events_processed += 1
                    except queue.Empty:
                        break
                
                # Status update with tool count
                if time.time() - last_update > 3:
                    if swarm_thread.is_alive():
                        yield {
                            "type": "status",
                            "timestamp": datetime.utcnow().isoformat(),
                            "message": f"Processing... ({tool_count} tool calls made)",
                            "tool_count": tool_count
                        }
                    last_update = time.time()
                
                await asyncio.sleep(0.1)
            
            # Process remaining events
            while not stream_queue.empty():
                try:
                    event = stream_queue.get_nowait()
                    yield event
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
                output = self._extract_best_output(result_container["result"])
                
                yield {
                    "type": "complete",
                    "timestamp": datetime.utcnow().isoformat(),
                    "execution_id": execution_id,
                    "output": output,
                    "agents_used": len(agents),
                    "tools_used": tool_count,
                    "status": "completed"
                }
        
        except Exception as e:
            logger.error(f"Swarm service error: {e}", exc_info=True)
            yield {
                "type": "error",
                "timestamp": datetime.utcnow().isoformat(),
                "error": str(e)
            }
    
    def _extract_best_output(self, result) -> str:
        """Extract the best output from swarm result"""
        try:
            if hasattr(result, 'results'):
                # Priority order for final output
                priority_agents = ['final_synthesizer', 'report_compiler', 'deep_researcher', 'primary_researcher']
                
                # First try to get the final synthesizer or report compiler output
                for agent_name in priority_agents[:2]:
                    if agent_name in result.results:
                        output = self._extract_agent_output(result.results[agent_name])
                        # Skip handoff messages, look for actual reports
                        if output and len(output) > 500 and not output.startswith("The task has been"):
                            logger.info(f"Using output from {agent_name}")
                            return output
                
                # If no comprehensive report, combine outputs from all agents
                combined_output = []
                agent_outputs = {}
                
                for agent_name, node_result in result.results.items():
                    output = self._extract_agent_output(node_result)
                    if output and len(output) > 50:
                        agent_outputs[agent_name] = output
                
                # Build combined report if we have multiple agent outputs
                if len(agent_outputs) > 1:
                    combined_output.append("# Comprehensive Research Report\n")
                    
                    # Add outputs in priority order
                    for agent_name in priority_agents:
                        if agent_name in agent_outputs:
                            if agent_name == 'primary_researcher':
                                combined_output.append("## Research Findings\n")
                            elif agent_name == 'deep_researcher':
                                combined_output.append("\n## Deep Analysis\n")
                            elif agent_name == 'report_compiler':
                                combined_output.append("\n## Compiled Report\n")
                            elif agent_name == 'final_synthesizer':
                                combined_output.append("\n## Final Synthesis\n")
                            
                            combined_output.append(agent_outputs[agent_name])
                    
                    if combined_output:
                        return "\n".join(combined_output)
                
                # Fallback to any single substantial output
                for output in agent_outputs.values():
                    if len(output) > 100:
                        return output
        
        except Exception as e:
            logger.error(f"Error extracting output: {e}")
        
        return "Task completed but output extraction failed. Please try again."
    
    def _extract_agent_output(self, node_result) -> str:
        """Extract output from agent result"""
        try:
            if hasattr(node_result, 'result'):
                agent_result = node_result.result
                if hasattr(agent_result, 'message'):
                    message = agent_result.message
                    if isinstance(message, dict) and 'content' in message:
                        content = message['content']
                        if isinstance(content, list) and len(content) > 0:
                            # Get the last/most complete text content
                            texts = []
                            for item in content:
                                if isinstance(item, dict) and 'text' in item:
                                    texts.append(item['text'])
                            # Return the longest text (likely the most complete)
                            if texts:
                                return max(texts, key=len)
                        elif isinstance(content, str):
                            return content
                    elif isinstance(message, str):
                        return message
                
                # Also check for messages list (multiple outputs from same agent)
                if hasattr(agent_result, 'messages') and isinstance(agent_result.messages, list):
                    texts = []
                    for msg in agent_result.messages:
                        if isinstance(msg, dict) and 'content' in msg:
                            content = msg['content']
                            if isinstance(content, list):
                                for item in content:
                                    if isinstance(item, dict) and 'text' in item:
                                        texts.append(item['text'])
                            elif isinstance(content, str):
                                texts.append(content)
                    # Return the longest output
                    if texts:
                        return max(texts, key=len)
                        
        except Exception as e:
            logger.error(f"Error extracting agent output: {e}")
        return ""


# Singleton
_improved_dynamic_swarm_service = None

async def get_improved_dynamic_swarm_service() -> ImprovedDynamicSwarmService:
    global _improved_dynamic_swarm_service
    if _improved_dynamic_swarm_service is None:
        _improved_dynamic_swarm_service = ImprovedDynamicSwarmService()
        await _improved_dynamic_swarm_service._ensure_initialized()
    return _improved_dynamic_swarm_service