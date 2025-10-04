import { Node, Edge } from 'reactflow';

export const buildMachineFromGraph = (nodes: Node[], edges: Edge[]) => {
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
    // Handle tool blocks properly (map to tool_call)
    const data = n.data || {};
    const rawType = data.nodeType || data.type; // prefer explicit nodeType, fallback to type
    if (n.type === 'tool' || rawType === 'tool' || data.toolName) {
      const tname = data.toolName || (Array.isArray(data.toolsPlanned) ? data.toolsPlanned[0] : undefined);
      return {
        id: n.id,
        name: data.name || data.label || tname || n.id,
        type: 'tool_call',
        description: data.description || '',
        agent_role: data.agent_role || data.agentRole || 'Executor',
        tools: tname ? [tname] : (Array.isArray(data.toolsPlanned) ? data.toolsPlanned : []),
        parameters: data.parameters || {},
      };
    }
    // Handle regular nodes with better type fallback (include data.type)
    const derivedType = rawType ? (rawType === 'tool' ? 'tool_call' : rawType) : 'analysis';
    return {
      id: n.id,
      name: data.name || data.label || n.id,
      type: derivedType,
      description: data.description || '',
      agent_role: data.agentRole || data.agent_role || '',
      tools: Array.isArray(data.toolsPlanned) ? data.toolsPlanned : (Array.isArray(data.tools) ? data.tools : [])
    };
  });

  const edgesJson = edges.map((e: any) => ({
    source: e.source,
    target: e.target,
    event: (e.label && typeof e.label === 'string' && e.label.length > 0) ? e.label : 'success'
  }));

  // Determine initial state preference order:
  // 1) Node explicitly marked isStart
  // 2) First node with type 'input'
  // 3) Node with no incoming edges
  // 4) Named 'start'/'initial'
  // 5) Fallback to first node
  let initial: string | undefined;
  const startMarked = nodes.find(n => !!(n.data as any)?.isStart);
  if (startMarked) {
    initial = startMarked.id;
  } else {
    const firstInput = nodes.find(n => (n.data as any)?.type === 'input' || (n.data as any)?.nodeType === 'input');
    if (firstInput) {
      initial = firstInput.id;
    }
  }
  if (!initial) {
    const nodesWithNoIncoming = nodes.filter(n => !edges.some(e => e.target === n.id));
    if (nodesWithNoIncoming.length > 0) {
      initial = nodesWithNoIncoming[0].id;
    }
  }
  if (!initial) {
    const startNode = nodes.find(n =>
      n.data.name?.toLowerCase() === 'start' ||
      n.data.name?.toLowerCase() === 'initial' ||
      n.id === 'start' ||
      n.id === 'initial'
    );
    if (startNode) initial = startNode.id;
  }
  if (!initial) initial = nodes[0]?.id || 'start';

  return { name: `User Planned Workflow`, initial_state: initial, states, edges: edgesJson };
};

export const rerunFromSelected = async (executionId: string | null, selectedAgent: string | null) => {
  if (!executionId || !selectedAgent) return;
  try {
    await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/${executionId}/rerun_from`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_state_id: selectedAgent })
    });
  } catch (e) {
    console.error('Failed to rerun from node', e);
  }
};