import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { BlockStatus } from '../../../types/workflow';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTheme } from '../../../contexts/ThemeContext';
import './ChatbotOutput.css';

interface Message {
  id: string;
  agentId: string;
  agentName: string;
  agentRole?: string;
  content: string;
  timestamp: number;
  status: BlockStatus;
  type: 'agent' | 'system' | 'error';
  metadata?: {
    task?: string;
    tools?: string[];
    duration?: number;
    parent?: string;
    depth?: number;
  };
}

interface ChatbotOutputProps {
  agents: Map<string, any>;
  nodes: any[];
  selectedAgent: string | null;
  onAgentSelect: (agentId: string | null) => void;
  onNodeFocus: (agentId: string) => void;
}

// Memoized Message Component to prevent re-renders
const MessageItem = React.memo(({
  message,
  isSelected,
  onSelect,
  getStatusIcon,
  formatTime,
  isDark
}: {
  message: Message;
  isSelected: boolean;
  onSelect: () => void;
  getStatusIcon: (status: string) => React.ReactNode;
  formatTime: (timestamp: number) => string;
  isDark: boolean;
}) => {
  return (
    <div
      id={`message-${message.agentId}`}
      className={`message-bubble ${message.type} ${message.status} ${
        isSelected ? 'selected' : ''
      }`}
      onClick={onSelect}
    >
      <div className="message-header">
        <div className="agent-info">
          {getStatusIcon(message.status)}
          <span className="agent-name">{message.agentName}</span>
          {message.agentRole && (
            <span className="agent-role">{message.agentRole}</span>
          )}
        </div>
        <div className="message-meta">
          {message.metadata?.duration && (
            <span className="duration">{message.metadata.duration.toFixed(1)}s</span>
          )}
          <span className="timestamp">{formatTime(message.timestamp)}</span>
        </div>
      </div>

      {message.metadata?.task && (
        <div className="message-task">
          <span className="task-label">Task:</span> {message.metadata.task}
        </div>
      )}

      {message.metadata?.tools && message.metadata.tools.length > 0 && (
        <div className="message-tools">
          {message.metadata.tools.map((tool, idx) => (
            <span key={idx} className="tool-chip">{tool}</span>
          ))}
        </div>
      )}

      <div className="message-content">
        {message.content ? (
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
                      <button
                        className="copy-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(String(children));
                        }}
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="code-content">
                      <code className={className} {...props}>
                        {children}
                      </code>
                    </pre>
                  </div>
                ) : (
                  <code className="inline-code" {...props}>
                    {children}
                  </code>
                );
              },
              p: ({children}) => <p className="markdown-p">{children}</p>,
              ul: ({children}) => <ul className="markdown-list">{children}</ul>,
              ol: ({children}) => <ol className="markdown-list ordered">{children}</ol>,
              li: ({children}) => <li className="markdown-li">{children}</li>,
              h1: ({children}) => <h4 className="markdown-heading">{children}</h4>,
              h2: ({children}) => <h5 className="markdown-heading">{children}</h5>,
              h3: ({children}) => <h6 className="markdown-heading">{children}</h6>,
              blockquote: ({children}) => (
                <blockquote className="markdown-blockquote">{children}</blockquote>
              ),
              a: ({href, children}) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="markdown-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  {children}
                </a>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        ) : message.status === 'running' ? (
          <div className="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        ) : (
          <span className="no-content">Processing...</span>
        )}
      </div>

      {message.type === 'error' && message.content && (
        <div className="error-message">
          ⚠ {message.content}
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if these specific props change
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.status === nextProps.message.status &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isDark === nextProps.isDark
  );
});

const ChatbotOutput: React.FC<ChatbotOutputProps> = React.memo(({
  agents,
  nodes,
  selectedAgent,
  onAgentSelect,
  onNodeFocus,
}) => {
  const { isDark } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const prevAgentsRef = useRef<Map<string, any>>(new Map());

  // Convert agents to messages - only when agents actually change
  useEffect(() => {
    // Check if agents actually changed by comparing content
    let hasAgentChanges = false;

    // Check for new or updated agents
    agents.forEach((agent, agentId) => {
      const prevAgent = prevAgentsRef.current.get(agentId);
      if (!prevAgent ||
          prevAgent.output !== agent.output ||
          prevAgent.status !== agent.status ||
          prevAgent.startTime !== agent.startTime ||
          prevAgent.endTime !== agent.endTime) {
        hasAgentChanges = true;
      }
    });

    // Check for removed agents
    prevAgentsRef.current.forEach((_, agentId) => {
      if (!agents.has(agentId)) {
        hasAgentChanges = true;
      }
    });

    if (!hasAgentChanges) {
      return; // No actual changes, skip update
    }

    // Update prev agents ref
    prevAgentsRef.current = new Map(agents);

    // Generate new messages
    const msgs: Message[] = [];

    agents.forEach((agent, agentId) => {
      const node = nodes.find(n => n.id === agentId);
      const nodeData = node?.data;

      if (agent.output || agent.status !== 'pending') {
        msgs.push({
          id: `${agentId}-${agent.output?.length || 0}`,
          agentId,
          agentName: agent.name,
          agentRole: nodeData?.agentRole,
          content: agent.output || '',
          timestamp: agent.startTime || Date.now(),
          status: agent.status,
          type: agent.error ? 'error' : 'agent',
          metadata: {
            task: nodeData?.task,
            tools: nodeData?.toolsPlanned || nodeData?.toolsUsed,
            duration: agent.endTime && agent.startTime ?
              (agent.endTime - agent.startTime) / 1000 : undefined,
            parent: agent.parent,
            depth: agent.depth,
          },
        });
      }
    });

    // Sort by timestamp
    msgs.sort((a, b) => a.timestamp - b.timestamp);

    // Batch DOM updates with requestAnimationFrame
    requestAnimationFrame(() => {
      setMessages(prevMessages => {
        const hasMessageChanges = JSON.stringify(prevMessages) !== JSON.stringify(msgs);
        return hasMessageChanges ? msgs : prevMessages;
      });
    });
  }, [agents, nodes]);

  // Auto-scroll to bottom when new messages arrive - debounced
  useEffect(() => {
    if (isAutoScroll && messagesEndRef.current) {
      // Use requestAnimationFrame for smoother scrolling
      const rafId = requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [messages.length, isAutoScroll]); // Only trigger on message count change

  // Handle scroll to detect if user scrolled up
  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      setIsAutoScroll(isAtBottom);
    }
  };

  // Scroll to specific message when agent is selected
  useEffect(() => {
    if (selectedAgent) {
      const messageEl = document.getElementById(`message-${selectedAgent}`);
      if (messageEl) {
        messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Highlight effect
        messageEl.classList.add('highlight');
        setTimeout(() => messageEl.classList.remove('highlight'), 2000);
      }
    }
  }, [selectedAgent]);

  const formatTime = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }, []);

  const getStatusIcon = useCallback((status: string) => {
    switch (status) {
      case 'running':
        return <span className="status-icon running">●</span>;
      case 'completed':
        return <span className="status-icon success">✓</span>;
      case 'failed':
        return <span className="status-icon error">✗</span>;
      default:
        return <span className="status-icon pending">○</span>;
    }
  }, []);

  // Calculate stats
  const totalAgents = agents.size;
  const activeAgents = Array.from(agents.values()).filter(a => a.status === 'running').length;
  const completedAgents = Array.from(agents.values()).filter(a => a.status === 'completed').length;

  return (
    <div className={`chatbot-output ${isDark ? 'dark' : 'light'}`}>
      <div className="chat-header-enhanced">
        <div className="header-top">
          <div className="header-title-section">
            <div className="header-icon-wrapper">
              <span style={{ fontSize: '16px', fontWeight: 'bold' }}>💬</span>
            </div>
            <h3>Agent Conversation</h3>
          </div>
          <div className="chat-controls">
            <button
              className={`control-btn-enhanced ${isAutoScroll ? 'active' : ''}`}
              onClick={() => setIsAutoScroll(!isAutoScroll)}
              title="Auto-scroll"
              style={{
                color: isDark ? '#e2e8f0' : '#475569',
                background: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                fontSize: '18px',
                fontWeight: 'bold'
              }}
            >
              ↓
            </button>
            <button
              className="control-btn-enhanced"
              onClick={() => {
                const activeAgent = Array.from(agents.values()).find(a => a.status === 'running');
                if (activeAgent) {
                  onAgentSelect(activeAgent.id);
                  onNodeFocus(activeAgent.id);
                }
              }}
              title="Focus Active Agent"
              style={{
                color: isDark ? '#e2e8f0' : '#475569',
                background: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
            >
              ◎
            </button>
          </div>
        </div>
        <div className="header-stats">
          <div className="stat-item">
            <span className="stat-value">{totalAgents}</span>
            <span className="stat-label">Agents</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <span className="stat-value active-value">{activeAgents}</span>
            <span className="stat-label">Active</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <span className="stat-value completed-value">{completedAgents}</span>
            <span className="stat-label">Completed</span>
          </div>
        </div>
      </div>

      <div
        className="chat-messages"
        ref={chatContainerRef}
        onScroll={handleScroll}
      >
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💬</div>
            <p>Waiting for agents to start...</p>
            <span>Agent outputs will appear here as they work</span>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                isSelected={selectedAgent === message.agentId}
                onSelect={() => {
                  onAgentSelect(message.agentId);
                  onNodeFocus(message.agentId);
                }}
                getStatusIcon={getStatusIcon}
                formatTime={formatTime}
                isDark={isDark}
              />))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {!isAutoScroll && (
        <button
          className="scroll-to-bottom"
          onClick={() => {
            setIsAutoScroll(true);
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          ↓ New messages
        </button>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  // Deep comparison for agents Map
  const agentsEqual = (() => {
    if (prevProps.agents === nextProps.agents) return true;
    if (prevProps.agents.size !== nextProps.agents.size) return false;

    // Use Array.from to avoid downlevelIteration requirement
    const prevEntries = Array.from(prevProps.agents.entries());
    for (let i = 0; i < prevEntries.length; i++) {
      const [key, value] = prevEntries[i];
      const nextValue = nextProps.agents.get(key);
      if (!nextValue) return false;
      if (value.output !== nextValue.output ||
          value.status !== nextValue.status ||
          value.startTime !== nextValue.startTime ||
          value.endTime !== nextValue.endTime) {
        return false;
      }
    }
    return true;
  })();

  // Deep comparison for nodes array
  const nodesEqual = (() => {
    if (prevProps.nodes === nextProps.nodes) return true;
    if (prevProps.nodes.length !== nextProps.nodes.length) return false;

    return prevProps.nodes.every((node, i) => {
      const nextNode = nextProps.nodes[i];
      return node.id === nextNode.id &&
             JSON.stringify(node.data) === JSON.stringify(nextNode.data);
    });
  })();

  return (
    prevProps.selectedAgent === nextProps.selectedAgent &&
    agentsEqual &&
    nodesEqual &&
    prevProps.onAgentSelect === nextProps.onAgentSelect &&
    prevProps.onNodeFocus === nextProps.onNodeFocus
  );
});

export default ChatbotOutput;
