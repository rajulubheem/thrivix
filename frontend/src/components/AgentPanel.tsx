// Fixed AgentPanel.tsx with proper expanded details
import React, { useMemo, useEffect, useState } from 'react';
import './AgentPanel.css';

interface Agent {
  id: string;
  name: string;
  role?: string;
  description: string;
  capabilities: string[];
  status: 'idle' | 'thinking' | 'working' | 'streaming' | 'complete' | 'error';
  contributions: number;
  lastActivity?: string;
  currentTask?: string;
  progress?: number;
  tokensUsed?: number;
  toolsUsed?: string[];
  error?: string;
}

interface AgentActivity {
  agentName: string;
  action: string;
  timestamp: Date;
  type: 'handoff' | 'tool' | 'message' | 'complete' | 'error';
  details?: any;
}

interface AgentPanelProps {
  agents: Agent[];
  currentAgent?: string;
  activities?: AgentActivity[];
  sharedContext?: Record<string, any>;
  isExecuting?: boolean;
  onAgentSelect?: (agentId: string) => void;
  streamingMessages?: Map<string, string>;
}

const AgentPanel: React.FC<AgentPanelProps> = ({
                                                 agents,
                                                 currentAgent,
                                                 activities = [],
                                                 sharedContext = {},
                                                 isExecuting = false,
                                                 onAgentSelect,
                                                 streamingMessages = new Map()
                                               }) => {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['agents']));

  // Reset panel state when execution starts/stops
  useEffect(() => {
    if (!isExecuting) {
      setSelectedAgentId(null);
    }
  }, [isExecuting]);

  // Calculate real-time statistics for each agent
  const getAgentRealTimeStats = useMemo(() => {
    return (agent: Agent) => {
      const streamingContent = streamingMessages.get(agent.name) || '';
      const charCount = streamingContent.length;

      return {
        characters: charCount,
        tokens: agent.tokensUsed || Math.ceil(charCount / 4),
        contributions: agent.contributions || 0,
        toolsCount: agent.toolsUsed?.length || 0
      };
    };
  }, [streamingMessages]);

  // Agent emoji mapping
  const getAgentEmoji = (name: string): string => {
    const emojis: Record<string, string> = {
      orchestrator: '🎯',
      researcher: '🔬',
      architect: '🏗️',
      developer: '💻',
      coder: '💻',
      reviewer: '✅',
      analyst: '📊',
      designer: '🎨',
      tester: '🧪',
      documenter: '📝',
      planner: '📋',
      data_scientist: '📈',
      frontend: '🎨',
      backend: '⚙️',
      devops: '🚀',
      security: '🔒',
      database: '🗄️',
      api: '🔌',
      ui: '🎨',
      ux: '🎨',
      mobile: '📱',
      calculator: '🧮',
      deployer: '🚀',
      builder: '🔨',
      deployment: '🚀',
      app: '📱',
      integrator: '🔗',
      todo: '📝',
      default: '🤖'
    };

    const key = name.toLowerCase().replace(/[_-]/g, '').split(/(?=[A-Z])/).join('_').toLowerCase();
    for (const [k, v] of Object.entries(emojis)) {
      if (key.includes(k)) return v;
    }
    return emojis.default;
  };

  // Agent color mapping
  const getAgentColor = (name: string): string => {
    const colors: Record<string, string> = {
      orchestrator: '#6366f1',
      researcher: '#10b981',
      architect: '#8b5cf6',
      developer: '#06b6d4',
      coder: '#06b6d4',
      reviewer: '#f59e0b',
      analyst: '#14b8a6',
      designer: '#ec4899',
      tester: '#ef4444',
      documenter: '#84cc16',
      ui: '#ec4899',
      ux: '#ec4899',
      mobile: '#06b6d4',
      calculator: '#8b5cf6',
      deployer: '#059669',
      builder: '#0ea5e9',
      deployment: '#059669',
      app: '#06b6d4',
      integrator: '#6366f1',
      todo: '#14b8a6',
      default: '#6b7280'
    };

    const key = name.toLowerCase().replace(/[_-]/g, '');
    for (const [k, v] of Object.entries(colors)) {
      if (key.includes(k)) return v;
    }
    return colors.default;
  };

  // Get status color
  const getStatusColor = (status: Agent['status']): string => {
    const statusColors = {
      idle: '#9ca3af',
      thinking: '#8b5cf6',
      working: '#3b82f6',
      streaming: '#06b6d4',
      complete: '#10b981',
      error: '#ef4444'
    };
    return statusColors[status] || '#6b7280';
  };

  // Get status icon
  const getStatusIcon = (status: Agent['status']): string => {
    const statusIcons = {
      idle: '○',
      thinking: '💭',
      working: '⚡',
      streaming: '✏️',
      complete: '✓',
      error: '✗'
    };
    return statusIcons[status] || '●';
  };

  // Filter active agents
  const activeAgents = useMemo(() =>
          agents.filter(a => a.status !== 'idle' || a.contributions > 0),
      [agents]
  );

  // Get recent activities
  const recentActivities = useMemo(() =>
          activities.slice(-10).reverse(),
      [activities]
  );

  // Calculate team statistics
  const teamStats = useMemo(() => {
    const totalTokens = agents.reduce((sum, agent) => {
      const stats = getAgentRealTimeStats(agent);
      return sum + stats.tokens;
    }, 0);

    const totalTools = agents.reduce((sum, agent) => {
      return sum + (agent.toolsUsed?.length || 0);
    }, 0);

    const stats = {
      totalAgents: agents.length,
      activeAgents: agents.filter(a => a.status !== 'idle' && a.status !== 'complete').length,
      completedAgents: agents.filter(a => a.status === 'complete').length,
      totalContributions: agents.reduce((sum, a) => sum + (a.contributions || 0), 0),
      totalTokens,
      totalTools,
      successRate: 0
    };

    const completed = agents.filter(a => a.status === 'complete' || a.status === 'error');
    if (completed.length > 0) {
      const successful = completed.filter(a => a.status === 'complete');
      stats.successRate = Math.round((successful.length / completed.length) * 100);
    }

    return stats;
  }, [agents, getAgentRealTimeStats]);

  // Toggle section expansion
  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  // Handle agent click - FIXED
  const handleAgentClick = (agentId: string) => {
    setSelectedAgentId(prevId => prevId === agentId ? null : agentId);
    onAgentSelect?.(agentId);
  };

  // Format numbers
  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
  };

  return (
      <div className="unified-agent-panel">
        {/* Team Overview */}
        <div className="team-overview">
          <div className="overview-header">
            <h3 className="overview-title">
              🤖 Team Status
            </h3>
            {isExecuting && <span className="execution-badge">● Executing</span>}
          </div>

          <div className="team-stats-grid">
            <div className="stat-item">
              <span className="stat-value">{teamStats.totalAgents}</span>
              <span className="stat-label">Agents</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{teamStats.activeAgents}</span>
              <span className="stat-label">Active</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{teamStats.completedAgents}</span>
              <span className="stat-label">Done</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{formatNumber(teamStats.totalTokens)}</span>
              <span className="stat-label">Tokens</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{teamStats.totalTools}</span>
              <span className="stat-label">Tools</span>
            </div>
            {teamStats.successRate > 0 && (
                <div className="stat-item">
                  <span className="stat-value">{teamStats.successRate}%</span>
                  <span className="stat-label">Success</span>
                </div>
            )}
          </div>
        </div>

        {/* Agents Section */}
        <div className="panel-section">
          <div
              className="section-header-fixed"
              onClick={() => toggleSection('agents')}
          >
            <h4 className="section-title-fixed">
              {expandedSections.has('agents') ? '▼' : '▶'}
              {' '}Agents ({activeAgents.length})
            </h4>
          </div>

          {expandedSections.has('agents') && (
              <div className="agents-container">
                {activeAgents.length === 0 ? (
                    <div className="empty-state">
                      <span>No active agents yet</span>
                    </div>
                ) : (
                    activeAgents.map(agent => {
                      const isSelected = selectedAgentId === agent.id;
                      const isCurrent = currentAgent === agent.name;
                      const color = getAgentColor(agent.name);
                      const emoji = getAgentEmoji(agent.name);
                      const statusColor = getStatusColor(agent.status);
                      const realTimeStats = getAgentRealTimeStats(agent);

                      return (
                          <div
                              key={agent.id}
                              className={`agent-item ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}`}
                              style={{ '--agent-color': color } as React.CSSProperties}
                          >
                            {/* Main Agent Info - Always Visible */}
                            <div className="agent-main" onClick={() => handleAgentClick(agent.id)}>
                              <div className="agent-avatar" style={{ background: color }}>
                                {emoji}
                              </div>

                              <div className="agent-info">
                                <div className="agent-header">
                                  <span className="agent-name">{agent.name.replace(/_/g, ' ')}</span>
                                  <span
                                      className={`agent-status ${agent.status}`}
                                      style={{ color: statusColor }}
                                  >
                            {getStatusIcon(agent.status)} {agent.status}
                          </span>
                                </div>

                                <div className="agent-description">
                                  {agent.currentTask || agent.description}
                                </div>

                                {agent.progress !== undefined && agent.status === 'working' && (
                                    <div className="agent-progress">
                                      <div
                                          className="progress-bar"
                                          style={{ width: `${agent.progress}%`, backgroundColor: color }}
                                      />
                                    </div>
                                )}

                                <div className="agent-meta-improved">
                                  <span className="meta-badge">📋 {realTimeStats.contributions} tasks</span>
                                  <span className="meta-badge">🔤 {formatNumber(realTimeStats.tokens)} tokens</span>
                                  {realTimeStats.toolsCount > 0 && (
                                      <span className="meta-badge">🔧 {realTimeStats.toolsCount} tools</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Expanded Details - Shows when selected */}
                            {isSelected && (
                                <div className="agent-details">
                                  {/* Capabilities Section */}
                                  {agent.capabilities && agent.capabilities.length > 0 && (
                                      <div className="detail-section">
                                        <h5>Capabilities</h5>
                                        <div className="capability-tags">
                                          {agent.capabilities.map((cap, idx) => (
                                              <span key={idx} className="capability-tag">
                                  {cap}
                                </span>
                                          ))}
                                        </div>
                                      </div>
                                  )}

                                  {/* Tools Used Section */}
                                  {agent.toolsUsed && agent.toolsUsed.length > 0 && (
                                      <div className="detail-section">
                                        <h5>Tools Used</h5>
                                        <div className="tools-list">
                                          {agent.toolsUsed.map((tool, idx) => (
                                              <span key={idx} className="tool-badge">
                                  {tool.replace(/_/g, ' ')}
                                </span>
                                          ))}
                                        </div>
                                      </div>
                                  )}

                                  {/* Statistics Section */}
                                  <div className="detail-section">
                                    <h5>Statistics</h5>
                                    <div className="stats-grid-improved">
                                      <div className="stat-card">
                                        <span className="stat-number">{formatNumber(realTimeStats.tokens)}</span>
                                        <span className="stat-text">Tokens</span>
                                      </div>
                                      <div className="stat-card">
                                        <span className="stat-number">{realTimeStats.contributions}</span>
                                        <span className="stat-text">Tasks</span>
                                      </div>
                                      <div className="stat-card">
                                        <span className="stat-number">{realTimeStats.toolsCount}</span>
                                        <span className="stat-text">Tools</span>
                                      </div>
                                      <div className="stat-card">
                                        <span className="stat-number">{formatNumber(realTimeStats.characters)}</span>
                                        <span className="stat-text">Chars</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Error Message if any */}
                                  {agent.error && (
                                      <div className="error-message">
                                        ⚠️ {agent.error}
                                      </div>
                                  )}
                                </div>
                            )}
                          </div>
                      );
                    })
                )}
              </div>
          )}
        </div>

        {/* Recent Activity Section */}
        {recentActivities.length > 0 && (
            <div className="panel-section">
              <div
                  className="section-header-fixed"
                  onClick={() => toggleSection('activities')}
              >
                <h4 className="section-title-fixed">
                  {expandedSections.has('activities') ? '▼' : '▶'}
                  {' '}Recent Activity
                </h4>
              </div>

              {expandedSections.has('activities') && (
                  <div className="activity-feed">
                    {recentActivities.map((activity, idx) => {
                      const agentColor = getAgentColor(activity.agentName);
                      const emoji = getAgentEmoji(activity.agentName);

                      return (
                          <div key={idx} className="activity-item">
                            <div
                                className="activity-icon"
                                style={{ backgroundColor: agentColor }}
                            >
                              {emoji}
                            </div>
                            <div className="activity-content">
                              <div className="activity-header">
                        <span className="activity-agent">
                          {activity.agentName.replace(/_/g, ' ')}
                        </span>
                                <span className={`activity-type ${activity.type}`}>
                          {activity.type}
                        </span>
                              </div>
                              <div className="activity-action">{activity.action}</div>
                              <div className="activity-time">
                                {new Date(activity.timestamp).toLocaleTimeString()}
                              </div>
                            </div>
                          </div>
                      );
                    })}
                  </div>
              )}
            </div>
        )}

        {/* Shared Context Section */}
        {Object.keys(sharedContext).length > 0 && (
            <div className="panel-section">
              <div
                  className="section-header-fixed"
                  onClick={() => toggleSection('context')}
              >
                <h4 className="section-title-fixed">
                  {expandedSections.has('context') ? '▼' : '▶'}
                  {' '}Shared Context
                </h4>
              </div>

              {expandedSections.has('context') && (
                  <div className="shared-context">
                    {Object.entries(sharedContext).slice(0, 5).map(([key, value]) => (
                        <div key={key} className="context-item">
                          <span className="context-key">{key}:</span>
                          <span className="context-value">
                    {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                  </span>
                        </div>
                    ))}
                  </div>
              )}
            </div>
        )}
      </div>
  );
};

export default AgentPanel;