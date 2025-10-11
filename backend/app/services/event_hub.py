"""
EventHub: Central event backbone using Redis Streams
Provides exactly-once semantics with sequence tracking per agent stream
"""

import json
import asyncio
import time
from typing import Optional, Dict, Any, AsyncIterator, List
from dataclasses import dataclass, asdict
import redis.asyncio as redis
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class FrameType(str, Enum):
    TOKEN = "token"
    CONTROL = "control"
    METRICS = "metrics"
    ERROR = "error"


class ControlType(str, Enum):
    AGENT_STARTED = "agent_started"
    AGENT_COMPLETED = "agent_completed"
    TASK_STARTED = "task_started"
    TASK_COMPLETED = "task_completed"
    SESSION_START = "session_start"
    SESSION_END = "session_end"
    ERROR = "error"


@dataclass
class TokenFrame:
    """Data-plane frame for streaming tokens"""
    exec_id: str
    agent_id: str
    seq: int
    text: str
    ts: float
    final: bool = False
    frame_type: str = FrameType.TOKEN
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ControlFrame:
    """Control-plane frame for orchestration events"""
    exec_id: str
    type: str  # ControlType value
    agent_id: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    ts: Optional[float] = None
    frame_type: str = FrameType.CONTROL
    
    def __post_init__(self):
        if self.ts is None:
            self.ts = time.time()
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class EventHub:
    """
    Central event hub using Redis Streams
    Topics: exec.{id}.token, exec.{id}.control, exec.{id}.metrics
    """
    
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis_url = redis_url
        self._redis: Optional[redis.Redis] = None
        
    async def connect(self):
        """Connect to Redis"""
        if not self._redis:
            self._redis = await redis.from_url(
                self.redis_url,
                decode_responses=True
            )
            logger.info("Connected to Redis EventHub")
    
    async def disconnect(self):
        """Disconnect from Redis"""
        if self._redis:
            await self._redis.close()
            self._redis = None
    
    async def publish_token(self, frame: TokenFrame) -> str:
        """
        Publish token frame to exec.{id}.token stream
        Returns: Message ID from Redis
        """
        await self.connect()
        
        # Don't modify the sequence - agents manage their own sequences
        # This prevents duplicate sequence numbers
        stream_key = f"exec.{frame.exec_id}.token"
        data = {
            "data": json.dumps(frame.to_dict()),
            "agent_id": frame.agent_id,
            "seq": str(frame.seq)
        }
        
        msg_id = await self._redis.xadd(stream_key, data, maxlen=10000)
        logger.debug(f"Published token to {stream_key}: seq={frame.seq}, agent={frame.agent_id}")
        return msg_id
    
    async def publish_control(self, frame: ControlFrame) -> str:
        """
        Publish control frame to exec.{id}.control stream
        Returns: Message ID from Redis
        """
        await self.connect()
        
        stream_key = f"exec.{frame.exec_id}.control"
        data = {
            "data": json.dumps(frame.to_dict()),
            "type": frame.type,
            "agent_id": frame.agent_id or ""
        }
        
        msg_id = await self._redis.xadd(stream_key, data, maxlen=1000)
        logger.info(f"Published control event {frame.type} to {stream_key}")
        return msg_id
    
    async def subscribe(
        self,
        exec_id: str,
        streams: List[str] = ["token", "control"],
        start_id: str = "$"
    ) -> AsyncIterator[Dict[str, Any]]:
        """
        Subscribe to execution streams
        Yields parsed frames as they arrive
        
        Args:
            exec_id: Execution ID
            streams: List of stream types to subscribe to
            start_id: Redis stream ID to start from ("$" for new messages, "0" for all)
        """
        await self.connect()
        
        # Build stream keys
        stream_keys = {
            f"exec.{exec_id}.{stream}": start_id
            for stream in streams
        }
        
        logger.info(f"Subscribing to streams: {list(stream_keys.keys())} from position: {start_id}")
        
        # If starting from beginning, first get all existing messages
        if start_id == "0" or start_id == "0-0":
            for stream_name in list(stream_keys.keys()):
                # Get all existing messages
                existing = await self._redis.xrange(stream_name, "-", "+")
                if existing:
                    for msg_id, data in existing:
                        frame_data = json.loads(data.get("data", "{}"))
                        yield frame_data
                        # Update position to last message
                        stream_keys[stream_name] = msg_id
                else:
                    # No existing messages, set to $ to only get new ones
                    stream_keys[stream_name] = "$"
            
            logger.info(f"Finished reading historical messages, now listening for new ones")
        
        # Now listen for new messages only
        while True:
            try:
                # Read with 100ms timeout
                messages = await self._redis.xread(
                    stream_keys,
                    block=100
                )
                
                for stream_name, stream_messages in messages:
                    for msg_id, data in stream_messages:
                        # Update position for next read
                        stream_keys[stream_name] = msg_id
                        
                        # Parse and yield frame
                        frame_data = json.loads(data.get("data", "{}"))
                        yield frame_data
                        
            except asyncio.CancelledError:
                logger.info(f"Subscription cancelled for {exec_id}")
                break
            except Exception as e:
                logger.error(f"Error in subscription: {e}")
                await asyncio.sleep(0.1)
    
    async def reset_execution(self, exec_id: str):
        """
        Clear any existing streams for a new execution
        """
        # No longer need to track sequences - agents manage their own
        logger.info(f"Ready for new execution {exec_id}")
    
    async def delete_execution_streams(self, exec_id: str):
        """
        Delete all streams for an execution immediately
        """
        await self.connect()
        
        streams = [
            f"exec.{exec_id}.token",
            f"exec.{exec_id}.control",
            f"exec.{exec_id}.metrics"
        ]
        
        for stream in streams:
            try:
                await self._redis.delete(stream)
            except Exception as e:
                logger.warning(f"Could not delete stream {stream}: {e}")
        
        logger.info(f"Deleted streams for execution {exec_id}")
    
    async def cleanup_execution(self, exec_id: str, ttl: int = 3600):
        """
        Mark streams for expiration after TTL
        Default: 1 hour retention
        """
        await self.connect()
        
        streams = [
            f"exec.{exec_id}.token",
            f"exec.{exec_id}.control",
            f"exec.{exec_id}.metrics"
        ]
        
        for stream in streams:
            try:
                await self._redis.expire(stream, ttl)
                logger.info(f"Set TTL={ttl}s for stream {stream}")
            except Exception as e:
                logger.error(f"Error setting TTL for {stream}: {e}")


# Singleton instance
_event_hub: Optional[EventHub] = None


def get_event_hub() -> EventHub:
    """Get singleton EventHub instance"""
    global _event_hub
    if _event_hub is None:
        from app.config import settings
        _event_hub = EventHub(redis_url=settings.REDIS_URL)
    return _event_hub