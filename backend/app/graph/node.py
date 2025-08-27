"""Graph node implementation for DAG-based agent orchestration."""

from enum import Enum
from typing import Any, Optional, Set, Dict
from dataclasses import dataclass, field
from datetime import datetime
import uuid


class NodeStatus(Enum):
    """Status of a graph node execution."""
    PENDING = "pending"
    READY = "ready"  # All dependencies met, ready to execute
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"  # Skipped due to conditional edge


@dataclass
class NodeResult:
    """Result from a node execution."""
    node_id: str
    agent_name: str
    result: Any
    execution_time_ms: float
    tokens_used: int = 0
    status: NodeStatus = NodeStatus.COMPLETED
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class GraphNode:
    """A node in the execution graph."""
    
    def __init__(
        self,
        node_id: str,
        executor: Any,  # Agent or MultiAgentBase instance
        dependencies: Optional[Set[str]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        self.node_id = node_id
        self.executor = executor
        self.dependencies = dependencies or set()
        self.metadata = metadata or {}
        
        # Execution state
        self.status = NodeStatus.PENDING
        self.result: Optional[NodeResult] = None
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None
        self.execution_time_ms: float = 0.0
        
        # For tracking
        self.execution_id = str(uuid.uuid4())
        
    def is_ready(self, completed_nodes: Set[str]) -> bool:
        """Check if this node is ready to execute."""
        if self.status != NodeStatus.PENDING:
            return False
        return all(dep in completed_nodes for dep in self.dependencies)
    
    def mark_ready(self):
        """Mark node as ready for execution."""
        self.status = NodeStatus.READY
        
    def mark_executing(self):
        """Mark node as currently executing."""
        self.status = NodeStatus.EXECUTING
        self.started_at = datetime.now()
        
    def mark_completed(self, result: NodeResult):
        """Mark node as completed with result."""
        self.status = NodeStatus.COMPLETED
        self.completed_at = datetime.now()
        self.result = result
        if self.started_at:
            self.execution_time_ms = (self.completed_at - self.started_at).total_seconds() * 1000
            
    def mark_failed(self, error: str):
        """Mark node as failed."""
        self.status = NodeStatus.FAILED
        self.completed_at = datetime.now()
        if self.started_at:
            self.execution_time_ms = (self.completed_at - self.started_at).total_seconds() * 1000
        self.result = NodeResult(
            node_id=self.node_id,
            agent_name=getattr(self.executor, 'name', self.node_id),
            result=None,
            execution_time_ms=self.execution_time_ms,
            status=NodeStatus.FAILED,
            error=error
        )
        
    def mark_skipped(self, reason: str = "Conditional edge not satisfied"):
        """Mark node as skipped."""
        self.status = NodeStatus.SKIPPED
        self.result = NodeResult(
            node_id=self.node_id,
            agent_name=getattr(self.executor, 'name', self.node_id),
            result=None,
            execution_time_ms=0,
            status=NodeStatus.SKIPPED,
            metadata={"skip_reason": reason}
        )
        
    def reset(self):
        """Reset node to pending state."""
        self.status = NodeStatus.PENDING
        self.result = None
        self.started_at = None
        self.completed_at = None
        self.execution_time_ms = 0.0
        
    def __repr__(self):
        return f"GraphNode(id={self.node_id}, status={self.status.value}, deps={self.dependencies})"