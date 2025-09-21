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
  EdgeProps,
  Connection,
  useOnSelectionChange,
  getRectOfNodes,
  getTransformForBounds,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './ProfessionalStateMachine.css';
// @ts-ignore
import dagre from 'dagre';

// Types for State Machine
interface StateDefinition {
  id: string;
  name: string;
  type: 'atomic' | 'compound' | 'parallel' | 'final' | 'history';
  initial?: string;
  states?: Record<string, StateDefinition>;
  on?: Record<string, TransitionDefinition | string>;
  entry?: string[];
  exit?: string[];
  activities?: string[];
  meta?: {
    description?: string;
    color?: string;
  };
}

interface TransitionDefinition {
  target: string;
  cond?: string;
  actions?: string[];
  internal?: boolean;
}

interface MachineDefinition {
  id: string;
  initial: string;
  states: Record<string, StateDefinition>;
  context?: Record<string, any>;
}

// Custom Node Components
const StateNode: React.FC<NodeProps> = ({ data, selected, isConnectable }) => {
  const isCompound = data.type === 'compound' || data.type === 'parallel';
  const isFinal = data.type === 'final';
  const isParallel = data.type === 'parallel';

  return (
    <div 
      className={`state-machine-node ${data.type} ${selected ? 'selected' : ''} ${data.active ? 'active' : ''}`}
      style={{
        borderRadius: isFinal ? '50%' : isParallel ? '0' : '8px',
        minWidth: isCompound ? '300px' : '150px',
        minHeight: isCompound ? '200px' : '60px',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        style={{ opacity: 0 }}
      />
      
      <div className="state-header">
        <div className="state-name">{data.label}</div>
        {data.type !== 'atomic' && (
          <div className="state-type">{data.type}</div>
        )}
      </div>

      {data.description && (
        <div className="state-description">{data.description}</div>
      )}

      {data.entry && data.entry.length > 0 && (
        <div className="state-actions">
          <span className="action-label">entry /</span>
          {data.entry.map((action: string, i: number) => (
            <span key={i} className="action-item">{action}</span>
          ))}
        </div>
      )}

      {data.exit && data.exit.length > 0 && (
        <div className="state-actions">
          <span className="action-label">exit /</span>
          {data.exit.map((action: string, i: number) => (
            <span key={i} className="action-item">{action}</span>
          ))}
        </div>
      )}

      {data.activities && data.activities.length > 0 && (
        <div className="state-actions">
          <span className="action-label">do /</span>
          {data.activities.map((activity: string, i: number) => (
            <span key={i} className="action-item">{activity}</span>
          ))}
        </div>
      )}

      {isCompound && data.childrenCount && (
        <div className="nested-states-container">
          {/* Nested states are rendered as separate nodes by React Flow */}
          <div className="nested-states-placeholder">
            {data.childrenCount} nested states
          </div>
        </div>
      )}
      
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        style={{ opacity: 0 }}
      />

      {isFinal && (
        <div className="final-state-inner" />
      )}
    </div>
  );
};

const TransitionEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  selected,
}) => {
  const path = `M ${sourceX},${sourceY} L ${targetX},${targetY}`;
  
  return (
    <>
      <path
        id={id}
        className={`transition-edge ${selected ? 'selected' : ''} ${data?.active ? 'active' : ''}`}
        d={path}
        markerEnd={markerEnd}
        strokeWidth={2}
        fill="none"
      />
      {data?.label && (
        <text>
          <textPath
            href={`#${id}`}
            style={{ fontSize: 12 }}
            startOffset="50%"
            textAnchor="middle"
          >
            {data.label}
          </textPath>
        </text>
      )}
    </>
  );
};

// Sample complex state machine (like your satellite mission)
const createSampleStateMachine = (): MachineDefinition => ({
  id: 'satelliteMission',
  initial: 'launch',
  states: {
    launch: {
      id: 'launch',
      name: 'Launch',
      type: 'atomic',
      on: {
        SUCCESS: 'orbitInsertion',
        FAILURE: 'launchFailure',
      },
      meta: {
        description: 'The satellite is launched and is in the initial ascent phase',
      },
    },
    launchFailure: {
      id: 'launchFailure',
      name: 'Launch Failure',
      type: 'atomic',
      on: {
        RETRY: 'launch',
      },
      meta: {
        description: 'The satellite failed to launch correctly and requires recovery procedures',
      },
    },
    orbitInsertion: {
      id: 'orbitInsertion',
      name: 'Orbit Insertion',
      type: 'atomic',
      on: {
        SUCCESS: 'initialOperations',
        FAILURE: 'orbitAdjustment',
      },
      meta: {
        description: 'The satellite is inserted into its designated orbit',
      },
    },
    orbitAdjustment: {
      id: 'orbitAdjustment',
      name: 'Orbit Adjustment',
      type: 'atomic',
      on: {
        SUCCESS: 'initialOperations',
        FAILURE: 'missionAbort',
      },
      meta: {
        description: 'Adjustments are made to correct the satellite orbit',
      },
    },
    initialOperations: {
      id: 'initialOperations',
      name: 'Initial Operations',
      type: 'compound',
      initial: 'systemCheck',
      states: {
        systemCheck: {
          id: 'systemCheck',
          name: 'System Check',
          type: 'atomic',
          on: {
            SYSTEMS_NOMINAL: 'subsystems',
            SYSTEMS_FAILURE: 'troubleshooting',
          },
        },
        subsystems: {
          id: 'subsystems',
          name: 'Subsystems',
          type: 'parallel',
          states: {
            adcs: {
              id: 'adcs',
              name: 'ADCS',
              type: 'compound',
              initial: 'initialization',
              states: {
                initialization: {
                  id: 'initialization',
                  name: 'Initialization',
                  type: 'atomic',
                  on: {
                    SUCCESS: 'operational',
                  },
                },
                operational: {
                  id: 'operational',
                  name: 'Operational',
                  type: 'atomic',
                },
              },
            },
            power: {
              id: 'power',
              name: 'Power Management',
              type: 'compound',
              initial: 'startup',
              states: {
                startup: {
                  id: 'startup',
                  name: 'Startup',
                  type: 'atomic',
                  on: {
                    SUCCESS: 'nominal',
                  },
                },
                nominal: {
                  id: 'nominal',
                  name: 'Nominal',
                  type: 'atomic',
                },
              },
            },
          },
        },
        troubleshooting: {
          id: 'troubleshooting',
          name: 'Troubleshooting',
          type: 'atomic',
          on: {
            RESOLVED: 'systemCheck',
            UNRESOLVED: 'missionAbort',
          },
        },
      },
      on: {
        ALL_SYSTEMS_GO: 'nominalOperations',
      },
    },
    nominalOperations: {
      id: 'nominalOperations',
      name: 'Nominal Operations',
      type: 'atomic',
      on: {
        ANOMALY_DETECTED: 'troubleshooting',
        END_OF_LIFE: 'decommissioning',
      },
      activities: ['dataCollection', 'telemetryTransmission'],
      meta: {
        description: 'The satellite is fully operational, conducting its mission',
      },
    },
    troubleshooting: {
      id: 'troubleshooting',
      name: 'Troubleshooting',
      type: 'atomic',
      on: {
        RESOLVED: 'nominalOperations',
        UNRESOLVED: 'safeMode',
      },
      entry: ['logAnomaly', 'notifyGroundControl'],
    },
    safeMode: {
      id: 'safeMode',
      name: 'Safe Mode',
      type: 'atomic',
      on: {
        RECOVERY: 'nominalOperations',
        CRITICAL_FAILURE: 'missionAbort',
      },
      activities: ['minimalOperations'],
    },
    decommissioning: {
      id: 'decommissioning',
      name: 'Decommissioning',
      type: 'atomic',
      on: {
        SUCCESS: 'missionComplete',
      },
      entry: ['deorbitBurn', 'finalDataTransmission'],
    },
    missionAbort: {
      id: 'missionAbort',
      name: 'Mission Abort',
      type: 'final',
      meta: {
        description: 'Mission aborted due to critical failures',
      },
    },
    missionComplete: {
      id: 'missionComplete',
      name: 'Mission Complete',
      type: 'final',
      meta: {
        description: 'Mission successfully completed',
      },
    },
  },
});

// Convert state machine definition to React Flow elements
const stateMachineToFlow = (
  machine: MachineDefinition,
  parentId: string = '',
  depth: number = 0
): { nodes: Node[]; edges: Edge[] } => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const dagreGraph = new dagre.graphlib.Graph();
  
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ 
    rankdir: 'TB',
    nodesep: 100,
    ranksep: 100,
    marginx: 50,
    marginy: 50,
  });

  // Create nodes for each state
  Object.entries(machine.states).forEach(([stateId, state]) => {
    const nodeId = parentId ? `${parentId}.${stateId}` : stateId;
    
    const node: Node = {
      id: nodeId,
      type: 'state',
      position: { x: 0, y: 0 },
      data: {
        label: state.name || stateId,
        type: state.type,
        description: state.meta?.description,
        entry: state.entry,
        exit: state.exit,
        activities: state.activities,
        depth,
      },
    };

    // Handle nested states
    if (state.type === 'compound' || state.type === 'parallel') {
      if (state.states) {
        const nested = stateMachineToFlow(
          { ...machine, states: state.states },
          nodeId,
          depth + 1
        );
        // Add nested nodes to the main nodes array instead of as children
        nodes.push(...nested.nodes);
        edges.push(...nested.edges);
        // Just store the count for display
        node.data.childrenCount = Object.keys(state.states).length;
      }
    }

    nodes.push(node);
    dagreGraph.setNode(nodeId, { 
      width: state.type === 'compound' ? 300 : 150,
      height: state.type === 'compound' ? 200 : 60,
    });
  });

  // Create edges for transitions
  Object.entries(machine.states).forEach(([stateId, state]) => {
    const sourceId = parentId ? `${parentId}.${stateId}` : stateId;
    
    if (state.on) {
      Object.entries(state.on).forEach(([event, transition]) => {
        const target = typeof transition === 'string' ? transition : transition.target;
        const targetId = parentId && !target.includes('.') ? `${parentId}.${target}` : target;
        
        const edge: Edge = {
          id: `${sourceId}-${targetId}-${event}`,
          source: sourceId,
          target: targetId,
          type: 'transition',
          data: {
            label: event,
            cond: typeof transition !== 'string' ? transition.cond : undefined,
            actions: typeof transition !== 'string' ? transition.actions : undefined,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
          },
        };
        
        edges.push(edge);
        dagreGraph.setEdge(sourceId, targetId);
      });
    }
  });

  // Apply dagre layout
  if (depth === 0) {
    try {
      dagre.layout(dagreGraph);
      
      nodes.forEach(node => {
        const nodeWithPosition = dagreGraph.node(node.id);
        if (nodeWithPosition) {
          node.position = {
            x: nodeWithPosition.x - (node.data.type === 'compound' ? 150 : 75),
            y: nodeWithPosition.y - (node.data.type === 'compound' ? 100 : 30),
          };
        }
      });
    } catch (error) {
      console.error('Layout error:', error);
    }
  }

  return { nodes, edges };
};

// Main Component
const ProfessionalStateMachine: React.FC = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView, getNodes } = useReactFlow();
  
  // State
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedElements, setSelectedElements] = useState<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] });
  const [currentMachine, setCurrentMachine] = useState<MachineDefinition>(createSampleStateMachine());
  const [currentState, setCurrentState] = useState<string>('launch');
  const [executionHistory, setExecutionHistory] = useState<Array<{ state: string; event: string; timestamp: Date }>>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  
  // Node and Edge types
  const nodeTypes = useMemo<NodeTypes>(() => ({ 
    state: StateNode,
  }), []);
  
  const edgeTypes = useMemo<EdgeTypes>(() => ({ 
    transition: TransitionEdge,
  }), []);

  // Initialize the state machine visualization
  useEffect(() => {
    const { nodes: flowNodes, edges: flowEdges } = stateMachineToFlow(currentMachine);
    setNodes(flowNodes);
    setEdges(flowEdges);
    
    // Fit view after layout
    setTimeout(() => {
      fitView({ padding: 0.2 });
    }, 100);
  }, [currentMachine, setNodes, setEdges, fitView]);

  // Update active state visualization
  useEffect(() => {
    setNodes(nodes => 
      nodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          active: node.id === currentState,
        },
      }))
    );
    
    setEdges(edges =>
      edges.map(edge => ({
        ...edge,
        data: {
          ...edge.data,
          active: edge.source === currentState,
        },
      }))
    );
  }, [currentState, setNodes, setEdges]);

  // Handle selection changes
  useOnSelectionChange({
    onChange: ({ nodes, edges }) => {
      setSelectedElements({ nodes, edges });
    },
  });

  // Simulate state machine execution
  const simulateTransition = useCallback((event: string) => {
    const state = currentMachine.states[currentState];
    if (!state || !state.on) return;

    const transition = state.on[event];
    if (!transition) return;

    const target = typeof transition === 'string' ? transition : transition.target;
    
    setExecutionHistory(prev => [...prev, {
      state: currentState,
      event,
      timestamp: new Date(),
    }]);
    
    setCurrentState(target);
  }, [currentState, currentMachine]);

  // Auto-simulate
  const startSimulation = useCallback(() => {
    setIsSimulating(true);
    setCurrentState(currentMachine.initial);
    setExecutionHistory([]);
    
    // Simulate a sequence of events
    const events = [
      { event: 'SUCCESS', delay: 1000 },
      { event: 'SUCCESS', delay: 2000 },
      { event: 'SYSTEMS_NOMINAL', delay: 3000 },
      { event: 'ALL_SYSTEMS_GO', delay: 4000 },
      { event: 'END_OF_LIFE', delay: 5000 },
      { event: 'SUCCESS', delay: 6000 },
    ];
    
    events.forEach(({ event, delay }) => {
      setTimeout(() => simulateTransition(event), delay);
    });
    
    setTimeout(() => setIsSimulating(false), 7000);
  }, [currentMachine, simulateTransition]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    
    // Create a new transition
    const event = prompt('Enter event name for this transition:');
    if (!event) return;
    
    const newEdge: Edge = {
      id: `${connection.source}-${connection.target}-${event}`,
      source: connection.source,
      target: connection.target,
      type: 'transition',
      data: { label: event },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 20,
        height: 20,
      },
    };
    
    setEdges(edges => addEdge(newEdge, edges));
  }, [setEdges]);

  return (
    <div className="professional-state-machine-container">
      {/* Header */}
      <div className="state-machine-header">
        <div className="header-left">
          <h1>State Machine Designer</h1>
          <span className="machine-name">{currentMachine.id}</span>
        </div>
        <div className="header-right">
          <span className="current-state-label">Current State:</span>
          <span className="current-state-value">{currentState}</span>
          <button 
            className="simulate-btn"
            onClick={startSimulation}
            disabled={isSimulating}
          >
            {isSimulating ? 'Simulating...' : 'Run Simulation'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="state-machine-main">
        {/* Canvas */}
        <div className="state-machine-canvas" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            fitView
            defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
          >
            <Background 
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="#2a2a2a"
            />
            <Controls />
            <MiniMap 
              nodeStrokeColor="#666"
              nodeColor="#1a1a1a"
              pannable
              zoomable
            />
            <Panel position="top-left" className="toolbar-panel">
              <button onClick={() => fitView({ padding: 0.2 })}>
                Fit View
              </button>
              <button onClick={() => {
                const machine = createSampleStateMachine();
                setCurrentMachine(machine);
                setCurrentState(machine.initial);
              }}>
                Reset
              </button>
            </Panel>
          </ReactFlow>
        </div>

        {/* Side Panel */}
        <div className="state-machine-sidebar">
          {/* Properties */}
          {selectedElements.nodes.length > 0 && (
            <div className="properties-panel">
              <h3>State Properties</h3>
              <div className="property-group">
                <label>Name:</label>
                <input 
                  type="text" 
                  value={selectedElements.nodes[0].data.label}
                  onChange={(e) => {
                    const nodeId = selectedElements.nodes[0].id;
                    setNodes(nodes => 
                      nodes.map(n => 
                        n.id === nodeId 
                          ? { ...n, data: { ...n.data, label: e.target.value } }
                          : n
                      )
                    );
                  }}
                />
              </div>
              <div className="property-group">
                <label>Type:</label>
                <select value={selectedElements.nodes[0].data.type}>
                  <option value="atomic">Atomic</option>
                  <option value="compound">Compound</option>
                  <option value="parallel">Parallel</option>
                  <option value="final">Final</option>
                </select>
              </div>
            </div>
          )}

          {/* Execution History */}
          <div className="history-panel">
            <h3>Execution History</h3>
            <div className="history-list">
              {executionHistory.map((entry, i) => (
                <div key={i} className="history-entry">
                  <span className="history-state">{entry.state}</span>
                  <span className="history-arrow">→</span>
                  <span className="history-event">{entry.event}</span>
                  <span className="history-time">
                    {entry.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Available Events */}
          <div className="events-panel">
            <h3>Available Events</h3>
            <div className="event-buttons">
              {(() => {
                const currentStateObj = currentMachine.states[currentState];
                if (currentStateObj && currentStateObj.on) {
                  return Object.keys(currentStateObj.on).map(event => (
                    <button
                      key={event}
                      className="event-button"
                      onClick={() => simulateTransition(event)}
                    >
                      {event}
                    </button>
                  ));
                }
                return null;
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Wrapper with Provider
const ProfessionalStateMachineWrapper: React.FC = () => {
  return (
    <ReactFlowProvider>
      <ProfessionalStateMachine />
    </ReactFlowProvider>
  );
};

export default ProfessionalStateMachineWrapper;