import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  Bot, User, AlertCircle, CheckCircle, Clock, Play, Zap,
  MessageSquare, Terminal, Copy, Check, ChevronDown, ChevronRight,
  Layers, Package, GitBranch, ArrowRight, Info, Loader2,
  Sparkles, Brain, Code, FileText, Search, Globe, Database, Target
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './ImprovedChatbotOutput.css';

interface Agent {
  id: string;
  name: string;
  output: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'needs_input' | string;
  startTime?: number;
  endTime?: number;
  parent?: string;
  depth?: number;
  role?: string;
  tools?: string[];
  error?: string;
}

interface ImprovedChatbotOutputProps {
  agents: Map<string, Agent>;
  nodes?: any[];
  selectedAgent: string | null;
  onAgentSelect: (agentId: string | null) => void;
  onNodeFocus?: (agentId: string) => void;
  isDarkMode?: boolean;
}

const ImprovedChatbotOutput: React.FC<ImprovedChatbotOutputProps> = ({
  agents,
  nodes = [],
  selectedAgent,
  onAgentSelect,
  onNodeFocus,
  isDarkMode = false
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'agent' | 'tool' | 'error'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new agents are added or updated
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [agents]);

  const handleAgentClick = useCallback((agentId: string) => {
    // Select the agent
    onAgentSelect(selectedAgent === agentId ? null : agentId);
    // Focus on the node if the function is available
    if (onNodeFocus) {
      onNodeFocus(agentId);
    }
  }, [selectedAgent, onAgentSelect, onNodeFocus]);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDuration = (start?: number, end?: number) => {
    if (!start) return null;
    const duration = ((end || Date.now()) - start) / 1000;
    if (duration < 1) return `${(duration * 1000).toFixed(0)}ms`;
    return `${duration.toFixed(1)}s`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader2 size={14} className="animate-spin" style={{ color: '#f59e0b' }} />;
      case 'completed':
        return <CheckCircle size={14} style={{ color: '#10b981' }} />;
      case 'failed':
        return <AlertCircle size={14} style={{ color: '#ef4444' }} />;
      case 'needs_input':
        return <MessageSquare size={14} style={{ color: '#3b82f6' }} />;
      case 'pending':
        return <Clock size={14} style={{ color: '#6b7280' }} />;
      default:
        return <Clock size={14} style={{ color: '#6b7280' }} />;
    }
  };

  const processContent = (content: string): string => {
    // Remove NEXT_EVENT from display
    return content.replace(/NEXT_EVENT:\s*\w+/g, '').trim();
  };

  const extractNextEvent = (content: string): string | null => {
    const match = content.match(/NEXT_EVENT:\s*(\w+)/);
    return match ? match[1] : null;
  };

  // Convert Map to sorted array
  const sortedAgents = useMemo(() => {
    const agentArray = Array.from(agents.entries()).map(([id, agent]) => ({
      ...agent,
      id
    }));

    // Sort by startTime if available, otherwise by order added
    return agentArray.sort((a, b) => {
      if (a.startTime && b.startTime) {
        return a.startTime - b.startTime;
      }
      return 0;
    });
  }, [agents]);

  // Apply filters
  const filteredAgents = useMemo(() => {
    let filtered = sortedAgents;

    // Apply type filter
    if (filterType === 'tool' && filtered) {
      filtered = filtered.filter(agent => agent.tools && agent.tools.length > 0);
    } else if (filterType === 'error') {
      filtered = filtered.filter(agent => agent.status === 'failed' || agent.error);
    }

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(agent =>
        agent.name.toLowerCase().includes(term) ||
        agent.output.toLowerCase().includes(term) ||
        agent.role?.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [sortedAgents, filterType, searchTerm]);

  const renderAgentMessage = (agent: typeof sortedAgents[0]) => {
    const isSelected = selectedAgent === agent.id;
    const processedContent = processContent(agent.output);
    const nextEvent = extractNextEvent(agent.output);

    // Find the corresponding node for block reference
    const node = nodes.find(n => n.id === agent.id);
    const blockName = node?.data?.name || agent.name;

    return (
      <div
        key={agent.id}
        className={`agent-message-card ${agent.status} ${isSelected ? 'selected' : ''}`}
        onClick={() => handleAgentClick(agent.id)}
        style={{
          marginBottom: '8px',
          padding: '10px',
          borderRadius: '8px',
          border: `1px solid ${isSelected ? '#3b82f6' : isDarkMode ? '#334155' : '#e2e8f0'}`,
          backgroundColor: isDarkMode ? '#1e293b' : 'white',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          borderLeft: `3px solid ${
            agent.status === 'completed' ? '#10b981' :
            agent.status === 'failed' ? '#ef4444' :
            agent.status === 'running' ? '#f59e0b' :
            '#6b7280'
          }`
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bot size={16} style={{ color: isDarkMode ? '#94a3b8' : '#64748b' }} />
            <span style={{ fontWeight: 600, fontSize: '14px', color: isDarkMode ? '#f1f5f9' : '#0f172a' }}>
              {blockName}
            </span>
            {getStatusIcon(agent.status)}
            {agent.startTime && (
              <span style={{ fontSize: '12px', opacity: 0.7 }}>
                {formatTime(agent.startTime)}
              </span>
            )}
            {agent.startTime && (
              <span style={{ fontSize: '12px', opacity: 0.7 }}>
                <Zap size={10} style={{ display: 'inline', marginRight: '2px' }} />
                {formatDuration(agent.startTime, agent.endTime)}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {processedContent && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(processedContent, agent.id);
                }}
                style={{
                  padding: '4px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: isDarkMode ? '#94a3b8' : '#64748b'
                }}
                title="Copy"
              >
                {copiedId === agent.id ? <Check size={14} /> : <Copy size={14} />}
              </button>
            )}
            {onNodeFocus && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onNodeFocus(agent.id);
                }}
                style={{
                  padding: '4px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#3b82f6'
                }}
                title="Focus on block"
              >
                <Target size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Tools */}
        {agent.tools && agent.tools.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
            {agent.tools.map((tool, idx) => (
              <span
                key={idx}
                style={{
                  fontSize: '11px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: isDarkMode ? '#0f172a' : '#f1f5f9',
                  color: isDarkMode ? '#94a3b8' : '#475569'
                }}
              >
                <Package size={10} style={{ display: 'inline', marginRight: '2px' }} />
                {tool}
              </span>
            ))}
          </div>
        )}

        {/* Content */}
        {processedContent && (
          <div style={{
            fontSize: '13px',
            lineHeight: '1.6',
            color: isDarkMode ? '#cbd5e1' : '#334155',
            maxHeight: '300px',
            overflowY: 'auto'
          }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h3 style={{ fontSize: '16px', margin: '8px 0' }}>{children}</h3>,
                h2: ({ children }) => <h4 style={{ fontSize: '15px', margin: '8px 0' }}>{children}</h4>,
                h3: ({ children }) => <h5 style={{ fontSize: '14px', margin: '8px 0' }}>{children}</h5>,
                p: ({ children }) => <p style={{ margin: '6px 0' }}>{children}</p>,
                ul: ({ children }) => <ul style={{ margin: '6px 0', paddingLeft: '20px' }}>{children}</ul>,
                ol: ({ children }) => <ol style={{ margin: '6px 0', paddingLeft: '20px' }}>{children}</ol>,
                li: ({ children }) => <li style={{ margin: '4px 0' }}>{children}</li>,
                code: ({ inline, className, children, ...props }: any) => {
                  const match = /language-(\w+)/.exec(className || '');
                  return !inline && match ? (
                    <SyntaxHighlighter
                      style={isDarkMode ? oneDark : oneLight}
                      language={match[1]}
                      PreTag="div"
                      customStyle={{
                        margin: '8px 0',
                        borderRadius: '6px',
                        fontSize: '12px'
                      }}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  ) : (
                    <code
                      style={{
                        padding: '2px 4px',
                        borderRadius: '3px',
                        backgroundColor: isDarkMode ? '#1e293b' : '#f1f5f9',
                        color: isDarkMode ? '#fb7185' : '#e11d48',
                        fontSize: '0.9em'
                      }}
                    >
                      {children}
                    </code>
                  );
                },
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#3b82f6', textDecoration: 'none' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {children}
                  </a>
                ),
                blockquote: ({ children }) => (
                  <blockquote
                    style={{
                      margin: '8px 0',
                      padding: '8px 12px',
                      borderLeft: '3px solid #3b82f6',
                      backgroundColor: isDarkMode ? '#0f172a' : '#f0f9ff'
                    }}
                  >
                    {children}
                  </blockquote>
                ),
                strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
                em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
              }}
            >
              {processedContent}
            </ReactMarkdown>
          </div>
        )}

        {/* Status indicator for streaming */}
        {agent.status === 'running' && (
          <div style={{
            marginTop: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: '#f59e0b'
          }}>
            <Loader2 size={12} className="animate-spin" />
            <span>Processing...</span>
          </div>
        )}

        {/* Next Event */}
        {nextEvent && (
          <div style={{
            marginTop: '8px',
            padding: '4px 8px',
            borderRadius: '4px',
            backgroundColor: isDarkMode ? '#451a03' : '#fef3c7',
            color: isDarkMode ? '#fbbf24' : '#92400e',
            fontSize: '12px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <ArrowRight size={12} />
            Next: {nextEvent}
          </div>
        )}

        {/* Error */}
        {agent.error && (
          <div style={{
            marginTop: '8px',
            padding: '4px 8px',
            borderRadius: '4px',
            backgroundColor: isDarkMode ? '#450a0a' : '#fee2e2',
            color: isDarkMode ? '#fca5a5' : '#991b1b',
            fontSize: '12px'
          }}>
            {agent.error}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`improved-chatbot ${isDarkMode ? 'dark' : 'light'}`} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare size={18} />
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Agent Conversation</span>
          <span style={{
            padding: '2px 6px',
            borderRadius: '10px',
            fontSize: '11px',
            backgroundColor: isDarkMode ? '#1e293b' : '#e2e8f0',
            color: isDarkMode ? '#94a3b8' : '#475569'
          }}>
            {filteredAgents.length} messages
          </span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {['all', 'agent', 'tool', 'error'].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type as any)}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                borderRadius: '4px',
                border: `1px solid ${filterType === type ? '#3b82f6' : isDarkMode ? '#475569' : '#cbd5e1'}`,
                backgroundColor: filterType === type ? '#3b82f6' : 'transparent',
                color: filterType === type ? 'white' : isDarkMode ? '#94a3b8' : '#64748b',
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {type === 'all' ? 'All' :
               type === 'agent' ? '🤖 Agents' :
               type === 'tool' ? '📦 Tools' :
               '⚠️ Errors'}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div style={{
        padding: '8px 16px',
        borderBottom: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0
      }}>
        <Search size={16} style={{ color: isDarkMode ? '#64748b' : '#94a3b8' }} />
        <input
          type="text"
          placeholder="Search messages..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: 1,
            padding: '4px 8px',
            border: 'none',
            background: 'transparent',
            fontSize: '13px',
            outline: 'none',
            color: isDarkMode ? '#e2e8f0' : '#1e293b'
          }}
        />
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px'
        }}
      >
        {filteredAgents.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            opacity: 0.5,
            gap: '8px'
          }}>
            <MessageSquare size={48} strokeWidth={1} />
            <p style={{ margin: 0, fontSize: '14px' }}>No messages to display</p>
            <span style={{ fontSize: '12px' }}>Agent outputs will appear here as they execute</span>
          </div>
        ) : (
          <>
            {filteredAgents.map(renderAgentMessage)}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
    </div>
  );
};

export default ImprovedChatbotOutput;