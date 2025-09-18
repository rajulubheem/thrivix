"""
Event-driven coordination system for Strands swarm agents
"""
import asyncio
import json
import time
import uuid
from typing import Dict, List, Callable, Any, Optional
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
import structlog

logger = structlog.get_logger()


@dataclass
class SwarmEvent:
    """Event in the swarm system"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    type: str = ""
    data: Dict[str, Any] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)
    source: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class EventBus:
    """Central event coordination system for swarm agents"""
    
    def __init__(self):
        self.listeners: Dict[str, List[Callable]] = defaultdict(list)
        self.event_history: List[SwarmEvent] = []
        self.pending_human_input: Dict[str, asyncio.Future] = {}
        self.active_agents: Dict[str, Any] = {}
        self.execution_context: Dict[str, Any] = {}
        
    async def emit(self, event_type: str, data: dict, source: str = None):
        """Emit an event that other agents can react to"""
        event = SwarmEvent(
            type=event_type,
            data=data,
            source=source
        )
        
        self.event_history.append(event)
        logger.info(f"📢 Event emitted: {event_type} from {source}", extra={"data": data})
        
        # Notify all listeners asynchronously
        tasks = []
        for listener in self.listeners[event_type]:
            tasks.append(asyncio.create_task(self._safe_invoke(listener, event)))
        
        # Also check wildcard listeners
        for pattern, listeners in self.listeners.items():
            if self._matches_pattern(event_type, pattern):
                for listener in listeners:
                    tasks.append(asyncio.create_task(self._safe_invoke(listener, event)))
        
        # Wait for all listeners to process
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
    
    def on(self, event_pattern: str, callback: Callable):
        """Register a listener for an event pattern"""
        self.listeners[event_pattern].append(callback)
        logger.debug(f"Registered listener for: {event_pattern}")
    
    def once(self, event_type: str, callback: Callable):
        """Register a one-time listener"""
        async def wrapper(event):
            await callback(event)
            self.listeners[event_type].remove(wrapper)
        self.listeners[event_type].append(wrapper)
    
    def off(self, event_pattern: str, callback: Callable):
        """Remove a listener for an event pattern"""
        if event_pattern in self.listeners:
            if callback in self.listeners[event_pattern]:
                self.listeners[event_pattern].remove(callback)
                logger.debug(f"Removed listener for: {event_pattern}")
    
    async def _safe_invoke(self, callback: Callable, event: SwarmEvent):
        """Safely invoke a callback with error handling"""
        try:
            if asyncio.iscoroutinefunction(callback):
                await callback(event)
            else:
                callback(event)
        except Exception as e:
            logger.error(f"Error in event listener: {e}", exc_info=True)
    
    def _matches_pattern(self, event_type: str, pattern: str) -> bool:
        """Check if event type matches pattern (supports wildcards)"""
        if pattern == "*":
            return True
        if pattern.endswith(".*"):
            prefix = pattern[:-2]
            return event_type.startswith(prefix)
        return event_type == pattern
    
    def get_recent_events(self, count: int = 10, event_type: str = None) -> List[SwarmEvent]:
        """Get recent events, optionally filtered by type"""
        events = self.event_history[-count:]
        if event_type:
            events = [e for e in events if self._matches_pattern(e.type, event_type)]
        return events
    
    def clear_history(self):
        """Clear event history (useful for testing)"""
        self.event_history.clear()


class HumanInLoopCoordinator:
    """Manages human intervention in the swarm"""
    
    def __init__(self, event_bus: EventBus):
        self.event_bus = event_bus
        self.pending_questions: Dict[str, asyncio.Future] = {}
        self.pending_approvals: Dict[str, asyncio.Future] = {}
        
    async def ask_human(self, question: str, context: dict = None, agent_name: str = None) -> str:
        """Ask human a question and wait for response"""
        question_id = str(uuid.uuid4())
        
        # Create future for response
        future = asyncio.Future()
        self.pending_questions[question_id] = future
        
        # Emit event for UI
        await self.event_bus.emit("human.question", {
            "id": question_id,
            "question": question,
            "context": context,
            "requesting_agent": agent_name,
            "timestamp": datetime.utcnow().isoformat()
        }, source=agent_name)
        
        try:
            # Wait for response with timeout
            response = await asyncio.wait_for(future, timeout=300)  # 5 min timeout
            logger.info(f"Received human response for question {question_id}")
            return response
        except asyncio.TimeoutError:
            logger.warning(f"Human response timed out for question {question_id}")
            await self.event_bus.emit("human.timeout", {
                "question_id": question_id
            })
            return "No response received from human (timeout)"
        finally:
            # Clean up
            self.pending_questions.pop(question_id, None)
    
    async def request_approval(self, action: str, reason: str, agent_name: str = None) -> bool:
        """Request human approval for an action"""
        approval_id = str(uuid.uuid4())
        
        # Create future for response
        future = asyncio.Future()
        self.pending_approvals[approval_id] = future
        
        # Emit event for UI
        await self.event_bus.emit("human.approval_needed", {
            "id": approval_id,
            "action": action,
            "reason": reason,
            "agent": agent_name,
            "timestamp": datetime.utcnow().isoformat()
        }, source=agent_name)
        
        try:
            # Wait for approval
            approved = await asyncio.wait_for(future, timeout=60)  # 1 min timeout
            logger.info(f"Received approval decision for {approval_id}: {approved}")
            return approved
        except asyncio.TimeoutError:
            logger.warning(f"Approval timed out for {approval_id}")
            return False  # Default to not approved
        finally:
            # Clean up
            self.pending_approvals.pop(approval_id, None)
    
    def provide_answer(self, question_id: str, answer: str):
        """Provide answer to a pending question"""
        if question_id in self.pending_questions:
            self.pending_questions[question_id].set_result(answer)
    
    def provide_approval(self, approval_id: str, approved: bool):
        """Provide approval decision"""
        if approval_id in self.pending_approvals:
            self.pending_approvals[approval_id].set_result(approved)


class DynamicAgentSpawner:
    """Dynamically spawn agents based on events and needs"""
    
    def __init__(self, event_bus: EventBus, agent_factory):
        self.event_bus = event_bus
        self.agent_factory = agent_factory
        self.spawned_agents: Dict[str, Any] = {}
        
        # Register event listeners
        self.event_bus.on("agent.needed", self._handle_agent_needed)
        self.event_bus.on("specialist.needed", self._handle_specialist_needed)
    
    async def _handle_agent_needed(self, event: SwarmEvent):
        """Handle request for new agent"""
        role = event.data.get("role")
        context = event.data.get("context", {})
        requesting_agent = event.data.get("requesting_agent")
        
        logger.info(f"Agent needed: {role} requested by {requesting_agent}")
        
        # Check if agent already exists
        agent_id = f"{role}_{uuid.uuid4().hex[:8]}"
        if agent_id not in self.spawned_agents:
            # Create new agent
            agent = await self._spawn_agent(role, context)
            if agent:
                self.spawned_agents[agent_id] = agent
                
                # Emit agent spawned event
                await self.event_bus.emit("agent.spawned", {
                    "agent_id": agent_id,
                    "role": role,
                    "capabilities": agent.get("capabilities", []),
                    "spawned_by": requesting_agent
                }, source="spawner")
    
    async def _handle_specialist_needed(self, event: SwarmEvent):
        """Handle request for specialist agent"""
        specialty = event.data.get("specialty")
        task = event.data.get("task")
        
        logger.info(f"Specialist needed: {specialty} for task: {task}")
        
        # Create specialized agent
        agent = await self._spawn_specialist(specialty, task)
        if agent:
            agent_id = f"specialist_{specialty}_{uuid.uuid4().hex[:8]}"
            self.spawned_agents[agent_id] = agent
            
            await self.event_bus.emit("specialist.spawned", {
                "agent_id": agent_id,
                "specialty": specialty,
                "task": task
            }, source="spawner")
    
    async def _spawn_agent(self, role: str, context: dict) -> Optional[Dict]:
        """Spawn a new agent with given role"""
        try:
            # Use agent factory to create agent config
            from app.schemas.swarm import AgentConfig
            
            # Get agent template from factory
            agent_config = self.agent_factory.create_agent(role)
            
            if agent_config:
                logger.info(f"Successfully spawned {role} agent")
                return {
                    "config": agent_config,
                    "role": role,
                    "context": context,
                    "capabilities": agent_config.tools if hasattr(agent_config, 'tools') else []
                }
        except Exception as e:
            logger.error(f"Failed to spawn agent {role}: {e}")
        
        return None
    
    async def _spawn_specialist(self, specialty: str, task: str) -> Optional[Dict]:
        """Spawn a specialist agent for specific task"""
        try:
            # Create specialized prompt
            system_prompt = f"""You are a specialist in {specialty}.
Your specific task is: {task}

Focus only on your specialty and provide expert-level assistance.
When your specialized task is complete, emit a 'specialist.complete' event."""
            
            from app.schemas.swarm import AgentConfig
            
            agent_config = AgentConfig(
                name=f"specialist_{specialty}",
                system_prompt=system_prompt,
                tools=[],  # Add relevant tools based on specialty
                temperature=0.7
            )
            
            return {
                "config": agent_config,
                "specialty": specialty,
                "task": task
            }
        except Exception as e:
            logger.error(f"Failed to spawn specialist {specialty}: {e}")
            return None


class EventAnalyzer:
    """Analyze agent outputs to extract event triggers"""
    
    def __init__(self, event_bus: EventBus):
        self.event_bus = event_bus
        self.patterns = {
            r"(?i)need(?:s|ed)?\s+(?:a|an)?\s*(\w+)\s*(?:agent|specialist|expert)": "agent.needed",
            r"(?i)handoff\s+to\s+(\w+)": "handoff.requested",
            r"(?i)task\s+complete": "task.complete",
            r"(?i)error\s+occurred": "error.detected",
            r"(?i)human\s+input\s+needed": "human.input.needed",
            r"(?i)waiting\s+for\s+(\w+)": "waiting.for",
            r"(?i)blocked\s+by\s+(.+)": "blocked.by",
            r"(?i)spawning\s+(\w+)": "spawning.agent"
        }
    
    async def analyze_output(self, output: str, agent_name: str) -> List[SwarmEvent]:
        """Analyze agent output for event triggers"""
        import re
        
        events = []
        
        for pattern, event_type in self.patterns.items():
            matches = re.finditer(pattern, output)
            for match in matches:
                event_data = {
                    "triggered_by": agent_name,
                    "pattern_matched": pattern,
                    "extracted": match.groups()
                }
                
                # Extract specific data based on event type
                if event_type == "agent.needed" and match.groups():
                    event_data["role"] = match.group(1).lower()
                elif event_type == "handoff.requested" and match.groups():
                    event_data["to"] = match.group(1).lower()
                    event_data["from"] = agent_name
                
                # Emit the detected event
                await self.event_bus.emit(event_type, event_data, source=agent_name)
                
                events.append(SwarmEvent(
                    type=event_type,
                    data=event_data,
                    source=agent_name
                ))
        
        return events


# Global event bus instance
global_event_bus = EventBus()