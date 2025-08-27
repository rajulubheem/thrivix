"""Main Graph class for DAG-based agent orchestration with parallel execution."""

import asyncio
import time
from typing import Dict, Set, List, Optional, Any, Union
from dataclasses import dataclass, field
from enum import Enum
import logging

from .node import GraphNode, NodeStatus, NodeResult
from .edge import GraphEdge


logger = logging.getLogger(__name__)


class ExecutionStatus(Enum):
    """Overall graph execution status."""
    PENDING = "pending"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"  # Some nodes failed but execution continued


@dataclass
class GraphResult:
    """Result of graph execution."""
    status: ExecutionStatus
    results: Dict[str, NodeResult]
    execution_order: List[GraphNode]
    total_nodes: int
    completed_nodes: int
    failed_nodes: int
    skipped_nodes: int
    execution_time_ms: float
    accumulated_tokens: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def __str__(self):
        return (
            f"GraphResult(status={self.status.value}, "
            f"completed={self.completed_nodes}/{self.total_nodes}, "
            f"failed={self.failed_nodes}, skipped={self.skipped_nodes}, "
            f"time={self.execution_time_ms:.2f}ms)"
        )
        
    def get_result(self, node_id: str) -> Optional[Any]:
        """Get result from a specific node."""
        if node_id in self.results:
            return self.results[node_id].result
        return None


class Graph:
    """
    Directed Acyclic Graph for agent orchestration with parallel execution support.
    """
    
    def __init__(
        self,
        nodes: Dict[str, GraphNode],
        edges: List[GraphEdge],
        entry_points: Set[str],
        max_parallel: int = 10
    ):
        self.nodes = nodes
        self.edges = edges
        self.entry_points = entry_points
        self.max_parallel = max_parallel
        
        # Build adjacency lists for efficient traversal
        self.adjacency_list = self._build_adjacency_list()
        self.reverse_adjacency_list = self._build_reverse_adjacency_list()
        
        # Execution state
        self.execution_order: List[GraphNode] = []
        self.completed_nodes: Set[str] = set()
        self.failed_nodes: Set[str] = set()
        self.skipped_nodes: Set[str] = set()
        
    def _build_adjacency_list(self) -> Dict[str, List[str]]:
        """Build adjacency list for graph traversal."""
        adj = {node_id: [] for node_id in self.nodes}
        for edge in self.edges:
            adj[edge.from_node].append(edge.to_node)
        return adj
        
    def _build_reverse_adjacency_list(self) -> Dict[str, List[str]]:
        """Build reverse adjacency list for dependency checking."""
        rev_adj = {node_id: [] for node_id in self.nodes}
        for edge in self.edges:
            rev_adj[edge.to_node].append(edge.from_node)
        return rev_adj
        
    def _topological_sort(self) -> List[str]:
        """
        Perform topological sort to determine execution levels.
        
        Returns:
            List of node IDs in topological order
        """
        in_degree = {node_id: len(node.dependencies) for node_id, node in self.nodes.items()}
        queue = [node_id for node_id, degree in in_degree.items() if degree == 0]
        topo_order = []
        
        while queue:
            current = queue.pop(0)
            topo_order.append(current)
            
            # Reduce in-degree for dependent nodes
            for neighbor in self.adjacency_list[current]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)
                    
        return topo_order
        
    def _get_execution_levels(self) -> List[Set[str]]:
        """
        Group nodes into execution levels for parallel processing.
        
        Returns:
            List of sets, where each set contains nodes that can execute in parallel
        """
        levels = []
        remaining = set(self.nodes.keys())
        completed = set()
        
        while remaining:
            # Find all nodes that can execute now
            current_level = set()
            for node_id in remaining:
                node = self.nodes[node_id]
                if all(dep in completed for dep in node.dependencies):
                    current_level.add(node_id)
                    
            if not current_level:
                # No progress possible - might indicate a cycle or unreachable nodes
                logger.warning(f"Cannot make progress. Remaining nodes: {remaining}")
                break
                
            levels.append(current_level)
            completed.update(current_level)
            remaining -= current_level
            
        return levels
        
    async def _execute_node(
        self,
        node: GraphNode,
        task: Any,
        context: Dict[str, Any]
    ) -> NodeResult:
        """
        Execute a single node.
        
        Args:
            node: Node to execute
            task: Original task/input
            context: Execution context with results from dependencies
            
        Returns:
            NodeResult from execution
        """
        try:
            node.mark_executing()
            start_time = time.time()
            
            # Build input for the node
            node_input = self._build_node_input(node, task, context)
            
            # Execute the agent/executor
            if hasattr(node.executor, 'invoke_async'):
                result = await node.executor.invoke_async(node_input)
            elif hasattr(node.executor, 'invoke'):
                # Run sync method in thread pool
                result = await asyncio.get_event_loop().run_in_executor(
                    None, node.executor.invoke, node_input
                )
            else:
                # Direct callable
                result = await asyncio.get_event_loop().run_in_executor(
                    None, node.executor, node_input
                )
                
            execution_time = (time.time() - start_time) * 1000
            
            # Create node result
            node_result = NodeResult(
                node_id=node.node_id,
                agent_name=getattr(node.executor, 'name', node.node_id),
                result=result,
                execution_time_ms=execution_time,
                tokens_used=getattr(result, 'tokens_used', 0),
                status=NodeStatus.COMPLETED
            )
            
            node.mark_completed(node_result)
            return node_result
            
        except Exception as e:
            logger.error(f"Error executing node {node.node_id}: {e}")
            node.mark_failed(str(e))
            return node.result
            
    def _build_node_input(
        self,
        node: GraphNode,
        original_task: Any,
        context: Dict[str, Any]
    ) -> str:
        """
        Build input for a node based on original task and dependency results.
        
        Args:
            node: Node to build input for
            original_task: Original task/input
            context: Results from completed nodes
            
        Returns:
            Formatted input string
        """
        if not node.dependencies:
            # Entry point - just use original task
            return original_task if isinstance(original_task, str) else str(original_task)
            
        # Build input from dependencies
        parts = [f"Original Task: {original_task}\n\nInputs from previous nodes:"]
        
        for dep_id in sorted(node.dependencies):
            if dep_id in context:
                dep_result = context[dep_id]
                if dep_result and dep_result.result:
                    parts.append(f"\nFrom {dep_id}:")
                    # Handle different result types
                    if hasattr(dep_result.result, 'message'):
                        parts.append(f"  {dep_result.result.message}")
                    else:
                        parts.append(f"  {dep_result.result}")
                        
        return "\n".join(parts)
        
    def _should_execute_node(
        self,
        node: GraphNode,
        graph_state: Dict[str, Any]
    ) -> bool:
        """
        Check if a node should be executed based on conditional edges.
        
        Args:
            node: Node to check
            graph_state: Current graph execution state
            
        Returns:
            True if node should execute, False if it should be skipped
        """
        # Check all incoming edges for conditions
        for edge in self.edges:
            if edge.to_node == node.node_id:
                if not edge.should_traverse(graph_state):
                    return False
        return True
        
    async def execute_async(
        self,
        task: Union[str, Any],
        max_retries: int = 0
    ) -> GraphResult:
        """
        Execute the graph asynchronously with parallel node execution.
        
        Args:
            task: Input task or prompt
            max_retries: Maximum retries for failed nodes
            
        Returns:
            GraphResult with execution details
        """
        start_time = time.time()
        results = {}
        graph_state = {"results": results, "task": task}
        
        # Reset all nodes
        for node in self.nodes.values():
            node.reset()
            
        # Get execution levels for parallel processing
        execution_levels = self._get_execution_levels()
        logger.info(f"Execution plan has {len(execution_levels)} levels")
        
        # Execute level by level
        for level_idx, level_nodes in enumerate(execution_levels):
            logger.info(f"Executing level {level_idx + 1} with {len(level_nodes)} nodes in parallel")
            
            # Filter nodes based on conditions
            nodes_to_execute = []
            for node_id in level_nodes:
                node = self.nodes[node_id]
                if self._should_execute_node(node, graph_state):
                    nodes_to_execute.append(node)
                else:
                    node.mark_skipped("Conditional edge not satisfied")
                    self.skipped_nodes.add(node_id)
                    logger.info(f"Skipping node {node_id} due to conditions")
                    
            # Execute nodes in parallel
            if nodes_to_execute:
                tasks = [
                    self._execute_node(node, task, results)
                    for node in nodes_to_execute
                ]
                
                # Use semaphore to limit parallelism
                semaphore = asyncio.Semaphore(self.max_parallel)
                
                async def bounded_execute(node_task):
                    async with semaphore:
                        return await node_task
                        
                bounded_tasks = [bounded_execute(t) for t in tasks]
                node_results = await asyncio.gather(*bounded_tasks, return_exceptions=True)
                
                # Process results
                for node, result in zip(nodes_to_execute, node_results):
                    if isinstance(result, Exception):
                        logger.error(f"Node {node.node_id} failed with exception: {result}")
                        self.failed_nodes.add(node.node_id)
                    elif result.status == NodeStatus.COMPLETED:
                        results[node.node_id] = result
                        self.completed_nodes.add(node.node_id)
                        self.execution_order.append(node)
                    elif result.status == NodeStatus.FAILED:
                        self.failed_nodes.add(node.node_id)
                        
        # Determine overall status
        if self.failed_nodes:
            status = ExecutionStatus.PARTIAL if self.completed_nodes else ExecutionStatus.FAILED
        else:
            status = ExecutionStatus.COMPLETED
            
        execution_time = (time.time() - start_time) * 1000
        total_tokens = sum(r.tokens_used for r in results.values() if r)
        
        return GraphResult(
            status=status,
            results=results,
            execution_order=self.execution_order,
            total_nodes=len(self.nodes),
            completed_nodes=len(self.completed_nodes),
            failed_nodes=len(self.failed_nodes),
            skipped_nodes=len(self.skipped_nodes),
            execution_time_ms=execution_time,
            accumulated_tokens=total_tokens,
            metadata={
                "execution_levels": len(execution_levels),
                "max_parallel": self.max_parallel
            }
        )
        
    def execute(self, task: Union[str, Any], max_retries: int = 0) -> GraphResult:
        """
        Execute the graph synchronously.
        
        Args:
            task: Input task or prompt
            max_retries: Maximum retries for failed nodes
            
        Returns:
            GraphResult with execution details
        """
        return asyncio.run(self.execute_async(task, max_retries))
        
    def __call__(self, task: Union[str, Any]) -> GraphResult:
        """Allow graph to be called directly."""
        return self.execute(task)
        
    def visualize_execution(self) -> str:
        """Generate a visualization of the execution plan."""
        levels = self._get_execution_levels()
        lines = ["Execution Plan (Parallel Levels):"]
        lines.append("=" * 50)
        
        for i, level in enumerate(levels, 1):
            lines.append(f"\nLevel {i} (Parallel):")
            for node_id in level:
                node = self.nodes[node_id]
                deps = f" <- {', '.join(node.dependencies)}" if node.dependencies else ""
                lines.append(f"  • {node_id}{deps}")
                
        return "\n".join(lines)