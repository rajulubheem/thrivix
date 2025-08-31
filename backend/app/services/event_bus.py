"""
Event Bus System for Event-Driven Swarm
"""
import asyncio
import time
import uuid
from typing import Dict, List, Callable, Any, Optional
from collections import defaultdict
from dataclasses import dataclass, field
import logging
import json

logger = logging.getLogger(__name__)

@dataclass
class SwarmEvent:
    """Represents an event in the swarm system"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    type: str = ""
    data: Dict[str, Any] = field(default_factory=dict)
    source: Optional[str] = None
    timestamp: float = field(default_factory=time.time)
    
    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type,
            "data": self.data,
            "source": self.source,
            "timestamp": self.timestamp
        }

class EventBus:
    """Central event coordination system for swarm agents"""
    
    def __init__(self):
        self.listeners: Dict[str, List[Callable]] = defaultdict(list)
        self.event_history: List[SwarmEvent] = []
        self.pending_human_input = {}
        self.active = True
        self._lock = asyncio.Lock()
        
    async def emit(self, event_type: str, data: dict, source: str = None):
        """Emit an event that other agents can react to"""
        event = SwarmEvent(
            type=event_type,
            data=data,
            source=source
        )
        
        async with self._lock:
            self.event_history.append(event)
            
        logger.info(f"📡 Event emitted: {event_type} from {source}")
        logger.debug(f"Event data: {json.dumps(data, default=str)[:200]}")
        
        # Notify all listeners for this event type
        listeners = self.listeners.get(event_type, [])
        
        # Also check for wildcard listeners
        if "." in event_type:
            # Handle patterns like "agent.*" 
            parts = event_type.split(".")
            for i in range(len(parts)):
                pattern = ".".join(parts[:i+1]) + ".*"
                listeners.extend(self.listeners.get(pattern, []))
        
        # Always notify "*" listeners (listen to everything)
        listeners.extend(self.listeners.get("*", []))
        
        # Execute all listeners
        for listener in listeners:
            try:
                if asyncio.iscoroutinefunction(listener):
                    asyncio.create_task(listener(event))
                else:
                    listener(event)
            except Exception as e:
                logger.error(f"Error in event listener: {e}")
    
    def on(self, event_pattern: str, callback: Callable):
        """Register a listener for an event pattern
        
        Patterns:
        - "agent.spawned" - specific event
        - "agent.*" - all agent events  
        - "*" - all events
        """
        self.listeners[event_pattern].append(callback)
        logger.debug(f"Registered listener for: {event_pattern}")
        return callback  # Allow use as decorator
    
    def once(self, event_pattern: str, callback: Callable):
        """Register a one-time listener"""
        async def wrapper(event):
            await callback(event) if asyncio.iscoroutinefunction(callback) else callback(event)
            self.listeners[event_pattern].remove(wrapper)
        self.listeners[event_pattern].append(wrapper)
        return wrapper
    
    def off(self, event_pattern: str, callback: Callable):
        """Remove a listener"""
        if event_pattern in self.listeners:
            if callback in self.listeners[event_pattern]:
                self.listeners[event_pattern].remove(callback)
    
    def get_recent_events(self, count: int = 10, event_type: str = None) -> List[SwarmEvent]:
        """Get recent events, optionally filtered by type"""
        events = self.event_history[-count:]
        if event_type:
            events = [e for e in events if e.type == event_type or e.type.startswith(event_type)]
        return events
    
    def clear_history(self):
        """Clear event history"""
        self.event_history.clear()
    
    async def wait_for_event(self, event_type: str, timeout: float = None) -> Optional[SwarmEvent]:
        """Wait for a specific event to occur"""
        future = asyncio.Future()
        
        def handler(event):
            if not future.done():
                future.set_result(event)
        
        self.once(event_type, handler)
        
        try:
            if timeout:
                return await asyncio.wait_for(future, timeout)
            else:
                return await future
        except asyncio.TimeoutError:
            return None
    
    def get_listeners_count(self) -> Dict[str, int]:
        """Get count of listeners per event pattern"""
        return {pattern: len(listeners) for pattern, listeners in self.listeners.items()}
    
    async def shutdown(self):
        """Shutdown the event bus"""
        self.active = False
        await self.emit("system.shutdown", {}, "event_bus")


# Global event bus instance
event_bus = EventBus()