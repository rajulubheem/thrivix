/**
 * State Machine Adapter for Frontend
 * Converts AI-generated state machine blocks to enhanced tool blocks
 */

import { Node, Edge } from 'reactflow';
import { unifiedToolService } from './unifiedToolService';
import { v4 as uuidv4 } from 'uuid';

export interface StateMachineState {
  id: string;
  name: string;
  type: 'analysis' | 'tool_call' | 'decision' | 'parallel' | 'final';
  description: string;
  agent_role: string;
  tools?: string[];
  transitions: Record<string, string>;
}

export interface StateMachine {
  name: string;
  initial_state: string;
  states: StateMachineState[];
  edges: Array<{
    source: string;
    target: string;
    event: string;
  }>;
  // Enhanced fields added by backend
  enhanced?: boolean;
  enhanced_blocks?: any[];
  enhanced_edges?: any[];
}

export interface BlockContext {
  previousOutputs: Map<string, any>;
  globalContext: Record<string, any>;
  userInputs: Record<string, any>;
}

export interface BlockExecutionContext {
  blockId: string;
  toolName: string;
  input: Record<string, any>;
  output: {
    success: boolean;
    data?: any;
    error?: string;
    metadata?: {
      filesPaths?: string[];
      urls?: string[];
      entities?: string[];
      searchTerms?: string[];
    };
  };
  timestamp: number;
}

export class StateMachineAdapter {
  /**
   * Convert AI state machine to React Flow nodes with enhanced tool blocks
   */
  async convertToEnhancedWorkflow(stateMachine: StateMachine): Promise<{ nodes: Node[]; edges: Edge[] }> {
    // If backend already provided enhanced blocks, use them directly
    if (stateMachine.enhanced && stateMachine.enhanced_blocks) {
      // Apply position recalculation even for enhanced blocks
      const nodes = stateMachine.enhanced_blocks.map(block => this.ensureNodeStructure(block));
      const edges = stateMachine.enhanced_edges || [];

      // Recalculate positions for better layout
      const positionedNodes = this.calculateNodePositions(nodes, edges);

      return {
        nodes: positionedNodes,
        edges: edges
      };
    }

    // Otherwise, convert states to enhanced blocks on frontend
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Convert states to nodes
    for (const state of stateMachine.states) {
      const node = await this.convertStateToNode(state);
      nodes.push(node);
    }

    // Build node position map for edge routing analysis
    const nodePositions = new Map<string, {x: number, y: number}>();

    // We'll need positions for smart edge routing
    const positionedNodes = this.calculateNodePositions(nodes, stateMachine.edges.map(e => ({
      id: `${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      type: 'smoothstep'
    } as Edge)));

    positionedNodes.forEach(node => {
      nodePositions.set(node.id, node.position);
      // Update the nodes array with calculated positions
      const originalNode = nodes.find(n => n.id === node.id);
      if (originalNode) {
        originalNode.position = node.position;
      }
    });

    // Convert edges with smart routing based on node positions
    for (const edge of stateMachine.edges) {
      const sourcePos = nodePositions.get(edge.source);
      const targetPos = nodePositions.get(edge.target);

      // Determine edge type and style based on event and positions
      let edgeType = 'smoothstep';
      let animated = false;
      let style: any = { strokeWidth: 2 };

      // Calculate if this is a backward edge or cross-level edge
      const isBackward = sourcePos && targetPos && sourcePos.x > targetPos.x;
      const isCrossLevel = sourcePos && targetPos && Math.abs(sourcePos.x - targetPos.x) > 700;

      if (edge.event === 'retry' || edge.event === 'failure' || edge.event === 'timeout') {
        edgeType = isBackward ? 'step' : 'smoothstep';
        animated = true;
        style.stroke = '#ef4444';
        style.strokeWidth = 2.5;
      } else if (edge.event === 'success' || edge.event === 'validated' || edge.event === 'valid') {
        edgeType = isCrossLevel ? 'step' : 'smoothstep';
        style.stroke = '#10b981';
      } else if (edge.event === 'needs_review' || edge.event === 'approve' || edge.event === 'reject') {
        edgeType = 'straight';
        style.stroke = '#f59e0b';
        style.strokeDasharray = '5 5';
      } else if (edge.event === 'anomaly_detected' || edge.event === 'escalate') {
        edgeType = 'step';
        style.stroke = '#a855f7';
        style.strokeDasharray = '3 3';
        animated = true;
      } else if (edge.event === 'invalid' || edge.event === 'error') {
        edgeType = 'step';
        style.stroke = '#dc2626';
        animated = true;
      } else {
        // Default styling for other events
        style.stroke = '#6b7280';
      }

      // For very long edges, use bezier for smoother curves
      if (isCrossLevel && !isBackward) {
        edgeType = 'bezier';
      }

      edges.push({
        id: `${edge.source}-${edge.target}-${edge.event}`,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.event,
        targetHandle: null,
        type: edgeType,
        animated: animated,
        style: style,
        label: edge.event,
        labelStyle: {
          fontSize: 11,
          fontWeight: 500,
          fill: style.stroke
        },
        labelBgStyle: {
          fill: '#ffffff',
          fillOpacity: 0.9
        },
        data: {
          label: edge.event,
          event: edge.event
        }
      });
    }

    return { nodes, edges };
  }

  /**
   * Convert a single state to an enhanced node
   */
  private async convertStateToNode(state: StateMachineState): Promise<Node> {
    const baseNode: Node = {
      id: state.id,
      type: this.mapStateTypeToNodeType(state.type),
      position: { x: 0, y: 0 }, // Will be calculated later
      data: {
        type: this.mapStateTypeToNodeType(state.type),
        name: state.name,
        label: state.name,
        description: state.description,
        agent_role: state.agent_role,
        status: 'pending',
        transitions: state.transitions,
        enabled: true,
        advancedMode: false,
        isWide: false
      }
    };

    // Handle tool_call states - convert to enhanced tool blocks
    if (state.type === 'tool_call' && state.tools && state.tools.length > 0) {
      const toolName = state.tools[0];
      const toolSchema = await unifiedToolService.getToolSchema(toolName);

      if (toolSchema) {
        baseNode.type = 'toolBlock';
        baseNode.data = {
          ...baseNode.data,
          type: 'tool',
          toolName: toolName,
          toolSchema: toolSchema,
          parameters: this.prefillParameters(toolName, toolSchema, state),
          executionResult: null,
          executionError: null,
          category: toolSchema.category,
          icon: toolSchema.icon,
          color: toolSchema.color,
          display_name: toolSchema.display_name,
          available_in_agents: toolSchema.available_in_agents,
          available_in_ui: toolSchema.available_in_ui,
          hasExecutionCapability: true,
          onExecuteTool: 'unified'
        };
      } else {
        // Fallback if tool schema not found
        baseNode.data.tools = state.tools;
        baseNode.data.toolName = toolName;
      }
    }

    return baseNode;
  }

  /**
   * Ensure node has proper structure for React Flow
   */
  private ensureNodeStructure(block: any): Node {
    // IGNORE any position from the block - will recalculate
    const node: Node = {
      id: block.id || uuidv4(),
      type: block.type || 'agent',
      position: { x: 0, y: 0 },  // Will be recalculated
      data: block.data || {},
      style: {
        width: 350,  // Consistent width for all nodes
        minHeight: 150  // Consistent minimum height
      }
    };

    // Ensure data has required fields
    if (!node.data.label && node.data.name) {
      node.data.label = node.data.name;
    }

    // Ensure all blocks have consistent sizing
    node.data.isWide = true;  // All blocks should be wide enough

    // For tool blocks, ensure execution capability
    if (node.type === 'toolBlock' || node.data.type === 'tool' || node.type === 'tool') {
      node.data.hasExecutionCapability = true;
      node.data.onExecuteTool = node.data.onExecuteTool || 'unified';
    }

    return node;
  }

  /**
   * Map state type to node type
   */
  private mapStateTypeToNodeType(stateType: string): string {
    const typeMap: Record<string, string> = {
      'analysis': 'agent',
      'tool_call': 'toolBlock',
      'decision': 'decision',
      'parallel': 'parallel',
      'final': 'final'
    };

    return typeMap[stateType] || 'agent';
  }

  /**
   * Calculate positions for nodes using an enhanced layout algorithm with collision detection
   */
  calculateNodePositions(nodes: Node[], edges: Edge[]): Node[] {
    // Build adjacency list and analyze graph structure
    const graph: Record<string, string[]> = {};
    const reverseGraph: Record<string, string[]> = {};
    const crossLevelEdges: Edge[] = [];

    nodes.forEach(node => {
      graph[node.id] = [];
      reverseGraph[node.id] = [];
    });

    edges.forEach(edge => {
      if (graph[edge.source]) {
        graph[edge.source].push(edge.target);
      }
      if (reverseGraph[edge.target]) {
        reverseGraph[edge.target].push(edge.source);
      }
    });

    // Find initial nodes (no incoming edges)
    const initialNodes = nodes.filter(n =>
      reverseGraph[n.id].length === 0 ||
      n.id === 'initialization' ||
      n.id.includes('init') ||
      n.data.name?.toLowerCase().includes('init')
    );

    const startNodes = initialNodes.length > 0 ? initialNodes : [nodes[0]];

    // Use BFS to assign levels - always assign to furthest level to minimize edge crossings
    const levels: Record<number, string[]> = {};
    const nodeLevel: Record<string, number> = {};
    const visited = new Set<string>();
    const queue: Array<{ id: string; level: number }> = [];

    // Start from all initial nodes
    startNodes.forEach(node => {
      queue.push({ id: node.id, level: 0 });
    });

    while (queue.length > 0) {
      const { id, level } = queue.shift()!;

      if (visited.has(id)) {
        // Always update to furthest level to minimize backward edges
        if (nodeLevel[id] < level) {
          // Remove from old level
          const oldLevel = nodeLevel[id];
          levels[oldLevel] = levels[oldLevel].filter(nid => nid !== id);
          // Add to new level
          nodeLevel[id] = level;
          if (!levels[level]) levels[level] = [];
          levels[level].push(id);
        }
        continue;
      }

      visited.add(id);
      nodeLevel[id] = level;

      if (!levels[level]) levels[level] = [];
      levels[level].push(id);

      // Add neighbors to queue
      const neighbors = graph[id] || [];
      neighbors.forEach(neighbor => {
        queue.push({ id: neighbor, level: level + 1 });
      });
    }

    // Detect cross-level edges that might cause overlaps
    edges.forEach(edge => {
      const sourceLevel = nodeLevel[edge.source];
      const targetLevel = nodeLevel[edge.target];
      if (Math.abs(targetLevel - sourceLevel) > 1) {
        crossLevelEdges.push(edge);
      }
    });

    // Calculate spacing based on workflow complexity
    const numLevels = Object.keys(levels).length;
    const maxNodesInLevel = Math.max(...Object.values(levels).map(l => l.length));
    const hasCrossLevelEdges = crossLevelEdges.length > 0;

    // VERY generous horizontal spacing especially when there are cross-level edges
    const baseXSpacing = 600;
    const xSpacing = hasCrossLevelEdges ?
      Math.max(800, baseXSpacing + crossLevelEdges.length * 20) :
      (numLevels > 8 ? 750 : numLevels > 5 ? 650 : baseXSpacing);

    // Smart vertical spacing based on node density and connections
    const baseYSpacing = 250;
    const ySpacing = maxNodesInLevel > 6 ? 200 :
                     maxNodesInLevel > 4 ? baseYSpacing :
                     maxNodesInLevel > 2 ? 300 : 400;

    const startX = 300;
    const canvasCenterY = 600;
    const nodeHeight = 150; // Approximate node height

    const positionedNodes = [...nodes];
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Track occupied positions for collision detection
    const occupiedPositions: Array<{x: number, y: number, width: number, height: number, id: string}> = [];

    // Position nodes by level with smart vertical distribution
    Object.entries(levels).forEach(([levelStr, nodeIds]) => {
      const level = parseInt(levelStr);
      const x = startX + level * xSpacing;
      const numNodes = nodeIds.length;

      // Analyze connections for better ordering
      const nodeConnections: Record<string, number> = {};
      nodeIds.forEach(id => {
        nodeConnections[id] = (graph[id]?.length || 0) + (reverseGraph[id]?.length || 0);
      });

      // Identify special nodes
      const finalNodes = nodeIds.filter(id => {
        const node = nodeMap.get(id);
        return node?.data?.type === 'final' || node?.data?.nodeType === 'final' ||
               id.includes('final') || id.includes('success') || id.includes('failure');
      });

      const decisionNodes = nodeIds.filter(id => {
        const node = nodeMap.get(id);
        return node?.data?.type === 'decision' || node?.data?.nodeType === 'decision';
      });

      const toolNodes = nodeIds.filter(id => {
        const node = nodeMap.get(id);
        return node?.data?.type === 'tool' || node?.data?.type === 'tool_call' ||
               node?.type === 'toolBlock';
      });

      const regularNodes = nodeIds.filter(id =>
        !finalNodes.includes(id) && !decisionNodes.includes(id) && !toolNodes.includes(id)
      );

      if (numNodes === 1) {
        // Single node - center it
        const node = nodeMap.get(nodeIds[0]);
        if (node) {
          node.position = { x, y: canvasCenterY };
          occupiedPositions.push({x, y: canvasCenterY, width: 350, height: nodeHeight, id: node.id});
        }
      } else if (finalNodes.length === 2 && regularNodes.length === 0 && decisionNodes.length === 0 && toolNodes.length === 0) {
        // Special case: Only two final nodes (success/failure) - wide vertical separation
        const successNode = nodeMap.get(finalNodes.find(id => id.includes('success')) || finalNodes[0]);
        const failureNode = nodeMap.get(finalNodes.find(id => id.includes('failure')) || finalNodes[1]);

        if (successNode) {
          successNode.position = { x, y: canvasCenterY - 300 };
          occupiedPositions.push({x, y: canvasCenterY - 300, width: 350, height: nodeHeight, id: successNode.id});
        }
        if (failureNode) {
          failureNode.position = { x, y: canvasCenterY + 300 };
          occupiedPositions.push({x, y: canvasCenterY + 300, width: 350, height: nodeHeight, id: failureNode.id});
        }
      } else {
        // Multiple nodes - smart distribution with collision avoidance

        // Group and sort nodes intelligently
        const sortedNodeIds = [
          ...regularNodes.sort((a, b) => nodeConnections[b] - nodeConnections[a]),
          ...toolNodes.sort((a, b) => nodeConnections[b] - nodeConnections[a]),
          ...decisionNodes.sort((a, b) => nodeConnections[b] - nodeConnections[a]),
          ...finalNodes.sort((a, b) => a.includes('success') ? -1 : 1)
        ];

        // Calculate vertical positions with collision detection
        const actualYSpacing = Math.max(ySpacing, nodeHeight + 50); // Ensure minimum spacing
        const totalHeight = (sortedNodeIds.length - 1) * actualYSpacing;
        const startY = canvasCenterY - totalHeight / 2;

        sortedNodeIds.forEach((nodeId, index) => {
          const node = nodeMap.get(nodeId);
          if (node) {
            let y = startY + index * actualYSpacing;

            // Check for collisions and adjust if needed
            let attempts = 0;
            while (attempts < 5) {
              const collision = occupiedPositions.find(pos =>
                Math.abs(pos.x - x) < 100 &&
                Math.abs(pos.y - y) < nodeHeight + 20
              );

              if (!collision) break;

              // Adjust position to avoid collision
              y += (attempts % 2 === 0 ? 1 : -1) * (30 + attempts * 10);
              attempts++;
            }

            node.position = { x, y };
            occupiedPositions.push({x, y, width: 350, height: nodeHeight, id: node.id});
          }
        });
      }
    });

    // Handle unpositioned nodes (disconnected components)
    positionedNodes.forEach((node, index) => {
      if (!visited.has(node.id)) {
        const x = startX + numLevels * xSpacing + 300;
        const y = canvasCenterY + (index - nodes.length/2) * 200;
        node.position = { x, y };
        occupiedPositions.push({x, y, width: 350, height: nodeHeight, id: node.id});
      }
    });

    // Final pass: Ensure no overlaps by adjusting problematic nodes
    this.resolveOverlaps(positionedNodes, occupiedPositions);

    return positionedNodes;
  }

  /**
   * Resolve any remaining overlaps between nodes
   */
  private resolveOverlaps(nodes: Node[], occupiedPositions: Array<{x: number, y: number, width: number, height: number, id: string}>): void {
    const minDistance = 180; // Minimum distance between node centers

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const pos = occupiedPositions.find(p => p.id === node.id);
      if (!pos) continue;

      // Check against all other nodes at similar X positions
      for (let j = i + 1; j < nodes.length; j++) {
        const otherNode = nodes[j];
        const otherPos = occupiedPositions.find(p => p.id === otherNode.id);
        if (!otherPos) continue;

        // Only check nodes in same or adjacent columns
        if (Math.abs(pos.x - otherPos.x) > 100) continue;

        const distance = Math.abs(pos.y - otherPos.y);
        if (distance < minDistance) {
          // Nodes are too close, separate them
          const adjustment = (minDistance - distance) / 2 + 10;

          // Move both nodes apart
          if (pos.y < otherPos.y) {
            node.position.y -= adjustment;
            otherNode.position.y += adjustment;
          } else {
            node.position.y += adjustment;
            otherNode.position.y -= adjustment;
          }

          // Update occupied positions
          pos.y = node.position.y;
          otherPos.y = otherNode.position.y;
        }
      }
    }
  }

  /**
   * Propagate context/results into downstream blocks to prefill parameters.
   */
  propagateContext(nodes: Node[], edges: Edge[], context: BlockContext): Node[] {
    const outputs = context.previousOutputs || new Map<string, any>();
    if (!outputs.size) return nodes;

    const outgoing = new Map<string, string[]>();
    edges.forEach(e => {
      if (!outgoing.has(e.source)) outgoing.set(e.source, []);
      outgoing.get(e.source)!.push(e.target);
    });

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    outputs.forEach((result, sourceId) => {
      const targets = outgoing.get(sourceId) || [];
      targets.forEach(tid => {
        const target = nodeMap.get(tid);
        if (!target) return;
        const toolName = target.data?.toolName as string | undefined;
        if (!toolName) return;

        // Example: if target is python_repl, generate code from prior results
        if (toolName === 'python_repl') {
          const current = target.data.parameters || {};
          if (!current.code) {
            current.code = this.generateCodeFromResults(result);
            target.data.parameters = current;
          }
        }
      });
    });

    return nodes;
  }

  /**
   * Validate parameters against required fields from schema.
   */
  async validateParameters(toolName: string, params: any): Promise<{ valid: boolean; message?: string; userInputNeeded?: boolean; missing?: string[] }>{
    const schema = await unifiedToolService.getToolSchema(toolName);
    if (!schema) return { valid: true };
    const required = (schema.parameters || []).filter(p => p.required).map(p => p.name);
    const missing = required.filter(r => params == null || params[r] == null || params[r] === '');
    if (missing.length > 0) {
      return {
        valid: false,
        message: `Please provide: ${missing.join(', ')}`,
        userInputNeeded: true,
        missing
      };
    }
    return { valid: true };
  }

  /**
   * Prefill parameters based on schema and simple heuristics from state.
   */
  private prefillParameters(toolName: string, schema: any, state: StateMachineState): Record<string, any> {
    const out: Record<string, any> = {};
    const desc = (state.description || state.name || '').trim();
    const addDefaults = () => {
      (schema.parameters || []).forEach((p: any) => {
        if (p.default !== undefined) out[p.name] = p.default;
      });
    };

    if (toolName === 'tavily_search') {
      out.query = this.extractSearchQuery(desc);
      out.search_depth = 'basic';
      out.max_results = 5;
      addDefaults();
    } else if (toolName === 'file_read') {
      out.path = '${USER_FILE:requirements.txt}';
      addDefaults();
    } else if (toolName === 'python_repl') {
      out.code = this.generatePythonScaffold(desc);
      addDefaults();
    } else if (toolName === 'http_request') {
      out.method = 'GET';
      out.url = this.extractUrl(desc) || 'https://example.com';
      addDefaults();
    } else {
      addDefaults();
    }
    return out;
  }

  private extractSearchQuery(text: string): string {
    if (!text) return '';
    return text.split(/\s+/).slice(0, 12).join(' ');
  }

  private extractUrl(text: string): string | null {
    const m = (text || '').match(/https?:\/\/[\w\-._~:/?#\[\]@!$&'()*+,;=%]+/);
    return m ? m[0] : null;
  }

  private generatePythonScaffold(desc: string): string {
    if (!desc) {
      return "# Write Python code to accomplish the task\n\nprint('Hello from python_repl')\n";
    }
    return (
      `# Auto-generated scaffold based on task description\n` +
      `# Task: ${desc}\n\n` +
      'def main():\n' +
      '    # TODO: implement the task logic\n' +
      '    pass\n\n' +
      "if __name__ == '__main__':\n" +
      '    main()\n'
    );
  }

  private generateCodeFromResults(result: any): string {
    const snippet = typeof result === 'string' ? result.slice(0, 400) : JSON.stringify(result, null, 2).slice(0, 400);
    return (
      '# Code generated from previous results\n' +
      'def summarize():\n' +
      "    data = '''" + snippet.replace(/`/g, '') + "'''\n" +
      '    # TODO: analyze data and produce output\n' +
      '    print(data[:200])\n\n' +
      "if __name__ == '__main__':\n" +
      '    summarize()\n'
    );
  }

  /**
   * Validate workflow has executable tools
   */
  async validateWorkflow(nodes: Node[]): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    for (const node of nodes) {
      if (node.type === 'toolBlock' || node.data?.type === 'tool') {
        const toolName = node.data?.toolName;

        if (!toolName) {
          issues.push(`Node ${node.id} is a tool block but has no tool name`);
          continue;
        }

        // Check if tool is available in UI
        const isAvailable = await unifiedToolService.isToolAvailableInUI(toolName);
        if (!isAvailable) {
          issues.push(`Tool '${toolName}' in node ${node.id} is not available for UI execution`);
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}

// Export singleton instance
export const stateMachineAdapter = new StateMachineAdapter();
