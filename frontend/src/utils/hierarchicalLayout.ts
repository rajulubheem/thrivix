/**
 * Hierarchical Auto-Layout for Workflow Nodes
 * Creates a sequence-diagram-style layout with proper spacing
 */

interface InputNode {
  id: string;
  position?: { x: number; y: number };
  data: any;
  [key: string]: any;
}

interface OutputNode {
  id: string;
  position: { x: number; y: number };
  data: any;
  [key: string]: any;
}

interface Edge {
  source: string;
  target: string;
  data?: any;
}

interface LayoutConfig {
  horizontalSpacing: number;
  verticalSpacing: number;
  startX: number;
  startY: number;
  nodeWidth: number;
  nodeHeight: number;
}

const DEFAULT_CONFIG: LayoutConfig = {
  horizontalSpacing: 400,  // Space between columns
  verticalSpacing: 150,    // Space between rows
  startX: 100,
  startY: 100,
  nodeWidth: 280,
  nodeHeight: 120
};

/**
 * Build adjacency list from edges
 */
function buildGraph(edges: Edge[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  edges.forEach(edge => {
    if (!graph.has(edge.source)) {
      graph.set(edge.source, []);
    }
    graph.get(edge.source)!.push(edge.target);
  });

  return graph;
}

/**
 * Find root nodes (nodes with no incoming edges)
 */
function findRoots(nodes: InputNode[], edges: Edge[]): string[] {
  const hasIncoming = new Set(edges.map(e => e.target));
  return nodes
    .filter(n => !hasIncoming.has(n.id))
    .map(n => n.id);
}

/**
 * Topological sort with level assignment
 */
function assignLevels(nodes: InputNode[], edges: Edge[]): Map<string, number> {
  const graph = buildGraph(edges);
  const roots = findRoots(nodes, edges);
  const levels = new Map<string, number>();
  const visited = new Set<string>();

  function dfs(nodeId: string, level: number) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const currentLevel = levels.get(nodeId) || 0;
    levels.set(nodeId, Math.max(currentLevel, level));

    const children = graph.get(nodeId) || [];
    children.forEach(child => dfs(child, level + 1));
  }

  // Start from all roots
  roots.forEach(root => dfs(root, 0));

  // Handle orphaned nodes
  nodes.forEach(node => {
    if (!levels.has(node.id)) {
      levels.set(node.id, 0);
    }
  });

  return levels;
}

/**
 * Group nodes by level
 */
function groupByLevel(levels: Map<string, number>): Map<number, string[]> {
  const groups = new Map<number, string[]>();

  levels.forEach((level, nodeId) => {
    if (!groups.has(level)) {
      groups.set(level, []);
    }
    groups.get(level)!.push(nodeId);
  });

  return groups;
}

/**
 * Calculate positions for hierarchical layout
 */
export function hierarchicalLayout(
  nodes: InputNode[],
  edges: Edge[],
  config: Partial<LayoutConfig> = {}
): OutputNode[] {
  const conf = { ...DEFAULT_CONFIG, ...config };

  if (nodes.length === 0) return [];

  // Special case: single node
  if (nodes.length === 1) {
    return [{
      ...nodes[0],
      position: { x: conf.startX, y: conf.startY }
    }];
  }

  // Assign levels based on graph structure
  const levels = assignLevels(nodes, edges);
  const levelGroups = groupByLevel(levels);
  const maxLevel = Math.max(...Array.from(levels.values()));

  // Calculate positions
  const positioned: OutputNode[] = [];

  for (let level = 0; level <= maxLevel; level++) {
    const nodesInLevel = levelGroups.get(level) || [];
    const numNodes = nodesInLevel.length;

    nodesInLevel.forEach((nodeId, index) => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      // X position: based on level (column)
      const x = conf.startX + (level * conf.horizontalSpacing);

      // Y position: centered vertically for this level
      let y;
      if (numNodes === 1) {
        // Center single node
        y = conf.startY + 200;
      } else {
        // Distribute multiple nodes vertically
        const totalHeight = (numNodes - 1) * conf.verticalSpacing;
        const startY = conf.startY + 200 - (totalHeight / 2);
        y = startY + (index * conf.verticalSpacing);
      }

      positioned.push({
        ...node,
        position: { x, y }
      });
    });
  }

  return positioned;
}

/**
 * Simple sequential layout (left-to-right flow)
 */
export function sequentialLayout(
  nodes: InputNode[],
  config: Partial<LayoutConfig> = {}
): OutputNode[] {
  const conf = { ...DEFAULT_CONFIG, ...config };

  return nodes.map((node, index) => ({
    ...node,
    position: {
      x: conf.startX + (index * conf.horizontalSpacing),
      y: conf.startY + 200
    }
  }));
}

/**
 * Grid layout (for nodes without clear hierarchy)
 */
export function gridLayout(
  nodes: InputNode[],
  columns: number = 3,
  config: Partial<LayoutConfig> = {}
): OutputNode[] {
  const conf = { ...DEFAULT_CONFIG, ...config };

  return nodes.map((node, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);

    return {
      ...node,
      position: {
        x: conf.startX + (col * conf.horizontalSpacing),
        y: conf.startY + (row * conf.verticalSpacing)
      }
    };
  });
}

/**
 * Auto-detect best layout and apply it
 */
export function autoLayout(nodes: InputNode[], edges: Edge[]): OutputNode[] {
  // If no edges, use grid layout
  if (edges.length === 0) {
    return gridLayout(nodes);
  }

  // If linear chain (each node has at most 1 outgoing edge), use sequential
  const outDegrees = new Map<string, number>();
  edges.forEach(e => {
    outDegrees.set(e.source, (outDegrees.get(e.source) || 0) + 1);
  });

  const isLinear = Array.from(outDegrees.values()).every(deg => deg <= 1);
  if (isLinear) {
    return sequentialLayout(nodes);
  }

  // Otherwise, use hierarchical layout
  return hierarchicalLayout(nodes, edges);
}
