import { Node, Edge, Position } from 'reactflow';
import { v4 as uuidv4 } from 'uuid';
import dagre from 'dagre';
import { fixWorkflowMachine } from '../../../utils/workflowFixer';

export interface StateMachine {
  name: string;
  initial_state: string;
  states: Array<{
    id: string;
    name: string;
    type: string;
    description: string;
    agent_role: string;
    tools: string[];
    transitions?: Record<string, string>;
    enabled?: boolean;
  }>;
  edges: Array<{
    source: string;
    target: string;
    event: string;
  }>;
}

export class StateMachineService {
  buildMachineFromGraph(nodes: Node[], edges: Edge[]): StateMachine {
    const states = nodes.map((n: any) => {
      // Handle professional and enhanced nodes
      if (n.type === 'professional' || n.type === 'enhanced') {
        return {
          id: n.id,
          name: n.data.name || n.id,
          type: n.data.type || 'analysis',
          description: n.data.description || '',
          agent_role: n.data.agent_role || 'Agent',
          tools: n.data.tools || [],
          transitions: n.data.transitions || {},
          enabled: n.data.enabled !== false
        };
      }
      // Handle regular nodes
      return {
        id: n.id,
        name: n.data?.name || n.data?.label || n.id,
        type: n.data?.nodeType || 'analysis',
        description: n.data?.description || '',
        agent_role: n.data?.agentRole || '',
        tools: Array.isArray(n.data?.toolsPlanned) ? n.data.toolsPlanned : []
      };
    });

    const edgesJson = edges.map((e: any) => ({
      source: e.source,
      target: e.target,
      event: (e.label && typeof e.label === 'string' && e.label.length > 0) ? e.label : 'success'
    }));

    // Find the initial state
    const nodesWithNoIncoming = nodes.filter(n =>
      !edges.some(e => e.target === n.id)
    );
    let initial = nodesWithNoIncoming[0]?.id || nodes[0]?.id || 'start';

    // Prefer nodes explicitly named 'start' or 'initial'
    const startNode = nodes.find(n =>
      n.data.name?.toLowerCase() === 'start' ||
      n.data.name?.toLowerCase() === 'initial' ||
      n.id === 'start' ||
      n.id === 'initial'
    );
    if (startNode) {
      initial = startNode.id;
    }

    return {
      name: `User Planned Workflow`,
      initial_state: initial,
      states,
      edges: edgesJson
    };
  }

  async importStateMachine(
    machine: StateMachine,
    clearExisting: boolean,
    onImport: (nodes: Node[], edges: Edge[]) => void,
    isDarkMode: boolean,
    layoutDirection: string = 'TB'
  ): Promise<void> {
    const nodeMap = new Map<string, Node>();
    const newEdges: Edge[] = [];

    // Create nodes from machine states
    machine.states.forEach((state, index) => {
      const node: Node = {
        id: state.id,
        type: 'professional',
        position: { x: index * 200, y: index * 100 },
        data: {
          ...state,
          label: state.name,
          status: 'pending',
          isDarkMode,
          nodeType: state.type,
          agentRole: state.agent_role,
          toolsPlanned: state.tools || [],
          transitions: state.transitions || {}
        }
      };
      nodeMap.set(state.id, node);
    });

    // Create edges from machine edges
    machine.edges.forEach(edge => {
      const newEdge: Edge = {
        id: `${edge.source}-${edge.target}-${edge.event}`,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        animated: edge.event === 'success',
        label: edge.event !== 'success' ? edge.event : '',
        data: {
          event: edge.event,
          isDarkMode,
          animated: edge.event === 'success'
        }
      };
      newEdges.push(newEdge);
    });

    // Apply auto-layout with proper dagre algorithm
    const nodes = Array.from(nodeMap.values());
    if (nodes.length > 0) {
      this.applyAutoLayout(nodes, newEdges, layoutDirection === 'TB' ? 'TB' : 'LR');
    }

    onImport(nodes, newEdges);
  }

  private applyAutoLayout(nodes: Node[], edges: Edge[], direction: string = 'LR'): void {
    if (nodes.length === 0) return;

    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    const isHorizontal = direction === 'LR';

    // Set graph options with proper spacing
    dagreGraph.setGraph({
      rankdir: direction,
      nodesep: isHorizontal ? 120 : 100,
      edgesep: 50,
      ranksep: isHorizontal ? 150 : 120,
      marginx: 20,
      marginy: 20
    });

    // Set node dimensions
    nodes.forEach((node) => {
      dagreGraph.setNode(node.id, {
        width: 260,
        height: 120
      });
    });

    // Add edges to graph
    edges.forEach((edge) => {
      if (dagreGraph.node(edge.source) && dagreGraph.node(edge.target)) {
        dagreGraph.setEdge(edge.source, edge.target, {
          weight: 1,
          minlen: 2
        });
      }
    });

    // Run the layout algorithm
    dagre.layout(dagreGraph);

    // Apply the calculated positions
    nodes.forEach((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      if (nodeWithPosition) {
        node.position = {
          x: nodeWithPosition.x - 260 / 2,
          y: nodeWithPosition.y - 120 / 2
        };

        // Set source and target positions based on layout direction
        if (isHorizontal) {
          node.sourcePosition = Position.Right;
          node.targetPosition = Position.Left;
        } else {
          node.sourcePosition = Position.Bottom;
          node.targetPosition = Position.Top;
        }
      }
    });
  }

  async planWorkflow(
    task: string,
    selectedTools: Set<string>
  ): Promise<StateMachine | null> {
    try {
      const response = await fetch(
        `${window.location.origin}/api/v1/streaming/stream/state-machine/plan`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task,
            tool_preferences: {
              selected_tools: Array.from(selectedTools),
              restrict_to_selected: selectedTools.size > 0,
              use_enhanced_blocks: true
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Plan HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.machine || null;
    } catch (error) {
      console.error('Workflow planning failed:', error);
      return null;
    }
  }

  async executeWorkflow(
    task: string,
    machine: StateMachine,
    selectedTools: Set<string>
  ): Promise<{ exec_id: string } | null> {
    try {
      // Fix the machine to ensure retry states have tools
      const fixedMachine = fixWorkflowMachine(machine as any) as StateMachine;

      const response = await fetch(
        `${window.location.origin}/api/v1/streaming/stream/state-machine/execute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task,
            machine: fixedMachine,
            tool_preferences: {
              selected_tools: Array.from(selectedTools),
              restrict_to_selected: selectedTools.size > 0
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Execution failed:', error);
      return null;
    }
  }

  async updateGraph(
    execId: string,
    updates: {
      states?: any[];
      edges?: any[];
      remove_states?: string[];
      remove_edges?: any[];
    }
  ): Promise<boolean> {
    try {
      const response = await fetch(
        `${window.location.origin}/api/v1/streaming/stream/state-machine/${execId}/update_graph`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        }
      );
      return response.ok;
    } catch (error) {
      console.error('Graph update failed:', error);
      return false;
    }
  }
}