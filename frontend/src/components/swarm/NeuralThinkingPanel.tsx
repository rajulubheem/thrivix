import React, { useState, useEffect } from 'react';
import './NeuralThinkingPanel.css';

interface Thought {
  id: string;
  agent: string;
  type: string;
  content: string;
  confidence: number;
  timestamp: number;
  references?: string[];
}

interface ConsensusItem {
  topic: string;
  confidence: number;
  thoughts: any[];
  agent_count: number;
}

interface NeuralThinkingPanelProps {
  thoughts: Thought[];
  consensusItems: ConsensusItem[];
  isThinking: boolean;
  agents: Map<string, any>;
}

const thoughtTypeIcons: Record<string, string> = {
  observation: '👁️',
  hypothesis: '💡',
  question: '❓',
  insight: '✨',
  concern: '⚠️',
  suggestion: '💬',
  reflection: '🪞',
  consensus: '🎯'
};

const thoughtTypeColors: Record<string, string> = {
  observation: '#3b82f6',
  hypothesis: '#8b5cf6',
  question: '#f59e0b',
  insight: '#10b981',
  concern: '#ef4444',
  suggestion: '#06b6d4',
  reflection: '#6366f1',
  consensus: '#22c55e'
};

const NeuralThinkingPanel: React.FC<NeuralThinkingPanelProps> = ({
  thoughts,
  consensusItems,
  isThinking,
  agents
}) => {
  const [selectedThought, setSelectedThought] = useState<Thought | null>(null);
  const [thoughtStats, setThoughtStats] = useState<Record<string, number>>({});
  const [activeAgents, setActiveAgents] = useState<Set<string>>(new Set());
  
  // Calculate thought statistics
  useEffect(() => {
    const stats: Record<string, number> = {};
    const agentSet = new Set<string>();
    
    thoughts.forEach(thought => {
      stats[thought.type] = (stats[thought.type] || 0) + 1;
      agentSet.add(thought.agent);
    });
    
    setThoughtStats(stats);
    setActiveAgents(agentSet);
  }, [thoughts]);
  
  // Get agent personality
  const getAgentPersonality = (agentName: string): string => {
    if (agentName.includes('Analytical')) return 'analytical';
    if (agentName.includes('Creative')) return 'creative';
    if (agentName.includes('Critical')) return 'critical';
    if (agentName.includes('Integrative')) return 'integrative';
    if (agentName.includes('Practical')) return 'practical';
    return 'unknown';
  };
  
  // Get recent thoughts (last 5)
  const recentThoughts = thoughts.slice(-5).reverse();
  
  return (
    <div className="neural-thinking-panel">
      {/* Header */}
      <div className="neural-header">
        <h2>🧠 Neural Thinking Network</h2>
        {isThinking && (
          <div className="thinking-indicator">
            <span className="pulse"></span>
            <span>Agents are thinking...</span>
          </div>
        )}
      </div>
      
      {/* Agent Network Visualization */}
      <div className="agent-network">
        <div className="network-title">Active Neural Agents</div>
        <div className="agent-nodes">
          {Array.from(activeAgents).map(agentName => (
            <div 
              key={agentName}
              className={`agent-node ${getAgentPersonality(agentName)}`}
              title={agentName}
            >
              <div className="agent-avatar">
                {agentName.charAt(0)}
              </div>
              <div className="agent-name">{agentName.split(' ')[0]}</div>
              <div className="thought-count">
                {thoughts.filter(t => t.agent === agentName).length} thoughts
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Thinking Process Phases */}
      <div className="thinking-phases">
        <div className="phase-title">Thinking Process</div>
        <div className="phase-timeline">
          <div className={`phase ${thoughts.length > 0 ? 'active' : ''}`}>
            <span className="phase-icon">🌱</span>
            <span className="phase-label">Initialization</span>
          </div>
          <div className={`phase ${thoughts.length > 5 ? 'active' : ''}`}>
            <span className="phase-icon">💭</span>
            <span className="phase-label">Exploration</span>
          </div>
          <div className={`phase ${thoughts.length > 15 ? 'active' : ''}`}>
            <span className="phase-icon">🔄</span>
            <span className="phase-label">Collaboration</span>
          </div>
          <div className={`phase ${consensusItems.length > 0 ? 'active' : ''}`}>
            <span className="phase-icon">🎯</span>
            <span className="phase-label">Consensus</span>
          </div>
        </div>
      </div>
      
      {/* Thought Type Distribution */}
      <div className="thought-distribution">
        <div className="distribution-title">Thought Distribution</div>
        <div className="thought-types">
          {Object.entries(thoughtStats).map(([type, count]) => (
            <div key={type} className="thought-type-card">
              <div 
                className="type-icon" 
                style={{ backgroundColor: thoughtTypeColors[type] + '20', color: thoughtTypeColors[type] }}
              >
                {thoughtTypeIcons[type]}
              </div>
              <div className="type-name">{type}</div>
              <div className="type-count">{count}</div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Recent Thoughts Stream */}
      <div className="thoughts-stream">
        <div className="stream-title">Recent Thoughts</div>
        <div className="thoughts-list">
          {recentThoughts.map((thought, index) => (
            <div 
              key={`${thought.agent}-${index}`}
              className="thought-card"
              onClick={() => setSelectedThought(thought)}
              style={{ borderLeft: `3px solid ${thoughtTypeColors[thought.type]}` }}
            >
              <div className="thought-header">
                <span className="thought-icon">{thoughtTypeIcons[thought.type]}</span>
                <span className="thought-agent">{thought.agent}</span>
                <span className="thought-confidence">
                  {(thought.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="thought-content">
                {thought.content.length > 150 
                  ? thought.content.substring(0, 150) + '...' 
                  : thought.content}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Consensus Panel */}
      {consensusItems.length > 0 && (
        <div className="consensus-panel">
          <div className="consensus-title">
            🎯 Consensus Reached
          </div>
          <div className="consensus-items">
            {consensusItems.map((item, index) => (
              <div key={index} className="consensus-card">
                <div className="consensus-confidence">
                  {(item.confidence * 100).toFixed(0)}%
                </div>
                <div className="consensus-content">
                  <div className="consensus-topic">{item.topic}</div>
                  <div className="consensus-agents">
                    {item.agent_count} agents agree
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Selected Thought Detail */}
      {selectedThought && (
        <div className="thought-detail-overlay" onClick={() => setSelectedThought(null)}>
          <div className="thought-detail" onClick={e => e.stopPropagation()}>
            <div className="detail-header">
              <span className="detail-icon">{thoughtTypeIcons[selectedThought.type]}</span>
              <span className="detail-type">{selectedThought.type.toUpperCase()}</span>
              <button className="close-btn" onClick={() => setSelectedThought(null)}>×</button>
            </div>
            <div className="detail-agent">
              {selectedThought.agent}
            </div>
            <div className="detail-content">
              {selectedThought.content}
            </div>
            <div className="detail-confidence">
              Confidence: {(selectedThought.confidence * 100).toFixed(0)}%
            </div>
            {selectedThought.references && selectedThought.references.length > 0 && (
              <div className="detail-references">
                References: {selectedThought.references.join(', ')}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Summary Statistics */}
      <div className="thinking-stats">
        <div className="stat">
          <span className="stat-value">{thoughts.length}</span>
          <span className="stat-label">Total Thoughts</span>
        </div>
        <div className="stat">
          <span className="stat-value">{activeAgents.size}</span>
          <span className="stat-label">Active Agents</span>
        </div>
        <div className="stat">
          <span className="stat-value">{Object.keys(thoughtStats).length}</span>
          <span className="stat-label">Thought Types</span>
        </div>
        <div className="stat">
          <span className="stat-value">{consensusItems.length}</span>
          <span className="stat-label">Consensus Topics</span>
        </div>
      </div>
    </div>
  );
};

export default NeuralThinkingPanel;