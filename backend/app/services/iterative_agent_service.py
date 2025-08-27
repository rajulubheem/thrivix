"""
Enhanced Agent Service with proper iterative loops - FIXED VERSION
"""
import asyncio
import json
import re
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, Callable, List
import structlog
from openai import AsyncOpenAI
from app.services.approval_manager import approval_manager
from app.api.v1.endpoints.settings import load_settings
from app.services.tool_display_service import tool_display_service

logger = structlog.get_logger()

class IterativeAgentService:
    """Service for executing agents with proper iterative loops and tool execution"""

    def __init__(self, openai_client: AsyncOpenAI, unified_tool_service=None):
        self.client = openai_client
        self.active_loops: Dict[str, bool] = {}
        self.unified_tool_service = unified_tool_service
        self._enabled_tools_cache = None
        # Track executed tools to prevent duplicates
        self.executed_tools_cache: Dict[str, set] = {}

    async def get_enabled_tools(self) -> Dict[str, Any]:
        """Get enabled tools from settings"""
        try:
            settings = load_settings()
            enabled_tools = {
                name: {
                    "name": tool.name,
                    "description": tool.description,
                    "category": tool.category,
                    "requires_approval": tool.requires_approval
                }
                for name, tool in settings.tools.items()
                if tool.enabled
            }
            return enabled_tools
        except Exception as e:
            logger.error(f"Failed to load enabled tools from settings: {e}")
            # Fallback to default tools
            return {
                "tavily_search": {"name": "tavily_search", "description": "Web search", "category": "web_search", "requires_approval": True},
                "file_read": {"name": "file_read", "description": "Read files", "category": "file_operations", "requires_approval": False},
                "python_repl": {"name": "python_repl", "description": "Execute Python code", "category": "code_execution", "requires_approval": True}
            }

    async def execute_agent_with_loop(
        self,
        agent: Any,
        task: str,
        previous_work: List[str],
        execution_id: str,
        callback_handler: Optional[Callable] = None,
        max_iterations: int = 8,  # FIXED: Increased from 3 to 8
        max_tokens_per_iteration: int = 4000
    ) -> Dict[str, Any]:
        """
        Execute agent with proper iterative loop allowing multiple reasoning cycles
        """
        agent_id = f"{execution_id}_{agent.name}"
        self.active_loops[agent_id] = True

        # FIXED: Initialize execution cache for this agent
        self.executed_tools_cache[agent_id] = set()

        try:
            # Initialize conversation with enhanced system prompt
            messages = await self._initialize_conversation(agent, task, previous_work)

            total_response = ""
            iteration_responses = []
            total_tokens = 0
            tools_used = []
            artifacts = []

            # Send agent start event
            if callback_handler:
                await callback_handler(
                    type="agent_started",
                    agent=agent.name,
                    data={
                        "task": task[:200],
                        "max_iterations": max_iterations,
                        "loop_type": "iterative"
                    }
                )

            # AGENT LOOP: Multiple iterations with tool use and reasoning
            for iteration in range(1, max_iterations + 1):
                if not self.active_loops.get(agent_id, False):
                    logger.info(f"🛑 Agent loop cancelled for {agent.name}")
                    break

                logger.info(f"🔄 {agent.name} - Starting iteration {iteration}/{max_iterations}")

                # Send iteration start event
                if callback_handler:
                    await callback_handler(
                        type="agent_iteration",
                        agent=agent.name,
                        data={
                            "iteration": iteration,
                            "max_iterations": max_iterations,
                            "status": "reasoning"
                        }
                    )

                # Execute one iteration with streaming
                iteration_result = await self._execute_iteration(
                    agent=agent,
                    messages=messages,
                    iteration=iteration,
                    callback_handler=callback_handler,
                    max_tokens=max_tokens_per_iteration,
                    agent_id=agent_id  # FIXED: Pass agent_id for tool deduplication
                )

                # Process iteration results
                iteration_response = iteration_result["response"]
                iteration_tokens = iteration_result["tokens"]
                iteration_tools = iteration_result["tools_used"]
                iteration_artifacts = iteration_result["artifacts"]

                # Accumulate results
                iteration_responses.append({
                    "iteration": iteration,
                    "response": iteration_response,
                    "tokens": iteration_tokens,
                    "tools_used": iteration_tools
                })

                total_response += f"\n\n--- Iteration {iteration} ---\n{iteration_response}"
                total_tokens += iteration_tokens
                tools_used.extend(iteration_tools)
                artifacts.extend(iteration_artifacts)

                # Add the assistant's response to conversation
                messages.append({
                    "role": "assistant",
                    "content": iteration_response
                })

                # FIXED: Check if agent wants to continue with more lenient conditions
                should_continue = await self._should_continue_iteration(
                    iteration_response, iteration, max_iterations, iteration_tools, agent.name
                )

                if not should_continue:
                    logger.info(f"✅ {agent.name} completed task in {iteration} iterations")
                    break

                # If continuing, add a prompt for the next iteration
                if iteration < max_iterations:
                    next_iteration = iteration + 1
                    # Simple continuation prompt
                    messages.append({
                        "role": "user",
                        "content": f"""Continue working on this task. Build on your previous work and use tools as needed.

Previous iterations:
{self._summarize_previous_iterations(iteration_responses)}

Iteration {next_iteration}/{max_iterations}"""
                    })

            # Send completion event
            if callback_handler:
                await callback_handler(
                    type="agent_completed",
                    agent=agent.name,
                    data={
                        "total_iterations": len(iteration_responses),
                        "total_tokens": total_tokens,
                        "tools_used": len(tools_used),
                        "artifacts_created": len(artifacts),
                        "completion_reason": "max_iterations" if iteration == max_iterations else "natural_completion"
                    }
                )

            return {
                "status": "success",
                "response": total_response.strip(),
                "tokens": total_tokens,
                "iterations": iteration_responses,
                "tools_used": tools_used,
                "artifacts": artifacts,
                "agent_name": agent.name
            }

        except Exception as e:
            logger.error(f"Agent loop failed for {agent.name}: {e}", exc_info=True)

            if callback_handler:
                await callback_handler(
                    type="agent_failed",
                    agent=agent.name,
                    data={"error": str(e)}
                )

            return {
                "status": "error",
                "response": f"Agent execution failed: {str(e)}",
                "tokens": 0,
                "iterations": [],
                "tools_used": [],
                "artifacts": [],
                "agent_name": agent.name
            }

        finally:
            if agent_id in self.active_loops:
                del self.active_loops[agent_id]

            # FIXED: Clean up execution cache
            if agent_id in self.executed_tools_cache:
                del self.executed_tools_cache[agent_id]

    async def _execute_iteration(
            self,
            agent: Any,
            messages: List[Dict],
            iteration: int,
            callback_handler: Optional[Callable],
            max_tokens: int,
            agent_id: str  # FIXED: Added agent_id parameter
        ) -> Dict[str, Any]:
            """Execute a single iteration with streaming"""

            response_text = ""
            tokens = 0
            tools_used = []
            artifacts = []

            # Get model configuration
            model = getattr(agent, 'model', 'gpt-4o-mini')
            temperature = getattr(agent, 'temperature', 0.7)

            try:
                logger.info(f"🚀 Creating OpenAI stream for {agent.name} iteration {iteration}")

                # Check if OpenAI client is properly initialized
                if not self.client:
                    logger.error("❌ OpenAI client is not initialized!")
                    raise Exception("OpenAI client not initialized")

                # Create the stream with error handling
                try:
                    stream = await self.client.chat.completions.create(
                        model=model,
                        messages=messages,
                        stream=True,
                        temperature=temperature,
                        max_tokens=max_tokens
                    )
                    logger.info(f"✅ OpenAI stream created successfully for {agent.name}")
                except Exception as api_error:
                    logger.error(f"❌ OpenAI API error: {api_error}")
                    raise api_error

                chunk_count = 0
                accumulated_text = ""
                first_chunk_received = False

                async for chunk in stream:
                    if not first_chunk_received:
                        logger.info(f"📨 First chunk received for {agent.name}")
                        first_chunk_received = True

                    if chunk.choices and len(chunk.choices) > 0:
                        delta = chunk.choices[0].delta
                        if delta and delta.content:
                            content = delta.content
                            response_text += content
                            accumulated_text += content
                            chunk_count += 1

                            # Stream content to frontend
                            if callback_handler:
                                await callback_handler(
                                    type="text_generation",
                                    agent=agent.name,
                                    data={
                                        "chunk": content,
                                        "text": content,
                                        "iteration": iteration,
                                        "streaming": True,
                                        "chunk_index": chunk_count
                                    }
                                )
                        elif chunk.choices[0].finish_reason:
                            logger.info(f"🏁 Stream finished for {agent.name}: {chunk.choices[0].finish_reason}")

                if not first_chunk_received:
                    logger.warning(f"⚠️ No chunks received from OpenAI for {agent.name}")

                logger.info(f"✅ COMPLETED streaming for {agent.name} iteration {iteration}")

                # If we got no response, send a placeholder message
                if not response_text:
                    logger.warning(f"⚠️ Empty response from OpenAI for {agent.name}")
                    placeholder = f"I am {agent.name}. Processing the task..."

                    if callback_handler:
                        await callback_handler(
                            type="text_generation",
                            agent=agent.name,
                            data={
                                "chunk": placeholder,
                                "text": placeholder,
                                "streaming": False
                            }
                        )

                    response_text = placeholder

                # FIXED: After streaming is complete, check for and execute tools with deduplication
                if response_text:
                    tool_results = await self._check_and_execute_tools(
                        response_text, agent, callback_handler, agent_id
                    )

                    if tool_results:
                        # FIXED: Don't add tool results to response_text to prevent duplication
                        # Tool results are already displayed via callback_handler
                        pass

                    tools_used = await self._extract_tool_calls(response_text)
                    artifacts = await self._extract_artifacts(response_text, agent.name)

                # Get token count
                if hasattr(chunk, 'usage') and chunk.usage:
                    tokens = chunk.usage.total_tokens
                else:
                    tokens = len(response_text) // 4

            except Exception as e:
                logger.error(f"❌ Iteration {iteration} failed for {agent.name}: {e}", exc_info=True)
                error_msg = f"Error in {agent.name}: {str(e)}"
                response_text = error_msg

                # Send error to frontend
                if callback_handler:
                    await callback_handler(
                        type="text_generation",
                        agent=agent.name,
                        data={
                            "chunk": error_msg,
                            "text": error_msg,
                            "streaming": False,
                            "is_error": True
                        }
                    )

            return {
                "response": response_text,
                "tokens": tokens,
                "tools_used": tools_used,
                "artifacts": artifacts
            }

    async def _initialize_conversation(self, agent: Any, task: str, previous_work: List[str]) -> List[Dict]:
            """Initialize conversation with enhanced system prompt"""

            # Get tools for THIS SPECIFIC agent
            if hasattr(agent, 'tools') and agent.tools is not None:
                if len(agent.tools) == 0:
                    enabled_tools = {}
                    tools_list = []
                    tools_description = "You have NO tools available. Work with the information provided."
                    logger.info(f"🚫 {agent.name} has NO tools (by design)")
                else:
                    all_tools = await self.get_enabled_tools()
                    enabled_tools = {name: all_tools[name] for name in agent.tools if name in all_tools}
                    tools_list = list(enabled_tools.keys())
                    tools_description = "\n".join([
                        f"- {name}: {info['description']}"
                        for name, info in enabled_tools.items()
                    ])
                    logger.info(f"✅ {agent.name} has specific tools: {tools_list}")
            else:
                enabled_tools = await self.get_enabled_tools()
                tools_list = list(enabled_tools.keys())
                tools_description = "\n".join([
                    f"- {name}: {info['description']}"
                    for name, info in enabled_tools.items()
                ])

            # Enhanced system prompt based on whether agent has tools
            if tools_list:
                system_prompt = f"""You are {agent.name}: {agent.description}

Your job is to complete the task by:
1. Explaining your approach and findings
2. Using tools to gather information or perform actions
3. Analyzing and presenting results

AVAILABLE TOOLS:
{tools_description}

HOW TO USE TOOLS:
When you need to use a tool, write it on its own line like this:
[TOOL: tool_name]
{{
  "parameter_name": "value"
}}

EXAMPLES:

To search for information:
[TOOL: tavily_search]
{{"query": "Tesla autonomous vehicles 2024"}}

To write a file:
[TOOL: file_write]
{{"path": "report.txt", "content": "Your content here"}}

To read a file:
[TOOL: file_read]
{{"path": "data.json"}}

To run Python code:
[TOOL: python_repl]
{{"code": "print('Hello World')"}}

IMPORTANT:
- Explain what you're doing and why
- When you need to use a tool, use the [TOOL: name] format
- After using tools, explain what you found or accomplished
- Provide analysis and insights, not just tool outputs
- Share your reasoning and conclusions"""
            else:
                system_prompt = f"""You are {agent.name}: {agent.description}

IMPORTANT: You have NO tools available. You must work with the information provided to you.

Your role is to analyze, summarize, and process the data from previous agents.
Focus on extracting insights and creating value through analysis, not through additional searches or actions.

DO NOT attempt to use tools - you don't have any.
DO NOT write [TOOL: ...] commands - they won't work.
FOCUS on processing and summarizing the information you've been given."""

            if previous_work:
                previous_work_text = "\n\n".join(previous_work)
                user_message = f"""{task}

Previous work from other agents:
{previous_work_text}

Please complete your part of the task. Explain your approach, use tools as needed (with [TOOL: name] format), and provide clear analysis and conclusions."""
            else:
                user_message = f"""{task}

Please complete this task. Start by explaining your approach, then use tools as needed (with [TOOL: name] format), and provide clear analysis and conclusions.

Remember to:
1. Explain what you're doing
2. Use tools when needed
3. Analyze the results
4. Share your findings"""

            return [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ]

    async def _should_continue_iteration(
        self,
        response: str,
        current_iteration: int,
        max_iterations: int,
        tools_used: List[str],
        agent_name: str  # FIXED: Added agent_name parameter
    ) -> bool:
        """Determine if agent should continue to next iteration - FIXED VERSION"""

        # FIXED: Allow more iterations for complex tasks
        if current_iteration >= max_iterations:
            logger.info(f"🔄 {agent_name} reached max iterations ({max_iterations})")
            return False

        # Always allow at least 2 iterations for quality work
        if current_iteration < 2:
            return True

        response_lower = response.lower()

        # Check for explicit completion signals first
        completion_signals = [
            "task completed",
            "analysis complete",
            "work is done",
            "final report",
            "conclusion:",
            "summary:",
            "deliverable complete",
            "ready for review",
            "implementation finished"
        ]

        for signal in completion_signals:
            if signal in response_lower:
                logger.info(f"✅ {agent_name} indicated completion: '{signal}'")
                return False

        # FIXED: Check for swarm handoff signals (only for swarm mode)
        if "swarm" in agent_name.lower() or current_iteration >= 3:
            handoff_signals = [
                "handoff",
                "next agent",
                "ready for",
                "passing to",
                "handing over",
                "for the next",
                "specialist can"
            ]

            for signal in handoff_signals:
                if signal in response_lower:
                    logger.info(f"🔄 {agent_name} indicated handoff: '{signal}'")
                    return False

        # FIXED: More intelligent continuation logic
        # Continue if the agent is still actively working
        active_work_indicators = [
            "let me",
            "i will",
            "next step",
            "now i need",
            "i should",
            "continuing",
            "additionally",
            "furthermore",
            "also need to"
        ]

        is_actively_working = any(indicator in response_lower for indicator in active_work_indicators)

        # If agent used tools recently, likely still working
        tools_in_iteration = len(tools_used) > 0

        # If response is short, might need more development
        response_is_brief = len(response) < 200

        # FIXED: Continue if agent seems to be actively working or needs more development
        if (is_actively_working or tools_in_iteration or response_is_brief) and current_iteration < max_iterations:
            logger.info(f"🔄 {agent_name} continuing: active={is_actively_working}, tools={tools_in_iteration}, brief={response_is_brief}")
            return True

        # FIXED: For later iterations, only continue if there's clear indication of ongoing work
        if current_iteration >= 4:
            # Be more selective about continuing
            substantial_content = len(response) > 500
            if substantial_content and not is_actively_working:
                logger.info(f"✅ {agent_name} produced substantial content without continuation signals")
                return False

        # Default: continue if under max iterations
        return current_iteration < max_iterations

    async def _extract_tool_calls(self, response: str) -> List[str]:
        """Extract tool calls from response"""
        tools = []

        # Look for [TOOL:name] patterns
        tool_pattern = r'\[TOOL:\s*(\w+)\]'
        matches = re.findall(tool_pattern, response)
        tools.extend(matches)

        return tools

    def _detect_language(self, filename: str) -> str:
        """Detect programming language from filename"""
        ext_map = {
            '.py': 'python',
            '.js': 'javascript',
            '.ts': 'typescript',
            '.jsx': 'jsx',
            '.tsx': 'tsx',
            '.html': 'html',
            '.css': 'css',
            '.json': 'json',
            '.md': 'markdown',
            '.yaml': 'yaml',
            '.yml': 'yaml',
            '.sh': 'bash',
            '.sql': 'sql',
            '.txt': 'text'
        }

        import os
        _, ext = os.path.splitext(filename.lower())
        return ext_map.get(ext, 'text')

    async def _extract_artifacts(self, response: str, agent_name: str) -> List[Dict]:
        """Extract code artifacts from response"""
        artifacts = []

        # Look for code blocks
        code_pattern = r'```(\w+)?\n(.*?)\n```'
        matches = re.findall(code_pattern, response, re.DOTALL)

        for i, (lang, code) in enumerate(matches):
            if code.strip():
                artifacts.append({
                    "type": "code",
                    "name": f"{agent_name}_artifact_{i}.{lang or 'txt'}",
                    "content": code.strip(),
                    "language": lang or "text",
                    "agent": agent_name,
                    "created_at": datetime.utcnow().isoformat()
                })

        return artifacts

    def _summarize_previous_iterations(self, iterations: List[Dict]) -> str:
        """Create a summary of previous iterations"""
        if not iterations:
            return "No previous iterations"

        summary = []
        for iter_data in iterations:
            iteration = iter_data["iteration"]
            tools = iter_data["tools_used"]
            response_preview = iter_data["response"][:200] + "..." if len(iter_data["response"]) > 200 else iter_data["response"]

            summary.append(f"Iteration {iteration}: {response_preview}")
            if tools:
                summary.append(f"  Tools used: {', '.join(tools)}")

        return "\n".join(summary)

    async def _check_and_execute_tools(
        self,
        response_text: str,
        agent: Any,
        callback_handler: Optional[Callable],
        agent_id: str  # FIXED: Added agent_id for deduplication
    ) -> str:
            """Check for tool calls in response and execute them - FIXED VERSION"""
            if not self.unified_tool_service:
                return ""

            # Get enabled tools from settings
            enabled_tools = await self.get_enabled_tools()

            # FIXED: Find tool calls with improved pattern matching
            tool_calls = []

            # Pattern: [TOOL: name] followed by JSON
            pattern = r'\[TOOL:\s*([\w_]+)\]\s*\n?\s*(\{[^}]*\})'
            matches = re.findall(pattern, response_text, re.DOTALL)

            for tool_name, params_json in matches:
                tool_calls.append((tool_name, params_json))
                logger.info(f"🔌 Found tool call: {tool_name}")

            logger.info(f"📊 Total tool calls found: {len(tool_calls)}")

            # FIXED: Get execution cache for this agent
            executed_cache = self.executed_tools_cache.get(agent_id, set())

            for tool_name, params_str in tool_calls:
                logger.info(f"🔧 Processing {tool_name}")

                # Validate tool is enabled
                if tool_name not in enabled_tools:
                    logger.warning(f"❌ Tool {tool_name} not enabled")
                    continue

                try:
                    # Parse parameters
                    params_str = params_str.strip()
                    params_str = re.sub(r',\s*}', '}', params_str)  # Remove trailing commas
                    params = json.loads(params_str) if params_str else {}

                    # FIXED: Create signature for duplicate detection
                    import hashlib
                    param_signature = hashlib.md5(
                        f"{tool_name}:{json.dumps(params, sort_keys=True)}".encode()
                    ).hexdigest()

                    if param_signature in executed_cache:
                        logger.info(f"⭐️ Skipping duplicate: {tool_name}")
                        continue

                    executed_cache.add(param_signature)

                    logger.info(f"📋 Executing {tool_name} with params: {params}")

                    # Check if approval required
                    tool_config = enabled_tools.get(tool_name, {})
                    requires_approval = tool_config.get('requires_approval', True)

                    if requires_approval:
                        # Request approval and WAIT
                        approval_id, approved, modified_params = await approval_manager.request_approval(
                            agent=agent.name,
                            tool=tool_name,
                            parameters=params,
                            callback_handler=callback_handler
                        )

                        if not approved:
                            logger.info(f"❌ Tool {tool_name} rejected by user")
                            continue

                        params = modified_params if modified_params else params

                    # FIXED: Display tool call ONCE before execution
                    if callback_handler:
                        tool_call_display = tool_display_service.format_tool_call(tool_name, params)
                        await callback_handler(
                            type="text_generation",
                            agent=agent.name,
                            data={
                                "chunk": "\n\n" + tool_call_display + "\n",
                                "text": "\n\n" + tool_call_display + "\n",
                                "streaming": True,
                                "is_tool_call": True  # FIXED: Mark as tool call
                            }
                        )

                    # Execute the tool
                    logger.info(f"🚀 EXECUTING {tool_name}")
                    result = await self.unified_tool_service.execute_tool(
                        tool_name,
                        params,
                        agent_name=agent.name
                    )

                    logger.info(f"✅ Tool {tool_name} executed successfully")

                    # FIXED: Display result ONCE
                    if callback_handler:
                        tool_result_display = tool_display_service.format_tool_result(tool_name, result, params)
                        await callback_handler(
                            type="text_generation",
                            agent=agent.name,
                            data={
                                "chunk": "\n" + tool_result_display + "\n",
                                "text": "\n" + tool_result_display + "\n",
                                "streaming": True,
                                "is_tool_result": True  # FIXED: Mark as tool result
                            }
                        )

                        # FIXED: Send artifact ONCE for file writes
                        if tool_name == "file_write" and result.get('success', False):
                            path = params.get('path', 'unknown')
                            content = params.get('content', '')
                            lang = tool_display_service._detect_language(path)

                            await callback_handler(
                                type="artifact",
                                agent=agent.name,
                                data={
                                    "title": path,
                                    "content": content,
                                    "type": "code",
                                    "language": lang
                                }
                            )

                except Exception as e:
                    logger.error(f"Error executing {tool_name}: {e}", exc_info=True)

                    if callback_handler:
                        error_text = f"\n\n[TOOL ERROR: {tool_name}]\n❌ {str(e)}\n[/TOOL ERROR]\n\n"
                        await callback_handler(
                            type="text_generation",
                            agent=agent.name,
                            data={
                                "chunk": error_text,
                                "text": error_text,
                                "is_tool_error": True
                            }
                        )

            return ""  # FIXED: Don't return tool results to prevent duplication

    def cancel_agent_loop(self, execution_id: str, agent_name: str):
        """Cancel a running agent loop"""
        agent_id = f"{execution_id}_{agent_name}"
        if agent_id in self.active_loops:
            self.active_loops[agent_id] = False
            logger.info(f"🛑 Cancelled agent loop for {agent_name}")