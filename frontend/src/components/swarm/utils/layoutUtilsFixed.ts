import dagre from 'dagre';
import { Node, Edge } from 'reactflow';
import { NodeData, EdgeData } from '../types/FlowTypes';

interface LayoutOptions {
  algorithm: 'dagre' | 'elk';
  direction: 'TB' | 'LR' | 'BT' | 'RL';
  nodeSpacing?: number;
  rankSpacing?: number;
  enableSwimlanes?: boolean;
}

// Improved Dagre Layout with better spacing and alignment
export const getLayoutedElements = (
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  options: LayoutOptions = { algorithm: 'dagre', direction: 'TB' }
): { nodes: Node<NodeData>[]; edges: Edge<EdgeData>[] } => {
  if (nodes.length === 0) {
    return { nodes, edges };
  }

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  // Much better spacing for cleaner layout
  const isHorizontal = options.direction === 'LR' || options.direction === 'RL';
  
  dagreGraph.setGraph({
    rankdir: options.direction || 'TB',
    align: 'UL', // Align nodes to upper-left for consistency
    nodesep: options.nodeSpacing || (isHorizontal ? 80 : 120), // Space between nodes in same rank
    ranksep: options.rankSpacing || (isHorizontal ? 200 : 150), // Space between ranks
    marginx: 40,
    marginy: 40,
    edgesep: 50, // Minimum space between edges
    ranker: 'network-simplex', // Better ranking algorithm
    acyclicer: 'greedy' // Handle cycles better
  });

  // Set nodes with proper dimensions
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { 
      width: node.width || 280, 
      height: node.height || 120,
      label: node.data?.label || node.id
    });
  });

  // Set edges with proper weights to influence layout
  edges.forEach((edge) => {
    if (dagreGraph.node(edge.source) && dagreGraph.node(edge.target)) {
      dagreGraph.setEdge(edge.source, edge.target, {
        weight: edge.data?.isActive ? 2 : 1, // Higher weight for active edges
        minlen: 2 // Minimum edge length in ranks
      });
    }
  });

  try {
    dagre.layout(dagreGraph);
    
    const layoutedNodes = nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      if (!nodeWithPosition) {
        return {
          ...node,
          position: { x: 0, y: 0 },
        };
      }
      
      // Center the node position
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - (node.width || 280) / 2,
          y: nodeWithPosition.y - (node.height || 120) / 2,
        },
        style: {
          ...node.style,
          opacity: 1,
        }
      };
    });

    return { nodes: layoutedNodes, edges };
  } catch (error) {
    console.error('Dagre layout error:', error);
    // Fallback to grid layout
    return {
      nodes: nodes.map((node, index) => ({
        ...node,
        position: {
          x: 100 + (index % 3) * 350,
          y: 100 + Math.floor(index / 3) * 200,
        },
      })),
      edges,
    };
  }
};

// Group nodes by their depth/round for better organization
export const organizeNodesByDepth = (
  nodes: Node<NodeData>[]
): Map<number, Node<NodeData>[]> => {
  const depthMap = new Map<number, Node<NodeData>[]>();
  
  nodes.forEach(node => {
    const depth = node.data?.round || node.data?.depth || 0;
    if (!depthMap.has(depth)) {
      depthMap.set(depth, []);
    }
    depthMap.get(depth)!.push(node);
  });
  
  return depthMap;
};

// Calculate better positions for nodes to minimize edge crossings
export const optimizeLayout = (
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[]
): Node<NodeData>[] => {
  // Group nodes by depth
  const depthGroups = organizeNodesByDepth(nodes);
  
  // Sort nodes within each depth to minimize crossings
  depthGroups.forEach((groupNodes, depth) => {
    groupNodes.sort((a, b) => {
      // Sort based on connections to previous level
      const aConnections = edges.filter(e => e.target === a.id).length;
      const bConnections = edges.filter(e => e.target === b.id).length;
      return bConnections - aConnections;
    });
  });
  
  // Reassign positions with better spacing
  let yOffset = 100;
  const optimizedNodes: Node<NodeData>[] = [];
  
  depthGroups.forEach((groupNodes, depth) => {
    const nodesInRow = groupNodes.length;
    const totalWidth = nodesInRow * 350;
    const startX = (1920 - totalWidth) / 2; // Center on typical screen
    
    groupNodes.forEach((node, index) => {
      optimizedNodes.push({
        ...node,
        position: {
          x: startX + index * 350,
          y: yOffset
        }
      });
    });
    
    yOffset += 200;
  });
  
  return optimizedNodes;
};