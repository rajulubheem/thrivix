import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  EdgeProps,
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
  useReactFlow,
  getSmoothStepPath
} from 'reactflow';
import { EdgeData } from '../types/FlowTypes';
import { Edit2, Check, X, Trash2 } from 'lucide-react';

interface EnhancedEditableEdgeProps extends EdgeProps<EdgeData> {
  onEdgeClick?: (edgeId: string, sourceNode: string, targetNode: string) => void;
  isHighlighted?: boolean;
  highlightPath?: boolean;
}

const EnhancedEditableEdge: React.FC<EnhancedEditableEdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  source,
  target,
  data,
  markerEnd,
  style = {},
  selected,
  label,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState((label as string) || data?.label || 'success');
  const [showMenu, setShowMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setEdges } = useReactFlow();

  // Use Bezier curve for smoother appearance
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Handle label edit
  const handleSaveLabel = useCallback(() => {
    setEdges((edges) =>
      edges.map((edge) =>
        edge.id === id
          ? { ...edge, label: editLabel, data: { ...edge.data, label: editLabel } }
          : edge
      )
    );
    setIsEditing(false);
  }, [id, editLabel, setEdges]);

  const handleCancelEdit = useCallback(() => {
    setEditLabel((label as string) || data?.label || 'success');
    setIsEditing(false);
  }, [label, data?.label]);

  const handleDeleteEdge = useCallback(() => {
    try {
      setEdges((edges) => {
        const filteredEdges = edges.filter((edge) => edge.id !== id);
        return filteredEdges;
      });
      setShowMenu(false);
    } catch (error) {
      console.error('Error deleting edge:', error);
    }
  }, [id, setEdges]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Subtle, professional color scheme
  const getEdgeProperties = () => {
    const currentLabel = (label as string || editLabel || '').toLowerCase();
    const isActive = data?.isActive || false;
    const isCompleted = data?.isCompleted || false;

    // Active/running state - muted blue
    if (isActive) {
      return {
        color: '#6b7280', // Muted gray-blue
        animated: true,
        strokeWidth: 2.5,
        glow: 'rgba(107, 114, 128, 0.2)',
        dashArray: '5 5',
      };
    }

    // Success path - subtle green
    if (currentLabel.includes('success')) {
      return {
        color: isCompleted ? '#16a34a' : '#22c55e', // Softer green
        animated: false,
        strokeWidth: isHovered || selected ? 2.5 : 2,
        glow: isHovered ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.15)',
        dashArray: '',
      };
    }

    // Failure/error path - muted red
    if (currentLabel.includes('failure') || currentLabel.includes('error') || currentLabel.includes('failed')) {
      return {
        color: '#e11d48', // Softer red
        animated: false,
        strokeWidth: isHovered || selected ? 2.5 : 2,
        glow: isHovered ? 'rgba(225, 29, 72, 0.3)' : 'rgba(225, 29, 72, 0.15)',
        dashArray: '8 4', // Subtle dashes
      };
    }

    // Retry path - muted orange
    if (currentLabel.includes('retry')) {
      return {
        color: '#f97316', // Softer orange
        animated: true,
        strokeWidth: isHovered || selected ? 2.5 : 2,
        glow: isHovered ? 'rgba(249, 115, 22, 0.3)' : 'rgba(249, 115, 22, 0.15)',
        dashArray: '6 3',
      };
    }

    // Timeout path - muted amber
    if (currentLabel.includes('timeout')) {
      return {
        color: '#f59e0b', // Softer amber
        animated: false,
        strokeWidth: isHovered || selected ? 2.5 : 2,
        glow: isHovered ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.15)',
        dashArray: '10 4',
      };
    }

    // Default/custom - light gray
    return {
      color: '#9ca3af',
      animated: false,
      strokeWidth: isHovered || selected ? 2 : 1.5,
      glow: isHovered ? 'rgba(156, 163, 175, 0.2)' : 'rgba(156, 163, 175, 0.1)',
      dashArray: '',
    };
  };

  const edgeProps = getEdgeProperties();

  // Subtle edge styles with minimal effects
  const enhancedStyle = {
    ...style,
    stroke: edgeProps.color,
    strokeWidth: edgeProps.strokeWidth,
    filter: (isHovered || selected)
      ? `drop-shadow(0 1px 3px ${edgeProps.glow})`
      : undefined,
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeDasharray: edgeProps.dashArray,
    opacity: 0.9,
  };

  return (
    <>
      {/* Invisible wider path for better interaction */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={25}
        stroke="transparent"
        style={{ cursor: 'pointer' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          if (!isEditing) setShowMenu(false);
        }}
      />

      {/* Subtle animated background for active edges only */}
      {edgeProps.animated && (
        <path
          d={edgePath}
          fill="none"
          stroke={edgeProps.color}
          strokeWidth={edgeProps.strokeWidth}
          strokeOpacity={0.3}
          strokeDasharray="10 5"
          style={{
            animation: 'dash 2s linear infinite',
          }}
        />
      )}

      {/* Main edge path */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={enhancedStyle}
        markerEnd={markerEnd || `url(#arrow-${edgeProps.color.replace('#', '')})`}
      />

      {/* Custom arrow markers with better design */}
      <defs>
        <marker
          id={`arrow-${edgeProps.color.replace('#', '')}`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="10"
          markerHeight="10"
          orient="auto"
        >
          <path
            d="M 0 0 L 10 5 L 0 10 L 2 5 z"
            fill={edgeProps.color}
            opacity="0.9"
          />
        </marker>
      </defs>

      {/* Edge label with enhanced controls */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            fontSize: 13,
            fontWeight: 600,
            zIndex: 1001,
          }}
          className="nodrag nopan"
        >
          {isEditing ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(255,255,255,0.95)',
                border: `1.5px solid ${edgeProps.color}`,
                borderRadius: '6px',
                padding: '4px 6px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
              }}
            >
              <input
                ref={inputRef}
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveLabel();
                  if (e.key === 'Escape') handleCancelEdit();
                }}
                style={{
                  border: 'none',
                  outline: 'none',
                  fontSize: '13px',
                  minWidth: '80px',
                  maxWidth: '180px',
                  fontWeight: 600,
                  background: 'transparent',
                }}
                placeholder="Label..."
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSaveLabel();
                }}
                style={{
                  background: '#10b981',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'white',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#059669';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#10b981';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                title="Save"
              >
                <Check size={16} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancelEdit();
                }}
                style={{
                  background: '#ef4444',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'white',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#dc2626';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#ef4444';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                title="Cancel"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: isHovered || showMenu
                  ? 'rgba(255,255,255,0.95)'
                  : 'rgba(255,255,255,0.9)',
                border: `1px solid ${edgeProps.color}`,
                borderRadius: '5px',
                padding: '3px 6px',
                boxShadow: (isHovered || showMenu)
                  ? '0 2px 6px rgba(0,0,0,0.12)'
                  : '0 1px 3px rgba(0,0,0,0.08)',
                transition: 'all 0.2s ease',
                transform: (isHovered || showMenu) ? 'scale(1.02)' : 'scale(1)',
                cursor: 'pointer',
              }}
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(true);
              }}
            >
              <span
                style={{
                  color: edgeProps.color,
                  fontWeight: 500,
                  userSelect: 'none',
                  fontSize: '11px',
                }}
              >
                {label || editLabel || 'success'}
              </span>
              {(isHovered || showMenu) && (
                <div style={{ display: 'flex', gap: '4px', marginLeft: '4px' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditing(true);
                      setShowMenu(false);
                    }}
                    style={{
                      background: '#dbeafe',
                      border: '1.5px solid #3b82f6',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '5px',
                      display: 'flex',
                      alignItems: 'center',
                      color: '#3b82f6',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#3b82f6';
                      e.currentTarget.style.color = 'white';
                      e.currentTarget.style.transform = 'scale(1.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#dbeafe';
                      e.currentTarget.style.color = '#3b82f6';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    title="Edit label"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('Delete this connection?')) {
                        handleDeleteEdge();
                      }
                    }}
                    style={{
                      background: '#fee2e2',
                      border: '1.5px solid #ef4444',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '5px',
                      display: 'flex',
                      alignItems: 'center',
                      color: '#ef4444',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#ef4444';
                      e.currentTarget.style.color = 'white';
                      e.currentTarget.style.transform = 'scale(1.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#fee2e2';
                      e.currentTarget.style.color = '#ef4444';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    title="Delete connection"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>

      {/* Add CSS animations */}
      <style>
        {`
          @keyframes dash {
            from {
              stroke-dashoffset: 0;
            }
            to {
              stroke-dashoffset: -20;
            }
          }
          @keyframes dash-reverse {
            from {
              stroke-dashoffset: 0;
            }
            to {
              stroke-dashoffset: 20;
            }
          }
          @keyframes pulse {
            0%, 100% {
              opacity: 0.4;
            }
            50% {
              opacity: 0.8;
            }
          }
        `}
      </style>
    </>
  );
};

export default EnhancedEditableEdge;