"""
Enhanced Swarm Service using Strands native streaming with proper tool support
"""
import asyncio
import json
import os
import re
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

# Import tools if available
try:
    from strands_tools import (
        web_search,
        workflow,
        swarm as swarm_tool,
        code_interpreter,
        document_analysis,
        diagram_generator,
        tech_stack_analyzer,
        code_generator,
        data_analyzer,
        ml_toolkit,
        visualization_generator,
        infrastructure_generator,
        pipeline_builder,
        security_scanner,
        vulnerability_analyzer,
        test_generator,
        test_runner,
        code_analyzer,
        report_generator,
        design_generator,
        css_builder,
        markdown_generator,
        api_doc_generator,
        api_generator,
        schema_builder,
        schema_designer,
        query_optimizer,
        model_deployer,
        component_generator,
        state_manager,
        service_generator,
        auth_builder,
        cloud_designer,
        cost_optimizer,
        task_planner,
        timeline_generator,
        requirement_analyzer,
        process_mapper,
        test_automation,
        defect_tracker
    )
    STRANDS_TOOLS_AVAILABLE = True
    
    # Map tool names to actual tool objects
    TOOL_REGISTRY = {
        "web_search": web_search,
        "workflow": workflow,
        "swarm": swarm_tool,
        "code_interpreter": code_interpreter,
        "document_analysis": document_analysis,
        "diagram_generator": diagram_generator,
        "tech_stack_analyzer": tech_stack_analyzer,
        "code_generator": code_generator,
        "data_analyzer": data_analyzer,
        "ml_toolkit": ml_toolkit,
        "visualization_generator": visualization_generator,
        "infrastructure_generator": infrastructure_generator,
        "pipeline_builder": pipeline_builder,
        "security_scanner": security_scanner,
        "vulnerability_analyzer": vulnerability_analyzer,
        "test_generator": test_generator,
        "test_runner": test_runner,
        "code_analyzer": code_analyzer,
        "report_generator": report_generator,
        "design_generator": design_generator,
        "css_builder": css_builder,
        "markdown_generator": markdown_generator,
        "api_doc_generator": api_doc_generator,
        "api_generator": api_generator,
        "schema_builder": schema_builder,
        "schema_designer": schema_designer,
        "query_optimizer": query_optimizer,
        "model_deployer": model_deployer,
        "component_generator": component_generator,
        "state_manager": state_manager,
        "service_generator": service_generator,
        "auth_builder": auth_builder,
        "cloud_designer": cloud_designer,
        "cost_optimizer": cost_optimizer,
        "task_planner": task_planner,
        "timeline_generator": timeline_generator,
        "requirement_analyzer": requirement_analyzer,
        "process_mapper": process_mapper,
        "test_automation": test_automation,
        "defect_tracker": defect_tracker
    }
except ImportError:
    STRANDS_TOOLS_AVAILABLE = False
    TOOL_REGISTRY = {}
    logger = structlog.get_logger()
    logger.warning("strands_tools not available. Tools will be disabled.")

from app.schemas.swarm import (
    SwarmExecutionRequest,
    SwarmExecutionResponse,
    ExecutionStatus,
    AgentConfig,
    Artifact
)
from app.services.agent_factory import AgentFactory, AgentRole

logger = structlog.get_logger()


class StrandsSwarmService:
    """Swarm Service using Strands native async streaming with proper tool support"""
    
    def __init__(self):
        self.active_executions = {}
        self.agent_factory = AgentFactory()
        
        if not STRANDS_AVAILABLE:
            logger.warning("Strands library not available. Install with: pip install strands")
        
        if not STRANDS_TOOLS_AVAILABLE:
            logger.warning("strands_tools not available. Install with: pip install strands-tools")
    
    def _get_tools_for_agent(self, tool_names: List[str]) -> List[Any]:
        """Convert tool names to actual tool objects"""
        if not STRANDS_TOOLS_AVAILABLE:
            return []
        
        tools = []
        for tool_name in tool_names:
            if tool_name in TOOL_REGISTRY:
                tools.append(TOOL_REGISTRY[tool_name])
            else:
                logger.warning(f"Tool '{tool_name}' not found in registry")
        
        return tools
    
    async def execute_swarm_async(
        self,
        request: SwarmExecutionRequest,
        user_id: str,
        callback_handler: Optional[Callable] = None
    ) -> SwarmExecutionResponse:
        """Execute swarm with native Strands streaming and proper tool support"""
        
        if not STRANDS_AVAILABLE:
            return SwarmExecutionResponse(
                execution_id=str(uuid.uuid4()),
                status=ExecutionStatus.FAILED,
                error="Strands library not installed. Run: pip install strands"
            )
        
        execution_id = request.execution_id or str(uuid.uuid4())
        self.active_executions[execution_id] = {
            "status": "running",
            "start_time": datetime.utcnow(),
            "user_id": user_id
        }
        
        try:
            # Initialize dynamic agent builder if needed
            await self.agent_factory.initialize_dynamic_builder()
            
            # Use smart agent selection if no agents provided
            if not request.agents or len(request.agents) == 0:
                # Get available tools from UI settings (passed in request or from service)
                # For now, use default but this should come from UI
                available_tools = ["tavily_search"]  # TODO: Get from UI settings
                logger.info(f"🔍 Getting agents for task: {request.task}")
                agent_configs = self.agent_factory.get_agents_for_task(request.task, available_tools)
                logger.info(f"📋 Created {len(agent_configs)} agents: {[a.name for a in agent_configs]}")
                for config in agent_configs:
                    logger.info(f"   Agent: {config.name}, Tools: {config.tools}")
            else:
                agent_configs = request.agents
                logger.info(f"📋 Using provided agents: {[a.name for a in agent_configs]}")
            
            # Create Strands agents from configs with proper tools
            strands_agents = []
            for config in agent_configs:
                # Convert tool names to actual tool objects
                tool_objects = self._get_tools_for_agent(config.tools if config.tools else [])
                
                agent = Agent(
                    name=config.name,
                    system_prompt=config.system_prompt,
                    tools=tool_objects,  # Pass actual tool objects, not strings
                    callback_handler=None  # We'll use stream_async instead
                )
                strands_agents.append(agent)
                
                logger.info(f"Created agent '{config.name}' with {len(tool_objects)} tools: {config.tools}")
            
            logger.info(f"Executing with {len(strands_agents)} Strands agents: {[a.name for a in strands_agents]}")
            
            # Send start event
            if callback_handler:
                await callback_handler(
                    type="execution_started",
                    data={
                        "task": request.task,
                        "agents": [a.name for a in strands_agents]
                    }
                )
                await asyncio.sleep(0)  # Force event flush
            
            # Option 1: Sequential execution with tool support
            if request.execution_mode == "sequential":
                return await self._execute_sequential(
                    strands_agents, request.task, execution_id, callback_handler
                )
            
            # Option 2: Native Swarm execution with handoff tools
            else:
                return await self._execute_native_swarm(
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
    
    async def _execute_sequential(
        self,
        agents: List['Agent'],
        task: str,
        execution_id: str,
        callback_handler: Optional[Callable]
    ) -> SwarmExecutionResponse:
        """Execute agents sequentially with tool support"""
        
        all_outputs = []
        all_artifacts = []
        total_tokens = 0
        agent_sequence = []
        
        current_task = task
        
        for agent in agents:
            agent_sequence.append(agent.name)
            
            # Stream agent execution
            result = await self._stream_agent_execution(
                agent=agent,
                task=current_task,
                previous_work=all_outputs,
                execution_id=execution_id,
                callback_handler=callback_handler
            )
            
            if result["output"]:
                all_outputs.append({
                    "agent": agent.name,
                    "output": result["output"]
                })
            
            all_artifacts.extend(result.get("artifacts", []))
            total_tokens += result.get("tokens", 0)
            
            # Update task for next agent if needed
            if result.get("next_task"):
                current_task = result["next_task"]
        
        # Compile final response
        final_response = self._compile_outputs(all_outputs, all_artifacts)
        
        # Send completion
        if callback_handler:
            await callback_handler(
                type="execution_completed",
                data={"result": {
                    "final_response": final_response,
                    "artifacts": all_artifacts
                }}
            )
        
        return SwarmExecutionResponse(
            execution_id=execution_id,
            status=ExecutionStatus.COMPLETED,
            result=final_response,
            handoffs=len(agents) - 1,
            tokens_used=total_tokens,
            agent_sequence=agent_sequence,
            artifacts=all_artifacts
        )
    
    async def _execute_native_swarm(
        self,
        agents: List['Agent'],
        request: SwarmExecutionRequest,
        execution_id: str,
        callback_handler: Optional[Callable]
    ) -> SwarmExecutionResponse:
        """Execute using Strands native Swarm with proper handoff support"""
        
        try:
            # Create Swarm with configured parameters
            swarm = Swarm(
                agents,
                max_handoffs=request.max_handoffs or 20,
                max_iterations=request.max_iterations or 20,
                execution_timeout=request.execution_timeout or 900.0,
                node_timeout=request.node_timeout or 300.0,
                repetitive_handoff_detection_window=8,
                repetitive_handoff_min_unique_agents=3
            )
            
            # Send start event
            if callback_handler:
                await callback_handler(
                    type="execution_started",
                    data={
                        "task": request.task,
                        "agents": [a.name for a in agents],
                        "mode": "native_swarm"
                    }
                )
            
            # Execute swarm asynchronously
            result = await swarm.invoke_async(request.task)
            
            # Process result
            final_response = ""
            artifacts = []
            
            if result.results:
                for node_id, node_result in result.results.items():
                    if node_result.result:
                        final_response += f"\n## {node_id}\n{node_result.result}\n"
                        # Extract artifacts from each agent's output
                        node_artifacts = self._extract_artifacts(
                            node_result.result, node_id
                        )
                        artifacts.extend(node_artifacts)
            
            # Send completion
            if callback_handler:
                await callback_handler(
                    type="execution_completed",
                    data={
                        "result": {
                            "final_response": final_response,
                            "artifacts": artifacts
                        }
                    }
                )
            
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
            
        except Exception as e:
            logger.error(f"Native swarm execution failed: {e}", exc_info=True)
            
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
    
    async def _stream_agent_execution(
        self,
        agent: 'Agent',
        task: str,
        previous_work: List[Dict],
        execution_id: str,
        callback_handler: Optional[Callable]
    ) -> Dict[str, Any]:
        """Stream agent execution using Strands stream_async with tool support"""
        
        # Send agent start event
        if callback_handler:
            await callback_handler(
                type="agent_started",
                agent=agent.name,
                data={"task": task[:100]}
            )
            await asyncio.sleep(0)
        
        # Build context from previous work
        context = ""
        if previous_work:
            context = "\n\nPrevious work by other agents:\n"
            for work in previous_work:
                context += f"{work['agent']}: {work['output'][:500]}...\n"
        
        # Prepare the prompt
        full_prompt = f"{task}{context}"
        
        response_text = ""
        accumulated_text = ""
        tokens = 0
        
        try:
            # Use Strands stream_async for real-time streaming
            agent_stream = agent.stream_async(full_prompt)
            
            async for event in agent_stream:
                if execution_id not in self.active_executions:
                    break
                
                # Handle text generation events for real-time streaming
                if "data" in event:
                    text_chunk = event["data"]
                    response_text += text_chunk
                    accumulated_text += text_chunk
                    
                    # Send every chunk immediately for real-time experience
                    if callback_handler:
                        await callback_handler(
                            type="text_generation",
                            agent=agent.name,
                            data={
                                "text": text_chunk,
                                "accumulated": response_text
                            }
                        )
                        # No sleep here - send immediately
                
                # Handle tool use events
                elif "current_tool_use" in event:
                    tool_info = event["current_tool_use"]
                    if callback_handler:
                        await callback_handler(
                            type="tool_use",
                            agent=agent.name,
                            data={
                                "tool": tool_info.get("name", "unknown"),
                                "arguments": tool_info.get("input", {})
                            }
                        )
                        
                    # Log tool execution for debugging
                    logger.info(f"Agent {agent.name} using tool: {tool_info.get('name')}")
                
                # Handle tool result events
                elif "tool_result" in event:
                    tool_result = event["tool_result"]
                    if callback_handler:
                        await callback_handler(
                            type="tool_result",
                            agent=agent.name,
                            data={
                                "tool": event.get("tool_name", "unknown"),
                                "result": str(tool_result)[:500]  # Truncate for display
                            }
                        )
                
                # Handle reasoning events
                elif event.get("reasoning"):
                    reasoning_text = event.get("reasoningText", "")
                    if reasoning_text and callback_handler:
                        await callback_handler(
                            type="reasoning",
                            agent=agent.name,
                            data={"text": reasoning_text}
                        )
                
                # Handle result
                elif "result" in event:
                    result = event["result"]
                    if hasattr(result, 'messages') and result.messages:
                        # Extract text from result if available
                        for msg in result.messages:
                            if hasattr(msg, 'text'):
                                response_text = msg.text
                                break
            
            # Extract artifacts from response
            artifacts = self._extract_artifacts(response_text, agent.name)
            
            # Send completion event
            if callback_handler:
                await callback_handler(
                    type="agent_completed",
                    agent=agent.name,
                    data={
                        "output": response_text,
                        "tokens": tokens
                    }
                )
                await asyncio.sleep(0)
            
            return {
                "output": response_text,
                "artifacts": artifacts,
                "tokens": tokens
            }
            
        except Exception as e:
            logger.error(f"Agent {agent.name} streaming error: {e}", exc_info=True)
            
            # Send error event
            if callback_handler:
                await callback_handler(
                    type="agent_error",
                    agent=agent.name,
                    data={"error": str(e)}
                )
            
            return {
                "output": f"Error during execution: {str(e)}",
                "artifacts": [],
                "tokens": 0
            }
    
    def _extract_artifacts(self, text: str, agent_name: str) -> List[Dict[str, Any]]:
        """Extract code artifacts from response"""
        artifacts = []
        
        if "```" not in text:
            return artifacts
        
        code_blocks = re.findall(r'```(?:(\w+))?\n(.*?)```', text, re.DOTALL)
        
        for i, (lang, code) in enumerate(code_blocks):
            if not code.strip() or len(code.strip()) < 20:
                continue
            
            # Smart filename detection
            filename = self._detect_filename(code, lang, i, agent_name)
            
            artifacts.append({
                "type": "code",
                "name": filename,
                "content": code.strip(),
                "metadata": {
                    "language": lang or "text",
                    "agent": agent_name
                }
            })
        
        return artifacts
    
    def _detect_filename(self, code: str, lang: str, index: int, agent_name: str) -> str:
        """Detect appropriate filename from code content"""
        
        code_lower = code.lower()
        
        # Check for specific patterns
        if 'express()' in code or 'app.listen' in code:
            return "server.js"
        elif 'package.json' in code_lower:
            return "package.json"
        elif '.env' in code_lower and '=' in code:
            return ".env.example"
        elif 'import pandas' in code or 'import numpy' in code:
            return f"analysis_{index}.py"
        elif 'create table' in code_lower:
            return "schema.sql"
        elif 'dockerfile' in code_lower:
            return "Dockerfile"
        elif lang == "python":
            return f"script_{index}.py"
        elif lang == "javascript" or lang == "js":
            return f"script_{index}.js"
        elif lang == "typescript" or lang == "ts":
            return f"script_{index}.ts"
        elif lang == "json":
            return f"data_{index}.json"
        elif lang == "yaml" or lang == "yml":
            return f"config_{index}.yaml"
        else:
            return f"{agent_name}_output_{index}.txt"
    
    def _compile_outputs(self, outputs: List[Dict], artifacts: List[Dict]) -> str:
        """Compile outputs into final response"""
        response = "# Task Completed\n\n"
        
        for output in outputs:
            response += f"## {output['agent']}\n\n{output['output']}\n\n"
        
        if artifacts:
            response += "\n## Generated Artifacts\n\n"
            for artifact in artifacts:
                response += f"- **{artifact['name']}** ({artifact['metadata']['language']})\n"
        
        return response