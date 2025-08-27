"""
Event Manager for SSE streaming
Manages execution events and provides async generators for SSE endpoints
"""
import asyncio
import json
from typing import Dict, Any, AsyncGenerator, Optional
from datetime import datetime
import structlog

logger = structlog.get_logger()


class EventManager:
    """Manages events for SSE streaming"""
    
    def __init__(self):
        # Store event queues for each execution
        self.execution_queues: Dict[str, asyncio.Queue] = {}
        self.execution_results: Dict[str, Any] = {}
    
    def create_execution_queue(self, execution_id: str) -> asyncio.Queue:
        """Create a new queue for an execution"""
        if execution_id not in self.execution_queues:
            self.execution_queues[execution_id] = asyncio.Queue()
        return self.execution_queues[execution_id]
    
    async def send_event(self, execution_id: str, event: Dict[str, Any]):
        """Send an event to the execution queue"""
        if execution_id in self.execution_queues:
            await self.execution_queues[execution_id].put(event)
            logger.debug(f"Event sent for {execution_id}: {event.get('type')}")
    
    async def get_event_stream(self, execution_id: str) -> AsyncGenerator[Dict[str, Any], None]:
        """Get event stream for an execution"""
        queue = self.create_execution_queue(execution_id)
        
        # Send initial connection event
        yield {
            "data": json.dumps({
                "type": "connection_established",
                "execution_id": execution_id,
                "timestamp": datetime.utcnow().isoformat()
            })
        }
        
        # Stream events from queue
        try:
            while True:
                try:
                    # Wait for event with timeout
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    
                    # Check if this is the final event
                    if event.get("type") in ["execution_completed", "execution_failed"]:
                        yield {"data": json.dumps(event)}
                        break
                    
                    yield {"data": json.dumps(event)}
                    
                except asyncio.TimeoutError:
                    # Send heartbeat to keep connection alive
                    yield {
                        "data": json.dumps({
                            "type": "heartbeat",
                            "timestamp": datetime.utcnow().isoformat()
                        })
                    }
                    
        finally:
            # Cleanup queue
            if execution_id in self.execution_queues:
                del self.execution_queues[execution_id]
    
    def cleanup_execution(self, execution_id: str):
        """Cleanup execution resources"""
        if execution_id in self.execution_queues:
            del self.execution_queues[execution_id]
        if execution_id in self.execution_results:
            del self.execution_results[execution_id]


# Global event manager instance
event_manager = EventManager()