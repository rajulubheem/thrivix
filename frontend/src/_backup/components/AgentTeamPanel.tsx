import React from 'react';
import './AgentTeamPanel.css';

interface Agent {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  status: 'idle' | 'working' | 'complete';
  contributions: number;
  lastActivity?: string;
}

interface AgentTeamPanelProps {
  agents: Agent[];
  currentAgent?: string;
  sharedKnowledge?: Record<string, any>;
}

const AgentTeamPanel: React.FC<AgentTeamPanelProps> = ({ 
  agents, 
  currentAgent,
  sharedKnowledge 
}) => {
  const getAgentEmoji = (name: string): string => {
    const emojis: Record<string, string> = {
      researcher: '🔬',
      architect: '🏗️',
      coder: '💻',
      developer: '💻',
      reviewer: '✅',
      analyst: '📊',
      designer: '🎨',
      tester: '🧪',
      documenter: '📝',
      security: '🔒',
      devops: '🚀',
      database: '🗄️',
      api: '🔌',
      frontend: '🎨',
      backend: '⚙️',
      default: '🤖'
    };
    
    const key = name.toLowerCase().split('_')[0];
    return emojis[key] || emojis.default;
  };

  const getAgentColor = (name: string): string => {
    const colors: Record<string, string> = {
      researcher: '#6366f1',
      architect: '#8b5cf6',
      coder: '#10b981',
      developer: '#10b981',
      reviewer: '#f59e0b',
      analyst: '#06b6d4',
      designer: '#ec4899',
      tester: '#ef4444',
      documenter: '#84cc16',
      security: '#f43f5e',
      devops: '#a855f7',
      database: '#0ea5e9',
      api: '#14b8a6',
      frontend: '#f97316',
      backend: '#6366f1',
      default: '#6b7280'
    };
    
    const key = name.toLowerCase().split('_')[0];
    return colors[key] || colors.default;
  };

  return (
    <div className="agent-team-panel">
      <div className="panel-header">
        <h3>🤝 Agent Team Composition</h3>
        <span className="agent-count">{agents.length} agents</span>
      </div>

      <div className="agents-grid">
        {agents.map(agent => {
          const isActive = agent.name === currentAgent;
          const color = getAgentColor(agent.name);
          const emoji = getAgentEmoji(agent.name);

          return (
            <div 
              key={agent.id}
              className={`agent-card ${agent.status} ${isActive ? 'active' : ''}`}
              style={{ borderColor: isActive ? color : undefined }}
            >
              <div className="agent-header">
                <div className="agent-identity">
                  <span className="agent-emoji">{emoji}</span>
                  <span className="agent-name" style={{ color }}>
                    {agent.name}
                  </span>
                </div>
                <div className={`status-indicator ${agent.status}`}>
                  {agent.status === 'working' && '●'}
                  {agent.status === 'complete' && '✓'}
                  {agent.status === 'idle' && '○'}
                </div>
              </div>

              <div className="agent-description">
                {agent.description}
              </div>

              {agent.capabilities && agent.capabilities.length > 0 && (
                <div className="agent-capabilities">
                  {agent.capabilities.map((cap, idx) => (
                    <span key={idx} className="capability-badge">
                      {cap}
                    </span>
                  ))}
                </div>
              )}

              <div className="agent-stats">
                <div className="stat">
                  <span className="stat-label">Contributions</span>
                  <span className="stat-value">{agent.contributions}</span>
                </div>
                {agent.lastActivity && (
                  <div className="stat">
                    <span className="stat-label">Last Activity</span>
                    <span className="stat-value">{agent.lastActivity}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {sharedKnowledge && Object.keys(sharedKnowledge).length > 0 && (
        <div className="shared-knowledge-section">
          <h4>📋 Shared Knowledge Base</h4>
          <div className="knowledge-items">
            {Object.entries(sharedKnowledge).map(([agent, knowledge], idx) => (
              <div key={idx} className="knowledge-item">
                <div className="knowledge-agent">
                  {getAgentEmoji(agent)} {agent}
                </div>
                <div className="knowledge-content">
                  {typeof knowledge === 'string' 
                    ? knowledge 
                    : JSON.stringify(knowledge, null, 2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentTeamPanel;