import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { getNodeIcon, getNodeColors } from '../../utils/nodeIcons';

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
        maxWidth: '280px',
        color: isDark ? '#e5e7eb' : '#1f2937',
        boxShadow: selected
          ? `0 0 0 3px ${getStatusColor()}40, 0 10px 25px -5px rgba(0, 0, 0, 0.15)`
          : isDark
            ? '0 4px 12px rgba(0, 0, 0, 0.4)'
            : '0 2px 8px rgba(0, 0, 0, 0.1)',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: getStatusColor(),
          width: '12px',
          height: '12px',
          border: `3px solid ${isDark ? '#0f172a' : '#ffffff'}`,
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          left: '-6px',
        }}
      />

      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          {/* Professional colored icon circle like competitor */}
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: getNodeColors(data.nodeType || data.type || 'agent').bg,
            border: `2px solid ${getNodeColors(data.nodeType || data.type || 'agent').border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: '16px',
            boxShadow: data.status === 'running'
              ? `0 0 0 4px ${getStatusColor()}30`
              : '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <span style={{ color: getNodeColors(data.nodeType || data.type || 'agent').icon }}>
              {getNodeIcon(data.nodeType || data.type || 'agent')}
            </span>
          </div>
          <span style={{
            fontSize: '15px',
            fontWeight: '600',
            color: isDark ? '#f3f4f6' : '#111827',
            letterSpacing: '-0.025em',
          }}>
            {data.label || data.name || 'Agent'}
          </span>
        </div>

        {data.agentRole && (
          <div style={{
            fontSize: '12px',
            color: isDark ? '#9ca3af' : '#6b7280',
            marginLeft: '20px',
            fontStyle: 'italic',
          }}>
            {data.agentRole}
          </div>
        )}
      </div>

      {data.description && (
        <div style={{
          fontSize: '12px',
          color: isDark ? '#d1d5db' : '#4b5563',
          lineHeight: '1.4',
          marginBottom: '8px',
          maxHeight: '36px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {data.description}
        </div>
      )}

      {(data.tools?.length > 0 || data.toolsPlanned?.length > 0 || data.toolsUsed?.length > 0) && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          marginTop: '8px',
        }}>
          {(data.toolsUsed || data.tools || data.toolsPlanned || []).slice(0, 3).map((tool: string, i: number) => (
            <span
              key={i}
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                background: data.toolsUsed?.includes(tool)
                  ? (isDark ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7')
                  : (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)'),
                color: data.toolsUsed?.includes(tool)
                  ? (isDark ? '#86efac' : '#166534')
                  : (isDark ? '#d1d5db' : '#6b7280'),
                border: data.toolsUsed?.includes(tool)
                  ? (isDark ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid #86efac')
                  : (isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)'),
                fontWeight: data.toolsUsed?.includes(tool) ? '600' : '400',
              }}
            >
              {tool}
            </span>
          ))}
          {((data.toolsUsed || data.tools || data.toolsPlanned || []).length > 3) && (
            <span
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                background: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
                color: isDark ? '#d1d5db' : '#6b7280',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
              }}
            >
              +{(data.toolsUsed || data.tools || data.toolsPlanned || []).length - 3}
            </span>
          )}
        </div>
      )}

      {data.status === 'running' && (
        <div style={{
          marginTop: '10px',
          height: '2px',
          background: isDark ? '#374151' : '#e5e7eb',
          borderRadius: '1px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: '50%',
            height: '100%',
            background: getStatusColor(),
            animation: 'progress 1.5s ease-in-out infinite',
          }} />
        </div>
      )}

      {data.duration && (
        <div style={{
          marginTop: '6px',
          fontSize: '11px',
          color: isDark ? '#9ca3af' : '#6b7280',
          textAlign: 'right',
        }}>
          {(data.duration / 1000).toFixed(1)}s
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: getStatusColor(),
          width: '12px',
          height: '12px',
          border: `3px solid ${isDark ? '#0f172a' : '#ffffff'}`,
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          right: '-6px',
        }}
      />
    </div>
  );
};

export default AgentNode;