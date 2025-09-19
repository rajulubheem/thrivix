"""
DAG Orchestrator: Deterministic task execution with explicit dependencies
Drives agents and publishes to EventHub - single writer pattern
"""

import asyncio
from typing import Dict, List, Optional, Any, Set
from dataclasses import dataclass, field
from enum import Enum
import uuid
import time
import logging
from collections import defaultdict

from app.services.event_hub import get_event_hub, ControlFrame, ControlType
from app.services.agent_runtime import AgentRuntime, AgentContext

logger = logging.getLogger(__name__)


class NodeState(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class DAGNode:
    """Represents a task node in the execution DAG"""
    node_id: str
    agent_id: str
    task: str
    dependencies: Set[str] = field(default_factory=set)
    state: NodeState = NodeState.PENDING
    result: Optional[str] = None
    error: Optional[str] = None
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    
    def is_ready(self, completed_nodes: Set[str]) -> bool:
        """Check if all dependencies are satisfied"""
        return self.dependencies.issubset(completed_nodes)
    
    def duration(self) -> Optional[float]:
        """Get execution duration"""
        if self.started_at and self.completed_at:
            return self.completed_at - self.started_at
        return None


@dataclass
class ExecutionDAG:
    """Directed Acyclic Graph for task execution"""
    nodes: Dict[str, DAGNode] = field(default_factory=dict)
    edges: Dict[str, Set[str]] = field(default_factory=lambda: defaultdict(set))
    
    def add_node(self, node: DAGNode):
        """Add a node to the DAG"""
        self.nodes[node.node_id] = node
        
        # Update edges
        for dep in node.dependencies:
            self.edges[dep].add(node.node_id)
    
    def get_ready_nodes(self, completed_nodes: Set[str]) -> List[DAGNode]:
        """Get all nodes ready to execute"""
        ready = []
        for node in self.nodes.values():
            if node.state == NodeState.PENDING and node.is_ready(completed_nodes):
                ready.append(node)
        return ready
    
    def is_complete(self) -> bool:
        """Check if all nodes are in terminal state"""
        for node in self.nodes.values():
            if node.state in (NodeState.PENDING, NodeState.RUNNING):
                return False
        return True
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get execution statistics"""
        states = defaultdict(int)
        for node in self.nodes.values():
            states[node.state] += 1
        
        return {
            "total_nodes": len(self.nodes),
            "states": dict(states),
            "complete": self.is_complete()
        }


class DAGOrchestrator:
    """
    Orchestrates agent execution based on DAG
    Single writer to EventHub - prevents conflicts
    """
    
    def __init__(self, max_parallel: int = 5):
        self.max_parallel = max_parallel
        self.hub = get_event_hub()
        self.agents: Dict[str, AgentRuntime] = {}
        self._running_tasks: Dict[str, asyncio.Task] = {}
    
    def register_agent(self, agent: AgentRuntime):
        """Register an agent runtime"""
        self.agents[agent.agent_id] = agent
        logger.info(f"Registered agent: {agent.agent_id} ({agent.name})")
    
    async def execute_dag(
        self,
        exec_id: str,
        dag: ExecutionDAG,
        config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Execute the DAG
        Returns execution summary
        """
        
        logger.info(f"Starting DAG execution: {exec_id}")
        
        # Publish session start
        await self.hub.publish_control(ControlFrame(
            exec_id=exec_id,
            type=ControlType.SESSION_START,
            payload={
                "nodes": len(dag.nodes),
                "config": config or {}
            }
        ))
        
        completed_nodes: Set[str] = set()
        failed_nodes: Set[str] = set()
        
        try:
            while not dag.is_complete():
                # Get nodes ready to execute
                ready_nodes = dag.get_ready_nodes(completed_nodes)
                
                # Limit parallel execution
                can_start = min(
                    len(ready_nodes),
                    self.max_parallel - len(self._running_tasks)
                )
                
                # Start execution for ready nodes
                for node in ready_nodes[:can_start]:
                    if node.node_id not in self._running_tasks:
                        task = asyncio.create_task(
                            self._execute_node(exec_id, node, dag)
                        )
                        self._running_tasks[node.node_id] = task
                        node.state = NodeState.RUNNING
                        node.started_at = time.time()
                        
                        logger.info(f"Started node: {node.node_id}")
                
                # Wait for at least one task to complete
                if self._running_tasks:
                    done, pending = await asyncio.wait(
                        self._running_tasks.values(),
                        return_when=asyncio.FIRST_COMPLETED
                    )
                    
                    # Process completed tasks
                    for task in done:
                        # Find which node completed
                        for node_id, node_task in list(self._running_tasks.items()):
                            if node_task == task:
                                del self._running_tasks[node_id]
                                node = dag.nodes[node_id]
                                
                                try:
                                    await task
                                    node.state = NodeState.COMPLETED
                                    node.completed_at = time.time()
                                    completed_nodes.add(node_id)
                                    logger.info(f"Completed node: {node_id}")
                                    
                                except Exception as e:
                                    node.state = NodeState.FAILED
                                    node.error = str(e)
                                    node.completed_at = time.time()
                                    failed_nodes.add(node_id)
                                    logger.error(f"Failed node {node_id}: {e}")
                                    
                                    # Mark dependent nodes as skipped
                                    self._skip_dependents(dag, node_id)
                                
                                break
                else:
                    # No tasks running and no ready nodes - might be stuck
                    if not dag.is_complete():
                        logger.warning("DAG execution stuck - no ready nodes")
                        break
                
                # Small delay to prevent busy loop
                await asyncio.sleep(0.01)
            
            # Publish session end
            await self.hub.publish_control(ControlFrame(
                exec_id=exec_id,
                type=ControlType.SESSION_END,
                payload={
                    "completed": len(completed_nodes),
                    "failed": len(failed_nodes),
                    "statistics": dag.get_statistics()
                }
            ))
            
            logger.info(f"DAG execution complete: {dag.get_statistics()}")
            
            # Clear running tasks dict for next execution
            self._running_tasks.clear()
            
            return {
                "exec_id": exec_id,
                "success": len(failed_nodes) == 0,
                "completed_nodes": list(completed_nodes),
                "failed_nodes": list(failed_nodes),
                "statistics": dag.get_statistics()
            }
            
        except Exception as e:
            logger.error(f"DAG execution error: {e}")
            
            # Cancel running tasks
            for task in self._running_tasks.values():
                task.cancel()
            
            # Clear the dict after cancelling
            self._running_tasks.clear()
            
            raise
    
    async def _execute_node(
        self,
        exec_id: str,
        node: DAGNode,
        dag: ExecutionDAG
    ):
        """
        Execute a single node
        Drives agent and publishes all frames to hub
        """
        
        # Get agent
        agent = self.agents.get(node.agent_id)
        if not agent:
            raise ValueError(f"Agent not found: {node.agent_id}")
        
        # Create context
        context = AgentContext(
            exec_id=exec_id,
            agent_id=node.agent_id,
            task=node.task,
            config={},
            parent_result=self._get_parent_result(node, dag)
        )
        
        # Publish task started
        await self.hub.publish_control(ControlFrame(
            exec_id=exec_id,
            type=ControlType.TASK_STARTED,
            agent_id=node.agent_id,
            payload={
                "node_id": node.node_id,
                "task": node.task,
                "dependencies": list(node.dependencies)
            }
        ))
        
        result_text = ""
        
        try:
            # Stream from agent and publish to hub
            async for frame in agent.stream(context):
                # Publish frame to hub
                if frame.frame_type == "token":
                    await self.hub.publish_token(frame)
                    result_text += frame.text
                else:
                    await self.hub.publish_control(frame)
            
            # Store result
            node.result = result_text
            
            # Publish task completed
            await self.hub.publish_control(ControlFrame(
                exec_id=exec_id,
                type=ControlType.TASK_COMPLETED,
                agent_id=node.agent_id,
                payload={
                    "node_id": node.node_id,
                    "duration": node.duration(),
                    "result_length": len(result_text)
                }
            ))
            
        except Exception as e:
            logger.error(f"Node execution error {node.node_id}: {e}")
            
            # Publish error
            await self.hub.publish_control(ControlFrame(
                exec_id=exec_id,
                type=ControlType.ERROR,
                agent_id=node.agent_id,
                payload={
                    "node_id": node.node_id,
                    "error": str(e)
                }
            ))
            
            raise
    
    def _get_parent_result(self, node: DAGNode, dag: ExecutionDAG) -> Optional[str]:
        """Get result from parent node if available"""
        if node.dependencies:
            # Get first dependency's result
            parent_id = list(node.dependencies)[0]
            parent_node = dag.nodes.get(parent_id)
            if parent_node:
                return parent_node.result
        return None
    
    def _skip_dependents(self, dag: ExecutionDAG, failed_node_id: str):
        """Mark all dependent nodes as skipped"""
        to_skip = [failed_node_id]
        
        while to_skip:
            node_id = to_skip.pop()
            
            # Get nodes that depend on this one
            for dependent_id in dag.edges.get(node_id, []):
                dependent = dag.nodes.get(dependent_id)
                if dependent and dependent.state == NodeState.PENDING:
                    dependent.state = NodeState.SKIPPED
                    to_skip.append(dependent_id)
                    logger.info(f"Skipped node {dependent_id} due to failed dependency")


def build_simple_dag(tasks: List[Dict[str, Any]]) -> ExecutionDAG:
    """
    Build a simple sequential DAG from task list
    Each task depends on the previous one
    """
    dag = ExecutionDAG()
    previous_id = None
    
    for i, task_config in enumerate(tasks):
        node_id = f"node_{i:03d}"
        agent_id = task_config.get("agent_id", f"agent_{i:03d}")
        
        node = DAGNode(
            node_id=node_id,
            agent_id=agent_id,
            task=task_config["task"],
            dependencies={previous_id} if previous_id else set()
        )
        
        dag.add_node(node)
        previous_id = node_id
    
    return dag


def build_parallel_dag(task_groups: List[List[Dict[str, Any]]]) -> ExecutionDAG:
    """
    Build a DAG with parallel execution groups
    Tasks in same group run in parallel, groups are sequential
    """
    dag = ExecutionDAG()
    previous_group_ids = []
    
    for group_idx, group in enumerate(task_groups):
        current_group_ids = []
        
        for task_idx, task_config in enumerate(group):
            node_id = f"node_{group_idx:02d}_{task_idx:02d}"
            agent_id = task_config.get("agent_id", node_id)
            
            node = DAGNode(
                node_id=node_id,
                agent_id=agent_id,
                task=task_config["task"],
                dependencies=set(previous_group_ids)
            )
            
            dag.add_node(node)
            current_group_ids.append(node_id)
        
        previous_group_ids = current_group_ids
    
    return dag