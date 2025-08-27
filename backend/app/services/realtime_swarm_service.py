"""
Real-time Swarm Service with true streaming and agent collaboration
"""
import asyncio
import json
import uuid
from typing import Optional, Callable, Dict, Any, List
from datetime import datetime
import structlog

try:
    from strands import Agent
    from strands.multiagent import Swarm
    STRANDS_AVAILABLE = True
except ImportError:
    STRANDS_AVAILABLE = False
    Agent = None
    Swarm = None

from app.schemas.swarm import (
    SwarmExecutionRequest,
    SwarmExecutionResponse,
    ExecutionStatus,
    AgentConfig,
    Artifact
)
from app.services.agent_factory import AgentFactory, AgentRole
from app.tools.strands_tavily_search import tavily_search

logger = structlog.get_logger()


class RealtimeSwarmService:
    """Real-time swarm service with true streaming and agent handoff"""
    
    def __init__(self):
        self.active_executions = {}
        self.agent_factory = AgentFactory()
        self.agent_contexts = {}  # Store context between agents
        
    async def execute_swarm_async(
        self,
        request: SwarmExecutionRequest,
        user_id: str,
        callback_handler: Optional[Callable] = None
    ) -> SwarmExecutionResponse:
        """Execute swarm with real-time streaming and true agent collaboration"""
        
        if not STRANDS_AVAILABLE:
            return SwarmExecutionResponse(
                execution_id=str(uuid.uuid4()),
                status=ExecutionStatus.FAILED,
                error="Strands library not installed"
            )
        
        execution_id = request.execution_id or str(uuid.uuid4())
        self.active_executions[execution_id] = {
            "status": "running",
            "start_time": datetime.utcnow(),
            "user_id": user_id
        }
        
        # Initialize agent context storage
        self.agent_contexts[execution_id] = {
            "shared_memory": {},
            "agent_outputs": {},
            "handoff_chain": [],
            "current_task": request.task
        }
        
        try:
            # Initialize dynamic agent builder
            await self.agent_factory.initialize_dynamic_builder()
            
            # Get or create agent configurations
            if not request.agents or len(request.agents) == 0:
                available_tools = ["tavily_search"]
                agent_configs = self.agent_factory.get_agents_for_task(request.task, available_tools)
            else:
                agent_configs = request.agents
                
            logger.info(f"📋 Using agents: {[a.name for a in agent_configs]}")
            
            # Create agents with handoff capabilities
            strands_agents = await self._create_collaborative_agents(
                agent_configs, execution_id
            )
            
            # Send start event
            if callback_handler:
                await callback_handler(
                    type="execution_started",
                    data={
                        "task": request.task,
                        "agents": [a.name for a in strands_agents]
                    }
                )
            
            # Execute with streaming by default
            # Check if execution_mode is specified (may not exist in schema)
            execution_mode = getattr(request, 'execution_mode', 'streaming')
            
            if execution_mode == "collaborative":
                return await self._execute_collaborative_swarm(
                    strands_agents, request, execution_id, callback_handler
                )
            else:
                return await self._execute_streaming_swarm(
                    strands_agents, request, execution_id, callback_handler
                )
                
        except Exception as e:
            logger.error(f"Execution failed: {e}", exc_info=True)
            
            if callback_handler:
                await callback_handler(
                    type="execution_failed",
                    data={"error": str(e)}
                )
            
            return SwarmExecutionResponse(
                execution_id=execution_id,
                status=ExecutionStatus.FAILED,
                error=str(e)
            )
        finally:
            if execution_id in self.active_executions:
                del self.active_executions[execution_id]
            if execution_id in self.agent_contexts:
                del self.agent_contexts[execution_id]
    
    async def _create_collaborative_agents(
        self, 
        agent_configs: List[AgentConfig],
        execution_id: str
    ) -> List['Agent']:
        """Create agents with collaboration capabilities"""
        
        agents = []
        agent_map = {}
        
        for config in agent_configs:
            # Enhanced system prompt for collaboration
            collaborative_prompt = f"""
{config.system_prompt}

COLLABORATION GUIDELINES:
- You are part of a team working on: {self.agent_contexts[execution_id]['current_task']}
- Build upon the work of previous agents
- Pass clear context to the next agent
- If you need specific expertise, handoff to the appropriate specialist
- Summarize your key findings for the next agent
"""
            
            # Create agent with tools
            tools = []
            if config.tools and "tavily_search" in config.tools:
                # For now, skip tools as Strands may need specific tool format
                # TODO: Integrate tavily_search properly with Strands
                pass
            
            agent = Agent(
                name=config.name,
                system_prompt=collaborative_prompt,
                tools=tools
            )
            
            agents.append(agent)
            agent_map[config.name] = agent
            
        # Store agent map for handoff resolution
        self.agent_contexts[execution_id]['agent_map'] = agent_map
        
        return agents
    
    async def _execute_streaming_swarm(
        self,
        agents: List['Agent'],
        request: SwarmExecutionRequest,
        execution_id: str,
        callback_handler: Optional[Callable]
    ) -> SwarmExecutionResponse:
        """Execute with real-time streaming and context passing"""
        
        context = self.agent_contexts[execution_id]
        all_outputs = []
        all_artifacts = []
        total_tokens = 0
        
        current_task = request.task
        
        for i, agent in enumerate(agents):
            # Prepare task with context from previous agents
            if i > 0 and all_outputs:
                task_with_context = f"""
Original Task: {request.task}

Previous Work by Team:
{self._format_previous_work(all_outputs)}

Your Turn ({agent.name}):
Please continue the work. Focus on your specialty and build upon what has been done.
Current objective: {current_task}
"""
            else:
                task_with_context = current_task
            
            # Stream agent execution with real-time chunks
            result = await self._stream_agent_realtime(
                agent=agent,
                task=task_with_context,
                execution_id=execution_id,
                callback_handler=callback_handler
            )
            
            # Store agent output for context
            if result["output"]:
                agent_output = {
                    "agent": agent.name,
                    "output": result["output"],
                    "summary": result.get("summary", ""),
                    "next_task": result.get("next_task", "")
                }
                all_outputs.append(agent_output)
                context['agent_outputs'][agent.name] = agent_output
            
            # Check for explicit handoff
            if result.get("handoff_to"):
                next_agent = result["handoff_to"]
                handoff_reason = result.get("handoff_reason", "Task continuation")
                
                # Send handoff event
                if callback_handler:
                    await callback_handler(
                        type="handoff",
                        data={
                            "from_agent": agent.name,
                            "to_agent": next_agent,
                            "reason": handoff_reason
                        }
                    )
                
                # Update task for next agent
                current_task = result.get("next_task", current_task)
                context['handoff_chain'].append({
                    "from": agent.name,
                    "to": next_agent,
                    "reason": handoff_reason
                })
            
            all_artifacts.extend(result.get("artifacts", []))
            total_tokens += result.get("tokens", 0)
        
        # Compile final response
        final_response = self._compile_collaborative_response(all_outputs, all_artifacts)
        
        # Send completion
        if callback_handler:
            await callback_handler(
                type="execution_completed",
                data={
                    "result": {
                        "final_response": final_response,
                        "artifacts": all_artifacts,
                        "collaboration_chain": context['handoff_chain']
                    }
                }
            )
        
        return SwarmExecutionResponse(
            execution_id=execution_id,
            status=ExecutionStatus.COMPLETED,
            result=final_response,
            handoffs=len(context['handoff_chain']),
            tokens_used=total_tokens,
            agent_sequence=[a.name for a in agents],
            artifacts=all_artifacts
        )
    
    async def _execute_collaborative_swarm(
        self,
        agents: List['Agent'],
        request: SwarmExecutionRequest,
        execution_id: str,
        callback_handler: Optional[Callable]
    ) -> SwarmExecutionResponse:
        """Execute using native Swarm with enhanced collaboration"""
        
        try:
            # Create collaborative swarm
            swarm = Swarm(
                agents,
                max_handoffs=request.max_handoffs or 20,
                max_iterations=request.max_iterations or 20
            )
            
            # Execute with streaming
            result = await self._stream_swarm_execution(
                swarm, request.task, execution_id, callback_handler
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Collaborative swarm failed: {e}", exc_info=True)
            raise
    
    async def _stream_agent_realtime(
        self,
        agent: 'Agent',
        task: str,
        execution_id: str,
        callback_handler: Optional[Callable]
    ) -> Dict[str, Any]:
        """Stream agent execution with real-time chunk sending"""
        
        # Send agent start immediately
        if callback_handler:
            await callback_handler(
                type="agent_started",
                agent=agent.name,
                data={"task": task[:200]}
            )
        
        response_text = ""
        chunk_buffer = ""
        tokens = 0
        artifacts = []
        
        try:
            # Use stream_async for real-time streaming
            agent_stream = agent.stream_async(task)
            
            async for event in agent_stream:
                if execution_id not in self.active_executions:
                    break
                
                # Handle text generation - send immediately
                if "data" in event:
                    text_chunk = event["data"]
                    response_text += text_chunk
                    chunk_buffer += text_chunk
                    
                    # Send small chunks immediately for real-time feel
                    if len(chunk_buffer) >= 5 or text_chunk.endswith(('.', '!', '?', '\n')):
                        if callback_handler:
                            await callback_handler(
                                type="text_generation",
                                agent=agent.name,
                                data={
                                    "text": chunk_buffer,
                                    "accumulated": response_text
                                }
                            )
                        chunk_buffer = ""
                
                # Handle tool calls with immediate feedback
                elif "current_tool_use" in event:
                    tool_info = event["current_tool_use"]
                    tool_name = tool_info.get("name", "unknown")
                    
                    # Send tool call event immediately
                    if callback_handler:
                        await callback_handler(
                            type="tool_call",
                            agent=agent.name,
                            data={
                                "tool": tool_name,
                                "parameters": tool_info.get("input", {})
                            }
                        )
                    
                    # Add visual feedback for tool execution
                    tool_feedback = f"\n🔧 Using tool: {tool_name}\n"
                    response_text += tool_feedback
                    
                    if callback_handler:
                        await callback_handler(
                            type="text_generation",
                            agent=agent.name,
                            data={
                                "text": tool_feedback,
                                "accumulated": response_text
                            }
                        )
                
                # Handle tool results with immediate display
                elif "tool_result" in event:
                    tool_result = event["tool_result"]
                    tool_name = event.get("tool_name", "tool")
                    
                    # Format and send tool result immediately
                    if callback_handler:
                        await callback_handler(
                            type="tool_result",
                            agent=agent.name,
                            data={
                                "tool": tool_name,
                                "result": tool_result
                            }
                        )
                    
                    # Add formatted result to response
                    if isinstance(tool_result, dict):
                        if tool_result.get("results"):
                            result_text = f"\n📊 Found {len(tool_result['results'])} results\n"
                            response_text += result_text
                            
                            if callback_handler:
                                await callback_handler(
                                    type="text_generation",
                                    agent=agent.name,
                                    data={
                                        "text": result_text,
                                        "accumulated": response_text
                                    }
                                )
            
            # Flush any remaining buffer
            if chunk_buffer and callback_handler:
                await callback_handler(
                    type="text_generation",
                    agent=agent.name,
                    data={
                        "text": chunk_buffer,
                        "accumulated": response_text
                    }
                )
            
            # Extract handoff information from response
            handoff_info = self._extract_handoff_info(response_text)
            
            # Send completion
            if callback_handler:
                await callback_handler(
                    type="agent_completed",
                    agent=agent.name,
                    data={
                        "output": response_text,
                        "tokens": tokens
                    }
                )
            
            return {
                "output": response_text,
                "artifacts": artifacts,
                "tokens": tokens,
                **handoff_info
            }
            
        except Exception as e:
            logger.error(f"Agent {agent.name} streaming error: {e}", exc_info=True)
            
            if callback_handler:
                await callback_handler(
                    type="agent_error",
                    agent=agent.name,
                    data={"error": str(e)}
                )
            
            return {
                "output": f"Error: {str(e)}",
                "artifacts": [],
                "tokens": 0
            }
    
    async def _stream_swarm_execution(
        self,
        swarm: 'Swarm',
        task: str,
        execution_id: str,
        callback_handler: Optional[Callable]
    ) -> SwarmExecutionResponse:
        """Stream native swarm execution with real-time updates"""
        
        # This would integrate with Strands native swarm streaming
        # For now, using the invoke_async method
        result = await swarm.invoke_async(task)
        
        # Process and return result
        final_response = ""
        artifacts = []
        
        if result.results:
            for node_id, node_result in result.results.items():
                if node_result.result:
                    final_response += f"\n## {node_id}\n{node_result.result}\n"
        
        return SwarmExecutionResponse(
            execution_id=execution_id,
            status=ExecutionStatus.COMPLETED,
            result=final_response,
            handoffs=len(result.node_history) - 1 if result.node_history else 0,
            execution_count=result.execution_count,
            execution_time_ms=result.execution_time,
            agent_sequence=[node.node_id for node in result.node_history] if result.node_history else [],
            artifacts=artifacts
        )
    
    def _format_previous_work(self, outputs: List[Dict]) -> str:
        """Format previous agent outputs for context"""
        formatted = []
        for output in outputs[-3:]:  # Last 3 agents for context
            formatted.append(f"""
**{output['agent']}:**
{output.get('summary') or output['output'][:500]}
""")
        return "\n".join(formatted)
    
    def _extract_handoff_info(self, text: str) -> Dict[str, Any]:
        """Extract handoff information from agent response"""
        handoff_info = {}
        
        # Look for explicit handoff patterns
        if "HANDOFF TO:" in text:
            parts = text.split("HANDOFF TO:")
            if len(parts) > 1:
                next_agent = parts[1].split('\n')[0].strip()
                handoff_info['handoff_to'] = next_agent
        
        if "NEXT TASK:" in text:
            parts = text.split("NEXT TASK:")
            if len(parts) > 1:
                next_task = parts[1].split('\n')[0].strip()
                handoff_info['next_task'] = next_task
        
        if "SUMMARY:" in text:
            parts = text.split("SUMMARY:")
            if len(parts) > 1:
                summary = parts[1].split('\n\n')[0].strip()
                handoff_info['summary'] = summary
        
        return handoff_info
    
    def _compile_collaborative_response(
        self, 
        outputs: List[Dict], 
        artifacts: List[Dict]
    ) -> str:
        """Compile collaborative agent outputs into final response"""
        
        response = "# Task Completed Through Collaboration\n\n"
        
        # Add collaboration summary
        response += "## Agent Collaboration Chain\n\n"
        for i, output in enumerate(outputs, 1):
            response += f"**{i}. {output['agent']}**\n"
            if output.get('summary'):
                response += f"{output['summary']}\n\n"
            else:
                response += f"{output['output'][:200]}...\n\n"
        
        # Add final result
        if outputs:
            response += "\n## Final Result\n\n"
            response += outputs[-1]['output']
        
        # Add artifacts
        if artifacts:
            response += "\n\n## Generated Artifacts\n\n"
            for artifact in artifacts:
                response += f"- **{artifact['name']}** ({artifact.get('type', 'file')})\n"
        
        return response