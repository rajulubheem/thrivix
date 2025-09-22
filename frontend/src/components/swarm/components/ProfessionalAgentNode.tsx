import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NodeData } from '../types/FlowTypes';

const ProfessionalAgentNode: React.FC<NodeProps<NodeData>> = ({ data, selected }) => {
  const getStatusColor = () => {
    switch (data.status) {
      case 'running': return { bg: '#fef3c7', border: '#fbbf24', text: '#92400e' };
      case 'completed': return { bg: '#dcfce7', border: '#22c55e', text: '#14532d' };
      case 'failed': return { bg: '#fee2e2', border: '#ef4444', text: '#7f1d1d' };
      default: return { bg: '#f3f4f6', border: '#9ca3af', text: '#374151' };
    }
  };

  const getNodeTypeColor = () => {
    switch (data.nodeType?.toLowerCase()) {
      case 'analysis': return '#3b82f6';
      case 'decision': return '#8b5cf6';
      case 'research': return '#06b6d4';
      case 'parallel': return '#f59e0b';
      case 'final': return '#10b981';
      default: return '#6b7280';
    }
  };

  const colors = getStatusColor();
  const typeColor = getNodeTypeColor();
  const ringShadow = `0 0 0 2px ${typeColor}40, 0 8px 24px ${typeColor}33`;

  const isHorizontal = data.direction === 'LR' || data.direction === 'RL';

  return (
    <div
      className={`professional-agent-node ${data.status} ${selected ? 'selected' : ''}`}
      style={{
        background: colors.bg,
        borderColor: colors.border,
        borderWidth: '2px',
        borderStyle: 'solid',
        borderRadius: '12px',
        padding: '0',
        minWidth: '260px',
        maxWidth: '300px',
        boxShadow: selected
          ? `0 0 0 2px ${colors.border}, ${ringShadow}`
          : `0 12px 30px rgba(2,6,23,0.28), ${ringShadow}`,
        transition: 'transform 0.15s ease, box-shadow 0.2s ease, border-color 0.2s ease',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Accent ring overlay */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: -3,
          borderRadius: '14px',
          border: `2px solid ${typeColor}80`,
          boxShadow: `inset 0 0 24px ${typeColor}33`,
          opacity: data.status === 'running' ? 0.9 : 0.45,
          pointerEvents: 'none',
          filter: 'blur(0.2px)'
        }}
      />
      {/* Handles with better positioning */}
      <Handle
        type="target"
        position={isHorizontal ? Position.Left : Position.Top}
        style={{
          width: 10,
          height: 10,
          background: '#6b7280',
          border: '2px solid white',
          ...(isHorizontal ? { left: -5 } : { top: -5 })
        }}
      />
      
      {/* Node Type Badge */}
      {data.nodeType && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            padding: '2px 8px',
            fontSize: '10px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            background: typeColor,
            color: 'white',
            borderRadius: '4px',
            opacity: 0.9
          }}
        >
          {data.nodeType}
        </div>
      )}
      
      {/* Header Section */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${colors.border}`,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.65), rgba(255,255,255,0.35))'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Status Indicator */}
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: colors.border,
              flexShrink: 0,
              animation: data.status === 'running' ? 'pulse 2s infinite' : 'none'
            }}
          />
          
          {/* Node Title */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: colors.text,
                lineHeight: '1.2',
                marginBottom: data.agentRole ? '2px' : '0',
              }}
            >
              {data.label || data.name}
            </div>
            {data.agentRole && (
              <div
                style={{
                  fontSize: '11px',
                  color: colors.text,
                  opacity: 0.7,
                  fontStyle: 'italic'
                }}
              >
                {data.agentRole}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Body Section */}
      <div style={{ padding: '12px 16px' }}>
        {/* Task Description */}
        {data.task && (
          <div
            style={{
              fontSize: '12px',
              color: colors.text,
              marginBottom: '8px',
              lineHeight: '1.4',
              opacity: 0.9
            }}
          >
            {data.task.length > 100 ? data.task.substring(0, 100) + '...' : data.task}
          </div>
        )}
        
        {/* Tools Section */}
        {(data.toolsPlanned && data.toolsPlanned.length > 0) && (
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '10px', color: colors.text, opacity: 0.6, marginBottom: '4px' }}>
              Planned:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {data.toolsPlanned.slice(0, 3).map((tool) => (
                <span
                  key={tool}
                  style={{
                    padding: '2px 6px',
                    fontSize: '10px',
                    background: 'rgba(59, 130, 246, 0.1)',
                    color: '#2563eb',
                    borderRadius: '4px',
                    border: '1px solid rgba(59, 130, 246, 0.2)'
                  }}
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {data.toolsUsed && data.toolsUsed.length > 0 && (
          <div>
            <div style={{ fontSize: '10px', color: colors.text, opacity: 0.6, marginBottom: '4px' }}>
              Used:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {data.toolsUsed.slice(0, 3).map((tool) => (
                <span
                  key={tool}
                  style={{
                    padding: '2px 6px',
                    fontSize: '10px',
                    background: 'rgba(34, 197, 94, 0.1)',
                    color: '#16a34a',
                    borderRadius: '4px',
                    border: '1px solid rgba(34, 197, 94, 0.2)'
                  }}
                >
                  ✓ {tool}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* Metrics */}
        {data.status === 'completed' && data.duration && (
          <div
            style={{
              marginTop: '8px',
              paddingTop: '8px',
              borderTop: `1px solid ${colors.border}`,
              fontSize: '11px',
              color: colors.text,
              opacity: 0.7,
              display: 'flex',
              justifyContent: 'space-between'
            }}
          >
            <span>Duration: {(data.duration / 1000).toFixed(1)}s</span>
            {data.tokenCount && <span>{data.tokenCount} tokens</span>}
          </div>
        )}
        
        {/* Progress Bar for Running State */}
        {data.status === 'running' && (
          <div
            style={{
              marginTop: '8px',
              height: '3px',
              background: 'rgba(0,0,0,0.1)',
              borderRadius: '3px',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                height: '100%',
                background: colors.border,
                width: '40%',
                animation: 'progress 1.5s ease-in-out infinite'
              }}
            />
          </div>
        )}
      </div>
      
      <Handle
        type="source"
        position={isHorizontal ? Position.Right : Position.Bottom}
        style={{
          width: 10,
          height: 10,
          background: '#6b7280',
          border: '2px solid white',
          ...(isHorizontal ? { right: -5 } : { bottom: -5 })
        }}
      />
    </div>
  );
};

export default ProfessionalAgentNode;
