import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './CleanSwarmDashboard.css';
import { HomeButton } from '../ui/HomeButton';
import { Send, Users, Bot, Clock, CheckCircle, AlertCircle, Download } from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  displayName: string;
  role?: string;
  status: 'waiting' | 'running' | 'completed' | 'failed';
  output: string;
  startTime?: number;
  endTime?: number;
  duration?: string;
  depth?: number;
}

interface Message {
  id: string;
  agentId: string;
  agentName: string;
  content: string;
  timestamp: Date;
  type: 'user' | 'agent' | 'system';
}

export default function CleanSwarmDashboard() {
  const [agents, setAgents] = useState<Map<string, Agent>>(new Map());
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [showSystemMessages, setShowSystemMessages] = useState(false);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesFeedRef = useRef<HTMLDivElement>(null);
  const agentOutputs = useRef<Map<string, string>>(new Map());
  const isUserScrolling = useRef<boolean>(false);

  // Force light theme regardless of global settings
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .clean-swarm-dashboard,
      .clean-swarm-dashboard * {
        color-scheme: light !important;
      }

      .clean-swarm-dashboard {
        background: #f9fafb !important;
      }

      .dashboard-header,
      .agents-section,
      .messages-section,
      .agent-card,
      .message:not(.user),
      .input-section,
      .input-section input {
        background: white !important;
        color: #1a1a1a !important;
      }

      .dashboard-header h1,
      .agents-section h2,
      .messages-header h2,
      .agent-name,
      .message-author {
        color: #1a1a1a !important;
      }

      .stat,
      .agent-duration,
      .message-time {
        color: #4b5563 !important;
      }

      .agent-output,
      .message-content:not(.user .message-content) {
        color: #4b5563 !important;
        background: #f9fafb !important;
      }

      .message.user {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      }

      .message.user .message-header,
      .message.user .message-content {
        color: white !important;
      }

      .message.system {
        background: #f0f9ff !important;
        border-color: #bae6fd !important;
      }

      .message.system .message-content {
        color: #0369a1 !important;
        background: transparent !important;
      }

      .agent-card {
        border: 1px solid #e5e7eb !important;
      }

      .agent-card.running {
        border-color: #3b82f6 !important;
        background: linear-gradient(to right, #eff6ff, white) !important;
      }

      .agent-card.completed {
        border-color: #10b981 !important;
        background: linear-gradient(to right, #f0fdf4, white) !important;
      }

      .agent-card.failed {
        border-color: #ef4444 !important;
        background: linear-gradient(to right, #fef2f2, white) !important;
      }

      .input-section input {
        border: 1px solid #e5e7eb !important;
        color: #1a1a1a !important;
        background: white !important;
      }

      .input-section input::placeholder {
        color: #9ca3af !important;
      }

      .input-section input:focus {
        border-color: #6366f1 !important;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1) !important;
      }

      .export-btn {
        background: white !important;
        border: 1px solid #e5e7eb !important;
        color: #4b5563 !important;
      }

      .export-btn:hover {
        background: #f9fafb !important;
      }

      .empty-state {
        color: #9ca3af !important;
      }

      .empty-state p {
        color: #4b5563 !important;
      }

      /* Scrollbar styling */
      .clean-swarm-dashboard ::-webkit-scrollbar-track {
        background: #f3f4f6 !important;
      }

      .clean-swarm-dashboard ::-webkit-scrollbar-thumb {
        background: #cbd5e1 !important;
      }
    `;
    document.head.appendChild(style);

    // Add light theme class to body temporarily
    const originalTheme = document.body.getAttribute('data-theme');

    return () => {
      document.head.removeChild(style);
      if (originalTheme) {
        document.body.setAttribute('data-theme', originalTheme);
      }
    };
  }, []);

  // Simple auto-scroll for new messages
  useEffect(() => {
    // Only auto-scroll for new messages, not updates
    if (messages.length > 0) {
      const timer = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages.length]);

  // Connect WebSocket when execution starts
  const connectWebSocket = useCallback((execId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:8000/api/v1/ws/${execId}`;

    console.log('Connecting to:', wsUrl);

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      // Connection established - no need for system message
    };

    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data);
        handleFrame(frame);
      } catch (error) {
        console.error('Error parsing frame:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      addSystemMessage('Connection error occurred');
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
      wsRef.current = null;
    };

    wsRef.current = ws;
  }, []);

  const handleFrame = (frame: any) => {
    if (frame.frame_type === 'token') {
      // Accumulate agent output
      const currentOutput = agentOutputs.current.get(frame.agent_id) || '';
      const newOutput = currentOutput + frame.text;
      agentOutputs.current.set(frame.agent_id, newOutput);

      // Update agent
      setAgents(prev => {
        const updated = new Map(prev);
        const agent = updated.get(frame.agent_id);
        if (agent) {
          agent.output = newOutput;
          updated.set(frame.agent_id, agent);
        }
        return updated;
      });

      // Update or create agent message
      setMessages(prev => {
        const existingIndex = prev.findIndex(
          m => m.agentId === frame.agent_id && m.type === 'agent'
        );

        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex].content = newOutput;
          return updated;
        } else if (frame.text.trim()) {
          const agent = agents.get(frame.agent_id);
          return [...prev, {
            id: `msg-${frame.agent_id}-${Date.now()}`,
            agentId: frame.agent_id,
            agentName: agent?.displayName || agent?.name || frame.agent_id,
            content: newOutput,
            timestamp: new Date(),
            type: 'agent'
          }];
        }
        return prev;
      });

    } else if (frame.frame_type === 'control') {
      handleControlFrame(frame);
    }
  };

  const formatAgentName = (agentId: string, name?: string): { displayName: string; role: string } => {
    // Clean up agent names
    if (name && name !== agentId) {
      // Extract role from name if it contains descriptive text
      const cleanName = name.replace(/^agent_\d+_?/, '').replace(/_/g, ' ');
      return {
        displayName: cleanName.split(' ').map(word =>
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' '),
        role: 'Specialist'
      };
    }

    // Handle generic agent IDs
    if (agentId.match(/^agent_\d+$/)) {
      const agentNum = agentId.replace('agent_', '');
      return {
        displayName: `Agent ${agentNum}`,
        role: 'Worker'
      };
    }

    // Try to extract meaningful name from ID
    const cleanId = agentId.replace(/[_-]/g, ' ').replace(/agent/i, '');
    return {
      displayName: cleanId.trim() || `Agent ${agentId}`,
      role: 'Task Handler'
    };
  };

  const handleControlFrame = (frame: any) => {
    const { type, agent_id, payload } = frame;

    switch (type) {
      case 'agent_started':
      case 'agent_spawned':
        if (agent_id || payload?.id) {
          const id = agent_id || payload.id;
          const rawName = payload?.name || id;
          const { displayName, role } = formatAgentName(id, rawName);

          setAgents(prev => {
            const updated = new Map(prev);
            updated.set(id, {
              id,
              name: rawName,
              displayName,
              role,
              status: 'running',
              output: '',
              startTime: Date.now(),
              depth: payload?.depth || 0
            });
            return updated;
          });

          // Don't spam system messages for every agent start
        }
        break;

      case 'agent_completed':
        if (agent_id) {
          setAgents(prev => {
            const updated = new Map(prev);
            const agent = updated.get(agent_id);
            if (agent) {
              agent.status = 'completed';
              agent.endTime = Date.now();
              if (agent.startTime) {
                agent.duration = formatDuration(agent.endTime - agent.startTime);
              }
              updated.set(agent_id, agent);
            }
            return updated;
          });
        }
        break;

      case 'task_completed':
      case 'session_end':
        setIsExecuting(false);
        addSystemMessage('All tasks completed successfully');
        break;

      case 'error':
        if (agent_id) {
          setAgents(prev => {
            const updated = new Map(prev);
            const agent = updated.get(agent_id);
            if (agent) {
              agent.status = 'failed';
              updated.set(agent_id, agent);
            }
            return updated;
          });
        }
        break;
    }
  };

  const addSystemMessage = (content: string) => {
    // Avoid duplicate system messages by checking last message
    setMessages(prev => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && lastMessage.type === 'system' && lastMessage.content === content) {
        return prev; // Skip duplicate
      }
      return [...prev, {
        id: `system-${Date.now()}-${Math.random()}`,
        agentId: 'system',
        agentName: 'System',
        content,
        timestamp: new Date(),
        type: 'system'
      }];
    });
  };

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

  const startExecution = async () => {
    if (!userInput.trim() || isExecuting) return;

    // Clear previous state
    setAgents(new Map());
    setMessages([]);
    agentOutputs.current.clear();
    setIsExecuting(true);
    isUserScrolling.current = false; // Reset scroll flag

    // Add user message
    setMessages([{
      id: `user-${Date.now()}`,
      agentId: 'user',
      agentName: 'You',
      content: userInput,
      timestamp: new Date(),
      type: 'user'
    }]);

    try {
      const response = await fetch('http://localhost:8000/api/v1/streaming/stream/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: userInput,
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error('Failed to start execution');
      }

      const data = await response.json();
      setExecutionId(data.exec_id);

      // Execution started - no need for system message, user sees agents loading

      // Connect WebSocket
      setTimeout(() => connectWebSocket(data.exec_id), 100);

      setUserInput('');
    } catch (error) {
      console.error('Execution error:', error);
      setIsExecuting(false);
      addSystemMessage(`Error: ${error}`);
    }
  };

  const exportConversation = () => {
    const header = `AI Agent Swarm Execution Report\n` +
                  `Generated: ${new Date().toLocaleString()}\n` +
                  `Total Agents: ${agents.size}\n` +
                  `=================================\n\n`;

    const agentSummary = Array.from(agents.values())
      .map(agent => `${agent.displayName} (${agent.role}): ${agent.status}`)
      .join('\n');

    const conversation = messages.map(msg =>
      `[${msg.timestamp.toLocaleTimeString()}] ${msg.agentName}:\n${msg.content}\n`
    ).join('\n---\n\n');

    const content = header + 'AGENT SUMMARY:\n' + agentSummary + '\n\n=================================\n\nCONVERSATION:\n\n' + conversation;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `swarm-execution-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (status: Agent['status']) => {
    switch (status) {
      case 'running':
        return <div className="status-spinner" />;
      case 'completed':
        return <CheckCircle className="status-icon completed" />;
      case 'failed':
        return <AlertCircle className="status-icon failed" />;
      default:
        return <Clock className="status-icon waiting" />;
    }
  };

  const getStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'running': return '#3b82f6';
      case 'completed': return '#10b981';
      case 'failed': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <div className="clean-swarm-dashboard" data-theme="light">
      <HomeButton />

      <div className="dashboard-content no-header">
        {/* Agent Cards */}
        <div className="agents-section">
          <div className="agents-header">
            <h2>Agents</h2>
            <div className="inline-stats">
              <span className="mini-stat">
                <Users size={12} />
                {agents.size}
              </span>
              <span className="mini-stat active">
                <Bot size={12} />
                {Array.from(agents.values()).filter(a => a.status === 'running').length}
              </span>
              <span className="mini-stat completed">
                <CheckCircle size={12} />
                {Array.from(agents.values()).filter(a => a.status === 'completed').length}
              </span>
            </div>
          </div>
          <div className="agent-cards">
            {Array.from(agents.values())
              .sort((a, b) => {
                // Sort by depth first, then by start time
                if (a.depth !== b.depth) return (a.depth || 0) - (b.depth || 0);
                return (a.startTime || 0) - (b.startTime || 0);
              })
              .map(agent => (
              <div
                key={agent.id}
                className={`agent-card ${agent.status}`}
                onClick={() => {
                  // Find and scroll to the first message from this agent
                  const agentMessage = messages.find(m => m.agentId === agent.id);
                  if (agentMessage) {
                    const messageEl = messageRefs.current.get(agentMessage.id);
                    messageEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Highlight the message briefly
                    messageEl?.classList.add('highlight');
                    setTimeout(() => messageEl?.classList.remove('highlight'), 2000);
                  }
                }}
                style={{ cursor: 'pointer' }}>
                <div className="agent-header">
                  <div className="agent-info">
                    <Bot size={18} style={{ color: getStatusColor(agent.status) }} />
                    <div className="agent-details">
                      <span className="agent-name">{agent.displayName}</span>
                      {agent.role && (
                        <span className="agent-role">{agent.role}</span>
                      )}
                    </div>
                  </div>
                  {getStatusIcon(agent.status)}
                </div>

                {agent.output && (
                  <div className="agent-output">
                    {agent.output}
                  </div>
                )}

                {agent.duration && (
                  <div className="agent-duration">
                    <Clock size={14} />
                    <span>{agent.duration}</span>
                  </div>
                )}
              </div>
            ))}

            {agents.size === 0 && !isExecuting && (
              <div className="empty-state">
                <Bot size={48} />
                <p>No agents running</p>
                <span>Enter a task below to start</span>
              </div>
            )}
          </div>
        </div>

        {/* Message Feed */}
        <div className="messages-section">
          <div className="messages-header">
            <h2>Conversation</h2>
            <div className="message-controls">
              <button
                onClick={() => setShowSystemMessages(!showSystemMessages)}
                className={`toggle-btn ${showSystemMessages ? 'active' : ''}`}
                title={showSystemMessages ? 'Hide system messages' : 'Show system messages'}
              >
                System: {showSystemMessages ? 'ON' : 'OFF'}
              </button>
              <button onClick={exportConversation} className="export-btn">
                <Download size={16} />
                Export
              </button>
            </div>
          </div>

          <div
            className="messages-feed"
            ref={messagesFeedRef}
          >
            {messages
              .filter(msg => showSystemMessages || msg.type !== 'system')
              .map(msg => {
              // No truncation - display full content with markdown formatting
              return (
                <div
                  key={msg.id}
                  ref={el => {
                    if (el) messageRefs.current.set(msg.id, el);
                  }}
                  className={`message ${msg.type}`}>
                  <div className="message-header">
                    <span className="message-author">{msg.agentName}</span>
                    <span className="message-time">
                      {msg.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="message-content">
                    {msg.type === 'user' || msg.type === 'system' ? (
                      <pre style={{
                        margin: 0,
                        fontFamily: 'inherit',
                        whiteSpace: 'pre-wrap',
                        wordWrap: 'break-word'
                      }}>
                        {msg.content}
                      </pre>
                    ) : (
                      <ReactMarkdown
                        components={{
                          code({ node, inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '');
                            return !inline && match ? (
                              <SyntaxHighlighter
                                style={oneLight}
                                language={match[1]}
                                PreTag="div"
                                customStyle={{
                                  margin: '0.5em 0',
                                  fontSize: '13px',
                                  background: '#f6f8fa',
                                  padding: '12px',
                                  borderRadius: '6px',
                                  overflow: 'auto'
                                }}
                                {...props}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            ) : (
                              <code style={{
                                background: '#f3f4f6',
                                padding: '2px 6px',
                                borderRadius: '3px',
                                fontSize: '13px',
                                fontFamily: '"SF Mono", Monaco, "Courier New", monospace'
                              }} {...props}>
                                {children}
                              </code>
                            );
                          },
                          p: ({ children }) => <p style={{ margin: '0.5em 0', lineHeight: 1.6 }}>{children}</p>,
                          ul: ({ children }) => <ul style={{ marginLeft: '1.5em', margin: '0.5em 0' }}>{children}</ul>,
                          ol: ({ children }) => <ol style={{ marginLeft: '1.5em', margin: '0.5em 0' }}>{children}</ol>,
                          blockquote: ({ children }) => (
                            <blockquote style={{
                              borderLeft: '3px solid #e5e7eb',
                              paddingLeft: '1em',
                              margin: '0.5em 0',
                              color: '#6b7280',
                              fontStyle: 'italic'
                            }}>
                              {children}
                            </blockquote>
                          ),
                          h1: ({ children }) => <h1 style={{ fontSize: '1.5em', fontWeight: 600, margin: '0.5em 0' }}>{children}</h1>,
                          h2: ({ children }) => <h2 style={{ fontSize: '1.3em', fontWeight: 600, margin: '0.5em 0' }}>{children}</h2>,
                          h3: ({ children }) => <h3 style={{ fontSize: '1.1em', fontWeight: 600, margin: '0.5em 0' }}>{children}</h3>,
                          hr: () => <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '1em 0' }} />,
                          a: ({ children, href }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer" style={{
                              color: '#6366f1',
                              textDecoration: 'underline'
                            }}>
                              {children}
                            </a>
                          ),
                          table: ({ children }) => (
                            <table style={{
                              borderCollapse: 'collapse',
                              width: '100%',
                              margin: '0.5em 0'
                            }}>
                              {children}
                            </table>
                          ),
                          th: ({ children }) => (
                            <th style={{
                              border: '1px solid #e5e7eb',
                              padding: '8px',
                              background: '#f9fafb',
                              fontWeight: 600,
                              textAlign: 'left'
                            }}>
                              {children}
                            </th>
                          ),
                          td: ({ children }) => (
                            <td style={{
                              border: '1px solid #e5e7eb',
                              padding: '8px'
                            }}>
                              {children}
                            </td>
                          )
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-section">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && startExecution()}
              placeholder="Enter your task for the AI agents..."
              disabled={isExecuting}
            />
            <button
              onClick={startExecution}
              disabled={isExecuting || !userInput.trim()}
              className="send-btn"
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}