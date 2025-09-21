"""
State Machine Coordinator: Enhanced coordinator with state machine support
Supports event-driven transitions, conditional flows, and complex workflows
"""

import asyncio
import json
import time
import logging
from typing import AsyncIterator, Dict, Any, Optional, List, Union, Set, Tuple
from dataclasses import dataclass, field
from enum import Enum

from strands import Agent, tool
from strands.models.openai import OpenAIModel
import os
from strands.session.file_session_manager import FileSessionManager

from app.services.agent_runtime import AgentRuntime, AgentContext
from app.services.event_hub import TokenFrame, ControlFrame, ControlType, get_event_hub
from app.tools.tool_registry import ToolRegistry
from app.services.dynamic_tool_wrapper import DynamicToolWrapper

logger = logging.getLogger(__name__)


class EventType(Enum):
    """Standard event types for state transitions"""
    SUCCESS = "success"
    FAILURE = "failure"
    RETRY = "retry"
    TIMEOUT = "timeout"
    ERROR = "error"
    CANCELLED = "cancelled"
    CUSTOM = "custom"


class NodeType(Enum):
    """Types of nodes in the state machine"""
    INITIAL = "initial"
    STATE = "state"
    PARALLEL = "parallel"
    CHOICE = "choice"
    FINAL = "final"


@dataclass
class StateTransition:
    """Represents a transition between states"""
    source_id: str
    target_id: str
    event: EventType
    condition: Optional[Dict[str, Any]] = None
    actions: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class StateNode:
    """Represents a state in the state machine"""
    node_id: str
    name: str
    node_type: NodeType
    description: str = ""
    entry_actions: List[str] = field(default_factory=list)
    exit_actions: List[str] = field(default_factory=list)
    task: Optional[str] = None
    agent_config: Optional[Dict[str, Any]] = None
    timeout: float = 60.0
    retry_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)
    position: Optional[Tuple[float, float]] = None


@dataclass
class StateMachineDefinition:
    """Complete state machine definition"""
    machine_id: str
    name: str
    description: str = ""
    initial_state: str = ""
    states: Dict[str, StateNode] = field(default_factory=dict)
    transitions: List[StateTransition] = field(default_factory=list)
    context: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


class StateMachineCoordinator:
    """Coordinator that manages agent execution as a state machine"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.hub = get_event_hub()
        self.config = config or {}
        self.runtime = AgentRuntime(config)
        self.tool_registry = ToolRegistry()
        self.active_states: Set[str] = set()
        self.state_history: List[Tuple[str, EventType, float]] = []
        self.state_outputs: Dict[str, Any] = {}
        self.current_machine: Optional[StateMachineDefinition] = None
        
    async def build_state_machine_from_task(self, task: str, execution_mode: str = "dynamic") -> StateMachineDefinition:
        """Build a state machine definition from a task"""
        # Use GPT to analyze the task and create a state machine
        planner_prompt = f"""
        Analyze this task and create a state machine workflow:
        Task: {task}
        
        Return a JSON object with:
        1. states: List of state nodes with:
           - node_id: Unique identifier
           - name: State name
           - node_type: One of [initial, state, parallel, choice, final]
           - description: What this state does
           - task: The specific task for this state
           - agent_config: Configuration for the agent (role, model, etc.)
           
        2. transitions: List of transitions with:
           - source_id: Source state ID
           - target_id: Target state ID
           - event: Trigger event (success, failure, etc.)
           - condition: Optional condition for transition
           
        3. initial_state: The starting state ID
        
        Create a workflow that can handle success and failure cases.
        """
        
        # For now, create a simple sequential flow (can be enhanced with GPT)
        machine = StateMachineDefinition(
            machine_id=f"machine_{int(time.time())}",
            name="Dynamic Task Workflow",
            description=f"Workflow for: {task}",
            initial_state="analyze_task"
        )
        
        # Create initial analysis state
        machine.states["analyze_task"] = StateNode(
            node_id="analyze_task",
            name="Task Analysis",
            node_type=NodeType.INITIAL,
            description="Analyze and break down the task",
            task=f"Analyze and plan how to accomplish: {task}",
            agent_config={
                "role": "Task Analyst",
                "model": "gpt-4o-mini",
                "temperature": 0.7
            },
            position=(100, 100)
        )
        
        # Add more states based on execution mode
        if execution_mode == "parallel":
            machine.states["parallel_execution"] = StateNode(
                node_id="parallel_execution",
                name="Parallel Execution",
                node_type=NodeType.PARALLEL,
                description="Execute subtasks in parallel",
                position=(300, 100)
            )
            
        # Add transitions
        machine.transitions.append(StateTransition(
            source_id="analyze_task",
            target_id="parallel_execution" if execution_mode == "parallel" else "complete",
            event=EventType.SUCCESS
        ))
        
        # Add final state
        machine.states["complete"] = StateNode(
            node_id="complete",
            name="Complete",
            node_type=NodeType.FINAL,
            description="Task completed",
            position=(500, 100)
        )
        
        return machine
    
    async def execute_state(self, state: StateNode, context: Dict[str, Any]) -> Tuple[EventType, Any]:
        """Execute a single state and return the result event and output"""
        try:
            # Notify state entry
            await self.hub.add(ControlFrame(
                exec_id=context['exec_id'],
                type="state_entered",
                agent_id=state.node_id,
                payload={
                    "state_id": state.node_id,
                    "name": state.name,
                    "type": state.node_type.value,
                    "description": state.description,
                    "position": state.position
                }
            ))
            
            # Execute entry actions
            for action in state.entry_actions:
                await self.execute_action(action, context)
            
            # Execute the state's task if it has one
            result = None
            if state.task and state.agent_config:
                agent_context = AgentContext(
                    agent_id=state.node_id,
                    name=state.name,
                    task=state.task,
                    model=state.agent_config.get("model", "gpt-4o-mini"),
                    temperature=state.agent_config.get("temperature", 0.7),
                    system_prompt=state.agent_config.get("system_prompt", f"You are {state.name}. {state.description}"),
                    tools=state.agent_config.get("tools", [])
                )
                
                # Execute agent
                async for frame in self.runtime.execute_agent(context['exec_id'], agent_context):
                    await self.hub.add(frame)
                    if frame.frame_type == 'token' and frame.final:
                        result = frame.text
            
            # Execute exit actions
            for action in state.exit_actions:
                await self.execute_action(action, context)
            
            # Store output
            self.state_outputs[state.node_id] = result
            
            # Determine event based on result
            event = EventType.SUCCESS if result else EventType.FAILURE
            
            # Notify state exit
            await self.hub.add(ControlFrame(
                exec_id=context['exec_id'],
                type="state_exited",
                agent_id=state.node_id,
                payload={
                    "state_id": state.node_id,
                    "event": event.value,
                    "output": result
                }
            ))
            
            return event, result
            
        except asyncio.TimeoutError:
            return EventType.TIMEOUT, None
        except Exception as e:
            logger.error(f"Error executing state {state.node_id}: {e}")
            return EventType.ERROR, str(e)
    
    async def execute_action(self, action: str, context: Dict[str, Any]):
        """Execute an action (placeholder for action execution)"""
        logger.info(f"Executing action: {action}")
        # Implement action execution logic here
    
    async def find_next_states(self, current_state: str, event: EventType) -> List[str]:
        """Find next states based on current state and event"""
        if not self.current_machine:
            return []
        
        next_states = []
        for transition in self.current_machine.transitions:
            if transition.source_id == current_state and transition.event == event:
                # Check condition if present
                if transition.condition:
                    # Evaluate condition (simplified)
                    if not self.evaluate_condition(transition.condition):
                        continue
                
                # Execute transition actions
                for action in transition.actions:
                    await self.execute_action(action, {})
                
                next_states.append(transition.target_id)
        
        return next_states
    
    def evaluate_condition(self, condition: Dict[str, Any]) -> bool:
        """Evaluate a transition condition"""
        # Simplified condition evaluation
        return True
    
    async def execute(self, task: str, exec_id: str, **kwargs) -> AsyncIterator[Union[TokenFrame, ControlFrame]]:
        """Execute the state machine workflow"""
        try:
            # Build state machine from task
            self.current_machine = await self.build_state_machine_from_task(
                task, 
                kwargs.get('execution_mode', 'dynamic')
            )
            
            # Send machine definition
            await self.hub.add(ControlFrame(
                exec_id=exec_id,
                type="machine_started",
                payload={
                    "machine_id": self.current_machine.machine_id,
                    "name": self.current_machine.name,
                    "states": [
                        {
                            "id": state.node_id,
                            "name": state.name,
                            "type": state.node_type.value,
                            "position": state.position
                        }
                        for state in self.current_machine.states.values()
                    ],
                    "transitions": [
                        {
                            "source": t.source_id,
                            "target": t.target_id,
                            "event": t.event.value
                        }
                        for t in self.current_machine.transitions
                    ]
                }
            ))
            
            # Execute state machine
            context = {
                'exec_id': exec_id,
                'task': task,
                'machine': self.current_machine
            }
            
            # Start with initial state
            current_states = [self.current_machine.initial_state]
            visited_states = set()
            
            while current_states:
                next_states = []
                
                for state_id in current_states:
                    if state_id in visited_states:
                        continue
                    
                    visited_states.add(state_id)
                    state = self.current_machine.states.get(state_id)
                    
                    if not state:
                        continue
                    
                    # Check if final state
                    if state.node_type == NodeType.FINAL:
                        await self.hub.add(ControlFrame(
                            exec_id=exec_id,
                            type="machine_completed",
                            payload={
                                "machine_id": self.current_machine.machine_id,
                                "final_state": state_id,
                                "outputs": self.state_outputs
                            }
                        ))
                        continue
                    
                    # Execute state
                    self.active_states.add(state_id)
                    event, output = await self.execute_state(state, context)
                    self.active_states.discard(state_id)
                    
                    # Record in history
                    self.state_history.append((state_id, event, time.time()))
                    
                    # Find next states
                    next_state_ids = await self.find_next_states(state_id, event)
                    next_states.extend(next_state_ids)
                
                current_states = next_states
            
            # Complete
            await self.hub.add(ControlFrame(
                exec_id=exec_id,
                type="session_end",
                payload={
                    "status": "completed",
                    "history": [
                        {"state": s, "event": e.value, "timestamp": t}
                        for s, e, t in self.state_history
                    ]
                }
            ))
            
        except Exception as e:
            logger.error(f"State machine execution error: {e}")
            await self.hub.add(ControlFrame(
                exec_id=exec_id,
                type="error",
                payload={"error": str(e)}
            ))
        
        finally:
            # Stream collected events
            async for frame in self.hub.stream(exec_id):
                yield frame