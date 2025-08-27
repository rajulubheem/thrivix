from fastapi import APIRouter, Depends, Request, Response
from sse_starlette import EventSourceResponse, ServerSentEvent
import json
import asyncio
import structlog
from datetime import datetime
import uuid
from typing import AsyncGenerator, Dict, Any, List, Optional
from collections import defaultdict
import time

# Optional Redis import
try:
    import redis.asyncio as redis
    REDIS_AVAILABLE = True
except ImportError:
    redis = None
    REDIS_AVAILABLE = False

from app.config import settings
from app.services.swarm_service import SwarmService
from app.services.enhanced_swarm_service import EnhancedSwarmService
from app.schemas.swarm import SwarmExecutionRequest
from app.core.security import get_current_user

logger = structlog.get_logger()
router = APIRouter()

class SSEManager:
    """FIXED SSE manager for ZERO-LATENCY real-time streaming like ChatGPT"""

    def __init__(self):
        self.execution_queues: Dict[str, asyncio.Queue] = {}
        self.active_connections: Dict[str, int] = defaultdict(int)
        self.execution_status: Dict[str, str] = {}
        self.redis_client: Optional[redis.Redis] = None
        self.redis_enabled = False
        self._redis_initialized = False

    async def _init_redis(self):
        """Initialize Redis connection if available"""
        if not REDIS_AVAILABLE:
            logger.info("Redis module not installed, using memory-only queues")
            self.redis_enabled = False
            return

        try:
            if hasattr(settings, 'REDIS_URL') and settings.REDIS_URL:
                self.redis_client = await redis.from_url(
                    settings.REDIS_URL,
                    encoding="utf-8",
                    decode_responses=True
                )
                await self.redis_client.ping()
                self.redis_enabled = True
                logger.info("Redis connected for SSE optimization")
        except Exception as e:
            logger.warning(f"Redis not available, using memory queues: {e}")
            self.redis_enabled = False

    async def add_connection(self, execution_id: str) -> asyncio.Queue:
        """Add a new connection for an execution - IMMEDIATE"""
        if execution_id not in self.execution_queues:
            # CRITICAL: Use unbounded queue for zero blocking
            self.execution_queues[execution_id] = asyncio.Queue(maxsize=0)

        self.active_connections[execution_id] += 1
        logger.info(f"IMMEDIATE SSE connection for {execution_id}, total: {self.active_connections[execution_id]}")
        return self.execution_queues[execution_id]

    async def remove_connection(self, execution_id: str):
        """Remove a connection for an execution"""
        self.active_connections[execution_id] -= 1
        if self.active_connections[execution_id] <= 0:
            self.active_connections.pop(execution_id, None)
            # Clean up queue after short delay to allow final events
            asyncio.create_task(self._cleanup_queue_delayed(execution_id))

        logger.info(f"SSE connection removed for {execution_id}, remaining: {self.active_connections.get(execution_id, 0)}")

    async def _cleanup_queue_delayed(self, execution_id: str):
        """Clean up queue after a delay"""
        await asyncio.sleep(5)  # REDUCED cleanup delay for faster cleanup
        if execution_id in self.execution_queues and self.active_connections.get(execution_id, 0) == 0:
            del self.execution_queues[execution_id]
            logger.info(f"Cleaned up queue for {execution_id}")

    async def broadcast_event(self, execution_id: str, event: dict):
        """CRITICAL FIX: Broadcast event with ZERO delay"""
        # Initialize Redis if not done yet
        if not self._redis_initialized:
            await self._init_redis()
            self._redis_initialized = True

        # Store in Redis for replay capability (non-blocking)
        if self.redis_enabled and self.redis_client:
            asyncio.create_task(self._cache_event_async(execution_id, event))

        # CRITICAL: IMMEDIATE broadcast to queue with zero delay
        if execution_id in self.execution_queues:
            queue = self.execution_queues[execution_id]
            try:
                # IMMEDIATE non-blocking put for zero latency
                queue.put_nowait(event)
                logger.debug(f"IMMEDIATE event sent for {execution_id}: {event.get('type')}")
            except asyncio.QueueFull:
                # This shouldn't happen with unbounded queue, but handle it
                logger.warning(f"Queue full for {execution_id}, creating new immediate queue")
                self.execution_queues[execution_id] = asyncio.Queue(maxsize=0)
                self.execution_queues[execution_id].put_nowait(event)

    async def _cache_event_async(self, execution_id: str, event: dict):
        """Cache event in Redis asynchronously"""
        try:
            event_key = f"sse:events:{execution_id}"
            await self.redis_client.rpush(event_key, json.dumps(event))
            await self.redis_client.expire(event_key, 1800)  # 30 minutes
        except Exception as e:
            logger.warning(f"Failed to cache event in Redis: {e}")

    async def get_cached_events(self, execution_id: str) -> List[dict]:
        """Get cached events from Redis"""
        if not self.redis_enabled or not self.redis_client:
            return []

        try:
            event_key = f"sse:events:{execution_id}"
            events = await self.redis_client.lrange(event_key, 0, -1)
            return [json.loads(event) for event in events]
        except Exception as e:
            logger.warning(f"Failed to get cached events: {e}")
            return []

    def get_status(self, execution_id: str) -> str:
        """Get execution status"""
        return self.execution_status.get(execution_id, "unknown")

    def set_status(self, execution_id: str, status: str):
        """Set execution status"""
        self.execution_status[execution_id] = status

# Global SSE manager
sse_manager = SSEManager()

@router.get("/events/{execution_id}")
async def stream_execution_events(
    request: Request,
    execution_id: str
):
    """FIXED SSE streaming for ZERO-LATENCY real-time experience"""

    async def event_generator() -> AsyncGenerator[Dict[str, Any], None]:
        """Generate SSE events with ZERO delay - maximum responsiveness"""
        queue = await sse_manager.add_connection(execution_id)

        try:
            # Send IMMEDIATE connection confirmation
            yield ServerSentEvent(
                data=json.dumps({
                    "type": "connection_established",
                    "execution_id": execution_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "message": "Real-time connection established"
                }),
                event="message",
                retry=500  # FASTER retry on disconnect
            )

            # Check for cached events and replay them IMMEDIATELY
            cached_events = await sse_manager.get_cached_events(execution_id)
            if cached_events:
                logger.info(f"Replaying {len(cached_events)} cached events IMMEDIATELY for {execution_id}")
                for event in cached_events:
                    yield ServerSentEvent(
                        data=json.dumps(event),
                        event="message",
                        id=str(int(time.time() * 1000000))  # Microsecond precision
                    )
                    # NO DELAY - send cached events as fast as possible

            # Check execution status
            status = sse_manager.get_status(execution_id)
            if status in ["completed", "failed", "stopped"]:
                logger.info(f"Execution {execution_id} already {status}")
                yield ServerSentEvent(
                    data=json.dumps({
                        "type": "status_check",
                        "execution_id": execution_id,
                        "status": status,
                        "timestamp": datetime.utcnow().isoformat()
                    }),
                    event="message"
                )

            # CRITICAL FIX: Main event loop optimized for ZERO-LATENCY streaming
            last_heartbeat = time.time()
            heartbeat_interval = 25  # Reduced heartbeat interval

            while True:
                # IMMEDIATE disconnect check
                if await request.is_disconnected():
                    logger.info(f"Client disconnected from {execution_id}")
                    break

                try:
                    # CRITICAL: Use MINIMAL timeout for maximum responsiveness
                    event = await asyncio.wait_for(queue.get(), timeout=0.001)  # 1ms timeout!

                    # IMMEDIATE event transmission with zero processing delay
                    yield ServerSentEvent(
                        data=json.dumps(event),
                        event="message",
                        id=str(int(time.time() * 1000000)),  # Microsecond precision ID
                        retry=500  # Fast retry
                    )

                    # Reset heartbeat timer
                    last_heartbeat = time.time()

                    # IMMEDIATE completion check
                    if event.get("type") in ["execution_completed", "execution_failed", "execution_stopped"]:
                        logger.info(f"Execution {execution_id} finished with {event.get('type')}")
                        # Very brief delay then close
                        await asyncio.sleep(0.1)
                        break

                except asyncio.TimeoutError:
                    # Only send heartbeat if it's been a while
                    current_time = time.time()
                    if current_time - last_heartbeat > heartbeat_interval:
                        yield ServerSentEvent(
                            data=json.dumps({
                                "type": "heartbeat",
                                "timestamp": datetime.utcnow().isoformat()
                            }),
                            event="heartbeat"
                        )
                        last_heartbeat = current_time
                    continue

        except asyncio.CancelledError:
            logger.info(f"SSE stream cancelled for {execution_id}")
            raise
        except Exception as e:
            logger.error(f"Error in IMMEDIATE SSE stream for {execution_id}: {e}")
            yield ServerSentEvent(
                data=json.dumps({
                    "type": "error",
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat()
                }),
                event="error"
            )
        finally:
            await sse_manager.remove_connection(execution_id)

    # Return EventSourceResponse optimized for ZERO-LATENCY streaming
    return EventSourceResponse(
        event_generator(),
        ping=25,  # Reduced ping interval
        headers={
            # CRITICAL headers for preventing ANY buffering and ensuring IMMEDIATE delivery
            "Cache-Control": "no-cache, no-store, must-revalidate, no-transform, private",
            "Pragma": "no-cache",
            "Expires": "0",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering
            "X-Nginx-Buffering": "no",  # Alternative Nginx header
            "X-Content-Type-Options": "nosniff",
            "Connection": "keep-alive",
            "Transfer-Encoding": "chunked",
            # CORS headers
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, Cache-Control",
            # Performance optimization headers
            "Server-Timing": "sse-setup;dur=0",
            # Force immediate transmission
            "X-No-Buffer": "1"
        },
        media_type="text/event-stream"
    )

@router.post("/execute_stream")
async def execute_swarm_with_stream(
    request_data: SwarmExecutionRequest,
    current_user: dict = Depends(get_current_user)
):
    """Execute swarm with IMMEDIATE streaming - zero setup delay"""
    execution_id = request_data.execution_id or str(uuid.uuid4())

    # Use enhanced service for better performance
    if settings.USE_ENHANCED_SWARM:
        swarm_service = EnhancedSwarmService()
    else:
        swarm_service = SwarmService()

    # Set initial status IMMEDIATELY
    sse_manager.set_status(execution_id, "started")

    # Start execution IMMEDIATELY in background
    asyncio.create_task(
        execute_with_streaming(execution_id, request_data, current_user["id"], swarm_service)
    )

    return {
        "execution_id": execution_id,
        "status": "started",
        "message": "Real-time execution started",
        "stream_url": f"/api/v1/sse/events/{execution_id}"
    }

async def execute_with_streaming(
    execution_id: str,
    request_data: SwarmExecutionRequest,
    user_id: str,
    swarm_service
):
    """Execute swarm with ZERO-LATENCY streaming callbacks"""

    async def stream_callback(**kwargs):
        """CRITICAL: Stream callback with ZERO delay"""
        event_data = {
            "type": "swarm_event",
            "execution_id": execution_id,
            "event": {
                "type": kwargs.get("type", "unknown"),
                "agent": kwargs.get("agent"),
                "data": kwargs.get("data", {}),
                "timestamp": datetime.utcnow().isoformat()
            },
            "timestamp": datetime.utcnow().isoformat()
        }

        # CRITICAL: IMMEDIATE broadcast with zero delay
        await sse_manager.broadcast_event(execution_id, event_data)

    try:
        # Send execution started IMMEDIATELY
        await sse_manager.broadcast_event(execution_id, {
            "type": "execution_started",
            "execution_id": execution_id,
            "timestamp": datetime.utcnow().isoformat(),
            "message": "Swarm execution started - agents will appear in real-time"
        })

        # Execute with real-time callbacks
        request_data.execution_id = execution_id
        result = await swarm_service.execute_swarm_async(
            request=request_data,
            user_id=user_id,
            callback_handler=stream_callback
        )

        # Send completion IMMEDIATELY
        await sse_manager.broadcast_event(execution_id, {
            "type": "execution_completed",
            "execution_id": execution_id,
            "result": result.model_dump() if result else None,
            "timestamp": datetime.utcnow().isoformat()
        })

        sse_manager.set_status(execution_id, "completed")

    except Exception as e:
        logger.error(f"IMMEDIATE swarm execution failed: {e}", execution_id=execution_id)

        await sse_manager.broadcast_event(execution_id, {
            "type": "execution_failed",
            "execution_id": execution_id,
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        })

        sse_manager.set_status(execution_id, "failed")

@router.delete("/stop/{execution_id}")
async def stop_execution_stream(
    execution_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Stop execution with immediate notification"""
    swarm_service = SwarmService()
    stopped = await swarm_service.stop_execution(execution_id)

    if stopped:
        # Immediate notification
        await sse_manager.broadcast_event(execution_id, {
            "type": "execution_stopped",
            "execution_id": execution_id,
            "timestamp": datetime.utcnow().isoformat()
        })

        sse_manager.set_status(execution_id, "stopped")

    return {"stopped": stopped, "execution_id": execution_id}

@router.options("/events/{execution_id}")
async def options_events(execution_id: str):
    """CORS preflight with optimized headers"""
    return Response(
        content="",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, Cache-Control",
            "Access-Control-Max-Age": "86400"  # 24 hours
        }
    )