import React, { useState, memo } from 'react';

interface MessageCardProps {
  message: {
    id: string;
    agent: string;
    content: string;
    timestamp: Date;
    type: 'user' | 'agent' | 'system' | 'tool_result';
    metadata?: any;
  };
  isStreaming?: boolean;
}

const MessageCard: React.FC<MessageCardProps> = memo(({ message, isStreaming }) => {
  const [expanded, setExpanded] = useState(true);
  
  const getAvatarIcon = (type: string, agent: string) => {
    if (type === 'user') return '👤';
    if (type === 'system') return '⚙️';
    if (agent.includes('architect')) return '🏗️';
    if (agent.includes('developer')) return '💻';
    if (agent.includes('researcher')) return '🔍';
    if (agent.includes('analyst')) return '📊';
    if (agent.includes('reviewer')) return '✅';
    return '🤖';
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatContent = (content: string) => {
    // Handle code blocks
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: content.slice(lastIndex, match.index)
        });
      }

      // Add code block
      parts.push({
        type: 'code',
        language: match[1] || 'plaintext',
        content: match[2]
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex)
      });
    }

    return parts.length > 0 ? parts : [{ type: 'text', content }];
  };

  const contentParts = formatContent(message.content);

  return (
    <div className="message-group">
      <div className="message-card">
        <div 
          className={`message-header ${expanded ? 'expanded' : ''}`}
          onClick={() => setExpanded(!expanded)}
        >
          <div className="message-agent-info">
            <div className={`agent-avatar ${message.type}`}>
              {getAvatarIcon(message.type, message.agent)}
            </div>
            <div className="agent-details">
              <div className="agent-name">{message.agent}</div>
              <div className="agent-timestamp">{formatTime(message.timestamp)}</div>
            </div>
          </div>
          
          <div className="message-meta">
            {isStreaming && (
              <div className="streaming-indicator">
                <div className="streaming-dots">
                  <span className="streaming-dot"></span>
                  <span className="streaming-dot"></span>
                  <span className="streaming-dot"></span>
                </div>
                Streaming
              </div>
            )}
            
            {message.metadata?.tokens && (
              <div className="message-badge">
                {message.metadata.tokens} tokens
              </div>
            )}
            
            <svg 
              className="expand-icon" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {expanded && (
          <div className="message-content">
            {contentParts.map((part, index) => {
              if (part.type === 'code') {
                return (
                  <pre key={index}>
                    <code className={`language-${part.language}`}>
                      {part.content}
                    </code>
                  </pre>
                );
              }
              
              return (
                <div key={index} style={{ whiteSpace: 'pre-wrap' }}>
                  {part.content}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

MessageCard.displayName = 'MessageCard';

export default MessageCard;