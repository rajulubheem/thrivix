import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const AgentNode: React.FC<NodeProps> = ({ data, selected }) => {
  const isDark = data.isDarkMode === true;

  const getStatusColor = () => {
    switch (data.status) {
      case 'running': return '#fbbf24';
      case 'completed': return '#10b981';
      case 'failed': return '#ef4444';
      default: return isDark ? '#6b7280' : '#9ca3af';
    }
  };

  const getNodeBackground = () => {
    if (isDark) {
      switch (data.status) {
        case 'running':
          return 'linear-gradient(135deg, rgba(251, 191, 36, 0.08) 0%, rgba(30, 41, 59, 0.95) 100%)';
        case 'completed':
          return 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(30, 41, 59, 0.95) 100%)';
        case 'failed':
          return 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(30, 41, 59, 0.95) 100%)';
        default:
          return 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)';
      }
    } else {
      switch (data.status) {
        case 'running':
          return 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)';
        case 'completed':
          return 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)';
        case 'failed':
          return 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)';
        default:
          return 'linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)';
      }
    }
  };

  return (
    <div
      className={`agent-node ${data.status} ${selected ? 'selected' : ''}`}
      style={{
        background: getNodeBackground(),
        border: `2px solid ${selected ? getStatusColor() : isDark ? 'rgba(71, 85, 105, 0.5)' : '#e5e7eb'}`,
        borderRadius: '10px',
        padding: '16px',
        minWidth: '240px',
        maxWidth: '320px',
        boxShadow: selected
          ? '0 0 0 3px rgba(59, 130, 246, 0.1), 0 10px 40px rgba(0, 0, 0, 0.15)'
          : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        transition: 'all 0.2s ease',
        position: 'relative',
        cursor: 'pointer',
      }}
      onClick={data.onClick}
      onDoubleClick={data.onDoubleClick}
    >
      <Handle
        type="target"
        position={data.targetPosition || Position.Top}
        style={{
          background: getStatusColor(),
          width: '10px',
          height: '10px',
          border: '2px solid white',
        }}
      />

      {/* Status indicator */}
      {data.status === 'running' && (
        <div
          className="status-badge running"
          style={{
            position: 'absolute',
            top: '-8px',
            right: '-8px',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            background: '#fbbf24',
            border: '3px solid white',
            animation: 'pulse 2s infinite',
          }}
        />
      )}

      {/* Node content */}
      <div className="node-header" style={{ marginBottom: '8px' }}>
        <div style={{
          fontSize: '14px',
          fontWeight: '600',
          color: isDark ? '#e2e8f0' : '#1e293b',
          marginBottom: '4px',
        }}>
          {data.name || data.label || 'Agent'}
        </div>
        {data.agentRole && (
          <div style={{
            fontSize: '11px',
            color: isDark ? '#94a3b8' : '#64748b',
            textTransform: 'capitalize',
          }}>
            {data.agentRole}
          </div>
        )}
      </div>

      {/* Description */}
      {data.description && (
        <div style={{
          fontSize: '12px',
          color: isDark ? '#cbd5e1' : '#64748b',
          marginBottom: '12px',
          lineHeight: '1.5',
          maxHeight: '60px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {data.description}
        </div>
      )}

      {/* Tools */}
      {data.toolsPlanned && data.toolsPlanned.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          marginTop: '8px',
        }}>
          {data.toolsPlanned.slice(0, 3).map((tool: string, i: number) => (
            <span
              key={i}
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                background: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)',
                color: isDark ? '#93c5fd' : '#3b82f6',
                borderRadius: '4px',
                border: `1px solid ${isDark ? '#1e40af' : '#dbeafe'}`,
              }}
            >
              {tool}
            </span>
          ))}
          {data.toolsPlanned.length > 3 && (
            <span style={{
              fontSize: '10px',
              color: isDark ? '#64748b' : '#94a3b8',
              padding: '2px 6px',
            }}>
              +{data.toolsPlanned.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Status text */}
      {data.status && data.status !== 'pending' && (
        <div style={{
          marginTop: '8px',
          fontSize: '11px',
          color: getStatusColor(),
          fontWeight: '500',
        }}>
          {data.status.charAt(0).toUpperCase() + data.status.slice(1)}
        </div>
      )}

      <Handle
        type="source"
        position={data.sourcePosition || Position.Bottom}
        style={{
          background: getStatusColor(),
          width: '10px',
          height: '10px',
          border: '2px solid white',
        }}
      />
    </div>
  );
};

export default AgentNode;