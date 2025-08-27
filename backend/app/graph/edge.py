"""Graph edge implementation with conditional traversal support."""

from typing import Callable, Optional, Dict, Any
from dataclasses import dataclass


@dataclass
class GraphEdge:
    """An edge connecting two nodes in the graph."""
    
    from_node: str
    to_node: str
    condition: Optional[Callable[[Dict[str, Any]], bool]] = None
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}
            
    def should_traverse(self, graph_state: Dict[str, Any]) -> bool:
        """
        Determine if this edge should be traversed based on condition.
        
        Args:
            graph_state: Current state of the graph execution
            
        Returns:
            True if edge should be traversed, False otherwise
        """
        if self.condition is None:
            return True
        
        try:
            return self.condition(graph_state)
        except Exception as e:
            # Log error and default to not traversing
            print(f"Error evaluating edge condition from {self.from_node} to {self.to_node}: {e}")
            return False
            
    def __repr__(self):
        conditional = " (conditional)" if self.condition else ""
        return f"GraphEdge({self.from_node} -> {self.to_node}{conditional})"