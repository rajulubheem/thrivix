"""
StrandsAgentRuntime: Proper integration with Strands agents
Supports async streaming, model selection, and tool calling
"""

import asyncio
import time
import logging
from typing import AsyncIterator, Dict, Any, Optional, Union, List
from dataclasses import dataclass
import sys
from pathlib import Path

from strands import Agent
from strands.session.file_session_manager import FileSessionManager

from app.services.agent_runtime import AgentRuntime, AgentContext
from app.services.event_hub import TokenFrame, ControlFrame, ControlType
from app.services.safe_tool_executor import SafeToolExecutor

# Import tool definitions for proper parameter instruction
sys.path.append(str(Path(__file__).parent))
try:
    from strands_tool_definitions import create_system_prompt_for_tools
except ImportError:
    def create_system_prompt_for_tools(tools: list) -> str:
        return ""

logger = logging.getLogger(__name__)


@dataclass
class StrandsAgentConfig:
    """Configuration for a Strands agent"""
    name: str
    system_prompt: str
    model: str = "gpt-4o-mini"
    tools: Optional[List[Any]] = None
    temperature: float = 0.7
    max_tokens: int = 2000
    enable_session: bool = False
    session_id: Optional[str] = None


class StrandsAgentRuntime(AgentRuntime):
    """
    Runtime wrapper for real Strands agents
    Handles async streaming and converts to our frame format
    """
    
    def __init__(
        self, 
        agent_id: str,
        config: StrandsAgentConfig
    ):
        super().__init__(agent_id, config.name, config.model)
        self.config = config
        self._agent = None
        self.safe_executor = SafeToolExecutor()
        self._initialize_agent()
    
    def _initialize_agent(self):
        """Initialize the Strands agent with configuration"""
        try:
            # Create session manager if enabled
            session_manager = None
            if self.config.enable_session and self.config.session_id:
                session_manager = FileSessionManager(
                    session_id=f"{self.config.session_id}-{self.agent_id}",
                    storage_dir="./sessions"
                )
            
            # Create the Strands agent - Agent class doesn't take temperature directly
            # Temperature is set on the model
            from strands.models.openai import OpenAIModel
            
            # Create model with temperature
            # The model_id is required by strands event loop
            model_instance = OpenAIModel(
                model=self.config.model,
                model_id=self.config.model,  # Add model_id for strands compatibility
                temperature=self.config.temperature,
                max_tokens=self.config.max_tokens
            )

            # Enhance system prompt with tool usage instructions
            enhanced_prompt = self.config.system_prompt
            if self.config.tools:
                # Get tool names from the tools list
                tool_names = []
                for tool in self.config.tools:
                    if hasattr(tool, '__name__'):
                        tool_names.append(tool.__name__)
                    elif hasattr(tool, 'name'):
                        tool_names.append(tool.name)

                # Add tool usage instructions if we have tools
                if tool_names:
                    tool_instructions = create_system_prompt_for_tools(tool_names)
                    if tool_instructions:
                        enhanced_prompt = f"{self.config.system_prompt}\n\n{tool_instructions}"

            self._agent = Agent(
                name=self.config.name,
                system_prompt=enhanced_prompt,
                model=model_instance,
                tools=self.config.tools or [],
                session_manager=session_manager,
                callback_handler=None  # We'll use async streaming instead
            )
            
            logger.info(f"Initialized Strands agent: {self.agent_id} ({self.config.name})")
            
        except Exception as e:
            logger.error(f"Failed to initialize Strands agent {self.agent_id}: {e}")
            raise
    
    async def stream(
        self,
        context: AgentContext
    ) -> AsyncIterator[Union[TokenFrame, ControlFrame]]:
        """
        Stream execution results using Strands async streaming
        """
        
        # Emit agent started event
        yield ControlFrame(
            exec_id=context.exec_id,
            type=ControlType.AGENT_STARTED,
            agent_id=self.agent_id,
            payload={
                "name": self.config.name,
                "model": self.config.model,
                "task": context.task,
                "has_tools": bool(self.config.tools),
                "temperature": self.config.temperature
            }
        )
        
        try:
            # Build the prompt with context if available
            prompt = self._build_prompt(context)
            
            # Track accumulated response
            full_response = ""
            tool_uses = []
            reasoning_steps = []
            
            # Stream from the Strands agent
            async for event in self._agent.stream_async(prompt):
                # Handle different event types
                
                # Text generation events
                if "data" in event:
                    text_chunk = event["data"]
                    if text_chunk:
                        full_response += text_chunk
                        
                        # Emit token frame
                        yield TokenFrame(
                            exec_id=context.exec_id,
                            agent_id=self.agent_id,
                            seq=self._next_seq(),
                            text=text_chunk,
                            ts=time.time(),
                            final=False
                        )
                
                # Tool usage events
                elif "current_tool_use" in event:
                    tool_use = event["current_tool_use"]
                    if tool_use.get("name"):
                        tool_name = tool_use["name"]
                        tool_uses.append(tool_use)
                        
                        # Emit control frame for tool usage
                        yield ControlFrame(
                            exec_id=context.exec_id,
                            type="tool_use",
                            agent_id=self.agent_id,
                            payload={
                                "tool": tool_name,
                                "input": tool_use.get("input", {}),
                                "result": tool_use.get("result")
                            }
                        )
                
                # Reasoning/thinking events
                elif "reasoning" in event:
                    reasoning = event["reasoning"]
                    if reasoning:
                        reasoning_steps.append(reasoning)
                        
                        # Optionally emit reasoning as a special control frame
                        yield ControlFrame(
                            exec_id=context.exec_id,
                            type="reasoning",
                            agent_id=self.agent_id,
                            payload={"step": reasoning}
                        )
                
                # Message creation events
                elif "message" in event:
                    message = event["message"]
                    logger.debug(f"Message created: role={message.get('role')}")
                
                # Completion events
                elif event.get("complete", False):
                    logger.info(f"Agent {self.agent_id} completed streaming")
                    break
                
                # Force stop events
                elif event.get("force_stop", False):
                    reason = event.get("force_stop_reason", "unknown")
                    logger.warning(f"Agent {self.agent_id} force stopped: {reason}")
                    break
            
            # Emit final token
            yield TokenFrame(
                exec_id=context.exec_id,
                agent_id=self.agent_id,
                seq=self._next_seq(),
                text="",
                ts=time.time(),
                final=True
            )
            
            # Emit completion event with full results
            yield ControlFrame(
                exec_id=context.exec_id,
                type=ControlType.AGENT_COMPLETED,
                agent_id=self.agent_id,
                payload={
                    "result": full_response,
                    "tokens": len(full_response.split()),
                    "tool_uses": len(tool_uses),
                    "reasoning_steps": len(reasoning_steps),
                    "model": self.config.model
                }
            )
            
        except Exception as e:
            logger.error(f"Agent {self.agent_id} streaming error: {e}")
            
            # Emit error frame
            yield ControlFrame(
                exec_id=context.exec_id,
                type=ControlType.ERROR,
                agent_id=self.agent_id,
                payload={
                    "error": str(e),
                    "type": type(e).__name__,
                    "agent": self.config.name
                }
            )
    
    def _build_prompt(self, context: AgentContext) -> str:
        """Build a richer, tool-aware prompt with strict output footer."""
        parts: List[str] = []
        parts.append(f"Task: {context.task}")

        # Summarize prior outputs briefly
        if context.parent_result:
            parts.append("\nContext from previous agent (truncated if long):\n" + str(context.parent_result)[:1500])

        # Provide compact metadata
        if context.metadata:
            meta_lines = []
            for k, v in list(context.metadata.items())[:10]:
                sv = str(v)
                meta_lines.append(f"- {k}: {sv[:200] + ('...' if len(sv) > 200 else '')}")
            if meta_lines:
                parts.append("\nAdditional metadata:\n" + "\n".join(meta_lines))

        # If tools are configured for this agent, list their names to avoid unknown tool attempts
        tool_names: List[str] = []
        try:
            tool_names = [getattr(t, "__name__", "") for t in (self.config.tools or []) if t]
            tool_names = [n for n in tool_names if n]
        except Exception:
            tool_names = []
        if tool_names:
            parts.append("\nPERMITTED_TOOLS (exact names):\n- " + "\n- ".join(tool_names))
            parts.append(
                "\nTOOL POLICY:\n"
                "- Call a tool only if it materially advances your task.\n"
                "- Never call tools not listed above.\n"
                "- If a tool returns an error or is unavailable, do not retry endlessly—adapt your plan and continue.\n"
                "- Prefer fewer, higher‑value calls over many redundant calls.\n"
            )
            # Add concise usage hints for commonly misused tools
            hints: list[str] = []
            if "file_read" in tool_names:
                hints.append("file_read expects {\"path\": \"...\"} (example: {\"path\": \"document.txt\"})")
            if "file_write" in tool_names:
                hints.append("file_write requires {\"path\": \"...\", \"content\": \"...\"}")
            if "tavily_search" in tool_names:
                hints.append("tavily_search needs {\"query\": \"...\"}")
            if hints:
                parts.append("\nUSAGE HINTS:\n- " + "\n- ".join(hints))

        # Strict footer to force a next event
        allowed = ["success", "failure"]
        try:
            meta_allowed = context.metadata.get('allowed_events') if context.metadata else None
            if isinstance(meta_allowed, list) and meta_allowed:
                # sanitize to strings
                allowed = [str(x) for x in meta_allowed if isinstance(x, (str, bytes))] or allowed
        except Exception:
            pass
        parts.append(
            "\nAt the very end of your response, output exactly one line:\n"
            f"NEXT_EVENT: <one of {allowed}>\n"
            "No extra commentary after that line."
        )
        return "\n".join(parts)


class StrandsAgentFactory:
    """Factory for creating Strands agents with different configurations"""
    
    @staticmethod
    def create_research_agent(agent_id: str) -> StrandsAgentRuntime:
        """Create a research specialist agent"""
        config = StrandsAgentConfig(
            name="Research Specialist",
            system_prompt="""You are a research specialist focused on gathering accurate, 
            comprehensive information. You excel at finding relevant data, analyzing sources, 
            and providing well-researched insights. Always cite your sources when possible.""",
            model="gpt-4o-mini",
            temperature=0.3  # Lower temperature for more focused research
        )
        return StrandsAgentRuntime(agent_id, config)
    
    @staticmethod
    def create_analysis_agent(agent_id: str) -> StrandsAgentRuntime:
        """Create a data analysis specialist agent"""
        config = StrandsAgentConfig(
            name="Analysis Specialist",
            system_prompt="""You are a data analysis specialist. You excel at processing 
            information, identifying patterns, and drawing meaningful conclusions from data. 
            You provide clear, structured analysis with actionable insights.""",
            model="gpt-4o-mini",
            temperature=0.5
        )
        return StrandsAgentRuntime(agent_id, config)
    
    @staticmethod
    def create_writer_agent(agent_id: str) -> StrandsAgentRuntime:
        """Create a content writer agent"""
        config = StrandsAgentConfig(
            name="Content Writer",
            system_prompt="""You are a skilled content writer who creates clear, engaging, 
            and well-structured content. You adapt your writing style to the audience and 
            purpose, ensuring readability and impact.""",
            model="gpt-4o-mini",
            temperature=0.7  # Higher temperature for more creative writing
        )
        return StrandsAgentRuntime(agent_id, config)
    
    @staticmethod
    def create_qa_agent(agent_id: str) -> StrandsAgentRuntime:
        """Create a quality assurance agent"""
        config = StrandsAgentConfig(
            name="QA Specialist",
            system_prompt="""You are a quality assurance specialist. You review work for 
            accuracy, completeness, and quality. You identify issues, suggest improvements, 
            and ensure high standards are met.""",
            model="gpt-4o-mini",
            temperature=0.2  # Very low temperature for consistent QA
        )
        return StrandsAgentRuntime(agent_id, config)
    
    @staticmethod
    def create_custom_agent(
        agent_id: str,
        name: str,
        system_prompt: str,
        model: str = "gpt-4o-mini",
        tools: Optional[List[Any]] = None,
        **kwargs
    ) -> StrandsAgentRuntime:
        """Create a custom agent with specified configuration"""
        config = StrandsAgentConfig(
            name=name,
            system_prompt=system_prompt,
            model=model,
            tools=tools,
            **kwargs
        )
        return StrandsAgentRuntime(agent_id, config)
