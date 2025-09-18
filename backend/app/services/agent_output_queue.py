"""
Agent Output Queue Manager

Manages sequential output streaming from parallel agents to prevent UI chaos.
Agents can compute in parallel but their outputs are queued and streamed one at a time.
"""
import asyncio
import logging
from typing import Dict, List, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
from collections import deque

logger = logging.getLogger(__name__)

@dataclass
class QueuedOutput:
    """Represents a queued output from an agent"""
    agent_name: str
    chunk: str
    timestamp: datetime
    execution_id: str
    
@dataclass
class AgentOutputBuffer:
    """Buffers output from a single agent"""
    agent_name: str
    execution_id: str
    chunks: deque = field(default_factory=deque)
    is_complete: bool = False
    is_streaming: bool = False

class AgentOutputQueue:
    """
    Manages output streaming from multiple agents.
    
    Key features:
    - Agents can add chunks to their buffers at any time
    - Only one agent streams at a time to the UI
    - Automatic switching when an agent completes
    """
    
    def __init__(self):
        self.agent_buffers: Dict[str, AgentOutputBuffer] = {}
        self.streaming_queue: deque = deque()  # Queue of agent names waiting to stream
        self.current_streaming_agent: Optional[str] = None
        self.global_callback: Optional[Callable] = None
        self._lock = asyncio.Lock()
        self._stream_task: Optional[asyncio.Task] = None
        
    def set_global_callback(self, callback: Callable):
        """Set the global callback for streaming output to UI"""
        self.global_callback = callback
        logger.info("Global callback set for output queue")
        
    async def add_agent(self, agent_name: str, execution_id: str):
        """Register a new agent for output queueing"""
        async with self._lock:
            if agent_name not in self.agent_buffers:
                self.agent_buffers[agent_name] = AgentOutputBuffer(
                    agent_name=agent_name,
                    execution_id=execution_id
                )
                self.streaming_queue.append(agent_name)
                logger.info(f"Added agent {agent_name} to output queue")
                
                # Start streaming if this is the first agent
                if not self.current_streaming_agent and not self._stream_task:
                    self._stream_task = asyncio.create_task(self._stream_loop())
    
    async def add_chunk(self, agent_name: str, chunk: str, execution_id: str):
        """Add a chunk from an agent to its buffer"""
        async with self._lock:
            # Auto-register agent if not exists
            if agent_name not in self.agent_buffers:
                await self.add_agent(agent_name, execution_id)
                
            buffer = self.agent_buffers.get(agent_name)
            if buffer and not buffer.is_complete:
                buffer.chunks.append(chunk)
                logger.debug(f"Added chunk ({len(chunk)} chars) from {agent_name}")
    
    async def mark_agent_complete(self, agent_name: str):
        """Mark an agent as complete"""
        async with self._lock:
            if agent_name in self.agent_buffers:
                self.agent_buffers[agent_name].is_complete = True
                logger.info(f"Agent {agent_name} marked as complete")
                
                # If this was the current streaming agent, switch to next
                if self.current_streaming_agent == agent_name:
                    self.current_streaming_agent = None
    
    async def _stream_loop(self):
        """Main streaming loop - streams one agent at a time"""
        while True:
            try:
                async with self._lock:
                    # Find next agent to stream
                    if not self.current_streaming_agent:
                        # Find next agent with chunks to stream
                        for agent_name in list(self.streaming_queue):
                            buffer = self.agent_buffers.get(agent_name)
                            if buffer and (buffer.chunks or not buffer.is_complete):
                                self.current_streaming_agent = agent_name
                                buffer.is_streaming = True
                                logger.info(f"Now streaming agent: {agent_name}")
                                break
                    
                    # Stream chunks from current agent
                    if self.current_streaming_agent:
                        buffer = self.agent_buffers.get(self.current_streaming_agent)
                        if buffer and buffer.chunks:
                            # Stream up to 5 chunks at once for smoother output
                            chunks_to_stream = []
                            for _ in range(min(5, len(buffer.chunks))):
                                if buffer.chunks:
                                    chunks_to_stream.append(buffer.chunks.popleft())
                            
                            # Send chunks to callback
                            if chunks_to_stream and self.global_callback:
                                combined_chunk = "".join(chunks_to_stream)
                                await self._send_to_callback(
                                    self.current_streaming_agent,
                                    combined_chunk,
                                    buffer.execution_id
                                )
                        
                        # Check if agent is done
                        if buffer and buffer.is_complete and not buffer.chunks:
                            logger.info(f"Agent {self.current_streaming_agent} finished streaming")
                            self.streaming_queue.remove(self.current_streaming_agent)
                            self.current_streaming_agent = None
                            
                            # Send completion event
                            if self.global_callback:
                                await self._send_completion(buffer.agent_name, buffer.execution_id)
                    
                    # Exit if no more agents
                    if not self.streaming_queue and not self.current_streaming_agent:
                        logger.info("No more agents to stream, exiting stream loop")
                        break
                
                # Small delay to prevent CPU spinning
                await asyncio.sleep(0.05)
                
            except Exception as e:
                logger.error(f"Error in stream loop: {e}", exc_info=True)
                await asyncio.sleep(0.1)
    
    async def _send_to_callback(self, agent_name: str, chunk: str, execution_id: str):
        """Send chunk to the global callback"""
        if self.global_callback:
            try:
                if asyncio.iscoroutinefunction(self.global_callback):
                    await self.global_callback(
                        type="text_generation",
                        agent=agent_name,
                        data={"chunk": chunk},
                        execution_id=execution_id
                    )
                else:
                    self.global_callback(
                        type="text_generation",
                        agent=agent_name,
                        data={"chunk": chunk},
                        execution_id=execution_id
                    )
            except Exception as e:
                logger.error(f"Error sending chunk to callback: {e}")
    
    async def _send_completion(self, agent_name: str, execution_id: str):
        """Send completion event for an agent"""
        if self.global_callback:
            try:
                if asyncio.iscoroutinefunction(self.global_callback):
                    await self.global_callback(
                        type="agent_completed",
                        agent=agent_name,
                        data={"completed": True},
                        execution_id=execution_id
                    )
                else:
                    self.global_callback(
                        type="agent_completed",
                        agent=agent_name,
                        data={"completed": True},
                        execution_id=execution_id
                    )
            except Exception as e:
                logger.error(f"Error sending completion to callback: {e}")

# Global instance
_output_queue: Optional[AgentOutputQueue] = None

def get_output_queue() -> AgentOutputQueue:
    """Get or create the global output queue"""
    global _output_queue
    if not _output_queue:
        _output_queue = AgentOutputQueue()
    return _output_queue

def reset_output_queue():
    """Reset the global output queue"""
    global _output_queue
    _output_queue = AgentOutputQueue()
    return _output_queue