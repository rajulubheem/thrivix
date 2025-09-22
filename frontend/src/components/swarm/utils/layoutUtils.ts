import ELK from 'elkjs/lib/elk.bundled.js';
import dagre from 'dagre';
import { Node, Edge } from 'reactflow';
import { NodeData, EdgeData } from '../types/FlowTypes';

const elk = new ELK();

interface LayoutOptions {
  algorithm: 'dagre' | 'elk';
  direction: 'TB' | 'LR' | 'BT' | 'RL';
  nodeSpacing?: number;
  rankSpacing?: number;
  enableSwimlanes?: boolean;
}

// Convert direction to ELK format
const directionToElk = (direction: string): string => {
  switch (direction) {
    case 'TB': return 'DOWN';
    case 'LR': return 'RIGHT';
    case 'BT': return 'UP';
    case 'RL': return 'LEFT';
    default: return 'DOWN';
  }
};

// ELK Layout Algorithm
export const getElkLayoutedElements = async (
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  options: LayoutOptions = { algorithm: 'elk', direction: 'TB' }
): Promise<{ nodes: Node<NodeData>[]; edges: Edge<EdgeData>[] }> => {
  if (nodes.length === 0) {
    return { nodes, edges };
  }

  const elkNodes = nodes.map((node) => ({
    id: node.id,
    width: node.width || 220,
    height: node.height || 100,
    // Group nodes by round/depth for swimlanes
    properties: {
      'org.eclipse.elk.partitioning.partition': node.data?.group || node.data?.round?.toString() || '0',
    },
  }));

  const elkEdges = edges.map((edge) => ({
    id: edge.id,
    sources: [edge.source],
    targets: [edge.target],
  }));

  const graph = {
    id: 'root',
    children: elkNodes,
    edges: elkEdges,
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': directionToElk(options.direction || 'TB'),
      'elk.spacing.nodeNode': String(options.nodeSpacing || 100),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(options.rankSpacing || 120),
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      // Enable partitioning for swimlanes
      ...(options.enableSwimlanes && {
        'elk.partitioning.activate': 'true',
      }),
    },
  };

  try {
    const layoutedGraph = await elk.layout(graph);
    
    const layoutedNodes = nodes.map((node) => {
      const layoutedNode = layoutedGraph.children?.find((n: any) => n.id === node.id);
      if (!layoutedNode) {
        return node;
      }
      
      return {
        ...node,
        position: {
          x: layoutedNode.x || 0,
          y: layoutedNode.y || 0,
        },
      };
    });

    return { nodes: layoutedNodes, edges };
  } catch (error) {
    console.error('ELK layout error:', error);
    // Fallback to dagre
    return getDagreLayoutedElements(nodes, edges, options);
  }
};

// Dagre Layout Algorithm (kept as fallback)
export const getDagreLayoutedElements = (
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  options: LayoutOptions = { algorithm: 'dagre', direction: 'TB' }
): { nodes: Node<NodeData>[]; edges: Edge<EdgeData>[] } => {
  if (nodes.length === 0) {
    return { nodes, edges };
  }

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  dagreGraph.setGraph({
    rankdir: options.direction || 'TB',
    nodesep: options.nodeSpacing || 100,
    ranksep: options.rankSpacing || 120,
    marginx: 50,
    marginy: 50,
    align: 'DL',
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { 
      width: node.width || 220, 
      height: node.height || 100 
    });
  });

  edges.forEach((edge) => {
    if (dagreGraph.node(edge.source) && dagreGraph.node(edge.target)) {
      dagreGraph.setEdge(edge.source, edge.target);
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
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - (node.width || 220) / 2,
          y: nodeWithPosition.y - (node.height || 100) / 2,
        },
      };
    });

    return { nodes: layoutedNodes, edges };
  } catch (error) {
    console.error('Dagre layout error:', error);
    // Fallback to simple grid
    return {
      nodes: nodes.map((node, index) => ({
        ...node,
        position: {
          x: 100 + (index % 4) * 250,
          y: 100 + Math.floor(index / 4) * 150,
        },
      })),
      edges,
    };
  }
};

// Unified layout function
export const getLayoutedElements = async (
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  options: LayoutOptions = { algorithm: 'elk', direction: 'TB' }
): Promise<{ nodes: Node<NodeData>[]; edges: Edge<EdgeData>[] }> => {
  if (options.algorithm === 'elk') {
    return getElkLayoutedElements(nodes, edges, options);
  } else {
    return getDagreLayoutedElements(nodes, edges, options);
  }
};

// Calculate swimlane backgrounds based on node groups
export const calculateSwimlanes = (
  nodes: Node<NodeData>[]
): Array<{ id: string; label: string; x: number; y: number; width: number; height: number }> => {
  const groups = new Map<string, Node<NodeData>[]>();
  
  // Group nodes by their group/round
  nodes.forEach((node) => {
    const group = node.data?.group || `Round ${node.data?.round || 0}`;
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group)!.push(node);
  });

  const swimlanes: Array<{ id: string; label: string; x: number; y: number; width: number; height: number }> = [];
  
  groups.forEach((groupNodes, groupName) => {
    if (groupNodes.length === 0) return;
    
    // Calculate bounding box
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    groupNodes.forEach((node) => {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + (node.width || 220));
      maxY = Math.max(maxY, node.position.y + (node.height || 100));
    });
    
    swimlanes.push({
      id: `swimlane-${groupName}`,
      label: groupName,
      x: minX - 20,
      y: minY - 40,
      width: maxX - minX + 40,
      height: maxY - minY + 60,
    });
  });

  return swimlanes;
};