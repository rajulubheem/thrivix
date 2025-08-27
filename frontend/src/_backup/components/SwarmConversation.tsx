import React, { useState, useEffect } from 'react';
import './SwarmConversation.css';

interface ConversationItem {
  id: string;
  type: 'user' | 'agent' | 'handoff' | 'system';
  agent?: string;
  content: string;
  timestamp: Date;
  metadata?: {
    fromAgent?: string;
    toAgent?: string;
    reason?: string;
    sharedKnowledge?: Record<string, any>;
    availableAgents?: Array<{name: string; description: string}>;
    toolsUsed?: string[];
  };
}

interface SwarmConversationProps {
  items: ConversationItem[];
  isStreaming?: boolean;
}

const SwarmConversation: React.FC<SwarmConversationProps> = ({ items, isStreaming }) => {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getAgentColor = (agent?: string): string => {
    const colors: Record<string, string> = {
      researcher: '#6366f1',
      architect: '#8b5cf6',
      coder: '#10b981',
      reviewer: '#f59e0b',
      analyst: '#06b6d4',
      designer: '#ec4899',
      tester: '#ef4444',
      default: '#6b7280'
    };
    return colors[agent?.toLowerCase() || 'default'] || colors.default;
  };

  const getAgentEmoji = (agent?: string): string => {
    const emojis: Record<string, string> = {
      researcher: '🔬',
      architect: '🏗️',
      coder: '💻',
      reviewer: '✅',
      analyst: '📊',
      designer: '🎨',
      tester: '🧪',
      default: '🤖'
    };
    return emojis[agent?.toLowerCase() || 'default'] || emojis.default;
  };

  return (
    <div className="swarm-conversation">
      {items.map((item, index) => {
        const isExpanded = expandedItems.has(item.id);
        
        if (item.type === 'user') {
          return (
            <div key={item.id} className="conversation-item user">
              <div className="message-header">
                <span className="user-label">You</span>
                <span className="timestamp">{item.timestamp.toLocaleTimeString()}</span>
              </div>
              <div className="message-content">{item.content}</div>
            </div>
          );
        }

        if (item.type === 'handoff') {
          return (
            <div key={item.id} className="conversation-item handoff">
              <div className="handoff-arrow">
                <span className="from-agent">
                  {getAgentEmoji(item.metadata?.fromAgent)} {item.metadata?.fromAgent}
                </span>
                <span className="arrow">→</span>
                <span className="to-agent">
                  {getAgentEmoji(item.metadata?.toAgent)} {item.metadata?.toAgent}
                </span>
              </div>
              {item.metadata?.reason && (
                <div className="handoff-reason">
                  <span className="reason-label">Reason:</span> {item.metadata.reason}
                </div>
              )}
              {item.metadata?.sharedKnowledge && (
                <div 
                  className="shared-knowledge"
                  onClick={() => toggleExpand(item.id)}
                >
                  <div className="knowledge-header">
                    <span>📋 Shared Knowledge</span>
                    <span className="toggle">{isExpanded ? '▼' : '▶'}</span>
                  </div>
                  {isExpanded && (
                    <pre className="knowledge-content">
                      {JSON.stringify(item.metadata.sharedKnowledge, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        }

        if (item.type === 'agent') {
          const agentColor = getAgentColor(item.agent);
          const agentEmoji = getAgentEmoji(item.agent);
          
          return (
            <div 
              key={item.id} 
              className="conversation-item agent"
              style={{ borderLeftColor: agentColor }}
            >
              <div className="message-header">
                <div className="agent-info">
                  <span className="agent-emoji">{agentEmoji}</span>
                  <span className="agent-name" style={{ color: agentColor }}>
                    {item.agent}
                  </span>
                  {item.metadata?.toolsUsed && item.metadata.toolsUsed.length > 0 && (
                    <div className="tools-used">
                      {item.metadata.toolsUsed.map((tool, idx) => (
                        <span key={idx} className="tool-badge">
                          🔧 {tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="timestamp">{item.timestamp.toLocaleTimeString()}</span>
              </div>
              <div className="message-content">
                {item.content}
                {isStreaming && index === items.length - 1 && (
                  <span className="cursor">▊</span>
                )}
              </div>
              {item.metadata?.availableAgents && (
                <div 
                  className="available-agents"
                  onClick={() => toggleExpand(item.id)}
                >
                  <div className="agents-header">
                    <span>👥 Available Collaborators</span>
                    <span className="toggle">{isExpanded ? '▼' : '▶'}</span>
                  </div>
                  {isExpanded && (
                    <div className="agents-list">
                      {item.metadata.availableAgents.map((agent, idx) => (
                        <div key={idx} className="available-agent">
                          <span className="agent-name">{agent.name}</span>
                          <span className="agent-desc">{agent.description}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        }

        if (item.type === 'system') {
          return (
            <div key={item.id} className="conversation-item system">
              <div className="system-message">
                ℹ️ {item.content}
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};

export default SwarmConversation;