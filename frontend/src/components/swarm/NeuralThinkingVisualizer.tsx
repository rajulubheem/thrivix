import React, { useState, useEffect, useRef } from 'react';
import './NeuralThinkingVisualizer.css';

interface Thought {
  id: string;
  agent: string;
  type: string;
  content: string;
  confidence: number;
  timestamp: number;
}

interface NeuralThinkingVisualizerProps {
  thoughts: Thought[];
  consensusItems: any[];
  isThinking: boolean;
  agents: Map<string, any>;
  task: string;
}

const NeuralThinkingVisualizer: React.FC<NeuralThinkingVisualizerProps> = ({
  thoughts,
  consensusItems,
  isThinking,
  agents,
  task
}) => {
  const [selectedView, setSelectedView] = useState<'overview' | 'timeline' | 'insights'>('overview');
  const [expandedThought, setExpandedThought] = useState<string | null>(null);
  
  // Group thoughts by type for analysis
  const thoughtsByType = thoughts.reduce((acc, thought) => {
    if (!acc[thought.type]) acc[thought.type] = [];
    acc[thought.type].push(thought);
    return acc;
  }, {} as Record<string, Thought[]>);
  
  // Get key insights (high confidence thoughts)
  const keyInsights = thoughts
    .filter(t => t.confidence > 0.8)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
  
  // Calculate thinking progress
  const thinkingProgress = Math.min(100, (thoughts.length / 30) * 100);
  
  return (
    <div className="neural-visualizer">
      {/* Header with Clear Explanation */}
      <div className="visualizer-header">
        <div className="header-content">
          <h1>Neural Thinking System</h1>
          <p className="system-explanation">
            5 AI agents with different personalities are collaborating to solve your problem.
            They share thoughts, build on each other's ideas, and reach consensus.
          </p>
        </div>
        
        {task && (
          <div className="current-task">
            <span className="task-label">Current Task:</span>
            <span className="task-text">{task}</span>
          </div>
        )}
      </div>
      
      {/* Status Bar */}
      <div className="thinking-status">
        <div className="status-grid">
          <div className="status-item">
            <span className="status-icon">🧠</span>
            <div className="status-info">
              <div className="status-value">{agents.size}</div>
              <div className="status-label">AI Agents</div>
            </div>
          </div>
          
          <div className="status-item">
            <span className="status-icon">💭</span>
            <div className="status-info">
              <div className="status-value">{thoughts.length}</div>
              <div className="status-label">Thoughts Generated</div>
            </div>
          </div>
          
          <div className="status-item">
            <span className="status-icon">🎯</span>
            <div className="status-info">
              <div className="status-value">{consensusItems.length}</div>
              <div className="status-label">Consensus Points</div>
            </div>
          </div>
          
          <div className="status-item">
            <span className="status-icon">📊</span>
            <div className="status-info">
              <div className="status-value">{thinkingProgress.toFixed(0)}%</div>
              <div className="status-label">Progress</div>
            </div>
          </div>
        </div>
        
        {isThinking && (
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${thinkingProgress}%` }} />
            <span className="progress-text">Agents are thinking collaboratively...</span>
          </div>
        )}
      </div>
      
      {/* View Selector */}
      <div className="view-selector">
        <button 
          className={selectedView === 'overview' ? 'active' : ''}
          onClick={() => setSelectedView('overview')}
        >
          <span className="view-icon">🏠</span>
          Overview
        </button>
        <button 
          className={selectedView === 'timeline' ? 'active' : ''}
          onClick={() => setSelectedView('timeline')}
        >
          <span className="view-icon">📜</span>
          Thought Timeline
        </button>
        <button 
          className={selectedView === 'insights' ? 'active' : ''}
          onClick={() => setSelectedView('insights')}
        >
          <span className="view-icon">💡</span>
          Key Insights
        </button>
      </div>
      
      {/* Main Content Area */}
      <div className="visualizer-content">
        {selectedView === 'overview' && (
          <div className="overview-view">
            {/* Agent Personalities */}
            <section className="agents-section">
              <h2>AI Agent Team</h2>
              <p className="section-description">
                Each agent has a unique thinking style that contributes to the solution
              </p>
              <div className="agents-grid">
                <div className="agent-card analytical">
                  <div className="agent-emoji">🔍</div>
                  <h3>Analytical Agent</h3>
                  <p>Breaks down problems systematically</p>
                  <div className="agent-stats">
                    {thoughts.filter(t => t.agent.includes('Analytical')).length} thoughts
                  </div>
                </div>
                
                <div className="agent-card creative">
                  <div className="agent-emoji">🎨</div>
                  <h3>Creative Agent</h3>
                  <p>Finds innovative solutions</p>
                  <div className="agent-stats">
                    {thoughts.filter(t => t.agent.includes('Creative')).length} thoughts
                  </div>
                </div>
                
                <div className="agent-card critical">
                  <div className="agent-emoji">🔎</div>
                  <h3>Critical Agent</h3>
                  <p>Identifies risks and issues</p>
                  <div className="agent-stats">
                    {thoughts.filter(t => t.agent.includes('Critical')).length} thoughts
                  </div>
                </div>
                
                <div className="agent-card integrative">
                  <div className="agent-emoji">🔗</div>
                  <h3>Integrative Agent</h3>
                  <p>Connects ideas together</p>
                  <div className="agent-stats">
                    {thoughts.filter(t => t.agent.includes('Integrative')).length} thoughts
                  </div>
                </div>
                
                <div className="agent-card practical">
                  <div className="agent-emoji">⚙️</div>
                  <h3>Practical Agent</h3>
                  <p>Focuses on implementation</p>
                  <div className="agent-stats">
                    {thoughts.filter(t => t.agent.includes('Practical')).length} thoughts
                  </div>
                </div>
              </div>
            </section>
            
            {/* How It Works */}
            <section className="how-it-works">
              <h2>How Neural Thinking Works</h2>
              <div className="process-steps">
                <div className="process-step">
                  <div className="step-number">1</div>
                  <h3>Initialization</h3>
                  <p>Agents analyze your task and prepare their unique perspectives</p>
                </div>
                <div className="process-arrow">→</div>
                <div className="process-step">
                  <div className="step-number">2</div>
                  <h3>Exploration</h3>
                  <p>Each agent generates initial thoughts based on their expertise</p>
                </div>
                <div className="process-arrow">→</div>
                <div className="process-step">
                  <div className="step-number">3</div>
                  <h3>Collaboration</h3>
                  <p>Agents read each other's thoughts and build upon them</p>
                </div>
                <div className="process-arrow">→</div>
                <div className="process-step">
                  <div className="step-number">4</div>
                  <h3>Consensus</h3>
                  <p>Common themes emerge and agents agree on key solutions</p>
                </div>
              </div>
            </section>
            
            {/* Current Thinking Summary */}
            {thoughts.length > 0 && (
              <section className="thinking-summary">
                <h2>Thinking Summary</h2>
                <div className="summary-grid">
                  <div className="summary-card">
                    <h3>💬 Suggestions</h3>
                    <div className="summary-count">{thoughtsByType['suggestion']?.length || 0}</div>
                    <p>Actionable recommendations</p>
                  </div>
                  
                  <div className="summary-card">
                    <h3>✨ Insights</h3>
                    <div className="summary-count">{thoughtsByType['insight']?.length || 0}</div>
                    <p>Key discoveries</p>
                  </div>
                  
                  <div className="summary-card">
                    <h3>⚠️ Concerns</h3>
                    <div className="summary-count">{thoughtsByType['concern']?.length || 0}</div>
                    <p>Risks identified</p>
                  </div>
                  
                  <div className="summary-card">
                    <h3>👁️ Observations</h3>
                    <div className="summary-count">{thoughtsByType['observation']?.length || 0}</div>
                    <p>Important patterns</p>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
        
        {selectedView === 'timeline' && (
          <div className="timeline-view">
            <h2>Thought Evolution Timeline</h2>
            <p className="section-description">
              See how ideas develop as agents collaborate
            </p>
            
            <div className="thoughts-timeline">
              {thoughts.slice(-10).reverse().map(thought => (
                <div 
                  key={thought.id} 
                  className={`timeline-thought ${expandedThought === thought.id ? 'expanded' : ''}`}
                  onClick={() => setExpandedThought(expandedThought === thought.id ? null : thought.id)}
                >
                  <div className="thought-time">
                    {new Date(thought.timestamp).toLocaleTimeString()}
                  </div>
                  
                  <div className="thought-bubble">
                    <div className="thought-header">
                      <span className="thought-agent">{thought.agent}</span>
                      <span className="thought-type">{thought.type}</span>
                      <span className="thought-confidence">
                        {(thought.confidence * 100).toFixed(0)}% confident
                      </span>
                    </div>
                    
                    <div className="thought-text">
                      {expandedThought === thought.id 
                        ? thought.content 
                        : thought.content.substring(0, 150) + '...'}
                    </div>
                    
                    <div className="thought-action">
                      {expandedThought === thought.id ? 'Click to collapse' : 'Click to expand'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {selectedView === 'insights' && (
          <div className="insights-view">
            <h2>Key Insights & Consensus</h2>
            <p className="section-description">
              The most important findings from the collaborative thinking process
            </p>
            
            {keyInsights.length > 0 && (
              <div className="insights-list">
                <h3>🌟 High-Confidence Insights</h3>
                {keyInsights.map((insight, index) => (
                  <div key={insight.id} className="insight-card">
                    <div className="insight-rank">#{index + 1}</div>
                    <div className="insight-content">
                      <div className="insight-header">
                        <span className="insight-agent">{insight.agent}</span>
                        <span className="insight-confidence">
                          {(insight.confidence * 100).toFixed(0)}% confidence
                        </span>
                      </div>
                      <p className="insight-text">{insight.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {consensusItems.length > 0 && (
              <div className="consensus-section">
                <h3>🎯 Consensus Reached</h3>
                <p className="consensus-description">
                  Multiple agents agree on these points:
                </p>
                {consensusItems.map((item, index) => (
                  <div key={index} className="consensus-item">
                    <div className="consensus-header">
                      <span className="consensus-confidence">
                        {(item.confidence * 100).toFixed(0)}% agreement
                      </span>
                      <span className="consensus-agents">
                        {item.agent_count} agents agree
                      </span>
                    </div>
                    <p className="consensus-topic">{item.topic}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Final Solution (when complete) */}
      {!isThinking && thoughts.length > 20 && (
        <div className="final-solution">
          <h2>💡 Solution Summary</h2>
          <div className="solution-content">
            <p>
              After {thoughts.length} thoughts from {agents.size} AI agents, 
              the system has identified {consensusItems.length} key consensus points 
              and {keyInsights.length} high-confidence insights to solve your problem.
            </p>
            <button className="view-details-btn" onClick={() => setSelectedView('insights')}>
              View Detailed Insights →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NeuralThinkingVisualizer;