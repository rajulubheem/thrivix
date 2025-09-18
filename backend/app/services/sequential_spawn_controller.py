"""
Sequential Spawn Controller for Event-Driven Hierarchical Agent Execution

This controller enforces sequential execution of child agents under parent agents,
ensuring proper parent-child relationships and ordered execution flow.

Works as an ADDITIVE layer on top of existing event-driven system.
"""
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from app.services.event_bus import event_bus

logger = logging.getLogger(__name__)

@dataclass
class ChildRequest:
    """Represents a request to spawn a child agent"""
    role: str
    reason: str
    priority: str
    parent: str
    context: str
    execution_id: str
    timestamp: datetime
    
@dataclass
class ActiveChild:
    """Represents a currently executing child agent"""
    agent_name: str
    parent: str
    role: str
    started_at: datetime
    execution_id: str

class SequentialSpawnController:
    """
    Controls sequential spawning of child agents under parent agents.
    
    Key Features:
    - One child at a time per execution
    - Parent-child relationship tracking
    - Event-driven coordination
    - Non-breaking integration with existing system
    """
    
    def __init__(self):
        self.spawn_queues: Dict[str, List[ChildRequest]] = {}  # execution_id -> queue
        self.active_children: Dict[str, ActiveChild] = {}  # execution_id -> active child
        self.parent_children_map: Dict[str, Dict[str, List[str]]] = {}  # execution_id -> {parent: [children]}
        self.enabled_executions: set = set()  # Only enable for specific executions
        
        # Register event handlers
        self._register_handlers()
        
    def _register_handlers(self):
        """Register event handlers for sequential execution control"""
        # Listen for agent requests with enhanced metadata
        event_bus.on("agent.needed.sequential", self._handle_sequential_agent_request)
        
        # ALSO listen for regular agent.needed events and route them if sequential is enabled
        event_bus.on("agent.needed", self._handle_regular_agent_request)
        
        # Listen for agent completions to trigger next in queue
        event_bus.on("agent.completed", self._handle_agent_completion)
        
        # Listen for agent spawns to track active children
        event_bus.on("agent.spawned", self._handle_agent_spawned)
        
        # Listen for execution start to initialize tracking
        event_bus.on("execution.started", self._handle_execution_started)
        
        # Listen for execution end to cleanup
        event_bus.on("execution.completed", self._cleanup_execution)
        
        logger.info("🔄 Sequential Spawn Controller initialized")
    
    def enable_for_execution(self, execution_id: str):
        """Enable sequential execution for a specific execution ID"""
        self.enabled_executions.add(execution_id)
        logger.info(f"🔄 Sequential execution ENABLED for {execution_id}")
    
    def disable_for_execution(self, execution_id: str):
        """Disable sequential execution for a specific execution ID"""
        self.enabled_executions.discard(execution_id)
        logger.info(f"🔄 Sequential execution DISABLED for {execution_id}")
    
    async def _handle_execution_started(self, event):
        """Initialize tracking for new execution"""
        execution_id = event.data.get("execution_id")
        if not execution_id:
            return
            
        # Initialize data structures for this execution
        self.spawn_queues[execution_id] = []
        if execution_id in self.active_children:
            del self.active_children[execution_id]
        self.parent_children_map[execution_id] = {}
        
        logger.info(f"🔄 Initialized sequential tracking for execution {execution_id}")
    
    async def _handle_regular_agent_request(self, event):
        """Handle regular agent.needed events and route to sequential if enabled"""
        execution_id = event.data.get("execution_id")
        if not execution_id or execution_id not in self.enabled_executions:
            # Not a sequential execution - let existing system handle it
            return
            
        # This is a sequential execution - intercept and route to sequential handler
        logger.info(f"🔄 Intercepting agent.needed for sequential execution {execution_id}")
        await self._handle_sequential_agent_request(event)
    
    async def _handle_sequential_agent_request(self, event):
        """Handle request for sequential agent spawning"""
        execution_id = event.data.get("execution_id")
        if not execution_id or execution_id not in self.enabled_executions:
            # Fall back to existing system for non-sequential executions
            await event_bus.emit("agent.needed", event.data, source=event.source)
            return
            
        parent_agent = event.source
        
        # Create child request
        request = ChildRequest(
            role=event.data["role"],
            reason=event.data["reason"],
            priority=event.data["priority"],
            parent=parent_agent,
            context=event.data.get("context", ""),
            execution_id=execution_id,
            timestamp=datetime.now()
        )
        
        # Add to queue
        if execution_id not in self.spawn_queues:
            self.spawn_queues[execution_id] = []
            
        self.spawn_queues[execution_id].append(request)
        
        logger.info(f"🔄 Queued child request: {request.role} under parent {parent_agent}")
        
        # Try to spawn next child if none currently active
        await self._try_spawn_next_child(execution_id)
    
    async def _try_spawn_next_child(self, execution_id: str):
        """Try to spawn the next child in queue if none currently active"""
        if execution_id not in self.enabled_executions:
            return
            
        # Check if child already active for this execution
        if execution_id in self.active_children:
            logger.info(f"🔄 Child already active for {execution_id}, waiting...")
            return
            
        # Check if queue has pending requests
        queue = self.spawn_queues.get(execution_id, [])
        if not queue:
            logger.info(f"🔄 No pending child requests for {execution_id}")
            return
            
        # Get next request from queue
        next_request = queue.pop(0)
        
        logger.info(f"🔄 Spawning sequential child: {next_request.role} under {next_request.parent}")
        
        # Emit enhanced agent.needed event with parent info
        enhanced_event_data = {
            "role": next_request.role,
            "reason": next_request.reason,
            "priority": next_request.priority,
            "context": next_request.context,
            "execution_id": execution_id,
            "parent": next_request.parent,  # NEW: parent relationship
            "sequential": True  # NEW: mark as sequential
        }
        
        # Emit to existing system but with parent metadata
        await event_bus.emit("agent.needed", enhanced_event_data, source=next_request.parent)
        
        # We'll track the spawned agent when we get agent.spawned event
        
    async def _handle_agent_spawned(self, event):
        """Track spawned agents for sequential execution"""
        execution_id = event.data.get("execution_id")
        agent_name = event.data.get("agent")
        parent = event.data.get("parent")
        
        if not execution_id or execution_id not in self.enabled_executions:
            return
            
        # Only track if this agent was spawned as part of sequential execution
        if not parent or not agent_name:
            return
            
        logger.info(f"🔄 Tracking sequential child: {agent_name} under parent {parent}")
        
        # Track as active child
        self.active_children[execution_id] = ActiveChild(
            agent_name=agent_name,
            parent=parent,
            role=event.data.get("role", "unknown"),
            started_at=datetime.now(),
            execution_id=execution_id
        )
        
    async def _handle_agent_completion(self, event):
        """Handle agent completion to spawn next child"""
        execution_id = event.data.get("execution_id")
        completed_agent = event.data.get("agent")
        
        if not execution_id or execution_id not in self.enabled_executions:
            return
            
        if execution_id not in self.active_children:
            return
            
        active_child = self.active_children[execution_id]
        if active_child.agent_name != completed_agent:
            return
            
        parent = active_child.parent
        
        logger.info(f"🔄 Child {completed_agent} completed under parent {parent}")
        
        # Track completed child under parent
        if execution_id not in self.parent_children_map:
            self.parent_children_map[execution_id] = {}
        if parent not in self.parent_children_map[execution_id]:
            self.parent_children_map[execution_id][parent] = []
            
        self.parent_children_map[execution_id][parent].append(completed_agent)
        
        # Emit enhanced completion event with parent info
        await event_bus.emit("child.completed", {
            "agent": completed_agent,
            "parent": parent,
            "execution_id": execution_id,
            "content": event.data.get("content", ""),
            "tokens_used": event.data.get("tokens_used", 0),
            "duration": (datetime.now() - active_child.started_at).total_seconds()
        })
        
        # Remove from active children
        del self.active_children[execution_id]
        
        # Try to spawn next child in queue
        await self._try_spawn_next_child(execution_id)
        
        # If no more children queued, trigger parent consolidation
        if not self.spawn_queues.get(execution_id):
            await self._trigger_parent_consolidation(execution_id, parent)
    
    async def _trigger_parent_consolidation(self, execution_id: str, parent: str):
        """Trigger parent consolidation when all children complete"""
        children = self.parent_children_map.get(execution_id, {}).get(parent, [])
        
        if not children:
            return
            
        logger.info(f"🔄 Triggering consolidation for parent {parent} with {len(children)} children")
        
        await event_bus.emit("parent.consolidate", {
            "parent": parent,
            "children": children,
            "execution_id": execution_id
        })
    
    async def _cleanup_execution(self, event):
        """Clean up tracking data for completed execution"""
        execution_id = event.data.get("execution_id")
        if not execution_id:
            return
            
        # Clean up data structures
        self.spawn_queues.pop(execution_id, None)
        self.active_children.pop(execution_id, None)
        self.parent_children_map.pop(execution_id, None)
        self.enabled_executions.discard(execution_id)
        
        logger.info(f"🔄 Cleaned up sequential tracking for execution {execution_id}")
    
    def get_execution_status(self, execution_id: str) -> Dict[str, Any]:
        """Get current status of sequential execution"""
        return {
            "enabled": execution_id in self.enabled_executions,
            "queued_children": len(self.spawn_queues.get(execution_id, [])),
            "active_child": self.active_children.get(execution_id),
            "parent_children": self.parent_children_map.get(execution_id, {})
        }

# Global instance
sequential_controller = SequentialSpawnController()

def get_sequential_controller() -> SequentialSpawnController:
    """Get the global sequential spawn controller instance"""
    return sequential_controller