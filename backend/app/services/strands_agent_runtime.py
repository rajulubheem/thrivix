"""
StrandsAgentRuntime: Proper integration with Strands agents
Supports async streaming, model selection, and tool calling
"""

import asyncio
import time
import logging
from typing import AsyncIterator, Dict, Any, Optional, Union, List
from dataclasses import dataclass

from strands import Agent
from strands.session.file_session_manager import FileSessionManager

from app.services.agent_runtime import AgentRuntime, AgentContext
from app.services.event_hub import TokenFrame, ControlFrame, ControlType

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
            
            # Create the Strands agent
            self._agent = Agent(
                name=self.config.name,
                system_prompt=self.config.system_prompt,
                model=self.config.model,
                tools=self.config.tools or [],
                temperature=self.config.temperature,
                max_tokens=self.config.max_tokens,
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
        """Build the prompt with context from parent agents"""
        prompt_parts = []
        
        # Add the main task
        prompt_parts.append(f"Task: {context.task}")
        
        # Add parent result if available
        if context.parent_result:
            prompt_parts.append(f"\nContext from previous agent:\n{context.parent_result}")
        
        # Add any additional metadata
        if context.metadata:
            for key, value in context.metadata.items():
                prompt_parts.append(f"\n{key}: {value}")
        
        return "\n".join(prompt_parts)


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