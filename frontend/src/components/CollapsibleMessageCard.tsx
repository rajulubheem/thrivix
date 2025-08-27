import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Bot, User, Zap, CheckCircle, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import './CollapsibleMessageCard.css';

interface CollapsibleMessageCardProps {
  message: {
    id: string;
    type: 'user' | 'agent' | 'system' | 'tool_call' | 'planning';
    agent?: string;
    content: string;
    timestamp: Date;
    status?: 'thinking' | 'working' | 'streaming' | 'complete' | 'error';
    metadata?: any;
  };
  isStreaming?: boolean;
  defaultExpanded?: boolean;
}

export const CollapsibleMessageCard: React.FC<CollapsibleMessageCardProps> = ({
  message,
  isStreaming = false,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const getIcon = () => {
    switch (message.type) {
      case 'user':
        return <User size={20} />;
      case 'agent':
        return <Bot size={20} />;
      case 'system':
      case 'planning':
        return <Zap size={20} />;
      case 'tool_call':
        return <Zap size={20} />;
      default:
        return null;
    }
  };

  const getStatusIcon = () => {
    switch (message.status) {
      case 'streaming':
      case 'working':
      case 'thinking':
        return <div className="status-indicator streaming" />;
      case 'complete':
        return <CheckCircle size={16} className="status-icon complete" />;
      case 'error':
        return <AlertCircle size={16} className="status-icon error" />;
      default:
        return null;
    }
  };

  const isCollapsible = message.type === 'system' || message.type === 'planning' || message.type === 'tool_call';

  return (
    <div className={`message-card ${message.type} ${isStreaming ? 'streaming' : ''}`}>
      <div 
        className={`message-card-header ${isCollapsible ? 'collapsible' : ''}`}
        onClick={isCollapsible ? toggleExpanded : undefined}
      >
        <div className="message-card-info">
          <div className="message-icon">
            {getIcon()}
          </div>
          <div className="message-meta">
            <span className="message-author">
              {message.type === 'user' ? 'You' : message.agent || 'System'}
            </span>
            {message.timestamp && (
              <span className="message-time">
                {new Date(message.timestamp).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        
        <div className="message-card-actions">
          {getStatusIcon()}
          {isCollapsible && (
            <button className="collapse-toggle" aria-label="Toggle expand">
              {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
            </button>
          )}
        </div>
      </div>

      <div className={`message-card-body ${!isExpanded ? 'collapsed' : ''}`}>
        {message.type === 'planning' && message.metadata ? (
          <div className="planning-content">
            <div className="planning-task">
              <strong>Task:</strong> {message.metadata.task}
            </div>
            {message.metadata.agents && (
              <div className="planning-agents">
                <strong>Agents Selected:</strong>
                <ul className="agent-list">
                  {message.metadata.agents.map((agent: any, idx: number) => (
                    <li key={idx} className="agent-item">
                      <span className="agent-number">{idx + 1}.</span>
                      <span className="agent-name">{agent.name}</span>
                      {agent.tools && agent.tools.length > 0 && (
                        <span className="agent-tools">
                          Tools: {agent.tools.join(', ')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : message.type === 'tool_call' && message.metadata ? (
          <div className="tool-call-content">
            <div className="tool-info">
              <span className="tool-label">Tool:</span>
              <code className="tool-name">{message.metadata.tool}</code>
            </div>
            {message.metadata.parameters && (
              <div className="tool-params">
                <span className="params-label">Parameters:</span>
                <pre className="params-content">
                  {JSON.stringify(message.metadata.parameters, null, 2)}
                </pre>
              </div>
            )}
            {message.metadata.result && (
              <div className="tool-result">
                <span className="result-label">Result:</span>
                <div className="result-content">
                  {typeof message.metadata.result === 'string' 
                    ? message.metadata.result 
                    : JSON.stringify(message.metadata.result, null, 2)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="message-content">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
};

export default CollapsibleMessageCard;