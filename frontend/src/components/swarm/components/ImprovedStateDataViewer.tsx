import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronDown, ChevronRight, Copy, Check, Eye, EyeOff,
  Activity, Database, GitBranch, Clock, AlertCircle,
  ArrowRight, Package, Zap, Info, FileText, Network,
  Terminal, MessageSquare, Bot, Cpu, Play, CheckCircle, XCircle
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { WS_BASE_URL } from '../../../config/api';
import './ImprovedStateDataViewer.css';

interface Frame {
  exec_id: string;
  type: string;
  agent_id?: string;
  payload?: any;
  ts: number;
  frame_type: 'token' | 'control';
}

interface TokenFrame extends Frame {
  frame_type: 'token';
  seq: number;
  text: string;
  final: boolean;
}

interface StateData {
  stateId: string;
  stateName: string;
  stateType: string;
  description?: string;
  agentRole?: string;
  timestamp: number;
  // Raw data from backend
  inputPayload?: any;
  outputText: string;
  outputResult?: any;
  // Parsed/extracted data
  tools?: string[];
  transitions?: Record<string, string>;
  nextEvent?: string;
  duration?: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: any;
  // Token streaming data
  tokens: string[];
  streamingOutput: string;
}

interface WorkflowData {
  task: string;
  execId: string;
  states: Map<string, StateData>;
  stateOrder: string[];
  globalResults?: any;
  contextFlow: Map<string, any>;
  edges: Array<{ source: string; target: string; event: string }>;
}

interface ImprovedStateDataViewerProps {
  execId: string;
  isDarkMode?: boolean;
  onClose?: () => void;
  nodes?: any[];
  edges?: any[];
}

const ImprovedStateDataViewer: React.FC<ImprovedStateDataViewerProps> = ({
  execId,
  isDarkMode = false,
  onClose,
  nodes = [],
  edges = []
}) => {
  const [workflowData, setWorkflowData] = useState<WorkflowData>({
    task: '',
    execId,
    states: new Map(),
    stateOrder: [],
    contextFlow: new Map(),
    edges: []
  });
  const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'timeline' | 'ai-io' | 'context' | 'raw'>('ai-io');
  const [filterText, setFilterText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const tokenBuffers = useRef<Map<string, string[]>>(new Map());

  // Connect to WebSocket
  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [execId]);

  const connectWebSocket = () => {
    const wsUrl = `${WS_BASE_URL}/api/v1/ws/${execId}?start_from=0`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data);
        handleFrame(frame);
      } catch (error) {
        console.error('Failed to parse frame:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
    };
  };

  const handleFrame = (frame: Frame) => {
    console.log('Received frame:', frame); // Debug log

    if (frame.frame_type === 'token') {
      handleTokenFrame(frame as TokenFrame);
    } else if (frame.frame_type === 'control') {
      handleControlFrame(frame);
    }
  };

  const handleTokenFrame = (frame: TokenFrame) => {
    const { agent_id, text, seq, final } = frame;

    if (!agent_id) return;

    // Buffer tokens for this agent
    if (!tokenBuffers.current.has(agent_id)) {
      tokenBuffers.current.set(agent_id, []);
    }

    const buffer = tokenBuffers.current.get(agent_id)!;
    buffer.push(text);

    setWorkflowData(prev => {
      const newData = { ...prev };
      const states = new Map(newData.states);

      let state = states.get(agent_id);
      if (!state) {
        // Create new state if doesn't exist
        state = {
          stateId: agent_id,
          stateName: agent_id,
          stateType: 'unknown',
          timestamp: frame.ts || Date.now() / 1000,
          outputText: '',
          tokens: [],
          streamingOutput: '',
          status: 'running'
        };
        newData.stateOrder.push(agent_id);
      }

      // Update streaming output
      state.streamingOutput = buffer.join('');
      state.tokens = [...buffer];
      state.status = final ? 'completed' : 'running';

      states.set(agent_id, state);
      newData.states = states;

      return newData;
    });
  };

  const handleControlFrame = (frame: Frame) => {
    const { type, agent_id, payload, ts } = frame;

    console.log('Control frame:', type, agent_id, payload); // Debug log

    switch (type) {
      case 'state_entered':
        if (agent_id) {
          setWorkflowData(prev => {
            const newData = { ...prev };
            const states = new Map(newData.states);

            const state: StateData = {
              stateId: agent_id,
              stateName: payload?.state?.name || agent_id,
              stateType: payload?.state?.type || 'unknown',
              description: payload?.state?.description,
              agentRole: payload?.state?.agent_role,
              timestamp: ts || Date.now() / 1000,
              inputPayload: payload,
              outputText: '',
              tools: payload?.state?.tools || [],
              transitions: payload?.state?.transitions || {},
              tokens: [],
              streamingOutput: '',
              status: 'running'
            };

            states.set(agent_id, state);
            if (!newData.stateOrder.includes(agent_id)) {
              newData.stateOrder.push(agent_id);
            }
            newData.states = states;

            return newData;
          });

          // Clear token buffer for this state
          tokenBuffers.current.set(agent_id, []);
        }
        break;

      case 'state_exited':
        if (agent_id) {
          setWorkflowData(prev => {
            const newData = { ...prev };
            const states = new Map(newData.states);
            const state = states.get(agent_id);

            if (state) {
              // The result contains the actual AI output
              state.outputResult = payload?.result;
              state.outputText = payload?.result || state.streamingOutput || '';
              state.nextEvent = payload?.next_event;
              state.status = 'completed';

              // Calculate duration
              if (state.timestamp) {
                state.duration = ((ts || Date.now() / 1000) - state.timestamp) * 1000;
              }

              // Store in context flow
              newData.contextFlow.set(agent_id, {
                input: state.inputPayload,
                output: payload?.result,
                nextEvent: payload?.next_event
              });

              states.set(agent_id, state);
            }
            newData.states = states;

            return newData;
          });
        }
        break;

      case 'workflow_completed':
        setWorkflowData(prev => ({
          ...prev,
          globalResults: payload?.results || {},
          task: payload?.task || prev.task
        }));
        break;

      case 'graph_updated':
        // Update edges if graph structure changes
        if (payload?.edges) {
          setWorkflowData(prev => ({
            ...prev,
            edges: payload.edges
          }));
        }
        break;
    }
  };

  const toggleStateExpansion = (stateId: string) => {
    setExpandedStates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stateId)) {
        newSet.delete(stateId);
      } else {
        newSet.add(stateId);
      }
      return newSet;
    });
  };

  const copyToClipboard = async (data: any, id: string) => {
    try {
      await navigator.clipboard.writeText(
        typeof data === 'string' ? data : JSON.stringify(data, null, 2)
      );
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // Process output text to enhance markdown formatting
  const processOutputText = (text: string): string => {
    if (!text) return '';

    // Extract NEXT_EVENT if present and remove it from main text
    const nextEventMatch = text.match(/NEXT_EVENT:\s*(\w+)/);
    let processedText = text;

    if (nextEventMatch) {
      processedText = text.replace(/NEXT_EVENT:\s*\w+/, '').trim();
    }

    return processedText;
  };

  // Extract next event from output
  const extractNextEvent = (text: string): string | null => {
    const match = text.match(/NEXT_EVENT:\s*(\w+)/);
    return match ? match[1] : null;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Play size={14} className="status-icon running" />;
      case 'completed':
        return <CheckCircle size={14} className="status-icon completed" />;
      case 'failed':
        return <XCircle size={14} className="status-icon failed" />;
      default:
        return <Clock size={14} className="status-icon pending" />;
    }
  };

  const renderAIInputOutput = (state: StateData) => {
    const isExpanded = expandedStates.has(state.stateId);

    return (
      <div key={state.stateId} className={`ai-io-block ${state.status}`}>
        <div
          className="ai-io-header"
          onClick={() => toggleStateExpansion(state.stateId)}
        >
          <div className="ai-io-header-left">
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {getStatusIcon(state.status)}
            <span className="state-name">{state.stateName}</span>
            <span className="state-type">({state.stateType})</span>
            {state.agentRole && (
              <span className="agent-role">
                <Bot size={12} />
                {state.agentRole}
              </span>
            )}
          </div>
          <div className="ai-io-header-right">
            <span className="timestamp">{formatTimestamp(state.timestamp)}</span>
            {state.duration && <span className="duration">{formatDuration(state.duration)}</span>}
            <button
              className="copy-btn"
              onClick={(e) => {
                e.stopPropagation();
                copyToClipboard({
                  input: state.inputPayload,
                  output: state.outputText || state.outputResult
                }, state.stateId);
              }}
            >
              {copiedId === state.stateId ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="ai-io-content">
            {/* Description */}
            {state.description && (
              <div className="description-box">
                <Info size={14} />
                <span>{state.description}</span>
              </div>
            )}

            {/* AI Input Section */}
            <div className="io-section">
              <div className="io-header">
                <MessageSquare size={14} />
                <span>AI Agent Input</span>
              </div>
              <div className="io-content">
                {state.inputPayload ? (
                  <div className="input-data">
                    {state.inputPayload.state && (
                      <div className="input-item">
                        <span className="label">Task:</span>
                        <span className="value">{state.inputPayload.state.description || 'No description'}</span>
                      </div>
                    )}
                    {state.tools && state.tools.length > 0 && (
                      <div className="input-item">
                        <span className="label">Available Tools:</span>
                        <div className="tools-list">
                          {state.tools.map(tool => (
                            <span key={tool} className="tool-chip">{tool}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <details className="raw-details">
                      <summary>View Raw Input</summary>
                      <pre className="raw-json">{JSON.stringify(state.inputPayload, null, 2)}</pre>
                    </details>
                  </div>
                ) : (
                  <span className="no-data">No input captured</span>
                )}
              </div>
            </div>

            {/* AI Output Section */}
            <div className="io-section">
              <div className="io-header">
                <Terminal size={14} />
                <span>AI Agent Output</span>
                {state.status === 'running' && state.tokens.length > 0 && (
                  <span className="streaming-badge">Streaming...</span>
                )}
              </div>
              <div className="io-content">
                {state.outputText || state.streamingOutput ? (
                  <div className="output-data">
                    <div className="output-text markdown-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          // Custom renderers for better styling
                          h1: ({ children }) => <h1 className="md-h1">{children}</h1>,
                          h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
                          h3: ({ children }) => <h3 className="md-h3">{children}</h3>,
                          h4: ({ children }) => <h4 className="md-h4">{children}</h4>,
                          p: ({ children }) => <p className="md-paragraph">{children}</p>,
                          ul: ({ children }) => <ul className="md-list">{children}</ul>,
                          ol: ({ children }) => <ol className="md-list md-ordered">{children}</ol>,
                          li: ({ children }) => <li className="md-list-item">{children}</li>,
                          code: ({ children, ...props }) => {
                            const inline = (props as any).inline;
                            return inline ? (
                              <code className="md-code-inline">{children}</code>
                            ) : (
                              <code className="md-code-block">{children}</code>
                            );
                          },
                          pre: ({ children }) => <pre className="md-pre">{children}</pre>,
                          blockquote: ({ children }) => (
                            <blockquote className="md-blockquote">{children}</blockquote>
                          ),
                          strong: ({ children }) => <strong className="md-bold">{children}</strong>,
                          em: ({ children }) => <em className="md-italic">{children}</em>,
                          hr: () => <hr className="md-divider" />,
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              className="md-link"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {children}
                            </a>
                          ),
                          table: ({ children }) => (
                            <div className="md-table-wrapper">
                              <table className="md-table">{children}</table>
                            </div>
                          ),
                          thead: ({ children }) => <thead className="md-thead">{children}</thead>,
                          tbody: ({ children }) => <tbody className="md-tbody">{children}</tbody>,
                          tr: ({ children }) => <tr className="md-tr">{children}</tr>,
                          th: ({ children }) => <th className="md-th">{children}</th>,
                          td: ({ children }) => <td className="md-td">{children}</td>,
                        }}
                      >
                        {processOutputText(state.outputText || state.streamingOutput)}
                      </ReactMarkdown>
                    </div>
                    {showTokens && state.tokens.length > 0 && (
                      <details className="tokens-details">
                        <summary>Token Stream ({state.tokens.length} tokens)</summary>
                        <div className="tokens-list">
                          {state.tokens.map((token, idx) => (
                            <span key={idx} className="token">{token}</span>
                          ))}
                        </div>
                      </details>
                    )}
                    {(state.nextEvent || extractNextEvent(state.outputText || state.streamingOutput || '')) && (
                      <div className={`next-event ${state.nextEvent === 'failure' ? 'failure' : state.nextEvent === 'success' ? 'success' : ''}`}>
                        <ArrowRight size={14} />
                        <span>Next Event: <strong>{state.nextEvent || extractNextEvent(state.outputText || state.streamingOutput || '')}</strong></span>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="no-data">
                    {state.status === 'running' ? 'Waiting for output...' : 'No output captured'}
                  </span>
                )}
              </div>
            </div>

            {/* Transitions */}
            {state.transitions && Object.keys(state.transitions).length > 0 && (
              <div className="transitions-section">
                <div className="transitions-header">
                  <GitBranch size={14} />
                  <span>Possible Transitions</span>
                </div>
                <div className="transitions-list">
                  {Object.entries(state.transitions).map(([event, target]) => (
                    <div
                      key={event}
                      className={`transition ${event === state.nextEvent ? 'active' : ''}`}
                    >
                      <span className="event">{event}</span>
                      <ArrowRight size={12} />
                      <span className="target">{target}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const filteredStates = useMemo(() => {
    if (!filterText) return workflowData.stateOrder;

    const lowerFilter = filterText.toLowerCase();
    return workflowData.stateOrder.filter(stateId => {
      const state = workflowData.states.get(stateId);
      if (!state) return false;

      return (
        state.stateName.toLowerCase().includes(lowerFilter) ||
        state.stateId.toLowerCase().includes(lowerFilter) ||
        state.outputText.toLowerCase().includes(lowerFilter)
      );
    });
  }, [workflowData.stateOrder, workflowData.states, filterText]);

  return (
    <div className={`improved-state-viewer ${isDarkMode ? 'dark' : 'light'}`}>
      <div className="viewer-header">
        <div className="header-left">
          <h3>Workflow Execution Viewer</h3>
          <span className="exec-id">ID: {execId}</span>
          {workflowData.task && <span className="task-name">Task: {workflowData.task}</span>}
        </div>
        <div className="header-right">
          <div className="tab-buttons">
            <button
              className={`tab-btn ${activeTab === 'ai-io' ? 'active' : ''}`}
              onClick={() => setActiveTab('ai-io')}
            >
              <Bot size={14} />
              AI Input/Output
            </button>
            <button
              className={`tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
              onClick={() => setActiveTab('timeline')}
            >
              <Clock size={14} />
              Timeline
            </button>
            <button
              className={`tab-btn ${activeTab === 'context' ? 'active' : ''}`}
              onClick={() => setActiveTab('context')}
            >
              <Database size={14} />
              Context
            </button>
            <button
              className={`tab-btn ${activeTab === 'raw' ? 'active' : ''}`}
              onClick={() => setActiveTab('raw')}
            >
              <FileText size={14} />
              Raw
            </button>
          </div>
          {onClose && (
            <button className="close-btn" onClick={onClose}>×</button>
          )}
        </div>
      </div>

      <div className="viewer-toolbar">
        <input
          type="text"
          className="filter-input"
          placeholder="Filter states..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
        <div className="toolbar-stats">
          <span>
            <Cpu size={12} />
            {workflowData.states.size} States
          </span>
          <span>
            <Activity size={12} />
            {Array.from(workflowData.states.values()).filter(s => s.status === 'running').length} Running
          </span>
          <span>
            <CheckCircle size={12} />
            {Array.from(workflowData.states.values()).filter(s => s.status === 'completed').length} Completed
          </span>
        </div>
        <label className="token-toggle">
          <input
            type="checkbox"
            checked={showTokens}
            onChange={(e) => setShowTokens(e.target.checked)}
          />
          Show Tokens
        </label>
      </div>

      <div className="viewer-content">
        {activeTab === 'ai-io' && (
          <div className="ai-io-view">
            {filteredStates.length === 0 ? (
              <div className="empty-state">
                <Bot size={48} />
                <h4>No AI Agent Activity Yet</h4>
                <p>Waiting for workflow execution to begin...</p>
              </div>
            ) : (
              filteredStates.map(stateId => {
                const state = workflowData.states.get(stateId);
                return state ? renderAIInputOutput(state) : null;
              })
            )}
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="timeline-view">
            <div className="timeline">
              {filteredStates.map(stateId => {
                const state = workflowData.states.get(stateId);
                if (!state) return null;

                return (
                  <div key={stateId} className={`timeline-item ${state.status}`}>
                    <div className="timeline-marker">
                      {getStatusIcon(state.status)}
                    </div>
                    <div className="timeline-content">
                      <div className="timeline-header">
                        <span className="timeline-name">{state.stateName}</span>
                        <span className="timeline-time">{formatTimestamp(state.timestamp)}</span>
                      </div>
                      {state.outputText && (
                        <div className="timeline-preview">
                          {state.outputText.substring(0, 150)}...
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'context' && (
          <div className="context-view">
            <div className="context-section">
              <h4>Global Results</h4>
              <div className="context-content">
                {workflowData.globalResults ? (
                  <pre className="raw-json">{JSON.stringify(workflowData.globalResults, null, 2)}</pre>
                ) : (
                  <span className="no-data">No global results yet</span>
                )}
              </div>
            </div>

            <div className="context-section">
              <h4>State Context Flow</h4>
              <div className="context-flow">
                {Array.from(workflowData.contextFlow.entries()).map(([stateId, context]) => (
                  <div key={stateId} className="context-item">
                    <div className="context-header">{stateId}</div>
                    <div className="context-data">
                      <pre className="raw-json">{JSON.stringify(context, null, 2)}</pre>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'raw' && (
          <div className="raw-view">
            <div className="raw-actions">
              <button
                className="copy-btn"
                onClick={() => copyToClipboard({
                  task: workflowData.task,
                  execId: workflowData.execId,
                  states: Object.fromEntries(workflowData.states),
                  contextFlow: Object.fromEntries(workflowData.contextFlow),
                  globalResults: workflowData.globalResults
                }, 'raw')}
              >
                <Copy size={14} />
                Copy All
              </button>
            </div>
            <pre className="raw-json">
              {JSON.stringify({
                task: workflowData.task,
                execId: workflowData.execId,
                states: Array.from(workflowData.states.values()),
                contextFlow: Object.fromEntries(workflowData.contextFlow),
                globalResults: workflowData.globalResults,
                edges: workflowData.edges
              }, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImprovedStateDataViewer;