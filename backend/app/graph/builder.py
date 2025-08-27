"""Graph builder for constructing DAG-based agent workflows."""

from typing import Dict, Set, List, Optional, Any, Callable
from .node import GraphNode
from .edge import GraphEdge
from .graph import Graph


class GraphBuilder:
    """Builder pattern for constructing execution graphs."""
    
    def __init__(self):
        self.nodes: Dict[str, GraphNode] = {}
        self.edges: List[GraphEdge] = []
        self.entry_points: Set[str] = set()
        
    def add_node(self, executor: Any, node_id: str, metadata: Optional[Dict[str, Any]] = None) -> 'GraphBuilder':
        """
        Add a node to the graph.
        
        Args:
            executor: Agent or MultiAgentBase instance
            node_id: Unique identifier for the node
            metadata: Optional metadata for the node
            
        Returns:
            Self for chaining
        """
        if node_id in self.nodes:
            raise ValueError(f"Node {node_id} already exists in graph")
            
        self.nodes[node_id] = GraphNode(
            node_id=node_id,
            executor=executor,
            metadata=metadata or {}
        )
        return self
        
    def add_edge(
        self, 
        from_node: str, 
        to_node: str, 
        condition: Optional[Callable[[Dict[str, Any]], bool]] = None
    ) -> 'GraphBuilder':
        """
        Add an edge between two nodes.
        
        Args:
            from_node: Source node ID
            to_node: Target node ID
            condition: Optional condition function for conditional edges
            
        Returns:
            Self for chaining
        """
        if from_node not in self.nodes:
            raise ValueError(f"Source node {from_node} does not exist")
        if to_node not in self.nodes:
            raise ValueError(f"Target node {to_node} does not exist")
            
        # Add edge
        self.edges.append(GraphEdge(from_node, to_node, condition))
        
        # Update dependencies
        self.nodes[to_node].dependencies.add(from_node)
        
        return self
        
    def set_entry_point(self, node_id: str) -> 'GraphBuilder':
        """
        Set a node as an entry point for the graph.
        
        Args:
            node_id: Node to mark as entry point
            
        Returns:
            Self for chaining
        """
        if node_id not in self.nodes:
            raise ValueError(f"Node {node_id} does not exist")
            
        self.entry_points.add(node_id)
        return self
        
    def set_entry_points(self, node_ids: List[str]) -> 'GraphBuilder':
        """
        Set multiple nodes as entry points.
        
        Args:
            node_ids: List of node IDs to mark as entry points
            
        Returns:
            Self for chaining
        """
        for node_id in node_ids:
            self.set_entry_point(node_id)
        return self
        
    def _detect_entry_points(self) -> Set[str]:
        """Auto-detect entry points (nodes with no dependencies)."""
        entry_points = set()
        for node_id, node in self.nodes.items():
            if not node.dependencies:
                entry_points.add(node_id)
        return entry_points
        
    def _detect_cycles(self) -> bool:
        """
        Detect if the graph contains cycles using DFS.
        
        Returns:
            True if cycles exist, False otherwise
        """
        WHITE = 0  # Not visited
        GRAY = 1   # Currently being processed
        BLACK = 2  # Finished processing
        
        colors = {node_id: WHITE for node_id in self.nodes}
        
        def has_cycle_dfs(node_id: str) -> bool:
            colors[node_id] = GRAY
            
            # Check all nodes that depend on this one
            for edge in self.edges:
                if edge.from_node == node_id:
                    neighbor = edge.to_node
                    if colors[neighbor] == GRAY:
                        return True  # Back edge found - cycle detected
                    if colors[neighbor] == WHITE and has_cycle_dfs(neighbor):
                        return True
                        
            colors[node_id] = BLACK
            return False
            
        # Check from all nodes
        for node_id in self.nodes:
            if colors[node_id] == WHITE:
                if has_cycle_dfs(node_id):
                    return True
                    
        return False
        
    def validate(self) -> List[str]:
        """
        Validate the graph structure.
        
        Returns:
            List of validation errors (empty if valid)
        """
        errors = []
        
        # Check for cycles
        if self._detect_cycles():
            errors.append("Graph contains cycles - must be acyclic")
            
        # Check for orphaned nodes (no path from entry points)
        if not self.entry_points:
            self.entry_points = self._detect_entry_points()
            
        if not self.entry_points:
            errors.append("No entry points found in graph")
            
        # Check all nodes are reachable from entry points
        reachable = set()
        to_visit = list(self.entry_points)
        
        while to_visit:
            current = to_visit.pop(0)
            if current in reachable:
                continue
            reachable.add(current)
            
            # Add all nodes this one connects to
            for edge in self.edges:
                if edge.from_node == current and edge.to_node not in reachable:
                    to_visit.append(edge.to_node)
                    
        unreachable = set(self.nodes.keys()) - reachable
        if unreachable:
            errors.append(f"Unreachable nodes: {unreachable}")
            
        return errors
        
    def build(self) -> Graph:
        """
        Build and validate the graph.
        
        Returns:
            Constructed Graph instance
            
        Raises:
            ValueError: If graph validation fails
        """
        # Auto-detect entry points if not set
        if not self.entry_points:
            self.entry_points = self._detect_entry_points()
            
        # Validate
        errors = self.validate()
        if errors:
            raise ValueError(f"Graph validation failed: {'; '.join(errors)}")
            
        return Graph(
            nodes=self.nodes,
            edges=self.edges,
            entry_points=self.entry_points
        )
        
    def visualize(self) -> str:
        """
        Generate a simple text visualization of the graph.
        
        Returns:
            ASCII representation of the graph
        """
        lines = ["Graph Structure:"]
        lines.append("-" * 40)
        
        # Show entry points
        lines.append(f"Entry Points: {', '.join(self.entry_points)}")
        lines.append("")
        
        # Show nodes and their dependencies
        for node_id, node in self.nodes.items():
            deps = f" <- {', '.join(node.dependencies)}" if node.dependencies else " (no dependencies)"
            lines.append(f"  {node_id}{deps}")
            
        lines.append("")
        lines.append("Edges:")
        for edge in self.edges:
            cond = " [conditional]" if edge.condition else ""
            lines.append(f"  {edge.from_node} -> {edge.to_node}{cond}")
            
        return "\n".join(lines)