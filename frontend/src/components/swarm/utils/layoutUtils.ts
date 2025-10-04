import { Node, Edge } from 'reactflow';
import dagre from 'dagre';

export const getLayoutedElements = (nodes: Node[], edges: Edge[], direction: 'TB' | 'LR' = 'LR') => {
  if (nodes.length === 0) return { nodes, edges };

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const isHorizontal = direction === 'LR';

  // Increase spacing for better clarity
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: isHorizontal ? 120 : 100,  // Increased horizontal spacing
    ranksep: isHorizontal ? 200 : 150,  // Increased vertical spacing
    marginx: 50,
    marginy: 50,
    align: 'UL',  // Upper-left alignment for cleaner look
    ranker: 'tight-tree',  // Better ranking algorithm
  });

  // Set node dimensions with padding
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: 260,   // Increased width for better content fit
      height: 120   // Increased height
    });
  });

  edges.forEach((edge) => {
    if (dagreGraph.node(edge.source) && dagreGraph.node(edge.target)) {
      dagreGraph.setEdge(edge.source, edge.target, {
        weight: 1,
        minlen: 2,  // Minimum edge length for spacing
      });
    }
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: nodeWithPosition ? {
        x: nodeWithPosition.x - 130,  // Center based on new width
        y: nodeWithPosition.y - 60,   // Center based on new height
      } : node.position,
    };
  });

  return { nodes: layoutedNodes, edges };
};