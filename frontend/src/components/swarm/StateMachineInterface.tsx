import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { BlockStatus } from '../../types/workflow';
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
  Connection,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './StateMachineInterface.css';
// @ts-ignore
import dagre from 'dagre';
import ReactMarkdown from 'react-markdown';
// @ts-ignore
import remarkGfm from 'remark-gfm';

// Node Types
enum NodeType {
  INITIAL = 'initial',
  STATE = 'state',
  PARALLEL = 'parallel',
  CHOICE = 'choice',
  FINAL = 'final',
}

// Event Types
enum EventType {
  SUCCESS = 'success',
  FAILURE = 'failure',
  RETRY = 'retry',
  TIMEOUT = 'timeout',
  ERROR = 'error',
  CUSTOM = 'custom',
}

// Custom State Node Component
const StateNode: React.FC<NodeProps> = ({ data, selected }) => {
  const getNodeColor = () => {
    switch (data.nodeType) {
      case NodeType.INITIAL: return '#22c55e';
      case NodeType.FINAL: return '#ef4444';
      case NodeType.PARALLEL: return '#8b5cf6';
      case NodeType.CHOICE: return '#f59e0b';
      default: return '#3b82f6';
    }
  };

  const getNodeIcon = () => {
    switch (data.nodeType) {
      case NodeType.INITIAL: return '▶';
      case NodeType.FINAL: return '⬛';
      case NodeType.PARALLEL: return '⋮⋮';
      case NodeType.CHOICE: return '◆';
      default: return '□';
    }
  };

  return (
    <div className={`state-node ${data.nodeType} ${data.status || ''} ${selected ? 'selected' : ''}`}>
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#555' }}
      />
      
      <div className="node-header">
        <span className="node-icon" style={{ color: getNodeColor() }}>
          {getNodeIcon()}
        </span>
        <span className="node-title">{data.label || data.name}</span>
        {data.status === 'active' && (
          <span className="active-indicator" />
        )}
      </div>
      
      {data.description && (
        <div className="node-description">
          {data.description}
        </div>
      )}
      
      <div className="node-body">
        {data.status === 'running' && (
          <div className="node-progress">
            <div className="progress-bar" />
          </div>
        )}
        {data.metrics && (
          <div className="node-metrics">
            {data.metrics.executions && (
              <span className="metric">Runs: {data.metrics.executions}</span>
            )}
            {data.metrics.avgDuration && (
              <span className="metric">{data.metrics.avgDuration}ms</span>
            )}
          </div>
        )}
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#555' }}
      />
    </div>
  );
};

// Custom Event Edge Component
const EventEdge: React.FC<EdgeProps> = ({
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
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const getEdgeColor = () => {
    switch (data?.eventType) {
      case EventType.SUCCESS: return '#22c55e';
      case EventType.FAILURE: return '#ef4444';
      case EventType.RETRY: return '#f59e0b';
      case EventType.TIMEOUT: return '#a855f7';
      default: return '#52525b';
    }
  };

  return (
    <>
      <BaseEdge 
        id={id} 
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: getEdgeColor(),
          strokeWidth: data?.isActive ? 2.5 : 1.5,
          strokeDasharray: data?.eventType === EventType.RETRY ? '5,5' : '0',
        }}
      />
      {data?.eventType && (
        <foreignObject
          width={80}
          height={20}
          x={labelX - 40}
          y={labelY - 10}
          className="edge-label-container"
        >
          <div className={`edge-label ${data.eventType}`}>
            {data.eventType}
          </div>
        </foreignObject>
      )}
      {data?.isActive && (
        <circle r="3" fill={getEdgeColor()}>
          <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
    </>
  );
};

// Types
interface StateNodeData {
  id: string;
  name: string;
  nodeType: NodeType;
  status?: BlockStatus;
  description?: string;
  task?: string;
  output?: string;
  error?: string;
  metrics?: {
    executions?: number;
    avgDuration?: number;
    successRate?: number;
  };
}

interface Transition {
  source: string;
  target: string;
  event: EventType;
  condition?: any;
}

interface StateMachine {
  id: string;
  name: string;
  description?: string;
  states: StateNodeData[];
  transitions: Transition[];
}

// Layout function using dagre for state machines
const getStateMachineLayout = (nodes: Node[], edges: Edge[]) => {
  if (nodes.length === 0) return { nodes, edges };
  
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ 
    rankdir: 'TB', // Top to bottom for state machines
    nodesep: 100,
    ranksep: 100,
    marginx: 50,
    marginy: 50,
    ranker: 'longest-path', // Better for state machines
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 180, height: 100 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  try {
    dagre.layout(dagreGraph);
  } catch (error) {
    console.error('Dagre layout error:', error);
    return { nodes, edges };
  }

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    if (!nodeWithPosition) {
      return node;
    }
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 90,
        y: nodeWithPosition.y - 50,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

// Main Component
const StateMachineInterface: React.FC = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView } = useReactFlow();
  
  // State
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [task, setTask] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [currentMachine, setCurrentMachine] = useState<StateMachine | null>(null);
  const [stateHistory, setStateHistory] = useState<Array<{state: string, event: string, timestamp: number}>>([]);
  const [activeStates, setActiveStates] = useState<Set<string>>(new Set());
  
  // WebSocket
  const wsRef = useRef<WebSocket | null>(null);

  // Node and Edge types
  const nodeTypes = useMemo<NodeTypes>(() => ({ 
    state: StateNode,
  }), []);
  
  const edgeTypes = useMemo<EdgeTypes>(() => ({ 
    event: EventEdge,
  }), []);
  
  // Update graph when machine definition changes
  const updateStateMachine = useCallback((machine: StateMachine, activeStates: Set<string>) => {
    // Build nodes
    const newNodes: Node[] = machine.states.map(state => ({
      id: state.id,
      type: 'state',
      data: {
        ...state,
        label: state.name,
        status: activeStates.has(state.id) ? 'active' : state.status,
      },
      position: { x: 0, y: 0 },
    }));

    // Build edges
    const newEdges: Edge[] = machine.transitions.map((transition, index) => ({
      id: `${transition.source}-${transition.target}-${transition.event}`,
      source: transition.source,
      target: transition.target,
      type: 'event',
      data: {
        eventType: transition.event,
        condition: transition.condition,
        isActive: activeStates.has(transition.source) && activeStates.has(transition.target),
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 20,
        height: 20,
        color: '#52525b',
      },
    }));

    // Apply layout
    const layouted = getStateMachineLayout(newNodes, newEdges);
    setNodes(layouted.nodes);
    setEdges(layouted.edges);

    // Fit view on first load
    if (newNodes.length > 0 && !currentMachine) {
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 400, maxZoom: 1 });
      }, 100);
    }
  }, [setNodes, setEdges, fitView, currentMachine]);

  // WebSocket message handler
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const frame = JSON.parse(event.data);
      
      switch (frame.type) {
        case 'machine_started':
          // Create state machine from payload
          const machine: StateMachine = {
            id: frame.payload.machine_id,
            name: frame.payload.name,
            states: frame.payload.states.map((s: any) => ({
              id: s.id,
              name: s.name,
              nodeType: s.type as NodeType,
              description: s.description,
              position: s.position,
            })),
            transitions: frame.payload.transitions.map((t: any) => ({
              source: t.source,
              target: t.target,
              event: t.event as EventType,
            })),
          };
          setCurrentMachine(machine);
          updateStateMachine(machine, new Set());
          break;
          
        case 'state_entered':
          setActiveStates(prev => new Set(prev).add(frame.agent_id));
          if (currentMachine) {
            updateStateMachine(currentMachine, new Set([frame.agent_id]));
          }
          break;
          
        case 'state_exited':
          setActiveStates(prev => {
            const newSet = new Set(prev);
            newSet.delete(frame.agent_id);
            return newSet;
          });
          setStateHistory(prev => [...prev, {
            state: frame.agent_id,
            event: frame.payload.event,
            timestamp: Date.now(),
          }]);
          break;
          
        case 'machine_completed':
          setIsRunning(false);
          console.log('Machine completed:', frame.payload);
          break;
      }
    } catch (error) {
      console.error('Parse error:', error);
    }
  }, [currentMachine, updateStateMachine]);

  // Connect WebSocket
  const connectWebSocket = useCallback((execId: string) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setConnectionStatus('connecting');
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const port = window.location.hostname === 'localhost' ? '8000' : window.location.port || (protocol === 'wss:' ? '443' : '8000');
    const wsUrl = `${protocol}//${window.location.hostname}:${port}/api/v1/ws/${execId}?start_from=0`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.onopen = () => {
      setConnectionStatus('connected');
    };
    
    ws.onmessage = handleMessage;
    
    ws.onerror = () => {
      setConnectionStatus('error');
    };
    
    ws.onclose = () => {
      setConnectionStatus('disconnected');
      wsRef.current = null;
    };
  }, [handleMessage]);

  // Start execution
  const startExecution = async () => {
    if (!task.trim()) return;
    
    setIsRunning(true);
    setActiveStates(new Set());
    setStateHistory([]);
    
    try {
      const requestBody = {
        task,
        execution_mode: 'state_machine',
        use_state_machine: true,
      };
      
      const apiUrl = `${window.location.origin}/api/v1/streaming/stream/state-machine`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      setExecutionId(data.exec_id);
      
      setTimeout(() => connectWebSocket(data.exec_id), 100);
    } catch (error) {
      console.error('Failed:', error);
      setIsRunning(false);
      setConnectionStatus('error');
    }
  };

  // Stop execution
  const stopExecution = () => {
    setIsRunning(false);
    setActiveStates(new Set());
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  // Reset view
  const resetView = () => {
    setCurrentMachine(null);
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    setActiveStates(new Set());
    setStateHistory([]);
  };

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node.id);
  }, []);

  // Allow connections between states
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    
    const newEdge: Edge = {
      id: `${connection.source}-${connection.target}-custom`,
      source: connection.source,
      target: connection.target,
      type: 'event',
      data: {
        eventType: EventType.CUSTOM,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 20,
        height: 20,
      },
    };
    
    setEdges(edges => addEdge(newEdge, edges));
  }, [setEdges]);

  return (
    <div className="state-machine-container">
      {/* Header */}
      <div className="flow-header">
        <div className="header-brand">
          <div className="brand-icon">⚙️</div>
          <h1>State Machine Workflow</h1>
        </div>
        <div className="connection-status">
          <span className={`status-dot ${connectionStatus}`} />
          <span>{connectionStatus}</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flow-main-content">
        {/* Graph */}
        <div className="flow-graph" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            fitView={false}
            attributionPosition="bottom-left"
            minZoom={0.2}
            maxZoom={1.5}
            defaultViewport={{ x: 100, y: 100, zoom: 0.75 }}
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
                const color = node.data?.nodeType === NodeType.INITIAL ? '#22c55e' :
                             node.data?.nodeType === NodeType.FINAL ? '#ef4444' :
                             node.data?.nodeType === NodeType.PARALLEL ? '#8b5cf6' :
                             node.data?.nodeType === NodeType.CHOICE ? '#f59e0b' :
                             '#3b82f6';
                return color;
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

        {/* State History Panel */}
        <div className="state-history-panel">
          <div className="panel-header">
            <h2>Execution History</h2>
          </div>
          
          <div className="history-list">
            {stateHistory.map((entry, index) => (
              <div key={index} className={`history-entry ${entry.event}`}>
                <div className="entry-header">
                  <span className="state-name">{entry.state}</span>
                  <span className={`event-badge ${entry.event}`}>
                    {entry.event}
                  </span>
                </div>
                <div className="entry-timestamp">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
            
            {stateHistory.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <h3>No execution history</h3>
                <p>Run a workflow to see state transitions</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Command Bar */}
      <div className="command-bar">
        <input
          className="task-input"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Enter your task to create a state machine workflow..."
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

// Wrapper Component with Provider
const StateMachineInterfaceWrapper: React.FC = () => {
  return (
    <ReactFlowProvider>
      <StateMachineInterface />
    </ReactFlowProvider>
  );
};

export default StateMachineInterfaceWrapper;
