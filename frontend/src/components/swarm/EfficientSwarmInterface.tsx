import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import './EfficientSwarmInterface.css';
import NeuralThinkingSimple from './NeuralThinkingSimple';

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

interface Window {
  id: string;
  title: string;
  type: 'agent' | 'console' | 'metrics';
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  minimized: boolean;
  maximized: boolean;
  agentId?: string;
}

const layoutAlgorithms = {
  force: (agents: Map<string, Agent>, containerWidth: number, containerHeight: number): Map<string, NodePosition> => {
    const positions = new Map<string, NodePosition>();
    const nodeArray = Array.from(agents.values());
    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;

    const baseRadius = Math.min(containerWidth, containerHeight) * 0.35;
    const radiusMultiplier = Math.min(1.5, Math.sqrt(nodeArray.length / 10));
    const radius = baseRadius * radiusMultiplier;

    nodeArray.forEach((agent, index) => {
      const angle = (index / nodeArray.length) * 2 * Math.PI;
      const variation = (Math.random() - 0.5) * 30;

      positions.set(agent.id, {
        x: centerX + Math.cos(angle) * (radius + variation),
        y: centerY + Math.sin(angle) * (radius + variation)
      });
    });

    return positions;
  },

  grid: (agents: Map<string, Agent>, containerWidth: number, containerHeight: number): Map<string, NodePosition> => {
    const positions = new Map<string, NodePosition>();
    const nodeArray = Array.from(agents.values());

    const aspectRatio = containerWidth / containerHeight;
    const totalNodes = nodeArray.length;
    const cols = Math.ceil(Math.sqrt(totalNodes * aspectRatio));
    const rows = Math.ceil(totalNodes / cols);

    const cellWidth = containerWidth / (cols + 1);
    const cellHeight = containerHeight / (rows + 1);

    nodeArray.forEach((agent, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      positions.set(agent.id, {
        x: cellWidth * (col + 1),
        y: cellHeight * (row + 1)
      });
    });

    return positions;
  },

  tree: (agents: Map<string, Agent>, containerWidth: number, containerHeight: number): Map<string, NodePosition> => {
    const positions = new Map<string, NodePosition>();
    const levels = new Map<number, Agent[]>();

    agents.forEach(agent => {
      const depth = agent.depth || 0;
      if (!levels.has(depth)) levels.set(depth, []);
      levels.get(depth)!.push(agent);
    });

    const maxDepth = Math.max(0, ...Array.from(levels.keys()));
    const levelHeight = containerHeight / Math.max(3, maxDepth + 2);

    levels.forEach((levelAgents, depth) => {
      const yPos = levelHeight * (depth + 1);
      const spacing = containerWidth / (levelAgents.length + 1);

      levelAgents.forEach((agent, index) => {
        positions.set(agent.id, {
          x: spacing * (index + 1),
          y: yPos
        });
      });
    });

    return positions;
  },

  circular: (agents: Map<string, Agent>, containerWidth: number, containerHeight: number): Map<string, NodePosition> => {
    const positions = new Map<string, NodePosition>();
    const nodeArray = Array.from(agents.values());
    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;

    const nodesPerCircle = 20;
    const circles = Math.ceil(nodeArray.length / nodesPerCircle);

    nodeArray.forEach((agent, index) => {
      const circle = Math.floor(index / nodesPerCircle);
      const indexInCircle = index % nodesPerCircle;
      const nodesInThisCircle = Math.min(nodesPerCircle, nodeArray.length - circle * nodesPerCircle);

      const radius = Math.min(containerWidth, containerHeight) * 0.3 * (1 - circle * 0.2);
      const angle = (indexInCircle / nodesInThisCircle) * 2 * Math.PI - Math.PI / 2;

      positions.set(agent.id, {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius
      });
    });

    return positions;
  }
};

const EfficientSwarmInterface: React.FC = () => {
  // Core state
  const [task, setTask] = useState('');
  const [agents, setAgents] = useState<Map<string, Agent>>(new Map());
  const [isRunning, setIsRunning] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [executionMode, setExecutionMode] = useState<'sequential' | 'parallel' | 'dynamic' | 'neural'>('neural');
  const [useMockAgents, setUseMockAgents] = useState(false);

  // UI state
  const [viewMode, setViewMode] = useState<'neural' | 'timeline' | 'console' | 'graph'>('neural');
  const [layoutMode, setLayoutMode] = useState<'force' | 'grid' | 'tree' | 'circular' | 'manual'>('force');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<Map<string, NodePosition>>(new Map());
  const [isDragging, setIsDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [consoleOutput, setConsoleOutput] = useState<Array<{type: string; content: string; timestamp: number}>>([]);

  // Window management state
  const [windows, setWindows] = useState<Map<string, Window>>(new Map());
  const [activeWindow, setActiveWindow] = useState<string | null>(null);
  const [windowDragging, setWindowDragging] = useState<{id: string; offset: {x: number; y: number}} | null>(null);
  const [windowResizing, setWindowResizing] = useState<{id: string; edge: string; start: {x: number; y: number; width: number; height: number}} | null>(null);
  const [windowDockMode, setWindowDockMode] = useState<'floating' | 'tabbed'>('floating');
  const nextZIndex = useRef(100);

  // Performance metrics
  const [metrics, setMetrics] = useState({
    throughput: 0,
    activeConnections: 0,
    messageRate: 0,
    networkLatency: 0,
    totalTokens: 0,
    totalEvents: 0
  });
  
  // Neural thinking state
  const [neuralThoughts, setNeuralThoughts] = useState<any[]>([]);
  const [consensusItems, setConsensusItems] = useState<any[]>([]);
  const [isNeuralThinking, setIsNeuralThinking] = useState(false);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const agentSequences = useRef<Map<string, number>>(new Map());
  const connectionIdRef = useRef<string | null>(null);
  const neuralContainerRef = useRef<HTMLDivElement>(null);
  const agentOutputRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Apply layout algorithm
  const applyLayout = useCallback(() => {
    if (!neuralContainerRef.current || layoutMode === 'manual') return;

    const container = neuralContainerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const algorithm = layoutAlgorithms[layoutMode as keyof typeof layoutAlgorithms];
    if (algorithm) {
      const newPositions = algorithm(agents, width, height);
      setNodePositions(newPositions);
    }
  }, [agents, layoutMode]);

  // Apply layout when agents or layout mode changes
  useEffect(() => {
    if (layoutMode !== 'manual') {
      applyLayout();
    }
  }, [agents.size, layoutMode, applyLayout]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (layoutMode !== 'manual') {
        applyLayout();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [applyLayout, layoutMode]);

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
    const port = window.location.hostname === 'localhost' ? '8000' : (window.location.port || (protocol === 'wss:' ? '443' : '8000'));
    const wsUrl = `${protocol}//${window.location.hostname}:${port}/api/v1/ws/${execId}?start_from=${startFrom}`;

    addConsoleOutput('system', `Connecting to ${wsUrl}...`);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      addConsoleOutput('success', 'Connected to swarm network');
      ws.send(JSON.stringify({ type: 'ping' }));

      setMetrics(prev => ({ ...prev, activeConnections: prev.activeConnections + 1 }));
    };

    ws.onmessage = (event) => {
      if (connectionIdRef.current !== newConnectionId) return;

      try {
        const frame: Frame = JSON.parse(event.data);
        handleFrame(frame);

        setMetrics(prev => ({
          ...prev,
          messageRate: prev.messageRate + 1,
          throughput: prev.throughput + event.data.length
        }));
      } catch (error) {
        addConsoleOutput('error', `Parse error: ${error}`);
      }
    };

    ws.onerror = (error) => {
      setConnectionStatus('error');
      addConsoleOutput('error', 'Connection error occurred');
    };

    ws.onclose = (event) => {
      setConnectionStatus('disconnected');
      wsRef.current = null;
      setMetrics(prev => ({ ...prev, activeConnections: Math.max(0, prev.activeConnections - 1) }));

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

    // Auto-scroll agent output
    setTimeout(() => {
      const outputEl = agentOutputRefs.current.get(agent_id);
      if (outputEl) {
        outputEl.scrollTop = outputEl.scrollHeight;
      }
    }, 0);

    setMetrics(prev => ({
      ...prev,
      totalTokens: prev.totalTokens + 1,
      networkLatency: Date.now() - (frame.ts * 1000)
    }));
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
              depth: payload?.depth || 0
            });
            return updated;
          });
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
            } as Agent);
            return updated;
          });
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

      case 'session_end':
        setIsRunning(false);
        addConsoleOutput('system', 'Execution complete');
        break;
        
      case 'neural_thought':
        // Handle neural thinking visualization
        if (payload?.thought) {
          const thought = payload.thought;
          addConsoleOutput('neural', `💭 [${thought.agent}] ${thought.type}: ${thought.content} (conf: ${thought.confidence})`);
          
          // Add to neural thoughts collection
          setNeuralThoughts(prev => [...prev, {
            ...thought,
            id: `${thought.agent}-${Date.now()}`,
            timestamp: Date.now()
          }]);
          
          // Update agent activation level if provided
          if (agent_id && payload.activation !== undefined) {
            setAgents(prev => {
              const updated = new Map(prev);
              const agent = updated.get(agent_id);
              if (agent) {
                updated.set(agent_id, {
                  ...agent,
                  output: agent.output + `\n[${thought.type}] ${thought.content}\n`
                });
              }
              return updated;
            });
          }
        }
        break;
        
      case 'consensus_reached':
        // Handle consensus visualization
        if (payload?.items) {
          addConsoleOutput('success', `🎯 Consensus reached on ${payload.items.length} topics!`);
          setConsensusItems(payload.items);
          payload.items.forEach((item: any) => {
            addConsoleOutput('info', `  Topic: ${item.topic} (confidence: ${item.confidence.toFixed(2)})`);
          });
        }
        break;
    }

    setMetrics(prev => ({
      ...prev,
      totalEvents: prev.totalEvents + 1
    }));
  }, [agents, addConsoleOutput]);

  const startExecution = async () => {
    if (!task.trim()) return;

    setIsRunning(true);
    setAgents(new Map());
    setNodePositions(new Map());
    setWindows(new Map()); // Clear windows on new execution
    agentSequences.current.clear();
    setConsoleOutput([]);
    
    // Reset neural thinking state
    setNeuralThoughts([]);
    setConsensusItems([]);
    setIsNeuralThinking(executionMode === 'neural');

    addConsoleOutput('system', '=== STARTING EXECUTION ===');
    addConsoleOutput('info', `Mode: ${executionMode}`);
    addConsoleOutput('info', `Task: ${task}`);

    try {
      const requestBody: any = {
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

  // Window management functions
  const bringToFront = useCallback((windowId: string) => {
    setWindows(prev => {
      const newWindows = new Map(prev);
      const window = newWindows.get(windowId);
      if (window) {
        window.zIndex = nextZIndex.current++;
        newWindows.set(windowId, { ...window });
      }
      return newWindows;
    });
    setActiveWindow(windowId);
  }, []);

  const closeWindow = useCallback((windowId: string) => {
    setWindows(prev => {
      const newWindows = new Map(prev);
      newWindows.delete(windowId);
      return newWindows;
    });
    if (activeWindow === windowId) {
      setActiveWindow(null);
    }
  }, [activeWindow]);

  const minimizeWindow = useCallback((windowId: string) => {
    setWindows(prev => {
      const newWindows = new Map(prev);
      const window = newWindows.get(windowId);
      if (window) {
        window.minimized = !window.minimized;
        newWindows.set(windowId, { ...window });
      }
      return newWindows;
    });
  }, []);

  const maximizeWindow = useCallback((windowId: string) => {
    setWindows(prev => {
      const newWindows = new Map(prev);
      const window = newWindows.get(windowId);
      if (window) {
        if (!window.maximized) {
          window.maximized = true;
          window.position = { x: 0, y: 0 };
          window.size = {
            width: neuralContainerRef.current?.clientWidth || 800,
            height: neuralContainerRef.current?.clientHeight || 600
          };
        } else {
          window.maximized = false;
          window.position = { x: 100, y: 100 };
          window.size = { width: 400, height: 500 };
        }
        newWindows.set(windowId, { ...window });
      }
      return newWindows;
    });
  }, []);

  // Node interaction handlers - MUST come AFTER window functions
  const handleNodeClick = useCallback((agent: Agent) => {
    const windowId = `agent-${agent.id}`;
    const existingWindow = windows.get(windowId);

    if (existingWindow) {
      // Toggle: close if exists
      closeWindow(windowId);
    } else {
      // Smart positioning: stack windows in a grid pattern
      const windowCount = windows.size;
      const cols = 3; // 3 columns max
      const row = Math.floor(windowCount / cols);
      const col = windowCount % cols;
      const xOffset = 50 + (col * 420); // 420px apart horizontally
      const yOffset = 50 + (row * 250); // 250px apart vertically

      setWindows(prev => {
        const newWindows = new Map(prev);
        newWindows.set(windowId, {
          id: windowId,
          title: agent.name,
          type: 'agent',
          position: { x: xOffset, y: yOffset },
          size: { width: 400, height: 500 },
          zIndex: nextZIndex.current++,
          minimized: false,
          maximized: false,
          agentId: agent.id
        });
        return newWindows;
      });

      setActiveWindow(windowId);
    }
  }, [windows, closeWindow]);

  const handleNodeDragStart = useCallback((e: React.MouseEvent, agentId: string) => {
    if (e.shiftKey || e.altKey) {
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left - rect.width / 2,
        y: e.clientY - rect.top - rect.height / 2
      });
      setIsDragging(agentId);
      setLayoutMode('manual');
    }
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !neuralContainerRef.current) return;

    const container = neuralContainerRef.current;
    const rect = container.getBoundingClientRect();

    const x = e.clientX - rect.left - dragOffset.x;
    const y = e.clientY - rect.top - dragOffset.y;

    setNodePositions(prev => {
      const newPositions = new Map(prev);
      newPositions.set(isDragging, { x, y });
      return newPositions;
    });
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(null);
  }, []);

  // Add global mouse event listeners for node dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Window drag handlers
  const handleWindowMouseDown = useCallback((e: React.MouseEvent, windowId: string) => {
    e.preventDefault();
    e.stopPropagation();

    const window = windows.get(windowId);
    if (!window) return;

    setWindowDragging({
      id: windowId,
      offset: {
        x: e.clientX - window.position.x,
        y: e.clientY - window.position.y
      }
    });
    bringToFront(windowId);
  }, [windows, bringToFront]);

  const handleWindowMouseMove = useCallback((e: MouseEvent) => {
    if (windowDragging) {
      const x = e.clientX - windowDragging.offset.x;
      const y = e.clientY - windowDragging.offset.y;

      setWindows(prev => {
        const newWindows = new Map(prev);
        const window = newWindows.get(windowDragging.id);
        if (window) {
          window.position = { x: Math.max(0, x), y: Math.max(0, y) };
          newWindows.set(windowDragging.id, { ...window });
        }
        return newWindows;
      });
    }

    if (windowResizing) {
      const dx = e.clientX - windowResizing.start.x;
      const dy = e.clientY - windowResizing.start.y;

      setWindows(prev => {
        const newWindows = new Map(prev);
        const window = newWindows.get(windowResizing.id);
        if (window) {
          let newWidth = windowResizing.start.width;
          let newHeight = windowResizing.start.height;
          let newX = window.position.x;
          let newY = window.position.y;

          if (windowResizing.edge.includes('right')) {
            newWidth = Math.max(300, windowResizing.start.width + dx);
          }
          if (windowResizing.edge.includes('left')) {
            newWidth = Math.max(300, windowResizing.start.width - dx);
            newX = window.position.x + dx;
          }
          if (windowResizing.edge.includes('bottom')) {
            newHeight = Math.max(200, windowResizing.start.height + dy);
          }
          if (windowResizing.edge.includes('top')) {
            newHeight = Math.max(200, windowResizing.start.height - dy);
            newY = window.position.y + dy;
          }

          window.size = { width: newWidth, height: newHeight };
          window.position = { x: newX, y: newY };
          newWindows.set(windowResizing.id, { ...window });
        }
        return newWindows;
      });
    }
  }, [windowDragging, windowResizing]);

  const handleWindowMouseUp = useCallback(() => {
    setWindowDragging(null);
    setWindowResizing(null);
  }, []);

  // Add window event listeners
  useEffect(() => {
    if (windowDragging || windowResizing) {
      document.addEventListener('mousemove', handleWindowMouseMove);
      document.addEventListener('mouseup', handleWindowMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleWindowMouseMove);
        document.removeEventListener('mouseup', handleWindowMouseUp);
      };
    }
  }, [windowDragging, windowResizing, handleWindowMouseMove, handleWindowMouseUp]);

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  // Calculate metrics
  const activeAgents = Array.from(agents.values()).filter(a => a.status === 'running').length;
  const completedAgents = Array.from(agents.values()).filter(a => a.status === 'completed').length;
  const failedAgents = Array.from(agents.values()).filter(a => a.status === 'failed').length;
  const progress = agents.size > 0 ? Math.round((completedAgents / agents.size) * 100) : 0;

  // Get connections between agents
  const connections = useMemo(() => {
    const conns: Array<{from: string; to: string}> = [];
    agents.forEach(agent => {
      if (agent.parent && agents.has(agent.parent)) {
        conns.push({ from: agent.parent, to: agent.id });
      }
    });
    return conns;
  }, [agents]);

  return (
      <div className="quantum-container">
        {/* Control Bar */}
        <div className="control-bar">
          <div className="control-section">
            <div className="logo-section">
              <div className="quantum-logo">Σ</div>
              <div className="system-title">
                <h1>SWARM.AI</h1>
                <div className="system-status">
                  <span className={`status-light ${connectionStatus}`}></span>
                  <span>{connectionStatus}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="control-section view-modes">
            {['neural', 'timeline', 'console', 'graph'].map(mode => (
                <button
                    key={mode}
                    className={`view-btn ${viewMode === mode ? 'active' : ''}`}
                    onClick={() => setViewMode(mode as any)}
                >
                  {mode.toUpperCase()}
                </button>
            ))}
          </div>

          <div className="control-section metrics">
            <div className="metric">
              <span className="metric-label">AGENTS</span>
              <span className="metric-value">{agents.size}</span>
            </div>
            <div className="metric">
              <span className="metric-label">ACTIVE</span>
              <span className="metric-value active">{activeAgents}</span>
            </div>
            <div className="metric">
              <span className="metric-label">LATENCY</span>
              <span className="metric-value">{metrics.networkLatency}ms</span>
            </div>
          </div>
        </div>

        {/* Main Display Area */}
        <div className="main-display">
          {viewMode === 'neural' && (
              <div className="neural-view">
                {/* Show Neural Thinking Simple for neural mode execution */}
                {executionMode === 'neural' && neuralThoughts.length > 0 ? (
                  <NeuralThinkingSimple
                    thoughts={neuralThoughts}
                    consensusItems={consensusItems}
                    isThinking={isRunning}
                    agents={agents}
                    task={task}
                  />
                ) : executionMode === 'neural' && isRunning ? (
                  <div className="neural-loading">
                    <h2>Initializing Neural Thinking Network...</h2>
                    <p>5 AI agents are preparing to collaborate on your task</p>
                    <div className="loading-spinner"></div>
                  </div>
                ) : (
                  <>
                <div className="layout-controls">
                  <span className="layout-label">Layout:</span>
                  {['force', 'grid', 'tree', 'circular', 'manual'].map(layout => (
                      <button
                          key={layout}
                          className={`layout-btn ${layoutMode === layout ? 'active' : ''}`}
                          onClick={() => setLayoutMode(layout as any)}
                      >
                        {layout.charAt(0).toUpperCase() + layout.slice(1)}
                      </button>
                  ))}
                </div>

                <div className="neural-container" ref={neuralContainerRef}>
                  {/* Connection lines */}
                  <svg className="connections-layer">
                    {connections.map((conn, idx) => {
                      const fromPos = nodePositions.get(conn.from);
                      const toPos = nodePositions.get(conn.to);
                      if (!fromPos || !toPos) return null;

                      return (
                          <line
                              key={idx}
                              x1={fromPos.x}
                              y1={fromPos.y}
                              x2={toPos.x}
                              y2={toPos.y}
                              stroke="rgba(102, 126, 234, 0.3)"
                              strokeWidth="2"
                              strokeDasharray={agents.get(conn.to)?.status === 'running' ? '5,5' : ''}
                          >
                            {agents.get(conn.to)?.status === 'running' && (
                                <animate
                                    attributeName="stroke-dashoffset"
                                    values="10;0"
                                    dur="0.5s"
                                    repeatCount="indefinite"
                                />
                            )}
                          </line>
                      );
                    })}
                  </svg>

                  {/* Agent nodes */}
                  {Array.from(agents.values()).map((agent) => {
                    const pos = nodePositions.get(agent.id) || { x: 100, y: 100 };
                    const isWindowOpen = windows.has(`agent-${agent.id}`);

                    return (
                        <div
                            key={agent.id}
                            className={`neural-node ${agent.status} ${isDragging === agent.id ? 'dragging' : ''} ${isWindowOpen ? 'window-open' : ''}`}
                            style={{
                              transform: `translate(${pos.x - 40}px, ${pos.y - 40}px)`,
                              transition: isDragging === agent.id ? 'none' : 'transform 0.3s ease'
                            }}
                            onClick={() => handleNodeClick(agent)}
                            onMouseDown={(e) => handleNodeDragStart(e, agent.id)}
                            title={`${agent.name} - Click to ${isWindowOpen ? 'close' : 'open'} window, Shift+Drag to move`}
                        >
                          <div className="node-core">
                            <div className="node-name">{agent.name}</div>
                            {agent.status === 'running' && <div className="node-pulse"></div>}
                            {isWindowOpen && <div className="window-indicator">▪</div>}
                          </div>
                        </div>
                    );
                  })}

                  {/* Window Dock Mode Toggle */}
                  <div className="window-mode-toggle">
                    <button
                        className={`mode-btn ${windowDockMode === 'floating' ? 'active' : ''}`}
                        onClick={() => setWindowDockMode('floating')}
                        title="Floating windows"
                    >
                      ⬚
                    </button>
                    <button
                        className={`mode-btn ${windowDockMode === 'tabbed' ? 'active' : ''}`}
                        onClick={() => setWindowDockMode('tabbed')}
                        title="Tabbed dock"
                    >
                      ☰
                    </button>
                  </div>

                  {/* Tabbed Dock Mode */}
                  {windowDockMode === 'tabbed' && windows.size > 0 && (
                      <div className="tabbed-dock">
                        <div className="dock-tabs">
                          {Array.from(windows.entries()).map(([windowId, window]) => {
                            const agent = window.agentId ? agents.get(window.agentId) : null;
                            if (!agent) return null;

                            return (
                                <div
                                    key={windowId}
                                    className={`dock-tab ${activeWindow === windowId ? 'active' : ''} ${agent.status}`}
                                    onClick={() => setActiveWindow(windowId)}
                                >
                                  <span className="tab-title">{window.title}</span>
                                  <button
                                      className="tab-close"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        closeWindow(windowId);
                                      }}
                                  >
                                    ×
                                  </button>
                                </div>
                            );
                          })}
                        </div>

                        {activeWindow && windows.get(activeWindow) && (
                            <div className="dock-content">
                              {(() => {
                                const window = windows.get(activeWindow);
                                const agent = window?.agentId ? agents.get(window.agentId) : null;
                                if (!agent) return null;

                                return (
                                    <>
                                      <div className="dock-status">
                                        <span className={agent.status}>{agent.status}</span>
                                        {agent.startTime && (
                                            <span className="runtime">
                                  Runtime: {((Date.now() - agent.startTime) / 1000).toFixed(1)}s
                                </span>
                                        )}
                                      </div>
                                      <div className="dock-output">
                                        <pre>{agent.output || '⏳ Waiting for output...'}</pre>
                                      </div>
                                      {agent.error && (
                                          <div className="dock-error">Error: {agent.error}</div>
                                      )}
                                    </>
                                );
                              })()}
                            </div>
                        )}
                      </div>
                  )}

                  {/* Floating Windows Mode */}
                  {windowDockMode === 'floating' && Array.from(windows.entries()).map(([windowId, window]) => {
                    const agent = window.agentId ? agents.get(window.agentId) : null;

                    if (!agent) return null;

                    return (
                        <div
                            key={windowId}
                            className={`floating-window ${window.minimized ? 'minimized' : ''} ${window.maximized ? 'maximized' : ''} ${activeWindow === windowId ? 'active' : ''}`}
                            style={{
                              left: `${window.position.x}px`,
                              top: `${window.position.y}px`,
                              width: `${window.size.width}px`,
                              height: window.minimized ? 'auto' : `${window.size.height}px`,
                              zIndex: window.zIndex
                            }}
                            onMouseDown={() => bringToFront(windowId)}
                        >
                          <div
                              className="window-titlebar"
                              onMouseDown={(e) => handleWindowMouseDown(e, windowId)}
                          >
                            <span className="window-title">{window.title}</span>
                            <div className="window-controls">
                              <button
                                  className="window-btn minimize"
                                  onClick={() => minimizeWindow(windowId)}
                              >
                                _
                              </button>
                              <button
                                  className="window-btn maximize"
                                  onClick={() => maximizeWindow(windowId)}
                              >
                                □
                              </button>
                              <button
                                  className="window-btn close"
                                  onClick={() => closeWindow(windowId)}
                              >
                                ×
                              </button>
                            </div>
                          </div>

                          {!window.minimized && (
                              <div className="window-content">
                                <div className="window-status">
                                  Status: <span className={agent.status}>
                            {agent.status}
                          </span>
                                  {agent.startTime && (
                                      <span className="window-runtime">
                              Runtime: {((Date.now() - agent.startTime) / 1000).toFixed(1)}s
                            </span>
                                  )}
                                </div>
                                <div className="window-output-label">Output:</div>
                                <div
                                    className="window-output"
                                    ref={(el) => {
                                      if (el && agent) {
                                        agentOutputRefs.current.set(agent.id, el);
                                      }
                                    }}
                                >
                                  <pre>{agent.output || '⏳ Waiting for output...'}</pre>
                                </div>
                                {agent.error && (
                                    <div className="window-error">
                                      Error: {agent.error}
                                    </div>
                                )}
                              </div>
                          )}

                          {/* Resize handles */}
                          {!window.minimized && !window.maximized && (
                              <>
                                <div
                                    className="resize-handle resize-e"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setWindowResizing({
                                        id: windowId,
                                        edge: 'right',
                                        start: { x: e.clientX, y: e.clientY, width: window.size.width, height: window.size.height }
                                      });
                                    }}
                                />
                                <div
                                    className="resize-handle resize-s"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setWindowResizing({
                                        id: windowId,
                                        edge: 'bottom',
                                        start: { x: e.clientX, y: e.clientY, width: window.size.width, height: window.size.height }
                                      });
                                    }}
                                />
                                <div
                                    className="resize-handle resize-se"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setWindowResizing({
                                        id: windowId,
                                        edge: 'bottom-right',
                                        start: { x: e.clientX, y: e.clientY, width: window.size.width, height: window.size.height }
                                      });
                                    }}
                                />
                              </>
                          )}
                        </div>
                    );
                  })}

                  {/* Taskbar for Minimized Windows */}
                  {windowDockMode === 'floating' && Array.from(windows.entries()).filter(([_, w]) => w.minimized).length > 0 && (
                      <div className="minimized-taskbar">
                        {Array.from(windows.entries())
                            .filter(([_, window]) => window.minimized)
                            .map(([windowId, window]) => (
                                <button
                                    key={windowId}
                                    className="taskbar-item"
                                    onClick={() => minimizeWindow(windowId)}
                                >
                                  {window.title}
                                </button>
                            ))}
                      </div>
                  )}
                </div>

                {selectedAgent && agents.get(selectedAgent) && (
                    <div className="agent-detail-panel">
                      <div className="panel-header">
                        <h3>{agents.get(selectedAgent)!.name}</h3>
                        <button onClick={() => setSelectedAgent(null)}>×</button>
                      </div>
                      <div className="panel-content">
                        <div className="detail-status">
                          Status: <span className={agents.get(selectedAgent)!.status}>
                      {agents.get(selectedAgent)!.status}
                    </span>
                        </div>
                        <div className="detail-output">
                          <pre>{agents.get(selectedAgent)!.output || 'Awaiting output...'}</pre>
                        </div>
                      </div>
                    </div>
                )}
                  </>
                )}
              </div>
          )}

          {viewMode === 'timeline' && (
              <div className="timeline-view">
                {Array.from(agents.values()).map(agent => (
                    <div key={agent.id} className={`timeline-track ${agent.status}`}>
                      <div className="track-header">
                        <span className="track-name">{agent.name}</span>
                        <span className="track-duration">
                    {agent.startTime && agent.endTime &&
                        `${((agent.endTime - agent.startTime) / 1000).toFixed(2)}s`
                    }
                  </span>
                      </div>
                      <div className="track-bar">
                        <div
                            className="track-progress"
                            style={{
                              width: agent.status === 'completed' ? '100%' :
                                  agent.status === 'running' ? '60%' : '10%'
                            }}
                        />
                      </div>
                    </div>
                ))}
              </div>
          )}

          {viewMode === 'console' && (
              <div className="console-view">
                <div className="terminal-output">
                  {consoleOutput.map((line, i) => (
                      <div key={i} className={`terminal-line ${line.type}`}>
                  <span className="terminal-timestamp">
                    [{new Date(line.timestamp).toLocaleTimeString()}]
                  </span>
                        <span className="terminal-content">{line.content}</span>
                      </div>
                  ))}
                </div>
              </div>
          )}

          {viewMode === 'graph' && (
              <div className="graph-view">
                <div className="perf-card">
                  <h4>Agent Distribution</h4>
                  <div className="distribution">
                    <div className="dist-bar running" style={{width: `${(activeAgents / Math.max(agents.size, 1)) * 100}%`}}>
                      {activeAgents} Running
                    </div>
                    <div className="dist-bar completed" style={{width: `${(completedAgents / Math.max(agents.size, 1)) * 100}%`}}>
                      {completedAgents} Done
                    </div>
                    {failedAgents > 0 && (
                        <div className="dist-bar failed" style={{width: `${(failedAgents / Math.max(agents.size, 1)) * 100}%`}}>
                          {failedAgents} Failed
                        </div>
                    )}
                  </div>
                  <div className="graph-value">{progress}% Complete</div>
                </div>
              </div>
          )}
        </div>

        {/* Command Center */}
        <div className="command-center">
          <div className="command-section-label">COMMAND CENTER</div>
          <div className="command-input-section">
            <select
                className="mode-selector"
                value={executionMode}
                onChange={(e) => setExecutionMode(e.target.value as any)}
                disabled={isRunning}
            >
              <option value="neural">Neural Thinking</option>
              <option value="dynamic">Dynamic AI</option>
              <option value="sequential">Sequential</option>
              <option value="parallel">Parallel</option>
            </select>

            <input
                className="task-input"
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="Enter your task... (e.g., 'Build a todo app' or 'Analyze data')"
                disabled={isRunning}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isRunning && task.trim()) {
                    startExecution();
                  }
                }}
            />

            <button
                className={`execute-btn ${isRunning ? 'stop' : 'start'}`}
                onClick={isRunning ? stopExecution : startExecution}
                disabled={!isRunning && !task.trim()}
            >
              {isRunning ? '■ STOP' : '▶ EXECUTE'}
            </button>
          </div>

          <div className="command-options">
            <label className="option-toggle">
              <input
                  type="checkbox"
                  checked={useMockAgents}
                  onChange={(e) => setUseMockAgents(e.target.checked)}
                  disabled={isRunning}
              />
              <span className="toggle-label">Use Mock Agents</span>
            </label>

            {task && !isRunning && (
                <div className="task-preview">
                  <span className="preview-label">Ready:</span>
                  <span className="preview-text">"{task}"</span>
                </div>
            )}
          </div>
        </div>

        {executionId && (
            <div className="execution-badge">
              <span className="badge-label">EXEC</span>
              <span className="badge-value">{executionId.slice(0, 8)}</span>
            </div>
        )}
      </div>
  );
};

export default EfficientSwarmInterface;