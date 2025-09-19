"""
WebSocket Gateway: Lightweight real-time streaming endpoint
Subscribes to Redis EventHub and pushes frames to browser
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from typing import Optional, Dict, Any, Set
import asyncio
import json
import logging
from collections import deque
import time

from app.services.event_hub import get_event_hub, FrameType

logger = logging.getLogger(__name__)

router = APIRouter()


class ClientConnection:
    """Manages a single WebSocket client connection with backpressure"""
    
    def __init__(self, websocket: WebSocket, exec_id: str, buffer_size: int = 100):
        self.websocket = websocket
        self.exec_id = exec_id
        self.buffer_size = buffer_size
        self.token_buffer = deque(maxlen=buffer_size)  # Ring buffer for tokens
        self.control_queue = asyncio.Queue()  # Unbounded for control frames
        self.last_seq_per_agent: Dict[str, int] = {}
        self.seen_message_ids: Set[str] = set()  # Track seen Redis message IDs
        self.connected = True
        self.stats = {
            "tokens_sent": 0,
            "tokens_dropped": 0,
            "control_sent": 0,
            "connect_time": time.time()
        }
    
    async def send_frame(self, frame: Dict[str, Any]):
        """
        Send frame to client with backpressure handling
        Control frames always sent, token frames may be dropped if buffer full
        """
        if not self.connected:
            return
        
        frame_type = frame.get("frame_type", FrameType.TOKEN)
        
        try:
            if frame_type == FrameType.CONTROL:
                # Control frames get priority - never drop
                await self.control_queue.put(frame)
                self.stats["control_sent"] += 1
            else:
                # Token frames use ring buffer - old ones dropped if full
                if len(self.token_buffer) >= self.buffer_size:
                    self.stats["tokens_dropped"] += 1
                    logger.debug(f"Dropping token frame for {self.exec_id}, buffer full")
                
                self.token_buffer.append(frame)
                self.stats["tokens_sent"] += 1
                
        except Exception as e:
            logger.error(f"Error queueing frame: {e}")
            self.connected = False
    
    async def writer_task(self):
        """
        Background task that writes frames to WebSocket
        Prioritizes control frames, batches token frames
        """
        try:
            while self.connected:
                # First, send any control frames (priority)
                try:
                    control_frame = self.control_queue.get_nowait()
                    await self.websocket.send_json(control_frame)
                    logger.debug(f"Sent control frame: {control_frame.get('type')}")
                except asyncio.QueueEmpty:
                    pass
                
                # Then batch send token frames
                if self.token_buffer:
                    # Send up to 10 token frames at once
                    batch_size = min(10, len(self.token_buffer))
                    batch = []
                    
                    for _ in range(batch_size):
                        if self.token_buffer:
                            frame = self.token_buffer.popleft()
                            
                            # Check sequence ordering per agent
                            agent_id = frame.get("agent_id")
                            seq = frame.get("seq", 0)
                            
                            if agent_id:
                                last_seq = self.last_seq_per_agent.get(agent_id, 0)
                                if seq > last_seq:
                                    self.last_seq_per_agent[agent_id] = seq
                                    batch.append(frame)
                                else:
                                    logger.warning(f"Out of order frame dropped: agent={agent_id}, seq={seq}, last={last_seq}")
                    
                    # Send batch
                    if batch:
                        for frame in batch:
                            await self.websocket.send_json(frame)
                        logger.debug(f"Sent {len(batch)} token frames")
                
                # Small sleep to prevent busy loop
                await asyncio.sleep(0.01)
                
        except WebSocketDisconnect:
            logger.info(f"WebSocket disconnected for {self.exec_id}")
            self.connected = False
        except Exception as e:
            logger.error(f"Writer task error: {e}")
            self.connected = False
    
    async def reader_task(self):
        """
        Background task that reads client messages
        Can be used for ping/pong, client commands, etc.
        """
        try:
            while self.connected:
                message = await self.websocket.receive_text()
                data = json.loads(message)
                
                # Handle client commands
                if data.get("type") == "ping":
                    await self.websocket.send_json({"type": "pong", "ts": time.time()})
                elif data.get("type") == "get_stats":
                    await self.websocket.send_json({
                        "type": "stats",
                        "data": self.stats
                    })
                    
        except WebSocketDisconnect:
            self.connected = False
        except Exception as e:
            logger.debug(f"Reader task ended: {e}")
            self.connected = False
    
    def get_stats(self) -> Dict[str, Any]:
        """Get connection statistics"""
        return {
            **self.stats,
            "uptime": time.time() - self.stats["connect_time"],
            "buffer_usage": len(self.token_buffer),
            "control_queue_size": self.control_queue.qsize()
        }


# Track active connections
active_connections: Dict[str, ClientConnection] = {}


@router.websocket("/ws/{execution_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    execution_id: str,
    start_from: Optional[str] = Query(None, description="Start position: $ for new, 0 for all, None for smart")
):
    """
    WebSocket endpoint for real-time streaming
    Subscribes to exec.{id}.* streams and forwards to client
    
    Features:
    - Per-client ring buffer with backpressure
    - Control frame priority (never dropped)
    - Token frame batching and potential dropping
    - Per-agent sequence ordering
    """
    
    await websocket.accept()
    logger.info(f"WebSocket connected: execution_id={execution_id}")
    
    # Check if there's already an active connection for this execution
    if execution_id in active_connections:
        logger.warning(f"Closing existing connection for execution_id={execution_id}")
        old_client = active_connections[execution_id]
        old_client.connected = False
        # Give it a moment to clean up
        await asyncio.sleep(0.1)
    
    # Create client connection
    client = ClientConnection(websocket, execution_id)
    active_connections[execution_id] = client
    
    # Get event hub
    hub = get_event_hub()
    
    # Create tasks
    writer_task = asyncio.create_task(client.writer_task())
    reader_task = asyncio.create_task(client.reader_task())
    
    # Send initial connection event
    await client.send_frame({
        "frame_type": FrameType.CONTROL,
        "type": "connected",
        "exec_id": execution_id,
        "ts": time.time()
    })
    
    # Determine start position
    # If there's an existing connection being replaced, start from new messages only
    # Otherwise use the provided start_from or default to new messages
    if start_from is None:
        start_position = "$"  # Default to new messages only
    else:
        start_position = start_from
    
    logger.info(f"Starting subscription from position: {start_position}")
    
    try:
        # Subscribe to event streams and forward to client
        async for frame in hub.subscribe(
            execution_id,
            streams=["token", "control"],
            start_id=start_position
        ):
            if not client.connected:
                break
                
            # Forward frame to client
            await client.send_frame(frame)
            
    except WebSocketDisconnect:
        logger.info(f"Client disconnected: {execution_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        
        # Send error frame
        await client.send_frame({
            "frame_type": FrameType.CONTROL,
            "type": "error",
            "error": str(e),
            "ts": time.time()
        })
    finally:
        # Cleanup
        client.connected = False
        writer_task.cancel()
        reader_task.cancel()
        
        # Wait for tasks to complete
        await asyncio.gather(writer_task, reader_task, return_exceptions=True)
        
        # Remove from active connections
        if execution_id in active_connections:
            del active_connections[execution_id]
        
        # Log final stats
        logger.info(f"WebSocket closed for {execution_id}: {client.get_stats()}")
        
        try:
            await websocket.close()
        except:
            pass


@router.get("/ws/stats")
async def get_websocket_stats():
    """Get statistics for all active WebSocket connections"""
    return {
        "active_connections": len(active_connections),
        "connections": {
            exec_id: conn.get_stats()
            for exec_id, conn in active_connections.items()
        }
    }