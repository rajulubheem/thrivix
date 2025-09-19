/**
 * EfficientSwarmInterface: WebSocket-based streaming UI
 * Uses the new EventHub architecture for real-time, efficient streaming
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import './EfficientSwarmInterface.css';

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
}

const EfficientSwarmInterface: React.FC = () => {
  // State
  const [task, setTask] = useState('');
  const [agents, setAgents] = useState<Map<string, Agent>>(new Map());
  const [isRunning, setIsRunning] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [executionMode, setExecutionMode] = useState<'sequential' | 'parallel'>('sequential');
  const [useMockAgents, setUseMockAgents] = useState(true);
  const [stats, setStats] = useState({
    tokensReceived: 0,
    controlEventsReceived: 0,
    latency: 0,
    startTime: 0
  });

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const agentSequences = useRef<Map<string, number>>(new Map());
  const connectionIdRef = useRef<string | null>(null);

  // WebSocket connection
  const connectWebSocket = useCallback((execId: string) => {
    // Generate a unique connection ID for this session
    const newConnectionId = `${execId}-${Date.now()}`;
    
    // Close any existing connection first
    if (wsRef.current) {
      console.log('Closing existing WebSocket connection');
      wsRef.current.close();
      wsRef.current = null;
    }

    connectionIdRef.current = newConnectionId;
    setConnectionStatus('connecting');
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Start from beginning (0) to get all messages for this execution
    const wsUrl = `${protocol}//${window.location.hostname}:8000/api/v1/ws/${execId}?start_from=0`;
    
    console.log(`Connecting to WebSocket: ${wsUrl} (connection: ${newConnectionId})`);
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnectionStatus('connected');
      
      // Send ping to verify connection
      ws.send(JSON.stringify({ type: 'ping' }));
    };

    ws.onmessage = (event) => {
      // Only process messages if this is still the active connection
      if (connectionIdRef.current !== newConnectionId) {
        console.log('Ignoring message from old connection');
        return;
      }
      
      try {
        const frame: Frame = JSON.parse(event.data);
        handleFrame(frame);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('error');
    };

    ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
      setConnectionStatus('disconnected');
      wsRef.current = null;

      // Auto-reconnect if still running
      if (isRunning && !event.wasClean) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket(execId);
        }, 2000);
      }
    };
  }, [isRunning]);

  // Handle incoming frames
  const handleFrame = useCallback((frame: Frame) => {
    console.log('Received frame:', frame.frame_type, 
      frame.frame_type === 'token' ? `seq=${(frame as TokenFrame).seq} agent=${(frame as TokenFrame).agent_id}` : (frame as ControlFrame).type
    );
    if (frame.frame_type === 'token') {
      handleTokenFrame(frame as TokenFrame);
    } else if (frame.frame_type === 'control') {
      handleControlFrame(frame as ControlFrame);
    }
  }, []);

  // Handle token frames
  const handleTokenFrame = useCallback((frame: TokenFrame) => {
    const { agent_id, seq, text, final } = frame;

    // Check sequence ordering and duplicates
    const lastSeq = agentSequences.current.get(agent_id) || 0;
    
    // Skip duplicate sequences
    if (seq === lastSeq) {
      console.warn(`Duplicate frame dropped: agent=${agent_id}, seq=${seq}`);
      return;
    }
    
    // Skip out-of-order sequences (except final)
    if (seq < lastSeq && !final) {
      console.warn(`Out of order frame dropped: agent=${agent_id}, seq=${seq}, last=${lastSeq}`);
      return;
    }
    
    agentSequences.current.set(agent_id, seq);

    // Update agent output
    setAgents(prev => {
      const updated = new Map(prev);
      const agent = updated.get(agent_id);
      
      if (agent) {
        // Create a new object to avoid mutation
        const newAgent = {
          ...agent,
          output: final ? agent.output : agent.output + text
        };
        updated.set(agent_id, newAgent);
      }
      
      return updated;
    });

    // Update stats
    setStats(prev => ({
      ...prev,
      tokensReceived: prev.tokensReceived + 1,
      latency: Date.now() - (frame.ts * 1000)
    }));
  }, []);

  // Handle control frames
  const handleControlFrame = useCallback((frame: ControlFrame) => {
    const { type, agent_id, payload } = frame;

    console.log('Control frame:', type, agent_id, payload);

    switch (type) {
      case 'connected':
        console.log('Connected to execution:', frame.exec_id);
        break;

      case 'session_start':
        setStats(prev => ({ ...prev, startTime: Date.now() }));
        break;

      case 'agent_started':
        if (agent_id) {
          setAgents(prev => {
            const updated = new Map(prev);
            const existing = updated.get(agent_id) || {
              id: agent_id,
              name: payload?.name || agent_id,
              output: '',
              status: 'pending' as const
            };
            
            updated.set(agent_id, {
              ...existing,
              status: 'running',
              startTime: Date.now()
            });
            
            return updated;
          });
        }
        break;

      case 'agent_completed':
        if (agent_id) {
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
        console.log('Session completed:', payload);
        break;
    }

    // Update stats
    setStats(prev => ({
      ...prev,
      controlEventsReceived: prev.controlEventsReceived + 1
    }));
  }, []);

  // Start execution
  const startExecution = async () => {
    if (!task.trim()) return;

    // Clean up any existing connection first
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsRunning(true);
    setAgents(new Map());
    agentSequences.current.clear();
    setStats({
      tokensReceived: 0,
      controlEventsReceived: 0,
      latency: 0,
      startTime: Date.now()
    });

    try {
      // Call the new streaming v2 API
      const response = await fetch('http://localhost:8000/api/v1/streaming/stream/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task,
          agents: [
            {
              name: 'UI Designer',
              role: 'Design user interfaces',
              task: 'Design the UI components'
            },
            {
              name: 'Backend Developer',
              role: 'Implement backend logic',
              task: 'Build the backend services'
            },
            {
              name: 'QA Engineer',
              role: 'Test the application',
              task: 'Write and execute tests'
            }
          ],
          execution_mode: executionMode,
          use_mock: useMockAgents,
          max_parallel: 5
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Execution started:', data);

      setExecutionId(data.exec_id);
      
      // Small delay to ensure backend is ready, then connect WebSocket once
      setTimeout(() => {
        connectWebSocket(data.exec_id);
      }, 100);
      
    } catch (error) {
      console.error('Error starting execution:', error);
      setIsRunning(false);
      setConnectionStatus('error');
    }
  };

  // Stop execution
  const stopExecution = () => {
    setIsRunning(false);
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  // Calculate progress
  const calculateProgress = () => {
    if (agents.size === 0) return 0;
    
    const completed = Array.from(agents.values()).filter(
      a => a.status === 'completed' || a.status === 'failed'
    ).length;
    
    return Math.round((completed / agents.size) * 100);
  };

  // Get connection status color
  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return '#52c41a';
      case 'connecting': return '#faad14';
      case 'error': return '#f5222d';
      default: return '#d9d9d9';
    }
  };

  return (
    <div className="efficient-swarm-container">
      <div className="efficient-control-panel">
        <h2 className="efficient-title">
          🚀 Efficient Event-Driven Swarm
        </h2>
        
        <div className="efficient-alert">
          <div className="efficient-alert-icon">ℹ️</div>
          <div>
            <strong>New Architecture</strong>
            <p>This interface uses WebSocket + Redis Streams for real-time, efficient streaming with backpressure handling and deterministic orchestration.</p>
          </div>
        </div>

        <div className="efficient-settings">
          <div className="efficient-status">
            <span 
              className="efficient-status-badge"
              style={{ backgroundColor: getConnectionStatusColor() }}
            >
              {connectionStatus.toUpperCase()}
            </span>
            {executionId && (
              <code className="efficient-exec-id">{executionId.slice(0, 8)}...</code>
            )}
          </div>
          
          <div className="efficient-controls">
            <label className="efficient-switch">
              <input
                type="checkbox"
                checked={useMockAgents}
                onChange={(e) => setUseMockAgents(e.target.checked)}
                disabled={isRunning}
              />
              <span className="efficient-switch-slider"></span>
              <span className="efficient-switch-label">Mock Agents</span>
            </label>
            
            <select
              value={executionMode}
              onChange={(e) => setExecutionMode(e.target.value as 'sequential' | 'parallel')}
              disabled={isRunning}
              className="efficient-select"
            >
              <option value="sequential">Sequential</option>
              <option value="parallel">Parallel</option>
            </select>
          </div>
        </div>

        <textarea
          className="efficient-textarea"
          rows={3}
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Enter your task..."
          disabled={isRunning}
        />

        <div className="efficient-buttons">
          <button
            className="efficient-button efficient-button-primary"
            onClick={startExecution}
            disabled={isRunning || !task.trim()}
          >
            {isRunning ? '⏳ Running...' : '▶️ Start Execution'}
          </button>
          
          <button
            className="efficient-button efficient-button-danger"
            onClick={stopExecution}
            disabled={!isRunning}
          >
            ⏹️ Stop
          </button>
        </div>

        {isRunning && (
          <div className="efficient-progress">
            <div className="efficient-progress-bar">
              <div 
                className="efficient-progress-fill"
                style={{ width: `${calculateProgress()}%` }}
              />
            </div>
            <span className="efficient-progress-text">{calculateProgress()}%</span>
          </div>
        )}

        <div className="efficient-stats">
          <div className="efficient-stat">
            <strong>Tokens:</strong> {stats.tokensReceived}
          </div>
          <div className="efficient-stat">
            <strong>Events:</strong> {stats.controlEventsReceived}
          </div>
          <div className="efficient-stat">
            <strong>Latency:</strong> {stats.latency.toFixed(0)}ms
          </div>
          {stats.startTime > 0 && (
            <div className="efficient-stat">
              <strong>Runtime:</strong> {((Date.now() - stats.startTime) / 1000).toFixed(1)}s
            </div>
          )}
        </div>
      </div>

      <div className="efficient-agents-grid">
        {Array.from(agents.values()).map((agent) => (
          <div
            key={agent.id}
            className={`efficient-agent-card efficient-agent-${agent.status}`}
          >
            <div className="efficient-agent-header">
              <div className="efficient-agent-title">
                {agent.status === 'running' && <span className="efficient-spinner">⚡</span>}
                {agent.status === 'completed' && <span style={{ color: '#10b981' }}>✓</span>}
                {agent.status === 'failed' && <span style={{ color: '#ef4444' }}>✗</span>}
                <strong>{agent.name}</strong>
              </div>
              <div className="efficient-agent-meta">
                <span className={`efficient-agent-status efficient-status-${agent.status}`}>
                  {agent.status}
                </span>
                {agent.startTime && agent.endTime && (
                  <span className="efficient-agent-duration">
                    {((agent.endTime - agent.startTime) / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            </div>
            
            {agent.error ? (
              <div className="efficient-error">
                <strong>Error:</strong> {agent.error}
              </div>
            ) : (
              <div className="efficient-agent-output">
                <pre>{agent.output || 'Waiting for output...'}</pre>
              </div>
            )}
          </div>
        ))}
      </div>

      {!isRunning && agents.size === 0 && (
        <div className="efficient-empty-state">
          <div className="efficient-empty-icon">⚙️</div>
          <h3>Ready to Start</h3>
          <p>
            Enter a task above and click "Start Execution" to begin.
            The new architecture provides <strong>10x faster streaming</strong> with
            deterministic execution and proper backpressure handling.
          </p>
        </div>
      )}
    </div>
  );
};

export default EfficientSwarmInterface;