# app/services/enhanced_swarm_service.py
"""
Enhanced Swarm Service with WORKING Strands Agents and VISIBLE tool calls
Complete implementation with all fixes applied
"""
import asyncio
import json
import os
import re
import uuid
from typing import Optional, Callable, Dict, Any, List
from datetime import datetime
import structlog

# Strands imports
from strands import Agent
from strands.models.openai import OpenAIModel
from strands import tool

# Import tool approval hook
try:
    from strands.experimental.hooks import BeforeToolInvocationEvent, AfterToolInvocationEvent
    APPROVAL_HOOKS_AVAILABLE = True
except ImportError as e:
    APPROVAL_HOOKS_AVAILABLE = False
    import structlog
    logger = structlog.get_logger()
    logger.warning(f"Tool approval hooks not available: {e}")

from app.schemas.swarm import (
    SwarmExecutionRequest,
    SwarmExecutionResponse,
    ExecutionStatus,
    AgentConfig,
    Artifact
)
from app.services.ai_orchestrator import AIOrchestrator
from app.services.approval_manager import approval_manager

logger = structlog.get_logger()

# Global virtual filesystem
GLOBAL_VIRTUAL_FILES = {}


class StrandsSwarmAgent:
    """Strands Agent wrapper with VISIBLE tool calls and proper streaming"""

    def __init__(
        self,
        name: str,
        system_prompt: str,
        tools: List = None,
        model: str = "gpt-4o-mini",
        temperature: float = 0.7,
        max_tokens: int = 4000,
        session_id: Optional[str] = None,
        callback_handler: Optional[Callable] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None
    ):
        self.name = name
        self.system_prompt = system_prompt
        self.callback_handler = callback_handler
        self.total_tokens = 0
        self.session_id = session_id
        self.tools = tools or []
        self.conversation_history = conversation_history or []

        # Import tool discovery for better prompts
        from app.services.tool_discovery import ToolDiscoveryService
        
        # Enhanced system prompt with detailed tool instructions
        tool_names = [t.__name__ for t in self.tools if hasattr(t, '__name__')]
        
        # Log available tools for debugging
        logger.info(f"🔧 Agent {name} has tools: {tool_names}")
        
        # Generate detailed tool guide
        tool_guide = ""
        if tool_names:
            tool_guide = ToolDiscoveryService.format_tool_usage_guide(name, tool_names)
        
        # Don't include conversation history in system prompt - will pass as messages parameter
        if self.conversation_history and len(self.conversation_history) > 0:
            logger.info(f"🤖 Agent {name} will receive {len(self.conversation_history)} conversation history items as messages")
        else:
            logger.info(f"🤖 Agent {name} has NO conversation history")
        
        enhanced_prompt = f"""{system_prompt}

YOU HAVE ACCESS TO THE FOLLOWING TOOLS:
{', '.join(tool_names) if tool_names else 'No tools available'}

{tool_guide if tool_guide else ''}

IMPORTANT INSTRUCTIONS:
1. Always use the exact tool name when calling a tool
2. Provide ALL required parameters for each tool
3. Check that the tool exists before trying to use it

TOOL USAGE EXAMPLES:
- For web search: Use tavily_search with query parameter
- To save content: Use file_write with path and content parameters  
- To read files: Use file_read with only path parameter
- For calculations: Use python_repl with code parameter

If a tool fails, check:
- Is the tool name correct?
- Are all required parameters provided?
- Is the parameter format correct?
"""

        # Create OpenAI model for Strands
        self.model = OpenAIModel(
            client_args={
                "api_key": os.getenv("OPENAI_API_KEY"),
            },
            model_id=model,
            params={
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
        )

        # CRITICAL FIX: Use centralized Strands session service for PROPER persistence
        from app.services.strands_session_service import get_strands_session_service
        
        if session_id:
            # Use the centralized session service for proper session management
            strands_service = get_strands_session_service()
            
            # CRITICAL: Get or create agent - this ensures we reuse existing agents
            # and share session managers properly according to Strands docs
            self.agent = strands_service.get_or_create_agent(
                session_id=session_id,
                agent_name=name,
                system_prompt=enhanced_prompt,
                tools=self.tools,
                model_config={
                    "model_id": model,
                    "temperature": temperature,
                    "max_tokens": max_tokens
                },
                force_new=False  # Reuse existing agent if available
            )
            
            logger.info(f"🗄️ Agent {name} using SHARED session management for {session_id}")
            
            # The shared session manager and conversation manager will automatically
            # provide access to ALL previous messages in the session
            if self.conversation_history:
                logger.info(f"📚 Agent {name} has access to shared conversation history")
        else:
            logger.warning(f"⚠️ Agent {name} created without session management (no session_id)")
            self.agent = Agent(
                model=self.model,
                tools=self.tools,
                system_prompt=enhanced_prompt
            )
        
        # Log agent creation details
        logger.info(f"✅ Agent {name} created with {len(self.tools)} tools")
        if self.tools:
            for tool in self.tools:
                if hasattr(tool, '__name__'):
                    logger.info(f"  - Tool available: {tool.__name__}")
        else:
            logger.warning(f"⚠️ Agent {name} has NO tools available!")

    async def execute(
        self,
        task: str,
        previous_work: List[str] = None,
        max_iterations: int = 3
    ) -> Dict[str, Any]:
        """Execute agent with VISIBLE tool calls and proper streaming"""

        # Build context
        context = self._build_context(task, previous_work)

        try:
            # Send agent started event
            if self.callback_handler:
                await self.callback_handler(
                    type="agent_started",
                    agent=self.name,
                    data={"task": task[:100]}
                )

            logger.info(f"🚀 Starting agent {self.name}")

            # Execute with Strands
            logger.info(f"📝 Invoking Strands agent {self.name}")

            # Use stream_async for real-time streaming
            response_text = ""
            accumulated_text = ""
            result = None
            
            # Stream the response in real-time
            agent_stream = self.agent.stream_async(context)
            
            async for event in agent_stream:
                # Handle text generation - send immediately
                if "data" in event:
                    text_chunk = event["data"]
                    response_text += text_chunk
                    accumulated_text += text_chunk
                    
                    # Send chunk immediately for real-time streaming
                    if self.callback_handler:
                        await self.callback_handler(
                            type="text_generation",
                            agent=self.name,
                            data={
                                "text": text_chunk,
                                "chunk": text_chunk,
                                "accumulated": accumulated_text
                            }
                        )
                
                # Handle tool usage events for visibility
                elif "current_tool_use" in event:
                    tool_info = event["current_tool_use"]
                    tool_name = tool_info.get("name", "")
                    
                    # Only send ONE tool call notification per tool use
                    # Check if we've already sent this tool call by tracking tool use ID
                    tool_use_id = tool_info.get("toolUseId", "")
                    if not hasattr(self, '_sent_tool_calls'):
                        self._sent_tool_calls = set()
                    
                    if tool_use_id and tool_use_id not in self._sent_tool_calls:
                        self._sent_tool_calls.add(tool_use_id)
                        
                        if tool_name and self.callback_handler:
                            tool_params = tool_info.get("input", {})
                            
                            # Send tool call notification ONCE
                            await self.callback_handler(
                                type="tool_call",
                                agent=self.name,
                                data={
                                    "tool": tool_name,
                                    "parameters": tool_params
                                }
                            )
                
                # Handle result event
                elif "result" in event:
                    result = event["result"]
                    # Extract any final content from result if needed
                    if hasattr(result, 'content') and result.content:
                        if result.content not in response_text:
                            response_text = result.content

            # Don't extract tool calls from response text since we already handled them in stream_async
            # This prevents duplicate tool messages and feedback loops
            tool_calls = []

            # Send visible tool call notifications
            for tool_call in tool_calls:
                if self.callback_handler:
                    # Send a formatted tool call message that will appear in the UI
                    tool_msg = f"\n🔧 **Using Tool:** `{tool_call['name']}`\n"
                    if tool_call.get('parameters'):
                        params_str = json.dumps(tool_call['parameters'], indent=2)
                        tool_msg += f"**Parameters:**\n```json\n{params_str}\n```\n"

                    # Send as visible text chunk
                    await self.callback_handler(
                        type="text_generation",
                        agent=self.name,
                        data={
                            "chunk": tool_msg,
                            "text": tool_msg
                        }
                    )

                    # Also send tool_call event for backend processing
                    await self.callback_handler(
                        type="tool_call",
                        agent=self.name,
                        data={
                            "tool": tool_call['name'],
                            "parameters": tool_call.get('parameters', {})
                        }
                    )

                    # Small delay for UI update
                    await asyncio.sleep(0.1)

                    # Send tool result notification
                    result_msg = f"✅ **Tool Result:** Successfully executed `{tool_call['name']}`\n"
                    await self.callback_handler(
                        type="text_generation",
                        agent=self.name,
                        data={
                            "chunk": result_msg,
                            "text": result_msg
                        }
                    )

            # Clean response text (remove tool syntax)
            clean_response = self._clean_response(response_text)

            # Don't re-stream the response since we already streamed it in real-time above
            # Just log that we have the cleaned response
            if clean_response:
                logger.info(f"✅ Cleaned response ready for {self.name}: {len(clean_response)} chars")

            # Extract token usage if we have a result
            if result and hasattr(result, 'usage'):
                usage = result.usage
                if isinstance(usage, dict):
                    self.total_tokens = usage.get('total_tokens', 0)
                    logger.info(f"📊 Agent {self.name} used {self.total_tokens} tokens")

            # Extract artifacts
            artifacts = await self._extract_artifacts(response_text)
            if artifacts:
                logger.info(f"📦 Agent {self.name} created {len(artifacts)} artifacts")

                # Send artifact creation notifications
                for artifact in artifacts:
                    if self.callback_handler:
                        artifact_msg = f"\n📄 **File Created:** `{artifact['name']}`\n"
                        artifact_msg += f"Type: {artifact['metadata']['language']}\n\n"

                        await self.callback_handler(
                            type="text_generation",
                            agent=self.name,
                            data={
                                "chunk": artifact_msg,
                                "text": artifact_msg
                            }
                        )

            # Send completion event
            if self.callback_handler:
                await self.callback_handler(
                    type="agent_completed",
                    agent=self.name,
                    data={
                        "output": clean_response,
                        "tokens": self.total_tokens,
                        "artifacts": len(artifacts)
                    }
                )

            logger.info(f"✅ Agent {self.name} completed: {len(clean_response)} chars, {self.total_tokens} tokens")

            return {
                "response": clean_response,
                "artifacts": artifacts,
                "tokens": self.total_tokens
            }

        except Exception as e:
            logger.error(f"Agent {self.name} error: {e}", exc_info=True)

            if self.callback_handler:
                error_msg = f"\n❌ **Error in {self.name}:** {str(e)}\n"
                await self.callback_handler(
                    type="text_generation",
                    agent=self.name,
                    data={
                        "chunk": error_msg,
                        "text": error_msg
                    }
                )

                await self.callback_handler(
                    type="agent_error",
                    agent=self.name,
                    data={"error": str(e)}
                )

            return {
                "response": f"Error: {str(e)}",
                "artifacts": [],
                "tokens": 0
            }

    def _build_context(self, task: str, previous_work: List[str] = None):
        """Build context for agent - returns messages list if we have conversation history"""
        
        # Build current task message
        current_message = f"Task: {task}\n\n"
        if previous_work:
            current_message += "Previous Work from Other Agents:\n" + "=" * 50 + "\n\n"
            for i, work in enumerate(previous_work):
                if work:  # Only add non-empty work
                    if len(work) > 2000:
                        work = work[:1000] + "\n...[truncated]...\n" + work[-1000:]
                    current_message += f"Agent {i+1} Output:\n{work}\n\n"
            current_message += "=" * 50 + "\n\nContinue the work based on what has been done."
        
        # If we have conversation history, return as proper message list
        if self.conversation_history and len(self.conversation_history) > 0:
            messages = []
            
            # Add all previous messages as proper Message format
            for msg in self.conversation_history:
                if isinstance(msg, dict) and 'role' in msg and 'content' in msg:
                    messages.append({
                        "role": msg["role"],
                        "content": msg["content"]
                    })
            
            # Inject shared state summary as a system message (Strands agent.state)
            try:
                from app.services.shared_state_service import SharedStateService
                if self.session_id:
                    shared = SharedStateService().get_shared_context(self.session_id)
                    if shared:
                        goal = shared.get("current_goal") or ""
                        outputs = shared.get("agent_outputs", {}) or {}
                        # Keep concise summary
                        outputs_summary = ", ".join(f"{k}: {str(v)[:100]}" for k, v in outputs.items())
                        system_note = ""
                        if goal:
                            system_note += f"Current Goal: {goal}\n"
                        if outputs_summary:
                            system_note += f"Known Agent Outputs: {outputs_summary}\n"
                        if system_note:
                            messages.insert(0, {"role": "system", "content": system_note.strip()})
            except Exception as e:
                logger.warning(f"Failed to inject shared state into context: {e}")
            
            # Add current task as new user message
            messages.append({
                "role": "user",
                "content": current_message
            })
            
            logger.info(f"📚 Built context with {len(messages)} messages including history for {self.name}")
            return messages
        else:
            # No conversation history - return simple string
            return current_message

    def _extract_tool_calls(self, text: str) -> List[Dict[str, Any]]:
        """Extract tool calls from response text"""
        tool_calls = []

        # Check for file_write calls
        if "file_write" in text or "writing to file" in text.lower() or "creating file" in text.lower():
            # Try to extract file path and content
            path_match = re.search(r'(?:file|path|filename)[:\s]+["\']?([^"\']+\.[\w]+)', text, re.IGNORECASE)
            if path_match:
                tool_calls.append({
                    'name': 'file_write',
                    'parameters': {
                        'path': path_match.group(1),
                        'content': 'File content from agent response'
                    }
                })

        # Check for tavily_search calls
        if "tavily_search" in text or "searching for" in text.lower() or "search query" in text.lower():
            query_match = re.search(r'(?:query|search|searching for)[:\s]+["\']?([^"\']+)["\']?', text, re.IGNORECASE)
            if query_match:
                tool_calls.append({
                    'name': 'tavily_search',
                    'parameters': {
                        'query': query_match.group(1).strip()
                    }
                })

        # Check for file_read calls
        if "file_read" in text or "reading file" in text.lower():
            path_match = re.search(r'(?:file|path|reading)[:\s]+["\']?([^"\']+\.[\w]+)', text, re.IGNORECASE)
            if path_match:
                tool_calls.append({
                    'name': 'file_read',
                    'parameters': {
                        'path': path_match.group(1)
                    }
                })

        return tool_calls

    def _clean_response(self, text: str) -> str:
        """Remove tool call syntax from response for cleaner display"""
        if not text:
            return ""

        # Remove various tool call patterns
        cleaned = text
        patterns_to_remove = [
            r'<tool_call>.*?</tool_call>',
            r'Tool:\s*\w+\s*Parameters:\s*{.*?}',
            r'Using tool:\s*\w+',
            r'\[TOOL:.*?\]',
            r'```tool\n.*?```',
        ]

        for pattern in patterns_to_remove:
            cleaned = re.sub(pattern, '', cleaned, flags=re.DOTALL | re.IGNORECASE)

        # Clean up extra whitespace
        cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
        cleaned = cleaned.strip()

        return cleaned

    async def _extract_artifacts(self, text: str) -> List[Dict[str, Any]]:
        """Extract code artifacts from response"""
        artifacts = []
        if not text:
            return artifacts

        # Find code blocks
        code_blocks = re.findall(r'```(?:(\w+))?\n(.*?)```', text, re.DOTALL)

        for lang, code in code_blocks:
            if not code.strip():
                continue

            # Check for filename
            filename_match = re.search(r'#\s*filename:\s*(.+)', code)
            if filename_match:
                filename = filename_match.group(1).strip()
                code = re.sub(r'#\s*filename:.*\n', '', code)
            else:
                # Generate filename based on language
                ext = lang if lang else 'txt'
                filename = f"output_{len(artifacts) + 1}.{ext}"

            # Store in virtual filesystem
            GLOBAL_VIRTUAL_FILES[filename] = code.strip()
            logger.info(f"💾 Stored file: {filename}")

            artifacts.append({
                "type": "code",
                "name": filename,
                "content": code.strip(),
                "metadata": {
                    "language": lang or "text",
                    "agent": self.name,
                    "created_at": datetime.utcnow().isoformat()
                }
            })

        return artifacts


def create_tavily_tool(agent_name: str, callback_handler: Optional[Callable] = None):
    """Create Tavily search tool with visible status updates"""
    @tool
    async def tavily_search(query: str, search_depth: str = "basic", max_results: int = 5) -> dict:
        """Search the web for current information.

        Args:
            query: Search query string (required)
            search_depth: "basic" or "advanced" (optional)
            max_results: Number of results (optional)
        """
        if not query:
            return {"status": "error", "content": [{"text": "Query parameter is required"}]}

        # TOOL APPROVAL DISABLED - Execute directly
        # Uncomment below to re-enable approval checks
        # from app.services.tool_approval_simple import check_tool_approval
        # can_execute, message = check_tool_approval("tavily_search", {"query": query})
        # if not can_execute:
        #     return {"status": "success", "results": [], "answer": f"⏳ {message}", ...}

        try:
            from tavily import TavilyClient

            logger.info(f"🔍 Executing Tavily search: {query}")

            # Send visible search notification with details
            if callback_handler:
                search_msg = f"\n🔧 **Tool Called:** `tavily_search`\n"
                search_msg += f"**Purpose:** Web search for current information\n"
                search_msg += f"**Query:** \"{query}\"\n"
                search_msg += f"**Depth:** {search_depth} | **Max Results:** {max_results}\n"
                search_msg += f"⏳ Searching...\n"
                await callback_handler(
                    type="text_generation",
                    agent=agent_name,
                    data={
                        "chunk": search_msg,
                        "text": search_msg
                    }
                )

            # Execute search
            client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
            response = await asyncio.to_thread(
                client.search,
                query=query,
                search_depth=search_depth,
                max_results=max_results
            )

            # Send search results notification
            if callback_handler and response.get("results"):
                results_msg = f"📋 **Found {len(response.get('results', []))} results**\n\n"
                await callback_handler(
                    type="text_generation",
                    agent=agent_name,
                    data={
                        "chunk": results_msg,
                        "text": results_msg
                    }
                )

                await callback_handler(
                    type="tool_result",
                    agent=agent_name,
                    data={
                        "tool": "tavily_search",
                        "success": True,
                        "results": response.get("results", [])
                    }
                )

            return {
                "status": "success",
                "content": [{
                    "json": response
                }]
            }
        except Exception as e:
            logger.error(f"Tavily error: {e}")

            if callback_handler:
                error_msg = f"❌ **Search Error:** {str(e)}\n"
                await callback_handler(
                    type="text_generation",
                    agent=agent_name,
                    data={
                        "chunk": error_msg,
                        "text": error_msg
                    }
                )

            return {"status": "error", "content": [{"text": str(e)}]}

    return tavily_search


def create_file_tools(agent_name: str, callback_handler: Optional[Callable] = None):
    """Create file tools with visible status updates"""

    @tool
    async def file_write(path: str, content: str) -> dict:
        """Write content to a file.

        Args:
            path: File path (required)
            content: File content (required)
        """
        if not path:
            error_msg = "Error: 'path' parameter is required for file_write"
            logger.error(error_msg)
            return {"status": "error", "content": [{"text": error_msg}]}
        
        if not content:
            error_msg = "Error: 'content' parameter is required for file_write"
            logger.error(error_msg)
            return {"status": "error", "content": [{"text": error_msg}]}

        try:
            # Write to virtual filesystem
            GLOBAL_VIRTUAL_FILES[path] = content
            logger.info(f"📝 Written: {path} ({len(content)} bytes)")
        except Exception as e:
            error_msg = f"Error writing file: {str(e)}"
            logger.error(error_msg)
            return {"status": "error", "content": [{"text": error_msg}]}

        # Send visible file creation notification with progress
        if callback_handler:
            # Send initial notification
            start_msg = f"\n✍️ **Writing file:** `{path}`...\n"
            await callback_handler(
                type="text_generation",
                agent=agent_name,
                data={
                    "chunk": start_msg,
                    "text": start_msg
                }
            )
            
            # Show preview of content
            preview_lines = content.splitlines()[:10]
            preview = '\n'.join(preview_lines)
            lines_count = len(content.splitlines())
            if len(preview_lines) < lines_count:
                preview += f"\n... ({lines_count} total lines)"
            
            preview_msg = f"📝 **Preview:**\n```\n{preview}\n```\n"
            await callback_handler(
                type="text_generation",
                agent=agent_name,
                data={
                    "chunk": preview_msg,
                    "text": preview_msg
                }
            )
            
            # Send completion notification with view link
            file_msg = f"\n✅ **File Written Successfully:** `{path}`\n"
            lines_count = len(content.splitlines())
            file_msg += f"**Size:** {len(content)} bytes | **Lines:** {lines_count}\n"
            file_msg += f"📖 **[View Full File](http://localhost:8000/api/v1/file-viewer/view/{path}?format=html)**\n"
            file_msg += f"⬇️ **[Download File](http://localhost:8000/api/v1/file-viewer/download/{path})**\n\n"

            await callback_handler(
                type="text_generation",
                agent=agent_name,
                data={
                    "chunk": file_msg,
                    "text": file_msg
                }
            )

            await callback_handler(
                type="tool_result",
                agent=agent_name,
                data={
                    "tool": "file_write",
                    "success": True,
                    "message": f"File written: {path}"
                }
            )

        return {
            "status": "success",
            "content": [{"text": f"Successfully wrote {len(content)} bytes to {path}"}]
        }

    @tool
    async def file_read(path: str) -> dict:
        """Read a file.

        Args:
            path: File path (required)
        """
        if not path:
            return {"status": "error", "content": [{"text": "Path parameter is required"}]}

        # Send tool called notification with details
        if callback_handler:
            tool_msg = f"\n🔧 **Tool Called:** `file_read`\n"
            tool_msg += f"**Purpose:** Read file contents\n"
            tool_msg += f"**Target File:** `{path}`\n"
            tool_msg += f"⏳ Reading...\n"
            await callback_handler(
                type="text_generation",
                agent=agent_name,
                data={
                    "chunk": tool_msg,
                    "text": tool_msg
                }
            )

        if path in GLOBAL_VIRTUAL_FILES:
            content = GLOBAL_VIRTUAL_FILES[path]
            
            # Show file details and preview
            if callback_handler:
                # Send file found notification with preview
                success_msg = f"✅ **File Found:** `{path}`\n"
                success_msg += f"**Size:** {len(content)} bytes | **Lines:** {len(content.splitlines())}\n"
                success_msg += f"📖 **[View Full File](http://localhost:8000/api/v1/file-viewer/view/{path}?format=html)**\n\n"
                
                # Add preview
                preview_lines = content.splitlines()[:5]
                preview = '\n'.join(preview_lines)
                if len(content.splitlines()) > 5:
                    preview += f"\n... ({len(content.splitlines()) - 5} more lines)"
                
                success_msg += f"**Preview:**\n```\n{preview}\n```\n"

                await callback_handler(
                    type="text_generation",
                    agent=agent_name,
                    data={
                        "chunk": success_msg,
                        "text": success_msg
                    }
                )

                await callback_handler(
                    type="tool_result",
                    agent=agent_name,
                    data={
                        "tool": "file_read",
                        "success": True,
                        "message": f"Successfully read {path}"
                    }
                )

            return {"status": "success", "content": [{"text": content}]}

        # File not found
        if callback_handler:
            error_msg = f"❌ **File Not Found:** `{path}`\n"
            error_msg += f"The requested file does not exist in the virtual filesystem.\n"
            await callback_handler(
                type="text_generation",
                agent=agent_name,
                data={
                    "chunk": error_msg,
                    "text": error_msg
                }
            )

        return {"status": "error", "content": [{"text": f"File not found: {path}"}]}

    return file_write, file_read


def create_python_repl_tool(agent_name: str, callback_handler: Optional[Callable] = None):
    """Create Python REPL tool with visible status updates"""
    @tool
    async def python_repl(code: str, persist_state: bool = True) -> dict:
        """Execute Python code in a sandboxed environment.
        
        Args:
            code: Python code to execute (required)
            persist_state: Keep variables between executions (optional)
        """
        if not code:
            return {"status": "error", "content": [{"text": "Code parameter is required"}]}
        
        # Send tool called notification with details
        if callback_handler:
            tool_msg = f"\n🔧 **Tool Called:** `python_repl`\n"
            tool_msg += f"**Purpose:** Execute Python code\n"
            tool_msg += f"**Code Length:** {len(code)} characters\n"
            tool_msg += f"**Persist State:** {persist_state}\n"
            tool_msg += f"⏳ Executing...\n"
            await callback_handler(
                type="text_generation",
                agent=agent_name,
                data={
                    "chunk": tool_msg,
                    "text": tool_msg
                }
            )
            
            # Show code preview
            code_lines = code.splitlines()[:10]
            preview = '\n'.join(code_lines)
            if len(code.splitlines()) > 10:
                preview += f"\n... ({len(code.splitlines()) - 10} more lines)"
            
            code_msg = f"**Code:**\n```python\n{preview}\n```\n"
            await callback_handler(
                type="text_generation",
                agent=agent_name,
                data={
                    "chunk": code_msg,
                    "text": code_msg
                }
            )
        
        try:
            # Import and use the actual Python REPL tool
            from app.tools.python_repl_tool import python_repl as repl_tool
            
            # Execute the code
            result = await repl_tool(code=code, persist_state=persist_state)
            
            # Send execution result notification
            if callback_handler:
                if result.get("success"):
                    success_msg = f"✅ **Python Code Executed Successfully**\n"
                    if result.get("stdout"):
                        success_msg += f"**Output:**\n```\n{result['stdout'][:500]}\n```\n"
                    if result.get("result"):
                        success_msg += f"**Result:** `{result['result'][:200]}`\n"
                    if result.get("variables"):
                        vars_list = ', '.join([f"{k}: {v}" for k, v in list(result['variables'].items())[:5]])
                        success_msg += f"**Variables:** {vars_list}\n"
                    success_msg += f"**Execution Time:** {result.get('execution_time', 0)} seconds\n"
                else:
                    success_msg = f"❌ **Python Execution Error**\n"
                    if result.get("stderr"):
                        success_msg += f"**Error:**\n```\n{result['stderr'][:500]}\n```\n"
                    elif result.get("error"):
                        success_msg += f"**Error:** {result['error']}\n"
                
                await callback_handler(
                    type="text_generation",
                    agent=agent_name,
                    data={
                        "chunk": success_msg,
                        "text": success_msg
                    }
                )
                
                await callback_handler(
                    type="tool_result",
                    agent=agent_name,
                    data={
                        "tool": "python_repl",
                        "success": result.get("success", False),
                        "result": result
                    }
                )
            
            # Format response for Strands
            if result.get("success"):
                content = result.get("stdout", "") or result.get("result", "Code executed successfully")
                return {"status": "success", "content": [{"text": content}]}
            else:
                error = result.get("stderr", "") or result.get("error", "Execution failed")
                return {"status": "error", "content": [{"text": error}]}
                
        except Exception as e:
            logger.error(f"Python REPL error: {e}")
            
            if callback_handler:
                error_msg = f"❌ **Python REPL Error:** {str(e)}\n"
                await callback_handler(
                    type="text_generation",
                    agent=agent_name,
                    data={
                        "chunk": error_msg,
                        "text": error_msg
                    }
                )
            
            return {"status": "error", "content": [{"text": str(e)}]}
    
    return python_repl


class EnhancedSwarmService:
    """Enhanced Swarm Service with WORKING Strands agents and VISIBLE tool calls"""

    def __init__(self):
        self.active_executions = {}
        self.orchestrator = None
        self._initialized = False

    async def _ensure_initialized(self):
        """Initialize resources"""
        if not self._initialized:
            self.orchestrator = AIOrchestrator()
            await self.orchestrator._ensure_initialized()
            self._initialized = True
            logger.info("✅ Enhanced Swarm Service initialized with Strands")

    async def execute_swarm_async(
        self,
        request: SwarmExecutionRequest,
        user_id: str,
        callback_handler: Optional[Callable] = None,
        use_orchestrator: bool = True,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        existing_agents: Optional[List[Dict[str, Any]]] = None
    ) -> SwarmExecutionResponse:
        """Execute swarm with PROPER Strands session management and shared context"""

        await self._ensure_initialized()

        # CRITICAL: Use consistent session_id for ALL agents in this execution
        # This ensures they share the same session manager and conversation history
        execution_id = request.execution_id or str(uuid.uuid4())
        
        logger.info(f"🚀 Starting swarm with shared session: {execution_id}")

        self.active_executions[execution_id] = {
            "status": "running",
            "start_time": datetime.utcnow(),
            "user_id": user_id,
            "conversation_history": conversation_history or [],
            "existing_agents": existing_agents or []
        }

        logger.info(f"🚀 Starting Strands swarm execution {execution_id}")

        try:
            # CRITICAL: Check if we're continuing an existing session with a coordinator
            # According to Strands docs, we should reuse the same agent for session continuity
            from app.services.strands_session_service import get_strands_session_service
            strands_service = get_strands_session_service()
            
            # Check if coordinator already exists for this session
            existing_coordinator = None
            if execution_id in strands_service.active_agents:
                if "coordinator" in strands_service.active_agents[execution_id]:
                    existing_coordinator = strands_service.active_agents[execution_id]["coordinator"]
                    logger.info(f"♻️ Found existing coordinator for session {execution_id}")
            
            # If we have an existing coordinator, we're in a continuation - skip agent generation
            is_continuation = existing_coordinator is not None
            
            if is_continuation and callback_handler:
                # Notify that we're continuing with existing coordinator
                continuation_msg = f"\n♻️ **Continuing session with existing coordinator**\n"
                continuation_msg += f"Session maintains full conversation history via Strands persistence.\n"
                await callback_handler(
                    type="text_generation",
                    agent="system",
                    data={"chunk": continuation_msg, "text": continuation_msg}
                )
            
            # Only generate agents if this is a NEW session (no existing coordinator)
            if use_orchestrator and not is_continuation and (not request.agents or len(request.agents) == 0):
                logger.info(f"📋 Orchestrating task for NEW session: {request.task}")
                
                # This is a new session, we need to generate agents
                has_existing_agents = bool(existing_agents and len(existing_agents) > 0)
                
                if False:  # This block was for continuations, but we handle them differently now
                    logger.info(f"🔄 Continuation detected with {len(existing_agents)} existing agents")
                    
                    # Analyze task complexity to determine if we need more agents
                    task_keywords = request.task.lower().split()
                    complexity_indicators = ['complex', 'multiple', 'also', 'additionally', 'analyze', 
                                            'compare', 'optimize', 'refactor', 'debug', 'integrate']
                    complexity_score = sum(1 for word in task_keywords if word in complexity_indicators)
                    
                    # Determine if we need additional specialized agents
                    needs_more_agents = (
                        complexity_score >= 2 or 
                        len(request.task) > 200 or 
                        'new' in task_keywords or 
                        'different' in task_keywords or
                        'add' in task_keywords
                    )
                    
                    if needs_more_agents:
                        logger.info(f"➕ Task complexity warrants additional agents (score: {complexity_score})")
                        # Generate 1-3 additional specialized agents for the new aspect
                        execution_mode = getattr(request, 'execution_mode', 'auto')
                        orchestration = await self.orchestrator.orchestrate(
                            f"Specialized agents needed for: {request.task}",
                            execution_mode=execution_mode
                        )
                        # Take only 1-3 new agents to add to existing ones
                        new_agents = [AgentConfig(**agent_data) for agent_data in orchestration["agents"][:3]]
                        
                        # Preserve existing agents and add new specialized ones
                        existing_agent_configs = []
                        for agent in existing_agents:
                            if isinstance(agent, dict):
                                existing_agent_configs.append(AgentConfig(**agent))
                            else:
                                existing_agent_configs.append(agent)
                        
                        request.agents = existing_agent_configs + new_agents
                        logger.info(f"📋 Total agents: {len(request.agents)} ({len(existing_agents)} preserved + {len(new_agents)} new)")
                        
                        # Notify about agent addition
                        if callback_handler:
                            agent_msg = f"\n🤖 **Intelligent Agent Management**\n"
                            agent_msg += f"• Preserving {len(existing_agents)} existing agents from previous tasks\n"
                            agent_msg += f"• Adding {len(new_agents)} specialized agents for complex continuation\n"
                            for agent in new_agents:
                                agent_msg += f"  - **{agent.name}**: {getattr(agent, 'role', 'Specialist')}\n"
                            await callback_handler(
                                type="text_generation",
                                agent="system",
                                data={"chunk": agent_msg, "text": agent_msg}
                            )
                    else:
                        # Reuse existing agents for simple continuation
                        logger.info(f"♻️ Reusing {len(existing_agents)} existing agents (simple continuation)")
                        request.agents = []
                        for agent in existing_agents:
                            if isinstance(agent, dict):
                                request.agents.append(AgentConfig(**agent))
                            else:
                                request.agents.append(agent)
                        
                        if callback_handler:
                            reuse_msg = f"\n♻️ **Reusing {len(existing_agents)} existing agents for continuation**\n"
                            await callback_handler(
                                type="text_generation",
                                agent="system",
                                data={"chunk": reuse_msg, "text": reuse_msg}
                            )
                else:
                    # Fresh task - generate new agents normally
                    execution_mode = getattr(request, 'execution_mode', 'auto')
                    orchestration = await self.orchestrator.orchestrate(request.task, execution_mode=execution_mode)
                    request.agents = [
                        AgentConfig(**agent_data) for agent_data in orchestration["agents"]
                    ]
                    logger.info(f"🆕 Generated {len(request.agents)} new agents for fresh task")

                if callback_handler:
                    # Send orchestration planning details
                    planning_msg = f"\n📋 **Planning Task Execution**\n\n"
                    planning_msg += f"**Task:** {request.task[:100]}{'...' if len(request.task) > 100 else ''}\n\n"
                    planning_msg += f"**Strategy:** Using {len(request.agents)} specialized agents\n"
                    for i, agent in enumerate(request.agents, 1):
                        planning_msg += f"\n**Agent {i}: {agent.name}**\n"
                        planning_msg += f"   • Role: {agent.role if hasattr(agent, 'role') else 'Task Specialist'}\n"
                        if hasattr(agent, 'tools') and agent.tools:
                            planning_msg += f"   • Tools: `{', '.join(agent.tools)}`\n"
                        else:
                            planning_msg += f"   • Tools: Analysis & Processing\n"
                    
                    planning_msg += f"\n**Execution:** Starting sequential workflow...\n"
                    
                    await callback_handler(
                        type="text_generation",
                        agent="system",
                        data={
                            "chunk": planning_msg,
                            "text": planning_msg
                        }
                    )
                    
                    # CRITICAL: Send generated agents to be saved in session
                    # Convert AgentConfig objects to dicts for storage
                    agent_dicts = []
                    for agent in request.agents:
                        if hasattr(agent, 'dict'):
                            agent_dict = agent.dict()
                        elif hasattr(agent, '__dict__'):
                            agent_dict = agent.__dict__
                        else:
                            agent_dict = dict(agent)
                        agent_dicts.append(agent_dict)
                    
                    await callback_handler(
                        type="agents_generated",
                        data={
                            "agents": agent_dicts
                        }
                    )
                    
                    await callback_handler(
                        type="orchestration_complete",
                        data={
                            "analysis": orchestration["analysis"],
                            "workflow": orchestration["workflow"],
                            "agent_count": len(request.agents)
                        }
                    )
            
            # Now execute with coordinator regardless of whether we just generated agents
            if use_orchestrator:
                # CRITICAL: Use Coordinator Pattern - Single persistent agent per session
                from app.services.coordinator_service import get_coordinator_service
                from app.services.strands_session_service import get_strands_session_service
                
                coordinator_service = get_coordinator_service()
                strands_service = get_strands_session_service()
                
                # Pre-create the shared session manager for this execution
                shared_session_manager = strands_service.get_or_create_session(execution_id)
                logger.info(f"📦 Created shared session manager for execution {execution_id}")
            
                # Collect ALL tools from all agent configs
                all_tools = []
                added_tools = set()
                
                for agent_config in request.agents:
                    if hasattr(agent_config, 'tools') and agent_config.tools:
                        for tool_name in agent_config.tools:
                            if tool_name in added_tools:
                                continue
                            
                            if tool_name == "tavily_search":
                                if os.getenv("TAVILY_API_KEY"):
                                    tool = create_tavily_tool("coordinator", callback_handler)
                                    all_tools.append(tool)
                                    added_tools.add(tool_name)
                                    logger.info(f"✅ Added tavily_search to coordinator")
                                else:
                                    logger.warning(f"⚠️ TAVILY_API_KEY not set, skipping tavily_search")
                            elif tool_name in ["file_write", "file_read"]:
                                if "file_write" not in added_tools and "file_read" not in added_tools:
                                    file_write, file_read = create_file_tools("coordinator", callback_handler)
                                    if "file_write" in agent_config.tools or tool_name == "file_write":
                                        all_tools.append(file_write)
                                        added_tools.add("file_write")
                                        logger.info(f"✅ Added file_write to coordinator")
                                    if "file_read" in agent_config.tools or tool_name == "file_read":
                                        all_tools.append(file_read)
                                        added_tools.add("file_read")
                                        logger.info(f"✅ Added file_read to coordinator")
                            elif tool_name == "python_repl":
                                tool = create_python_repl_tool("coordinator", callback_handler)
                                all_tools.append(tool)
                                added_tools.add(tool_name)
                                logger.info(f"✅ Added python_repl to coordinator")
                            else:
                                try:
                                    from app.services.dynamic_tool_wrapper import DynamicToolWrapper
                                    tool_wrapper = DynamicToolWrapper(callback_handler=callback_handler)
                                    wrapped_tool = tool_wrapper.wrap_strands_tool(tool_name, "coordinator")
                                    if wrapped_tool:
                                        all_tools.append(wrapped_tool)
                                        added_tools.add(tool_name)
                                        logger.info(f"✅ Added {tool_name} to coordinator")
                                    else:
                                        logger.warning(f"⚠️ Tool {tool_name} not found")
                                except Exception as e:
                                    logger.warning(f"Could not add tool {tool_name}: {e}")

                # COORDINATOR PATTERN: Use single persistent coordinator instead of multiple agents
                logger.info(f"🎯 Using Coordinator Pattern with {len(all_tools)} tools")
                logger.info(f"📊 Session has {len(conversation_history or [])} historical messages")
                
                # Convert agent configs to dicts for coordinator
                agent_configs_list = []
                for agent_config in request.agents:
                    if hasattr(agent_config, 'dict'):
                        agent_configs_list.append(agent_config.dict())
                    elif hasattr(agent_config, '__dict__'):
                        agent_configs_list.append(agent_config.__dict__)
                    else:
                        agent_configs_list.append(dict(agent_config))
                
                # Send start event
                if callback_handler:
                    await callback_handler(
                        type="execution_started",
                        data={
                            "task": request.task,
                            "agents": ["coordinator"]
                        }
                    )
                
                # Execute coordinator with all capabilities
                coordinator_result = await coordinator_service.execute_coordinator(
                    session_id=execution_id,
                    task=request.task,
                    agent_configs=agent_configs_list,
                    tools=all_tools,
                    callback_handler=callback_handler,
                    conversation_history=conversation_history,  # CRITICAL: Pass conversation history
                    stop_check=lambda: self.active_executions.get(execution_id, {}).get("status") == "stopped",
                )
                
                logger.info(f"✅ Coordinator completed execution")
                
                # Extract the actual content from coordinator result
                if coordinator_result.get("success"):
                    final_response = coordinator_result.get("content", "")
                else:
                    final_response = coordinator_result.get("content", "Error occurred")
                
                # Handle artifacts if any
                all_artifacts = []
                if final_response:
                    # Extract artifacts from response if needed
                    artifacts = await self._extract_artifacts_from_text(final_response)
                    all_artifacts.extend(artifacts)

                logger.info(f"🎉 Coordinator execution completed with {len(all_artifacts)} artifacts")

                # Send completion event
                if callback_handler:
                    await callback_handler(
                        type="execution_completed",
                        data={
                            "result": {
                                "final_response": final_response,
                                "artifacts": all_artifacts
                            }
                        }
                    )

                return SwarmExecutionResponse(
                    execution_id=execution_id,
                    status=ExecutionStatus.COMPLETED,
                    result=final_response,
                    handoffs=0,  # Single coordinator, no handoffs
                    tokens_used=0,  # TODO: Track tokens from coordinator
                    agent_sequence=["coordinator"],
                    artifacts=all_artifacts
                )

        except Exception as e:
            logger.error(f"Swarm execution failed: {e}", exc_info=True)

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

    async def stop_execution(self, execution_id: str) -> bool:
        """Mark execution as stopped so cooperative loops can exit."""
        if execution_id in self.active_executions:
            self.active_executions[execution_id]["status"] = "stopped"
            logger.info(f"🛑 EnhancedSwarmService: stop requested for {execution_id}")
            return True
        # If not tracked, still return False
        return False

    async def _extract_artifacts_from_text(self, text: str) -> List[Dict[str, Any]]:
        """Extract code artifacts from text"""
        artifacts = []
        if not text:
            return artifacts

        # Find code blocks
        code_blocks = re.findall(r'```(?:(\w+))?\n(.*?)```', text, re.DOTALL)

        for lang, code in code_blocks:
            if not code.strip():
                continue

            # Check for filename
            filename_match = re.search(r'#\s*filename:\s*(.+)', code)
            if filename_match:
                filename = filename_match.group(1).strip()
                code = re.sub(r'#\s*filename:.*\n', '', code)
            else:
                # Generate filename based on language
                ext = lang if lang else 'txt'
                filename = f"output_{len(artifacts) + 1}.{ext}"

            # Store in virtual filesystem
            GLOBAL_VIRTUAL_FILES[filename] = code.strip()
            logger.info(f"💾 Stored file: {filename}")

            artifacts.append({
                "type": "code",
                "name": filename,
                "content": code.strip(),
                "metadata": {
                    "language": lang or "text",
                    "agent": "coordinator",
                    "created_at": datetime.utcnow().isoformat()
                }
            })

        return artifacts
    
    def _compile_final_response(self, outputs: List[Dict], artifacts: List[Dict]) -> str:
        """Compile final response with details"""
        response = "# Task Completed Successfully\n\n"
        response += f"## Summary\n"
        response += f"- **Agents Executed:** {len(outputs)}\n"
        response += f"- **Files Generated:** {len(artifacts)}\n\n"

        if artifacts:
            response += "## Generated Files\n\n"
            for artifact in artifacts:
                response += f"### 📄 {artifact['name']}\n"
                response += f"- **Language:** {artifact['metadata']['language']}\n"
                response += f"- **Created by:** {artifact['metadata']['agent']}\n"
                response += f"- **Size:** {len(artifact['content'])} bytes\n\n"

        response += "\n✅ **All tasks completed successfully!**"
        return response

    async def cleanup(self):
        """Cleanup resources"""
        if self.orchestrator:
            await self.orchestrator.cleanup()
        self._initialized = False
