import React, { useState, useEffect } from 'react';
import './NeuralThinkingSimple.css';

interface Thought {
  agent: string;
  type: string;
  content: string;
  confidence: number;
}

interface ConsensusItem {
  topic: string;
  confidence: number;
  agent_count?: number;
}

interface NeuralThinkingSimpleProps {
  thoughts: Thought[];
  consensusItems: ConsensusItem[];
  isThinking: boolean;
  agents: Map<string, any>;
  task: string;
}

const NeuralThinkingSimple: React.FC<NeuralThinkingSimpleProps> = ({
  thoughts,
  consensusItems,
  isThinking,
  task
}) => {
  const [filter, setFilter] = useState<string>('all');
  
  // Group thoughts by agent
  const thoughtsByAgent = thoughts.reduce((acc, thought) => {
    const agentType = thought.agent.split(' ')[0].toLowerCase();
    if (!acc[agentType]) acc[agentType] = [];
    acc[agentType].push(thought);
    return acc;
  }, {} as Record<string, Thought[]>);
  
  // Filter thoughts
  const filteredThoughts = filter === 'all' 
    ? thoughts 
    : thoughts.filter(t => t.type === filter);
  
  // Get unique thought types
  const thoughtTypes = Array.from(new Set(thoughts.map(t => t.type)));
  
  return (
    <div className="neural-simple">
      {/* Clean Header */}
      <div className="neural-header-clean">
        <div className="header-left">
          <h2>Neural AI Thinking</h2>
          <p>{task}</p>
        </div>
        <div className="header-stats">
          <div className="stat-pill">
            <span className="stat-number">{thoughts.length}</span>
            <span className="stat-label">thoughts</span>
          </div>
          <div className="stat-pill">
            <span className="stat-number">{Object.keys(thoughtsByAgent).length}</span>
            <span className="stat-label">agents</span>
          </div>
          <div className="stat-pill consensus">
            <span className="stat-number">{consensusItems.length}</span>
            <span className="stat-label">consensus</span>
          </div>
          {isThinking && <div className="thinking-pulse">Thinking...</div>}
        </div>
      </div>
      
      {/* Filter Bar */}
      <div className="filter-bar">
        <button 
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          All ({thoughts.length})
        </button>
        {thoughtTypes.map(type => (
          <button
            key={type}
            className={filter === type ? 'active' : ''}
            onClick={() => setFilter(type)}
          >
            {type} ({thoughts.filter(t => t.type === type).length})
          </button>
        ))}
      </div>
      
      {/* Main Content Area */}
      <div className="neural-content">
        {/* Left: Agent Summary */}
        <div className="agents-sidebar">
          <h3>Active Agents</h3>
          {Object.entries(thoughtsByAgent).map(([agent, agentThoughts]) => (
            <div key={agent} className={`agent-summary ${agent}`}>
              <div className="agent-header">
                <span className="agent-type">{agent}</span>
                <span className="agent-count">{agentThoughts.length}</span>
              </div>
              <div className="agent-bar">
                <div 
                  className="agent-progress" 
                  style={{width: `${(agentThoughts.length / thoughts.length) * 100}%`}}
                />
              </div>
            </div>
          ))}
        </div>
        
        {/* Center: Thought Stream */}
        <div className="thought-stream">
          <div className="stream-header">
            <h3>Thought Process</h3>
            <span className="stream-count">Showing {filteredThoughts.length} thoughts</span>
          </div>
          
          <div className="thoughts-container">
            {filteredThoughts.map((thought, index) => (
              <div key={index} className={`thought-card ${thought.type}`}>
                <div className="thought-top">
                  <span className="thought-agent">{thought.agent}</span>
                  <span className={`thought-badge ${thought.type}`}>
                    {thought.type}
                  </span>
                  <span className="thought-confidence">
                    {Math.round(thought.confidence * 100)}%
                  </span>
                </div>
                <div className="thought-text">
                  {thought.content}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Right: Key Insights */}
        <div className="insights-sidebar">
          <h3>Key Insights</h3>
          
          {/* High confidence thoughts */}
          <div className="insight-section">
            <h4>High Confidence</h4>
            {thoughts
              .filter(t => t.confidence > 0.8)
              .slice(0, 3)
              .map((thought, i) => (
                <div key={i} className="insight-item">
                  <div className="insight-score">{Math.round(thought.confidence * 100)}%</div>
                  <div className="insight-text">
                    {thought.content.substring(0, 100)}...
                  </div>
                </div>
              ))}
          </div>
          
          {/* Consensus */}
          {consensusItems.length > 0 && (
            <div className="insight-section consensus-section">
              <h4>Consensus Reached</h4>
              {consensusItems.map((item, i) => (
                <div key={i} className="consensus-card">
                  <div className="consensus-level">
                    {Math.round(item.confidence * 100)}% agree
                  </div>
                  <div className="consensus-text">{item.topic}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NeuralThinkingSimple;