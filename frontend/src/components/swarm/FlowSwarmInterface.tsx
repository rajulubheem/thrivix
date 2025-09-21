import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  ConnectionMode,
  Panel,
  BackgroundVariant,
  NodeTypes,
  EdgeTypes,
  MarkerType,
  Position,
  Handle,
  NodeProps,
  getBezierPath,
  EdgeProps,
  BaseEdge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './FlowSwarmInterface.css';
// @ts-ignore
import dagre from 'dagre';
import ReactMarkdown from 'react-markdown';
// @ts-ignore
import remarkGfm from 'remark-gfm';

// Custom Node Component
const AgentNode: React.FC<NodeProps> = ({ data, selected }) => {
  const getStatusColor = () => {
    switch (data.status) {
      case 'running': return '#facc15';
      case 'completed': return '#22c55e';
      case 'failed': return '#ef4444';
      default: return '#71717a';
    }
  };

  return (
    <div className={`agent-node ${data.status} ${selected ? 'selected' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#555' }}
      />
      
      <div className="node-header">
        <div className="node-status" style={{ background: getStatusColor() }} />
        <span className="node-title">{data.label || data.name}</span>
      </div>
      
      <div className="node-body">
        {data.status === 'running' && (
          <div className="node-progress">
            <div className="progress-bar" />
          </div>
        )}
        {data.duration && (
          <div className="node-duration">{(data.duration / 1000).toFixed(1)}s</div>
        )}
      </div>
      
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#555' }}
      />
    </div>
  );
};

// Custom Edge Component
const AnimatedEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge 
        id={id} 
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: data?.isActive ? '#facc15' : data?.isCompleted ? '#22c55e' : '#52525b',
          strokeWidth: data?.isActive ? 2.5 : 1.5,
        }}
      />
      {data?.isActive && (
        <circle r="3" fill="#facc15">
          <animateMotion dur="1s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
    </>
  );
};

// Types
interface Agent {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output: string;
  startTime?: number;
  endTime?: number;
  error?: string;
  parent?: string;
  depth?: number;
}

interface TokenFrame {
  exec_id: string;
  agent_id: string;
  seq: number;
  text: string;
  ts: number;
  final: boolean;
  frame_type: 'token';
}

interface ControlFrame {
  exec_id: string;
  type: string;
  agent_id?: string;
  payload?: any;
  ts: number;
  frame_type: 'control';
}

type Frame = TokenFrame | ControlFrame;

// Layout function using dagre
const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  if (nodes.length === 0) return { nodes, edges };
  
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  // Improved spacing for better grid layout
  dagreGraph.setGraph({ 
    rankdir: direction,  // TB = top-bottom for vertical layout
    nodesep: 100, 
    ranksep: 120, 
    marginx: 50, 
    marginy: 50,
    align: 'DL' // Down-left alignment for better grid
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 220, height: 100 });
  });

  edges.forEach((edge) => {
    // Check if both nodes exist before adding edge
    if (dagreGraph.node(edge.source) && dagreGraph.node(edge.target)) {
      dagreGraph.setEdge(edge.source, edge.target);
    } else {
      console.warn(`Skipping edge ${edge.source} -> ${edge.target}: node not found`);
    }
  });

  try {
    dagre.layout(dagreGraph);
  } catch (error) {
    console.error('Dagre layout error:', error);
    // Fallback to simple positioning
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

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    if (!nodeWithPosition) {
      // Fallback position if node not found in graph
      return {
        ...node,
        position: { x: 0, y: 0 },
      };
    }
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 110,
        y: nodeWithPosition.y - 50,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

// Main Component
const FlowSwarmInterface: React.FC = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView } = useReactFlow();
  
  // State
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [agents, setAgents] = useState<Map<string, Agent>>(new Map());
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [task, setTask] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [executionMode, setExecutionMode] = useState<'sequential' | 'parallel' | 'dynamic' | 'neural'>('dynamic');
  const [outputPanelWidth, setOutputPanelWidth] = useState(400);
  const [activelyStreamingAgents, setActivelyStreamingAgents] = useState<Set<string>>(new Set());
  // When a full state machine graph is provided by backend, keep it as source of truth
  const [hasStateMachineStructure, setHasStateMachineStructure] = useState<boolean>(false);
  
  // WebSocket
  const wsRef = useRef<WebSocket | null>(null);
  const agentSequences = useRef<Map<string, number>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Node and Edge types
  const nodeTypes = useMemo<NodeTypes>(() => ({ agent: AgentNode }), []);
  const edgeTypes = useMemo<EdgeTypes>(() => ({ 
    animated: AnimatedEdge,
    // Using default smoothstep edge type from React Flow
  }), []);
  
  // Store layout state to prevent recalculation during streaming
  const layoutCache = useRef<{ nodes: Node[], edges: Edge[] }>({ nodes: [], edges: [] });
  const updateTimer = useRef<NodeJS.Timeout | null>(null);
  const lastLayoutedAgentIds = useRef<Set<string>>(new Set());
  const isStreamingRef = useRef<boolean>(false);

  // Update graph with smarter streaming handling
  const updateGraph = useCallback((forceLayout: boolean = false) => {
    // Don't clear nodes if we have agents
    if (agents.size === 0) {
      return;
    }

    // If we already have a full state-machine structure rendered,
    // avoid rebuilding the graph from the (partial) agents map.
    if (hasStateMachineStructure) {
      // Only update node statuses/durations and edge animations in-place
      setNodes(prevNodes => prevNodes.map(node => {
        const agent = agents.get(node.id);
        if (!agent) return node;
        return {
          ...node,
          data: {
            ...node.data,
            status: agent.status,
            duration: agent.endTime && agent.startTime ? agent.endTime - agent.startTime : (node.data?.duration as any),
          },
        };
      }));

      setEdges(prevEdges => prevEdges.map(edge => {
        const sourceAgent = agents.get(edge.source);
        const targetAgent = agents.get(edge.target);
        if (!sourceAgent || !targetAgent) return edge;
        return {
          ...edge,
          animated: targetAgent.status === 'running',
          style: {
            ...edge.style,
            stroke: targetAgent.status === 'running' ? '#facc15' : targetAgent.status === 'completed' ? '#22c55e' : (edge.style?.stroke || '#52525b'),
          },
        };
      }));

      return;
    }

    // Check if we need to recalculate layout (new agents added)
    const currentAgentIds = new Set(agents.keys());
    const needsLayout = forceLayout || Array.from(currentAgentIds).some(id => !lastLayoutedAgentIds.current.has(id));

    // Always do layout when needed, regardless of streaming state
    if (needsLayout) {
      // Build all nodes
      const newNodes: Node[] = Array.from(agents.values()).map(agent => ({
        id: agent.id,
        type: 'agent',
        data: {
          label: agent.name,
          name: agent.name,
          status: agent.status,
          duration: agent.endTime && agent.startTime ? agent.endTime - agent.startTime : undefined,
        },
        position: { x: 0, y: 0 },
      }));

      // Build all edges
      const newEdges: Edge[] = [];
      agents.forEach(agent => {
        if (agent.parent && agents.has(agent.parent)) {
          const parentAgent = agents.get(agent.parent);
          newEdges.push({
            id: `${agent.parent}-${agent.id}`,
            source: agent.parent,
            target: agent.id,
            type: 'animated',
            animated: agent.status === 'running',
            data: {
              isActive: parentAgent?.status === 'completed' && agent.status === 'running',
              isCompleted: parentAgent?.status === 'completed' && agent.status === 'completed',
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: agent.status === 'running' ? '#facc15' : agent.status === 'completed' ? '#22c55e' : '#52525b',
            },
            style: {
              strokeWidth: agent.status === 'running' ? 2 : 1.5,
            },
          });
        }
      });

      // Apply layout only when structure changes
      const layouted = getLayoutedElements(newNodes, newEdges);
      layoutCache.current = layouted;
      lastLayoutedAgentIds.current = currentAgentIds;
      
      setNodes(layouted.nodes);
      setEdges(layouted.edges);

      // Fit view only on first node
      if (agents.size === 1 && layouted.nodes.length > 0) {
        setTimeout(() => {
          try {
            fitView({ padding: 0.2, duration: 400, maxZoom: 1 });
          } catch (e) {
            // Ignore
          }
        }, 100);
      }
    } else {
      // Just update node data without changing layout
      const updatedNodes = layoutCache.current.nodes.map(node => {
        const agent = agents.get(node.id);
        if (!agent) return node;
        return {
          ...node,
          data: {
            ...node.data,
            status: agent.status,
            duration: agent.endTime && agent.startTime ? agent.endTime - agent.startTime : undefined,
          },
        };
      });

      // Update edge animations
      const updatedEdges = layoutCache.current.edges.map(edge => {
        const sourceAgent = agents.get(edge.source);
        const targetAgent = agents.get(edge.target);
        if (!sourceAgent || !targetAgent) return edge;
        
        return {
          ...edge,
          animated: targetAgent.status === 'running',
          data: {
            isActive: sourceAgent.status === 'completed' && targetAgent.status === 'running',
            isCompleted: sourceAgent.status === 'completed' && targetAgent.status === 'completed',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
            color: targetAgent.status === 'running' ? '#facc15' : 
                   targetAgent.status === 'completed' ? '#22c55e' : '#52525b',
          },
        };
      });

      setNodes(updatedNodes);
      setEdges(updatedEdges);
    }
  }, [agents, setNodes, setEdges, fitView]);

  // Smart update when agents change
  useEffect(() => {
    // Clear any pending update
    if (updateTimer.current) {
      clearTimeout(updateTimer.current);
    }

    // Use shorter debounce for better responsiveness
    const debounceTime = 50;

    // Schedule new update
    updateTimer.current = setTimeout(() => {
      updateGraph();
    }, debounceTime);

    return () => {
      if (updateTimer.current) {
        clearTimeout(updateTimer.current);
      }
    };
  }, [agents, updateGraph]);

  // Update streaming state
  useEffect(() => {
    isStreamingRef.current = activelyStreamingAgents.size > 0;
  }, [activelyStreamingAgents]);

  // WebSocket handlers
  const connectWebSocket = useCallback((execId: string, isReconnect: boolean = false) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setConnectionStatus('connecting');
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const startFrom = isReconnect ? '$' : '0';
    const port = window.location.hostname === 'localhost' ? '8000' : window.location.port || (protocol === 'wss:' ? '443' : '8000');
    const wsUrl = `${protocol}//${window.location.hostname}:${port}/api/v1/ws/${execId}?start_from=${startFrom}`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.onopen = () => {
      setConnectionStatus('connected');
      ws.send(JSON.stringify({ type: 'ping' }));
    };
    
    ws.onmessage = (event) => {
      try {
        const frame: Frame = JSON.parse(event.data);
        handleFrame(frame);
      } catch (error) {
        console.error('Parse error:', error);
      }
    };
    
    ws.onerror = () => {
      setConnectionStatus('error');
    };
    
    ws.onclose = (event) => {
      setConnectionStatus('disconnected');
      wsRef.current = null;
      
      if (isRunning && !event.wasClean) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket(execId, true);
        }, 2000);
      }
    };
  }, [isRunning]);

  const handleFrame = useCallback((frame: Frame) => {
    if (frame.frame_type === 'token') {
      handleTokenFrame(frame as TokenFrame);
    } else if (frame.frame_type === 'control') {
      handleControlFrame(frame as ControlFrame);
    }
  }, []);

  const handleTokenFrame = useCallback((frame: TokenFrame) => {
    const { agent_id, seq, text, final } = frame;
    
    const lastSeq = agentSequences.current.get(agent_id) || 0;
    if (seq === lastSeq) return;
    if (seq < lastSeq && !final) return;
    
    agentSequences.current.set(agent_id, seq);
    
    // Track streaming agents
    if (!final) {
      setActivelyStreamingAgents(prev => new Set(prev).add(agent_id));
    }
    
    setAgents(prev => {
      const updated = new Map(prev);
      const agent = updated.get(agent_id);
      
      if (agent) {
        updated.set(agent_id, {
          ...agent,
          output: final ? agent.output : agent.output + text
        });
      }
      
      return updated;
    });
  }, []);

  const handleControlFrame = useCallback((frame: ControlFrame) => {
    const { type, agent_id, payload } = frame;
    
    switch (type) {
      case 'dag_structure':
        // Switch to DAG structure mode
        setHasStateMachineStructure(false);
        // Handle DAG structure from dynamic coordinator
        if (payload?.nodes && payload?.edges) {
          const { nodes: dagNodes, edges: dagEdges } = payload;
          
          // Convert DAG nodes to React Flow nodes with proper layout
          const newNodes: Node[] = dagNodes.map((node: any, index: number) => ({
            id: node.id,
            type: 'agent',
            position: { x: 0, y: 0 }, // Will be set by layout
            data: {
              label: node.name,
              name: node.name,
              role: node.role,
              task: node.task,
              status: 'pending',
              nodeType: node.type
            },
          }));
          
          // Convert DAG edges to React Flow edges
          const newEdges: Edge[] = dagEdges.map((edge: any) => ({
            id: `${edge.source}-${edge.target}`,
            source: edge.source,
            target: edge.target,
            type: 'smoothstep',
            animated: false,
            data: {
              label: edge.type === 'dependency' ? '' : edge.type,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: '#52525b',
            },
            style: {
              strokeWidth: 2,
              stroke: '#52525b',
            },
          }));
          
          // Apply dagre layout for proper grid positioning
          const layouted = getLayoutedElements(newNodes, newEdges);
          setNodes(prevNodes => {
            // Merge with existing nodes if any
            const existingNodeIds = new Set(prevNodes.map(n => n.id));
            const nodesToAdd = layouted.nodes.filter(n => !existingNodeIds.has(n.id));
            return [...prevNodes, ...nodesToAdd];
          });
          setEdges(prevEdges => {
            // Merge with existing edges if any
            const existingEdgeIds = new Set(prevEdges.map(e => e.id));
            const edgesToAdd = layouted.edges.filter(e => !existingEdgeIds.has(e.id));
            return [...prevEdges, ...edgesToAdd];
          });
          
          // Fit view to show the complete DAG
          setTimeout(() => {
            try {
              fitView({ padding: 0.2, duration: 400, maxZoom: 1 });
            } catch (e) {
              // Ignore fit view errors
            }
          }, 100);
        }
        break;
        
      case 'state_machine_created':
        // AI has created a state machine - visualize it
        if (payload?.machine) {
          const { states, edges } = payload.machine;
          console.log('State machine created with', states?.length, 'states and', edges?.length, 'edges');
          console.log('Edges data:', edges);
          
          // Convert to React Flow nodes
          const newNodes: Node[] = states.map((state: any) => ({
            id: state.id,
            type: 'agent',
            position: { x: 0, y: 0 },
            data: {
              label: state.name,
              name: state.name,
              status: 'pending',
              fluxNodeType: state.type,
              task: state.task,
              tools: state.tools,
            },
          }));
          
          // Convert to React Flow edges
          const mappedEdges: Edge[] = edges.map((edge: any) => ({
            id: `${edge.source}-${edge.target}-${edge.event}`,
            source: edge.source,
            target: edge.target,
            type: 'smoothstep',
            animated: false,
            label: edge.event !== 'success' ? edge.event : '',
            labelStyle: { fill: '#94a3b8', fontSize: 11 },
            labelBgStyle: { fill: '#1e293b', fillOpacity: 0.8 },
            style: {
              stroke: '#52525b',
              strokeWidth: 1.5,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: '#52525b',
            },
          }));
          // Deduplicate edges by id to avoid React key collisions
          const edgeMap = new Map<string, Edge>();
          for (const e of mappedEdges) {
            if (!edgeMap.has(e.id)) edgeMap.set(e.id, e);
          }
          const newEdges = Array.from(edgeMap.values());
          
          // Apply layout and set
          const layouted = getLayoutedElements(newNodes, newEdges);
          console.log('After layout - nodes:', layouted.nodes.length, 'edges:', layouted.edges.length);
          // Cache and mark structure as state-machine-driven so we don't overwrite it
          layoutCache.current = layouted;
          lastLayoutedAgentIds.current = new Set(states.map((s: any) => s.id));
          setHasStateMachineStructure(true);
          setNodes(layouted.nodes);
          setEdges(layouted.edges);
          
          setTimeout(() => fitView({ padding: 0.2, duration: 400, maxZoom: 1 }), 100);
        }
        break;
        
      case 'state_entered':
        // A state is being executed
        if (agent_id) {
          setActivelyStreamingAgents(prev => new Set(prev).add(agent_id));
          setAgents(prev => {
            const updated = new Map(prev);
            updated.set(agent_id, {
              id: agent_id,
              name: payload?.state?.name || agent_id,
              output: '',
              status: 'running',
              startTime: Date.now(),
              parent: payload?.parent,
              depth: payload?.depth || 0
            });
            return updated;
          });
          
          // Update node visualization
          setNodes(nodes => 
            nodes.map(node => ({
              ...node,
              data: {
                ...node.data,
                status: node.id === agent_id ? 'running' : node.data.status,
              },
            }))
          );
        }
        break;
        
      case 'state_exited':
        // State completed execution
        if (agent_id) {
          setActivelyStreamingAgents(prev => {
            const updated = new Set(prev);
            updated.delete(agent_id);
            return updated;
          });
          
          setAgents(prev => {
            const updated = new Map(prev);
            const agent = updated.get(agent_id);
            if (agent) {
              updated.set(agent_id, {
                ...agent,
                status: 'completed',
                endTime: Date.now(),
                output: payload?.result || agent.output,
              });
            }
            return updated;
          });
          
          // Update node visualization
          setNodes(nodes => 
            nodes.map(node => ({
              ...node,
              data: {
                ...node.data,
                status: node.id === agent_id ? 'completed' : node.data.status,
              },
            }))
          );
        }
        break;
        
      case 'agent_started':
        if (agent_id) {
          setActivelyStreamingAgents(prev => new Set(prev).add(agent_id));
          setAgents(prev => {
            const updated = new Map(prev);
            updated.set(agent_id, {
              id: agent_id,
              name: payload?.name || agent_id,
              output: '',
              status: 'running',
              startTime: Date.now(),
              parent: payload?.parent,
              depth: payload?.depth || 0
            });
            return updated;
          });
          
          // Update node status in graph
          setNodes(nodes => 
            nodes.map(node => ({
              ...node,
              data: {
                ...node.data,
                status: node.id === agent_id ? 'running' : node.data.status,
              },
            }))
          );
          
          // Animate edges leading to this node
          setEdges(edges =>
            edges.map(edge => ({
              ...edge,
              animated: edge.target === agent_id,
              style: {
                ...edge.style,
                stroke: edge.target === agent_id ? '#facc15' : edge.style?.stroke || '#52525b',
              },
            }))
          );
        }
        break;
        
      case 'agent_spawned':
        if (payload?.id) {
          setAgents(prev => {
            const updated = new Map(prev);
            updated.set(payload.id, {
              id: payload.id,
              name: payload.name || payload.id,
              status: 'pending',
              output: '',
              parent: payload.parent,
              depth: (payload.depth || 0) + 1
            });
            return updated;
          });
        }
        break;
        
      case 'agent_completed':
        if (agent_id) {
          setActivelyStreamingAgents(prev => {
            const updated = new Set(prev);
            updated.delete(agent_id);
            return updated;
          });
          setAgents(prev => {
            const updated = new Map(prev);
            const agent = updated.get(agent_id);
            if (agent) {
              updated.set(agent_id, {
                ...agent,
                status: 'completed',
                endTime: Date.now()
              });
            }
            return updated;
          });
          
          // Update node status in graph
          setNodes(nodes => 
            nodes.map(node => ({
              ...node,
              data: {
                ...node.data,
                status: node.id === agent_id ? 'completed' : node.data.status,
              },
            }))
          );
          
          // Update edges to show completion
          setEdges(edges =>
            edges.map(edge => ({
              ...edge,
              animated: false,
              style: {
                ...edge.style,
                stroke: edge.source === agent_id ? '#22c55e' : edge.style?.stroke || '#52525b',
              },
            }))
          );
        }
        break;
        
      case 'error':
        if (agent_id) {
          setActivelyStreamingAgents(prev => {
            const updated = new Set(prev);
            updated.delete(agent_id);
            return updated;
          });
          setAgents(prev => {
            const updated = new Map(prev);
            const agent = updated.get(agent_id);
            if (agent) {
              updated.set(agent_id, {
                ...agent,
                status: 'failed',
                error: payload?.error || 'Unknown error',
                endTime: Date.now()
              });
            }
            return updated;
          });
        }
        break;
        
      case 'session_end':
        setIsRunning(false);
        setActivelyStreamingAgents(new Set());
        break;
    }
  }, []);

  const startExecution = async () => {
    if (!task.trim()) return;
    
    // Reset view before starting
    resetView();
    setIsRunning(true);
    agentSequences.current.clear();
    
    try {
      const requestBody = {
        task,
        execution_mode: executionMode,
        use_mock: false,
        max_parallel: 5
      };
      
      // Use AI state machine endpoint for dynamic mode
      const apiUrl = executionMode === 'dynamic' 
        ? `${window.location.origin}/api/v1/streaming/stream/state-machine`
        : `${window.location.origin}/api/v1/streaming/stream/v2`;
        
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      setExecutionId(data.exec_id);
      
      setTimeout(() => connectWebSocket(data.exec_id, false), 100);
    } catch (error) {
      console.error('Failed:', error);
      setIsRunning(false);
      setConnectionStatus('error');
    }
  };

  const stopExecution = () => {
    setIsRunning(false);
    setActivelyStreamingAgents(new Set());
    setHasStateMachineStructure(false);
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
  };

  const resetView = () => {
    // Clear everything and reset
    setAgents(new Map());
    setNodes([]);
    setEdges([]);
    setSelectedAgent(null);
    layoutCache.current = { nodes: [], edges: [] };
    lastLayoutedAgentIds.current.clear();
    setActivelyStreamingAgents(new Set());
    setHasStateMachineStructure(false);
  };

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedAgent(node.id);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  const selectedAgentData = selectedAgent ? agents.get(selectedAgent) : null;

  return (
    <div className="flow-swarm-container">
      {/* Header */}
      <header className="flow-header">
        <div className="header-brand">
          <div className="brand-icon">⚡</div>
          <h1>Dynamic Agent Flow</h1>
          <div className={`connection-status ${connectionStatus}`}>
            <span className="status-dot" />
            <span>{connectionStatus}</span>
          </div>
        </div>
        
        <div className="header-stats">
          <div className="stat">
            <span className="stat-value">{agents.size}</span>
            <span className="stat-label">Agents</span>
          </div>
          <div className="stat">
            <span className="stat-value">{Array.from(agents.values()).filter(a => a.status === 'running').length}</span>
            <span className="stat-label">Active</span>
          </div>
          <div className="stat">
            <span className="stat-value">{Array.from(agents.values()).filter(a => a.status === 'completed').length}</span>
            <span className="stat-label">Completed</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flow-content">
        {/* React Flow Graph */}
        <div className="flow-graph-panel" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            fitView={false}
            attributionPosition="bottom-left"
            minZoom={0.2}
            maxZoom={1.5}
            nodesDraggable={true}
            nodesConnectable={false}
            elementsSelectable={true}
            panOnScroll={true}
            panOnDrag={true}
            defaultViewport={{ x: 100, y: 100, zoom: 0.75 }}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: false,
              style: {
                stroke: '#52525b',
                strokeWidth: 2,
              },
            }}
          >
            <Background 
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="#27272a"
            />
            <Controls />
            <MiniMap 
              nodeColor={node => {
                switch (node.data?.status) {
                  case 'running': return '#facc15';
                  case 'completed': return '#22c55e';
                  case 'failed': return '#ef4444';
                  default: return '#71717a';
                }
              }}
              pannable
              zoomable
            />
            <Panel position="top-left">
              <div className="panel-controls">
                <button onClick={() => fitView({ padding: 0.2, duration: 400, maxZoom: 1 })} className="panel-button">
                  Center View
                </button>
                <button onClick={resetView} className="panel-button">
                  Clear All
                </button>
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {/* Improved Output Panel */}
        <div className="flow-output-panel" style={{ width: `${outputPanelWidth}px` }}>
          <div className="output-panel-header">
            <div className="header-content">
              <h2 className="panel-title">Agent Outputs</h2>
              <div className="header-actions">
                <button 
                  className="panel-action-btn"
                  onClick={() => setSelectedAgent(null)}
                  title="Show All"
                >
                  All
                </button>
                <button 
                  className="panel-action-btn"
                  onClick={() => {
                    const activeAgent = Array.from(agents.values()).find(a => a.status === 'running');
                    if (activeAgent) setSelectedAgent(activeAgent.id);
                  }}
                  title="Show Active"
                >
                  Active
                </button>
              </div>
            </div>
            <div className="output-stats">
              <span className="stat-item">
                <span className="stat-value">{agents.size}</span>
                <span className="stat-label">agents</span>
              </span>
              <span className="stat-item">
                <span className="stat-value">
                  {Array.from(agents.values()).filter(a => a.status === 'completed').length}
                </span>
                <span className="stat-label">completed</span>
              </span>
            </div>
          </div>
          
          <div className="output-scroll-container">
            <div className="output-list">
              {Array.from(agents.values()).map(agent => {
                const isExpanded = selectedAgent === agent.id || (!selectedAgent && agent.status === 'running');
                
                return (
                  <div
                    key={agent.id}
                    className={`output-card ${agent.status} ${selectedAgent === agent.id ? 'selected' : ''} ${isExpanded ? 'expanded' : ''}`}
                  >
                    <div 
                      className="card-header"
                      onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
                    >
                      <div className="card-header-left">
                        <span className={`status-dot ${agent.status}`} />
                        <span className="agent-name">{agent.name}</span>
                      </div>
                      <div className="card-header-right">
                        {agent.status === 'running' && (
                          <span className="running-indicator">
                            <span className="pulse-dot" />
                            Live
                          </span>
                        )}
                        {agent.status === 'completed' && (
                          <span className="status-text">✓</span>
                        )}
                        {agent.status === 'failed' && (
                          <span className="status-text error">✗</span>
                        )}
                        {agent.startTime && agent.endTime && (
                          <span className="duration">
                            {((agent.endTime - agent.startTime) / 1000).toFixed(1)}s
                          </span>
                        )}
                        <span className="expand-icon">
                          {isExpanded ? '▼' : '▶'}
                        </span>
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div className="card-body">
                        <div className="card-content">
                          {agent.output ? (
                            <div className="markdown-output">
                              <ReactMarkdown 
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  code: ({className, children, ...props}: any) => {
                                    const match = /language-(\w+)/.exec(className || '');
                                    const isInline = !match;
                                    return !isInline ? (
                                      <div className="code-block">
                                        <div className="code-header">
                                          <span className="code-lang">{match[1]}</span>
                                        </div>
                                        <pre className="code-content">
                                          <code className={className} {...props}>
                                            {children}
                                          </code>
                                        </pre>
                                      </div>
                                    ) : (
                                      <code className={`inline-code ${className || ''}`} {...props}>
                                        {children}
                                      </code>
                                    );
                                  },
                                  p: ({children}) => <p className="markdown-p">{children}</p>,
                                  ul: ({children}) => <ul className="markdown-list">{children}</ul>,
                                  ol: ({children}) => <ol className="markdown-list ordered">{children}</ol>,
                                  li: ({children}) => <li className="markdown-li">{children}</li>,
                                }}
                              >
                                {agent.output}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <div className="no-output">
                              {agent.status === 'running' ? (
                                <div className="loading-dots">
                                  <span /><span /><span />
                                </div>
                              ) : (
                                <span>Waiting for output...</span>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {agent.error && (
                          <div className="card-error">
                            <span className="error-icon">⚠</span>
                            <span className="error-text">{agent.error}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              
              {agents.size === 0 && (
                <div className="empty-state">
                  <div className="empty-icon">🤖</div>
                  <h3>No agents yet</h3>
                  <p>Enter a task below to start execution</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Command Bar */}
      <div className="command-bar">
        <select
          className="mode-select"
          value={executionMode}
          onChange={(e) => setExecutionMode(e.target.value as any)}
          disabled={isRunning}
        >
          <option value="dynamic">Dynamic</option>
          <option value="neural">Neural</option>
          <option value="parallel">Parallel</option>
          <option value="sequential">Sequential</option>
        </select>
        
        <input
          className="task-input"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Enter your task..."
          disabled={isRunning}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isRunning && task.trim()) {
              startExecution();
            }
          }}
        />
        
        <button
          className={`execute-btn ${isRunning ? 'stop' : ''}`}
          onClick={isRunning ? stopExecution : startExecution}
          disabled={!isRunning && !task.trim()}
        >
          {isRunning ? '⏹ Stop' : '▶ Execute'}
        </button>
      </div>
    </div>
  );
};

// Custom hook for debounced updates (inspired by the shared code)
const useDebouncedUpdate = (
  callback: () => void,
  timeout: number,
  deps: any[]
): boolean => {
  const [isWaiting, setIsWaiting] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setIsWaiting(true);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      callback();
      setIsWaiting(false);
    }, timeout);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, deps);

  return isWaiting;
};

// Wrapper Component with Provider
const FlowSwarmInterfaceWrapper: React.FC = () => {
  return (
    <ReactFlowProvider>
      <FlowSwarmInterface />
    </ReactFlowProvider>
  );
};

export default FlowSwarmInterfaceWrapper;
