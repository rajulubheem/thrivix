import dagre from 'dagre';
import { Node, Edge, Position } from 'reactflow';
import { NodeData, EdgeData } from '../types/FlowTypes';

interface LayoutOptions {
  direction: 'TB' | 'LR' | 'BT' | 'RL';
  nodeWidth?: number;
  nodeHeight?: number;
  nodeSpacingH?: number;
  nodeSpacingV?: number;
}

/**
 * Properly layout nodes in a hierarchical structure using dagre
 */
export const getHierarchicalLayout = (
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  options: LayoutOptions = { direction: 'TB' }
): { nodes: Node<NodeData>[]; edges: Edge<EdgeData>[] } => {
  if (nodes.length === 0) {
    return { nodes, edges };
  }

  // If we only have one node, center it
  if (nodes.length === 1) {
    return {
      nodes: nodes.map(node => ({
        ...node,
        position: { x: 0, y: 0 },
      })),
      edges,
    };
  }

  const {
    direction = 'TB',
    nodeWidth = 280,
    nodeHeight = 140,
    nodeSpacingH = 150,  // Increased horizontal spacing
    nodeSpacingV = 200,  // Increased vertical spacing
  } = options;

  // Create a new dagre graph
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Set graph configuration for better hierarchy
  const isHorizontal = direction === 'LR' || direction === 'RL';
  
  // Enhanced dagre configuration for better hierarchical layout
  dagreGraph.setGraph({
    rankdir: direction,
    align: 'UL',  // Align nodes to upper-left of their rank
    nodesep: isHorizontal ? nodeSpacingV : nodeSpacingH,  // Spacing between nodes at same rank
    edgesep: 50,  // Increased edge separation for cleaner layout
    ranksep: isHorizontal ? nodeSpacingH : nodeSpacingV,  // Spacing between ranks/levels
    marginx: 100,  // Increased margins
    marginy: 100,
    ranker: 'network-simplex',  // Best algorithm for DAGs
    acyclicer: 'greedy',  // Handle cycles if any
  });

  console.log(`[Layout] Configuring dagre for ${nodes.length} nodes, ${edges.length} edges`);

  // Add nodes to the graph
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: nodeWidth,
      height: nodeHeight,
      label: node.data?.name || node.id,  // Add label for debugging
    });
  });

  // Validate and add edges - this is crucial for proper hierarchy
  let validEdges = 0;
  edges.forEach((edge) => {
    // Only add edge if both source and target exist
    if (dagreGraph.node(edge.source) && dagreGraph.node(edge.target)) {
      // Prevent self-loops which can break layout
      if (edge.source !== edge.target) {
        dagreGraph.setEdge(edge.source, edge.target, {
          weight: 1,
          minlen: 1,  // Minimum length constraint
          labelpos: 'c',  // Center label position
        });
        validEdges++;
      }
    } else {
      console.warn(`[Layout] Invalid edge: ${edge.source} -> ${edge.target}`);
    }
  });

  console.log(`[Layout] Added ${validEdges} valid edges out of ${edges.length} total edges`);

  // Check if we have a connected graph - if not, apply manual layout
  if (validEdges === 0 && nodes.length > 1) {
    console.warn('[Layout] No valid edges found, applying manual grid layout');
    return applyManualGridLayout(nodes, edges, options);
  }

  // Perform the layout
  try {
    dagre.layout(dagreGraph);
    console.log('[Layout] Dagre layout completed successfully');
  } catch (error) {
    console.error('[Layout] Dagre layout failed:', error);
    return applyManualGridLayout(nodes, edges, options);
  }

  // Apply the computed layout to nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    
    if (!nodeWithPosition) {
      console.warn(`[Layout] Node ${node.id} not found in dagre layout`);
      return node;
    }

    // Position nodes centered on their computed positions
    const layoutedNode = {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
      style: {
        ...node.style,
        width: nodeWidth,
        height: nodeHeight,
      }
    };

    console.log(`[Layout] Node ${node.id} positioned at (${layoutedNode.position.x}, ${layoutedNode.position.y})`);
    return layoutedNode;
  });

  // Verify we have proper spacing between nodes
  const positionStats = analyzeNodePositions(layoutedNodes);
  console.log('[Layout] Position analysis:', positionStats);

  return { 
    nodes: layoutedNodes, 
    edges: edges.map(edge => ({
      ...edge,
      type: 'smoothstep',
      animated: edge.data?.isActive || false,
    }))
  };
};

/**
 * Manual grid layout fallback for when dagre fails or no edges exist
 */
const applyManualGridLayout = (
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  options: LayoutOptions
): { nodes: Node<NodeData>[]; edges: Edge<EdgeData>[] } => {
  const { direction = 'TB', nodeWidth = 280, nodeHeight = 140, nodeSpacingH = 150, nodeSpacingV = 200 } = options;
  const isHorizontal = direction === 'LR' || direction === 'RL';
  
  // Calculate grid dimensions
  const nodeCount = nodes.length;
  const cols = Math.ceil(Math.sqrt(nodeCount));
  const rows = Math.ceil(nodeCount / cols);
  
  const layoutedNodes = nodes.map((node, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    
    // Center the grid
    const totalWidth = (cols - 1) * (nodeWidth + nodeSpacingH);
    const totalHeight = (rows - 1) * (nodeHeight + nodeSpacingV);
    const startX = -totalWidth / 2;
    const startY = -totalHeight / 2;
    
    const x = startX + col * (nodeWidth + nodeSpacingH);
    const y = startY + row * (nodeHeight + nodeSpacingV);
    
    return {
      ...node,
      position: { x, y },
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      style: {
        ...node.style,
        width: nodeWidth,
        height: nodeHeight,
      }
    };
  });
  
  console.log(`[Layout] Applied manual grid layout: ${cols}x${rows} grid for ${nodeCount} nodes`);
  
  return { 
    nodes: layoutedNodes, 
    edges: edges.map(edge => ({
      ...edge,
      type: 'smoothstep',
      animated: edge.data?.isActive || false,
    }))
  };
};

/**
 * Analyze node positions to verify proper spacing
 */
const analyzeNodePositions = (nodes: Node<NodeData>[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  avgSpacingX: number;
  avgSpacingY: number;
  uniqueXPositions: number;
  uniqueYPositions: number;
} => {
  if (nodes.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, avgSpacingX: 0, avgSpacingY: 0, uniqueXPositions: 0, uniqueYPositions: 0 };
  }
  
  const positions = nodes.map(n => n.position);
  const xPositions = positions.map(p => p.x).sort((a, b) => a - b);
  const yPositions = positions.map(p => p.y).sort((a, b) => a - b);
  
  const uniqueX = new Set(xPositions);
  const uniqueY = new Set(yPositions);
  
  let avgSpacingX = 0;
  if (xPositions.length > 1) {
    const spacings = [];
    for (let i = 1; i < xPositions.length; i++) {
      const spacing = xPositions[i] - xPositions[i-1];
      if (spacing > 0) spacings.push(spacing);
    }
    avgSpacingX = spacings.length > 0 ? spacings.reduce((a, b) => a + b, 0) / spacings.length : 0;
  }
  
  let avgSpacingY = 0;
  if (yPositions.length > 1) {
    const spacings = [];
    for (let i = 1; i < yPositions.length; i++) {
      const spacing = yPositions[i] - yPositions[i-1];
      if (spacing > 0) spacings.push(spacing);
    }
    avgSpacingY = spacings.length > 0 ? spacings.reduce((a, b) => a + b, 0) / spacings.length : 0;
  }
  
  return {
    minX: Math.min(...xPositions),
    maxX: Math.max(...xPositions),
    minY: Math.min(...yPositions),
    maxY: Math.max(...yPositions),
    avgSpacingX,
    avgSpacingY,
    uniqueXPositions: uniqueX.size,
    uniqueYPositions: uniqueY.size,
  };
};

/**
 * Analyze the graph structure to determine node hierarchy
 */
export const analyzeGraphStructure = (
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[]
): Map<string, number> => {
  const nodeDepths = new Map<string, number>();
  const adjacencyList = new Map<string, string[]>();
  
  // Build adjacency list
  edges.forEach(edge => {
    if (!adjacencyList.has(edge.source)) {
      adjacencyList.set(edge.source, []);
    }
    adjacencyList.get(edge.source)!.push(edge.target);
  });
  
  // Find root nodes (nodes with no incoming edges)
  const rootNodes = nodes.filter(node => 
    !edges.some(edge => edge.target === node.id)
  );
  
  // BFS to assign depths
  const queue: Array<{id: string, depth: number}> = 
    rootNodes.map(node => ({ id: node.id, depth: 0 }));
  
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    
    if (!nodeDepths.has(id) || nodeDepths.get(id)! > depth) {
      nodeDepths.set(id, depth);
      
      const children = adjacencyList.get(id) || [];
      children.forEach(childId => {
        queue.push({ id: childId, depth: depth + 1 });
      });
    }
  }
  
  // Assign depth 0 to any unconnected nodes
  nodes.forEach(node => {
    if (!nodeDepths.has(node.id)) {
      nodeDepths.set(node.id, 0);
    }
  });
  
  return nodeDepths;
};

/**
 * Apply manual adjustments to reduce edge crossings and improve layout
 */
export const optimizeNodePositions = (
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  direction: 'TB' | 'LR' | 'BT' | 'RL' = 'TB'
): Node<NodeData>[] => {
  if (nodes.length <= 1) {
    return nodes;
  }

  console.log(`[Layout] Optimizing positions for ${nodes.length} nodes in ${direction} direction`);
  
  const nodeDepths = analyzeGraphStructure(nodes, edges);
  const depthGroups = new Map<number, Node<NodeData>[]>();
  const maxDepth = Math.max(...Array.from(nodeDepths.values()));
  
  console.log(`[Layout] Graph has ${maxDepth + 1} levels`);
  
  // Group nodes by depth/level
  nodes.forEach(node => {
    const depth = nodeDepths.get(node.id) || 0;
    if (!depthGroups.has(depth)) {
      depthGroups.set(depth, []);
    }
    depthGroups.get(depth)!.push(node);
  });

  // Log depth distribution
  depthGroups.forEach((nodesAtDepth, depth) => {
    console.log(`[Layout] Level ${depth}: ${nodesAtDepth.length} nodes`);
  });

  const isHorizontal = direction === 'LR' || direction === 'RL';
  const isReversed = direction === 'BT' || direction === 'RL';
  
  // Enhanced spacing based on graph size
  const nodeSpacing = Math.max(300, 150 + (nodes.length * 5));
  const levelSpacing = Math.max(250, 200 + (maxDepth * 10));
  
  // Sort and position nodes within each depth level
  depthGroups.forEach((nodesAtDepth, depth) => {
    // Sort nodes to minimize edge crossings
    if (depth > 0) {
      nodesAtDepth.sort((a, b) => {
        // Get parent nodes for each node
        const aParents = edges
          .filter(e => e.target === a.id)
          .map(e => nodes.find(n => n.id === e.source))
          .filter(n => n);
        const bParents = edges
          .filter(e => e.target === b.id)
          .map(e => nodes.find(n => n.id === e.source))
          .filter(n => n);
        
        // Calculate average parent position
        const aAvgPos = aParents.length > 0
          ? aParents.reduce((sum, p) => sum + (isHorizontal ? (p?.position.y || 0) : (p?.position.x || 0)), 0) / aParents.length
          : 0;
        const bAvgPos = bParents.length > 0
          ? bParents.reduce((sum, p) => sum + (isHorizontal ? (p?.position.y || 0) : (p?.position.x || 0)), 0) / bParents.length
          : 0;
        
        // Also consider node names for consistent ordering
        if (Math.abs(aAvgPos - bAvgPos) < 50) {
          return (a.data?.name || a.id).localeCompare(b.data?.name || b.id);
        }
        
        return aAvgPos - bAvgPos;
      });
    } else {
      // Sort root nodes alphabetically for consistency
      nodesAtDepth.sort((a, b) => (a.data?.name || a.id).localeCompare(b.data?.name || b.id));
    }
    
    // Position nodes within the level
    const numNodes = nodesAtDepth.length;
    const totalSpacing = (numNodes - 1) * nodeSpacing;
    const startOffset = -totalSpacing / 2;
    
    nodesAtDepth.forEach((node, index) => {
      const offset = startOffset + (index * nodeSpacing);
      
      if (isHorizontal) {
        // For horizontal layouts (LR/RL)
        const baseX = isReversed ? -depth * levelSpacing : depth * levelSpacing;
        node.position.x = baseX;
        node.position.y = offset;
        
        // Set handle positions for horizontal flow
        node.targetPosition = isReversed ? Position.Right : Position.Left;
        node.sourcePosition = isReversed ? Position.Left : Position.Right;
      } else {
        // For vertical layouts (TB/BT)
        const baseY = isReversed ? -depth * levelSpacing : depth * levelSpacing;
        node.position.x = offset;
        node.position.y = baseY;
        
        // Set handle positions for vertical flow
        node.targetPosition = isReversed ? Position.Bottom : Position.Top;
        node.sourcePosition = isReversed ? Position.Top : Position.Bottom;
      }
      
      console.log(`[Layout] Level ${depth}, Node ${index}: ${node.id} at (${node.position.x}, ${node.position.y})`);
    });
  });
  
  // Apply force-based adjustments to reduce edge crossings further
  const optimizedNodes = reduceEdgeCrossings(nodes, edges, direction);
  
  console.log('[Layout] Node position optimization completed');
  return optimizedNodes;
};

/**
 * Apply force-based layout adjustments to reduce edge crossings
 */
const reduceEdgeCrossings = (
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  direction: 'TB' | 'LR' | 'BT' | 'RL'
): Node<NodeData>[] => {
  const isHorizontal = direction === 'LR' || direction === 'RL';
  const maxIterations = 5;
  
  let currentNodes = [...nodes];
  
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let improved = false;
    
    // Group nodes by their level/rank
    const levels = new Map<number, Node<NodeData>[]>();
    currentNodes.forEach(node => {
      const level = isHorizontal ? Math.round(node.position.x / 250) : Math.round(node.position.y / 250);
      if (!levels.has(level)) {
        levels.set(level, []);
      }
      levels.get(level)!.push(node);
    });
    
    // For each level, try to minimize crossings with adjacent levels
    levels.forEach((levelNodes, level) => {
      if (levelNodes.length <= 1) return;
      
      // Calculate current crossing count
      const currentCrossings = countEdgeCrossingsForLevel(levelNodes, edges, currentNodes, isHorizontal);
      
      // Try different orderings
      for (let i = 0; i < levelNodes.length - 1; i++) {
        for (let j = i + 1; j < levelNodes.length; j++) {
          // Swap nodes i and j
          const tempNodes = [...currentNodes];
          const nodeI = tempNodes.find(n => n.id === levelNodes[i].id)!;
          const nodeJ = tempNodes.find(n => n.id === levelNodes[j].id)!;
          
          const tempPos = { ...nodeI.position };
          nodeI.position = { ...nodeJ.position };
          nodeJ.position = tempPos;
          
          // Count crossings with new arrangement
          const newCrossings = countEdgeCrossingsForLevel(
            tempNodes.filter(n => levels.get(level)?.some(ln => ln.id === n.id)),
            edges,
            tempNodes,
            isHorizontal
          );
          
          // Keep the swap if it improves the layout
          if (newCrossings < currentCrossings) {
            currentNodes = tempNodes;
            improved = true;
            console.log(`[Layout] Iteration ${iteration}: Reduced crossings from ${currentCrossings} to ${newCrossings}`);
            break;
          }
        }
        if (improved) break;
      }
    });
    
    if (!improved) {
      console.log(`[Layout] Converged after ${iteration + 1} iterations`);
      break;
    }
  }
  
  return currentNodes;
};

/**
 * Count edge crossings for a specific level
 */
const countEdgeCrossingsForLevel = (
  levelNodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  allNodes: Node<NodeData>[],
  isHorizontal: boolean
): number => {
  let crossings = 0;
  
  // Get all edges connected to this level
  const relevantEdges = edges.filter(edge => 
    levelNodes.some(node => node.id === edge.source || node.id === edge.target)
  );
  
  // Compare each pair of edges for crossings
  for (let i = 0; i < relevantEdges.length; i++) {
    for (let j = i + 1; j < relevantEdges.length; j++) {
      const edge1 = relevantEdges[i];
      const edge2 = relevantEdges[j];
      
      const node1Source = allNodes.find(n => n.id === edge1.source);
      const node1Target = allNodes.find(n => n.id === edge1.target);
      const node2Source = allNodes.find(n => n.id === edge2.source);
      const node2Target = allNodes.find(n => n.id === edge2.target);
      
      if (!node1Source || !node1Target || !node2Source || !node2Target) continue;
      
      // Check if edges cross
      if (edgesCross(
        node1Source.position, node1Target.position,
        node2Source.position, node2Target.position,
        isHorizontal
      )) {
        crossings++;
      }
    }
  }
  
  return crossings;
};

/**
 * Check if two edges cross each other
 */
const edgesCross = (
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number },
  isHorizontal: boolean
): boolean => {
  // Simple crossing detection based on layout direction
  if (isHorizontal) {
    // For horizontal layouts, check if vertical positions cross
    return (p1.y - p3.y) * (p2.y - p4.y) < 0;
  } else {
    // For vertical layouts, check if horizontal positions cross
    return (p1.x - p3.x) * (p2.x - p4.x) < 0;
  }
};