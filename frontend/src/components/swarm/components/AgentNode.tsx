import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NodeData } from '../types/FlowTypes';

// Custom Agent Node with enhanced visuals
const AgentNode: React.FC<NodeProps<NodeData>> = ({ data, selected }) => {
  const getStatusColor = () => {
    switch (data.status) {
      case 'running': return '#facc15';
      case 'completed': return '#22c55e';
      case 'failed': return '#ef4444';
      default: return '#71717a';
    }
  };

  const getProgressPercentage = () => {
    if (!data.progress) return 0;
    return Math.round(data.progress * 100);
  };

  return (
    <div 
      className={`agent-node ${data.status} ${selected ? 'selected' : ''}`} 
      title={data.description || ''}
      role="button"
      aria-label={`Agent: ${data.name}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#555' }}
      />
      
      <div className="node-header">
        <div className="node-avatar">
          {data.status === 'running' && data.progress !== undefined && (
            <svg className="progress-ring" width="24" height="24">
              <circle
                className="progress-ring-bg"
                cx="12"
                cy="12"
                r="10"
                strokeWidth="2"
                stroke="rgba(255,255,255,0.1)"
                fill="none"
              />
              <circle
                className="progress-ring-fill"
                cx="12"
                cy="12"
                r="10"
                strokeWidth="2"
                stroke={getStatusColor()}
                fill="none"
                strokeDasharray={`${2 * Math.PI * 10}`}
                strokeDashoffset={`${2 * Math.PI * 10 * (1 - (data.progress || 0))}`}
                transform="rotate(-90 12 12)"
                style={{
                  transition: 'stroke-dashoffset 0.3s ease'
                }}
              />
            </svg>
          )}
          {data.status !== 'running' && (
            <div className="node-status" style={{ background: getStatusColor() }} />
          )}
        </div>
        
        <div className="node-info">
          <span className="node-title">{data.label || data.name}</span>
          {data.agentRole && (
            <span className="node-role">{data.agentRole}</span>
          )}
        </div>
        
        {data.nodeType && (
          <span className="node-badge">{String(data.nodeType)}</span>
        )}
      </div>
      
      <div className="node-body">
        {data.description && (
          <div className="node-description">
            {data.description}
          </div>
        )}
        
        {/* Tool chips with distinction between planned and used */}
        {data.toolsPlanned && data.toolsPlanned.length > 0 && (
          <div className="node-tools planned">
            <span className="tools-label">Planned:</span>
            <div className="tools-chips">
              {data.toolsPlanned.slice(0, 3).map((tool) => (
                <span key={tool} className="tool-chip planned" title={`Planned: ${tool}`}>
                  {tool}
                </span>
              ))}
              {data.toolsPlanned.length > 3 && (
                <span className="tool-more">+{data.toolsPlanned.length - 3}</span>
              )}
            </div>
          </div>
        )}
        
        {data.toolsUsed && data.toolsUsed.length > 0 && (
          <div className="node-tools used">
            <span className="tools-label">Used:</span>
            <div className="tools-chips">
              {data.toolsUsed.slice(0, 3).map((tool) => (
                <span key={tool} className="tool-chip used" title={tool}>
                  ✓ {tool}
                </span>
              ))}
              {data.toolsUsed.length > 3 && (
                <span className="tool-more">+{data.toolsUsed.length - 3}</span>
              )}
            </div>
          </div>
        )}
        
        {/* Metrics display */}
        <div className="node-metrics">
          {data.status === 'running' && data.progress !== undefined && (
            <span className="metric-item progress">
              {getProgressPercentage()}%
            </span>
          )}
          {data.duration && (
            <span className="metric-item duration">
              {(data.duration / 1000).toFixed(1)}s
            </span>
          )}
          {data.tokenCount && (
            <span className="metric-item tokens" title="Tokens">
              {data.tokenCount} tok
            </span>
          )}
        </div>
        
        {/* Progress bar for running state */}
        {data.status === 'running' && !data.progress && (
          <div className="node-progress">
            <div className="progress-bar" />
          </div>
        )}
      </div>
      
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#555' }}
      />
    </div>
  );
};

export default AgentNode;