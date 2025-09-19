"""
AgentRuntime: Minimal, pluggable interface for agents
Agents only yield tokens/results - no UI callbacks, no DB writes
"""

from abc import ABC, abstractmethod
from typing import AsyncIterator, Dict, Any, Optional, Union
from dataclasses import dataclass
import time
import logging

from app.services.event_hub import TokenFrame, ControlFrame, ControlType

logger = logging.getLogger(__name__)


@dataclass
class AgentContext:
    """Context passed to agents during execution"""
    exec_id: str
    agent_id: str
    task: str
    config: Dict[str, Any]
    parent_result: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class AgentRuntime(ABC):
    """
    Abstract base class for agent runtimes
    Agents yield frames - orchestrator handles publishing
    """
    
    def __init__(self, agent_id: str, name: str, model: str = "gpt-4"):
        self.agent_id = agent_id
        self.name = name
        self.model = model
        self._sequence = 0
    
    def reset_sequence(self):
        """Reset sequence counter for new execution"""
        self._sequence = 0
    
    @abstractmethod
    async def stream(
        self,
        context: AgentContext
    ) -> AsyncIterator[Union[TokenFrame, ControlFrame]]:
        """
        Stream execution results
        Yields TokenFrame for text chunks, ControlFrame for events
        
        This is the ONLY method agents need to implement
        """
        pass
    
    def _next_seq(self) -> int:
        """Get next sequence number"""
        self._sequence += 1
        return self._sequence


class SimpleAgentRuntime(AgentRuntime):
    """
    Simple implementation that wraps existing Strands agents
    Adapts their streaming output to our frame format
    """
    
    def __init__(self, agent_id: str, strands_agent: Any):
        super().__init__(agent_id, strands_agent.name, strands_agent.model)
        self.strands_agent = strands_agent
    
    async def stream(
        self,
        context: AgentContext
    ) -> AsyncIterator[Union[TokenFrame, ControlFrame]]:
        """
        Adapt Strands agent streaming to frame format
        """
        
        # Emit started event
        yield ControlFrame(
            exec_id=context.exec_id,
            type=ControlType.AGENT_STARTED,
            agent_id=self.agent_id,
            payload={
                "name": self.name,
                "model": self.model,
                "task": context.task
            }
        )
        
        try:
            # Run the Strands agent
            result = await self.strands_agent.run(context.task)
            
            # Stream tokens
            full_response = ""
            async for chunk in result:
                if hasattr(chunk, "choices") and chunk.choices:
                    delta = chunk.choices[0].delta
                    if hasattr(delta, "content") and delta.content:
                        text = delta.content
                        full_response += text
                        
                        # Yield token frame
                        yield TokenFrame(
                            exec_id=context.exec_id,
                            agent_id=self.agent_id,
                            seq=self._next_seq(),
                            text=text,
                            ts=time.time(),
                            final=False
                        )
            
            # Emit final token
            if full_response:
                yield TokenFrame(
                    exec_id=context.exec_id,
                    agent_id=self.agent_id,
                    seq=self._next_seq(),
                    text="",
                    ts=time.time(),
                    final=True
                )
            
            # Emit completed event
            yield ControlFrame(
                exec_id=context.exec_id,
                type=ControlType.AGENT_COMPLETED,
                agent_id=self.agent_id,
                payload={
                    "result": full_response,
                    "tokens": len(full_response.split())
                }
            )
            
        except Exception as e:
            logger.error(f"Agent {self.agent_id} error: {e}")
            
            # Emit error frame
            yield ControlFrame(
                exec_id=context.exec_id,
                type=ControlType.ERROR,
                agent_id=self.agent_id,
                payload={
                    "error": str(e),
                    "type": type(e).__name__
                }
            )


class MockAgentRuntime(AgentRuntime):
    """Mock agent for testing the streaming pipeline"""
    
    def __init__(self, agent_id: str, name: str, delay: float = 0.1):
        super().__init__(agent_id, name, "mock")
        self.delay = delay
    
    async def stream(
        self,
        context: AgentContext
    ) -> AsyncIterator[Union[TokenFrame, ControlFrame]]:
        """Generate mock streaming output"""
        
        # Started event
        yield ControlFrame(
            exec_id=context.exec_id,
            type=ControlType.AGENT_STARTED,
            agent_id=self.agent_id,
            payload={"name": self.name, "task": context.task}
        )
        
        # Simulate streaming tokens - unique content per agent
        import random
        unique_id = random.randint(1000, 9999)
        response = f"[Agent {self.agent_id}] Processing: {context.task}\n"
        response += f"I am {self.name} (ID:{unique_id}).\n"
        response += "My approach:\n"
        response += f"Step 1: Analyze {context.task}\n"
        response += f"Step 2: Design solution for {self.name}\n"
        response += f"Step 3: Implement as {self.agent_id}\n"
        response += f"Step 4: Validate results\n"
        
        # Stream word by word
        words = response.split()
        for i, word in enumerate(words):
            yield TokenFrame(
                exec_id=context.exec_id,
                agent_id=self.agent_id,
                seq=self._next_seq(),
                text=word + " ",
                ts=time.time(),
                final=False
            )
            
            # Simulate processing delay
            await asyncio.sleep(self.delay)
        
        # Final token
        yield TokenFrame(
            exec_id=context.exec_id,
            agent_id=self.agent_id,
            seq=self._next_seq(),
            text="",
            ts=time.time(),
            final=True
        )
        
        # Completed event
        yield ControlFrame(
            exec_id=context.exec_id,
            type=ControlType.AGENT_COMPLETED,
            agent_id=self.agent_id,
            payload={"result": response}
        )


import asyncio