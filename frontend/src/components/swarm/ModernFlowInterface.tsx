import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import './ModernFlowInterface.css';
import ReactMarkdown from 'react-markdown';
// @ts-ignore
import remarkGfm from 'remark-gfm';

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

interface NodePosition {
  x: number;
  y: number;
}

const ModernFlowInterface: React.FC = () => {
  // Core state
  const [task, setTask] = useState('');
  const [agents, setAgents] = useState<Map<string, Agent>>(new Map());
  const [isRunning, setIsRunning] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [executionMode, setExecutionMode] = useState<'sequential' | 'parallel' | 'dynamic' | 'neural'>('dynamic');
  const [useMockAgents, setUseMockAgents] = useState(false);
  
  // UI state
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<Map<string, NodePosition>>(new Map());
  const [graphEdges, setGraphEdges] = useState<Array<{from: string; to: string}>>([]);
  const [consoleOutput, setConsoleOutput] = useState<Array<{type: string; content: string; timestamp: number}>>([]);
  const [outputPanelWidth, setOutputPanelWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  
  // Graph interaction state
  const [graphZoom, setGraphZoom] = useState(1);
  const [graphPan, setGraphPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const graphRef = useRef<HTMLDivElement | null>(null);
  const agentSequences = useRef<Map<string, number>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionIdRef = useRef<string | null>(null);

  // Calculate metrics
  const activeAgents = Array.from(agents.values()).filter(a => a.status === 'running').length;
  const completedAgents = Array.from(agents.values()).filter(a => a.status === 'completed').length;
  const failedAgents = Array.from(agents.values()).filter(a => a.status === 'failed').length;
  const progress = agents.size > 0 ? Math.round((completedAgents / agents.size) * 100) : 0;

  // Layout algorithm for DAG
  const calculateDAGLayout = useCallback(() => {
    if (!graphRef.current || agents.size === 0) return;
    
    const width = graphRef.current.clientWidth || 800;
    const height = graphRef.current.clientHeight || 600;
    
    // Constants for better spacing
    const NODE_WIDTH = 180;
    const NODE_HEIGHT = 70;
    const HORIZONTAL_GAP = 250;
    const VERTICAL_GAP = 100;
    const MARGIN = 50;
    
    // Group agents by depth level
    const agentsByDepth = new Map<number, Agent[]>();
    let maxDepth = 0;
    
    agents.forEach(agent => {
      const depth = agent.depth || 0;
      maxDepth = Math.max(maxDepth, depth);
      
      if (!agentsByDepth.has(depth)) {
        agentsByDepth.set(depth, []);
      }
      agentsByDepth.get(depth)!.push(agent);
    });
    
    // Calculate positions with better spacing
    const positions = new Map<string, NodePosition>();
    const occupiedSpaces = new Map<number, number[]>(); // Track Y positions per depth
    
    // Process each depth level
    for (let depth = 0; depth <= maxDepth; depth++) {
      const agentsAtDepth = agentsByDepth.get(depth) || [];
      const x = MARGIN + (depth * HORIZONTAL_GAP);
      
      if (!occupiedSpaces.has(depth)) {
        occupiedSpaces.set(depth, []);
      }
      
      // Group agents by parent for better organization
      const agentsByParent = new Map<string | undefined, Agent[]>();
      agentsAtDepth.forEach(agent => {
        const parentId = agent.parent;
        if (!agentsByParent.has(parentId)) {
          agentsByParent.set(parentId, []);
        }
        agentsByParent.get(parentId)!.push(agent);
      });
      
      let currentY = MARGIN;
      
      // Position each group of siblings
      agentsByParent.forEach((siblings, parentId) => {
        if (parentId) {
          const parentPos = positions.get(parentId);
          if (parentPos) {
            // Start siblings near parent Y position
            currentY = Math.max(currentY, parentPos.y - ((siblings.length - 1) * VERTICAL_GAP / 2));
          }
        }
        
        siblings.forEach((agent, index) => {
          let y = currentY + (index * VERTICAL_GAP);
          
          // Ensure no overlap with existing nodes at this depth
          const occupiedYs = occupiedSpaces.get(depth) || [];
          while (occupiedYs.some(occupiedY => Math.abs(y - occupiedY) < NODE_HEIGHT)) {
            y += NODE_HEIGHT + 20;
          }
          
          // Keep within bounds
          y = Math.max(MARGIN, Math.min(height - NODE_HEIGHT - MARGIN, y));
          
          positions.set(agent.id, { x, y });
          occupiedYs.push(y);
        });
        
        currentY = currentY + (siblings.length * VERTICAL_GAP) + 50;
      });
      
      occupiedSpaces.set(depth, occupiedSpaces.get(depth) || []);
    }
    
    setNodePositions(positions);
  }, [agents, graphEdges]);

  // Apply layout when agents or edges change
  useEffect(() => {
    calculateDAGLayout();
  }, [agents.size, graphEdges.length, calculateDAGLayout]);

  // WebSocket connection
  const connectWebSocket = useCallback((execId: string, isReconnect: boolean = false) => {
    const newConnectionId = `${execId}-${Date.now()}`;
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    connectionIdRef.current = newConnectionId;
    setConnectionStatus('connecting');
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const startFrom = isReconnect ? '$' : '0';
    const port = window.location.hostname === 'localhost' ? '8000' : window.location.port || (protocol === 'wss:' ? '443' : '8000');
    const wsUrl = `${protocol}//${window.location.hostname}:${port}/api/v1/ws/${execId}?start_from=${startFrom}`;
    
    addConsoleOutput('system', `Connecting to ${wsUrl}...`);
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.onopen = () => {
      setConnectionStatus('connected');
      addConsoleOutput('success', 'Connected to agent system');
      ws.send(JSON.stringify({ type: 'ping' }));
    };
    
    ws.onmessage = (event) => {
      if (connectionIdRef.current !== newConnectionId) return;
      
      try {
        const frame: Frame = JSON.parse(event.data);
        handleFrame(frame);
      } catch (error) {
        addConsoleOutput('error', `Parse error: ${error}`);
      }
    };
    
    ws.onerror = () => {
      setConnectionStatus('error');
      addConsoleOutput('error', 'Connection error occurred');
    };
    
    ws.onclose = (event) => {
      setConnectionStatus('disconnected');
      wsRef.current = null;
      
      if (isRunning && !event.wasClean) {
        addConsoleOutput('warning', 'Connection lost. Reconnecting...');
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket(execId, true);
        }, 2000);
      }
    };
  }, [isRunning]);

  const addConsoleOutput = useCallback((type: string, content: string) => {
    setConsoleOutput(prev => [...prev, { type, content, timestamp: Date.now() }].slice(-100));
  }, []);

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
      case 'agent_started':
        if (agent_id) {
          addConsoleOutput('info', `Agent [${payload?.name || agent_id}] started`);
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
          
          // Add edge if parent exists
          if (payload?.parent) {
            setGraphEdges(prev => {
              const exists = prev.some(e => e.from === payload.parent && e.to === agent_id);
              if (!exists) {
                return [...prev, { from: payload.parent, to: agent_id }];
              }
              return prev;
            });
          }
        }
        break;
        
      case 'agent_spawned':
        if (payload?.id) {
          addConsoleOutput('success', `Spawned: [${payload.name}]`);
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
          
          // Add edge if parent exists
          if (payload?.parent) {
            setGraphEdges(prev => {
              const exists = prev.some(e => e.from === payload.parent && e.to === payload.id);
              if (!exists) {
                return [...prev, { from: payload.parent, to: payload.id }];
              }
              return prev;
            });
          }
        }
        break;
        
      case 'agent_completed':
        if (agent_id) {
          const agent = agents.get(agent_id);
          addConsoleOutput('success', `Agent [${agent?.name}] completed`);
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
        }
        break;
        
      case 'error':
        if (agent_id) {
          addConsoleOutput('error', `Agent [${agent_id}] error: ${payload?.error}`);
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
        
      case 'planning_complete':
        if (payload?.graph) {
          const edges = Array.isArray(payload.graph.edges) ? payload.graph.edges : [];
          setGraphEdges(edges);
          
          // Pre-populate agents from graph nodes
          if (Array.isArray(payload.graph.nodes)) {
            setAgents(prev => {
              const updated = new Map(prev);
              payload.graph.nodes.forEach((n: any) => {
                const id = n.id || n.agent_id || n.name;
                if (id && !updated.has(id)) {
                  updated.set(id, {
                    id,
                    name: n.name || id,
                    status: 'pending',
                    output: '',
                    depth: 0
                  });
                }
              });
              return updated;
            });
          }
          
          addConsoleOutput('info', `Execution plan created: ${edges.length} connections`);
        }
        break;
        
      case 'session_end':
        setIsRunning(false);
        addConsoleOutput('system', 'Execution complete');
        break;
    }
  }, [agents, addConsoleOutput]);

  const startExecution = async () => {
    if (!task.trim()) return;
    
    setIsRunning(true);
    setAgents(new Map());
    setNodePositions(new Map());
    setGraphEdges([]);
    agentSequences.current.clear();
    setConsoleOutput([]);
    
    addConsoleOutput('system', '=== STARTING EXECUTION ===');
    addConsoleOutput('info', `Mode: ${executionMode}`);
    addConsoleOutput('info', `Task: ${task}`);
    
    try {
      const requestBody = {
        task,
        execution_mode: executionMode,
        use_mock: useMockAgents,
        max_parallel: 5
      };
      
      const apiUrl = `${window.location.origin}/api/v1/streaming/stream/v2`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      setExecutionId(data.exec_id);
      addConsoleOutput('success', `Execution ID: ${data.exec_id}`);
      
      setTimeout(() => connectWebSocket(data.exec_id, false), 100);
    } catch (error) {
      addConsoleOutput('error', `Failed: ${error}`);
      setIsRunning(false);
      setConnectionStatus('error');
    }
  };

  const stopExecution = () => {
    addConsoleOutput('warning', 'Stopping execution...');
    setIsRunning(false);
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
  };

  // Graph interactions
  const handleGraphWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setGraphZoom(prev => Math.max(0.5, Math.min(2, prev * delta)));
  }, []);

  const handleGraphMouseDown = useCallback((e: React.MouseEvent) => {
    setIsPanning(true);
    setPanStart({ x: e.clientX - graphPan.x, y: e.clientY - graphPan.y });
  }, [graphPan]);

  const handleGraphMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setGraphPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    }
  }, [isPanning, panStart]);

  const handleGraphMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const resetGraphView = useCallback(() => {
    setGraphZoom(1);
    setGraphPan({ x: 0, y: 0 });
  }, []);

  // Resizable panel handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (isResizing) {
      const newWidth = window.innerWidth - e.clientX;
      setOutputPanelWidth(Math.min(Math.max(300, newWidth), window.innerWidth - 400));
    }
  }, [isResizing]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  return (
    <div className="modern-flow-container">
      {/* Header */}
      <header className="flow-header">
        <div className="header-brand">
          <div className="brand-icon">⚡</div>
          <div className="brand-text">
            <h1>Dynamic Agent System</h1>
            <div className="connection-indicator">
              <span className={`indicator-dot ${connectionStatus}`}></span>
              <span className="indicator-text">{connectionStatus}</span>
            </div>
          </div>
        </div>
        
        <div className="header-stats">
          <div className="stat">
            <span className="stat-value">{agents.size}</span>
            <span className="stat-label">Agents</span>
          </div>
          <div className="stat">
            <span className="stat-value active">{activeAgents}</span>
            <span className="stat-label">Active</span>
          </div>
          <div className="stat">
            <span className="stat-value">{completedAgents}</span>
            <span className="stat-label">Done</span>
          </div>
          <div className="stat">
            <span className="stat-value">{progress}%</span>
            <span className="stat-label">Progress</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flow-content">
        {/* Graph Panel */}
        <div className="graph-panel">
          <div className="panel-header">
            <h2>Execution Flow</h2>
            <div className="graph-controls">
              <span className="zoom-level">Zoom: {Math.round(graphZoom * 100)}%</span>
              <button onClick={resetGraphView} className="control-btn">
                Reset
              </button>
            </div>
          </div>
          
          <div 
            className="graph-viewport"
            ref={graphRef}
            onWheel={handleGraphWheel}
            onMouseDown={handleGraphMouseDown}
            onMouseMove={handleGraphMouseMove}
            onMouseUp={handleGraphMouseUp}
            onMouseLeave={handleGraphMouseUp}
          >
            <div 
              className="graph-content"
              style={{
                transform: `translate(${graphPan.x}px, ${graphPan.y}px) scale(${graphZoom})`,
                transformOrigin: '0 0'
              }}
            >
              {/* Grid Background */}
              <svg className="graph-grid" width="2000" height="2000">
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1"/>
                  </pattern>
                </defs>
                <rect width="2000" height="2000" fill="url(#grid)" />
              </svg>
              
              {/* Connections */}
              <svg className="graph-connections" width="2000" height="2000">
                <defs>
                  <marker id="arrowhead" markerWidth="12" markerHeight="10" refX="10" refY="5" orient="auto">
                    <polygon points="0 0, 12 5, 0 10" fill="#52525b" />
                  </marker>
                  <marker id="arrowhead-active" markerWidth="12" markerHeight="10" refX="10" refY="5" orient="auto">
                    <polygon points="0 0, 12 5, 0 10" fill="#facc15" />
                  </marker>
                  <marker id="arrowhead-completed" markerWidth="12" markerHeight="10" refX="10" refY="5" orient="auto">
                    <polygon points="0 0, 12 5, 0 10" fill="#22c55e" />
                  </marker>
                </defs>
                {graphEdges.map((edge, idx) => {
                  const fromPos = nodePositions.get(edge.from);
                  const toPos = nodePositions.get(edge.to);
                  if (!fromPos || !toPos) return null;
                  
                  const fromAgent = agents.get(edge.from);
                  const toAgent = agents.get(edge.to);
                  const isActive = fromAgent?.status === 'completed' && toAgent?.status === 'running';
                  const isCompleted = fromAgent?.status === 'completed' && toAgent?.status === 'completed';
                  
                  // Calculate path for curved edges
                  // Calculate smooth bezier curve for connections
                  const dx = toPos.x - fromPos.x;
                  const dy = toPos.y - fromPos.y;
                  
                  // Create control points for smooth curve
                  const cx1 = fromPos.x + dx * 0.5;
                  const cy1 = fromPos.y;
                  const cx2 = toPos.x - dx * 0.3;
                  const cy2 = toPos.y;
                  
                  const pathData = `M ${fromPos.x} ${fromPos.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${toPos.x} ${toPos.y}`;
                  
                  return (
                    <g key={`edge-${idx}`}>
                      {/* Shadow for depth */}
                      <path
                        d={pathData}
                        stroke="rgba(0,0,0,0.3)"
                        strokeWidth={isActive ? 3 : 2}
                        fill="none"
                        transform="translate(2, 2)"
                      />
                      {/* Main path */}
                      <path
                        d={pathData}
                        stroke={isActive ? '#facc15' : isCompleted ? '#22c55e' : '#52525b'}
                        strokeWidth={isActive ? 2.5 : 2}
                        strokeOpacity={isActive ? 1 : isCompleted ? 0.9 : 0.6}
                        fill="none"
                        markerEnd={isActive ? "url(#arrowhead-active)" : isCompleted ? "url(#arrowhead-completed)" : "url(#arrowhead)"}
                        className={isActive ? 'connection-active' : ''}
                        strokeLinecap="round"
                      />
                    </g>
                  );
                })}
              </svg>
              
              {/* Nodes */}
              {Array.from(agents.values()).map(agent => {
                const pos = nodePositions.get(agent.id);
                if (!pos) return null;
                
                return (
                  <div
                    key={agent.id}
                    className={`flow-node ${agent.status} ${selectedAgent === agent.id ? 'selected' : ''}`}
                    style={{
                      left: pos.x - 90, // Half of NODE_WIDTH (180)
                      top: pos.y - 30   // Half of NODE_HEIGHT (60)
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAgent(prev => prev === agent.id ? null : agent.id);
                    }}
                  >
                    {agent.status === 'running' && <div className="node-pulse"></div>}
                    <div className="node-content">
                      <div className="node-status">
                        <div className={`node-status-indicator ${agent.status}`} />
                      </div>
                      <div className="node-info">
                        <div className="node-name">{agent.name}</div>
                        <div className="node-meta">{agent.status}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Resizable Splitter */}
        <div 
          className="resize-handle"
          onMouseDown={handleResizeStart}
          style={{ cursor: 'col-resize' }}
        />

        {/* Output Panel */}
        <div className="output-panel" style={{ width: `${outputPanelWidth}px` }}>
          <div className="panel-header">
            <h2>{selectedAgent ? 'Agent Detail' : 'All Agents'}</h2>
            <div className="panel-controls">
              {selectedAgent && (
                <button 
                  className="control-btn"
                  onClick={() => setSelectedAgent(null)}
                >
                  Show All
                </button>
              )}
            </div>
          </div>
          
          <div className="output-list">
            {Array.from(agents.values())
              .sort((a, b) => {
                // Sort by depth first, then by start time
                if (a.depth !== b.depth) return (a.depth || 0) - (b.depth || 0);
                return (a.startTime || 0) - (b.startTime || 0);
              })
              .map(agent => (
                <div 
                  key={agent.id}
                  className={`output-card ${agent.status} ${selectedAgent === agent.id ? 'selected' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedAgent(prev => prev === agent.id ? null : agent.id);
                  }}
                >
                  <div className="card-header">
                    <div className="card-title">
                      <span className={`status-dot ${agent.status}`}></span>
                      <span className="agent-name">{agent.name}</span>
                    </div>
                    <div className="card-meta">
                      <span className="status-badge">{agent.status}</span>
                      {agent.startTime && agent.endTime && (
                        <span className="duration">
                          {((agent.endTime - agent.startTime) / 1000).toFixed(1)}s
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {(selectedAgent === agent.id || !selectedAgent) && (
                    <div className="card-content">
                      {agent.output ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {selectedAgent === agent.id ? agent.output : 
                           (agent.output.length > 150 ? agent.output.substring(0, 150) + '...' : agent.output)}
                        </ReactMarkdown>
                      ) : (
                        <span className="no-output">
                          {agent.status === 'running' ? 'Processing...' : 'Waiting for output...'}
                        </span>
                      )}
                    </div>
                  )}
                  
                  {agent.error && (
                    <div className="card-error">
                      <span className="error-icon">⚠</span>
                      <span>{agent.error}</span>
                    </div>
                  )}
                </div>
              ))}
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
          {isRunning ? 'Stop' : 'Execute'}
        </button>
        
        <label className="mock-toggle">
          <input
            type="checkbox"
            checked={useMockAgents}
            onChange={(e) => setUseMockAgents(e.target.checked)}
            disabled={isRunning}
          />
          <span>Mock Mode</span>
        </label>
      </div>
    </div>
  );
};

export default ModernFlowInterface;