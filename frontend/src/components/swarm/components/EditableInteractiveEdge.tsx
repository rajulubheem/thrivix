import React, { useState, useCallback, useRef, useEffect } from 'react';
import { EdgeProps, getSmoothStepPath, EdgeLabelRenderer, BaseEdge, useReactFlow, Edge } from 'reactflow';
import { EdgeData } from '../types/FlowTypes';
import { Edit2, Check, X, Trash2 } from 'lucide-react';

interface EditableInteractiveEdgeProps extends EdgeProps<EdgeData> {
  onEdgeClick?: (edgeId: string, sourceNode: string, targetNode: string) => void;
  isHighlighted?: boolean;
  highlightPath?: boolean;
}

const EditableInteractiveEdge: React.FC<EditableInteractiveEdgeProps> = ({
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
  style,
  selected,
  label,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState((label as string) || data?.label || 'success');
  const [showMenu, setShowMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setEdges } = useReactFlow();

  // Use SmoothStep for clear connectors
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 18,
    offset: 0,
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
    setEdges((edges) => edges.filter((edge) => edge.id !== id));
    setShowMenu(false);
  }, [id, setEdges]);

  const handleLabelClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditing) {
      setShowMenu(true);
    }
  }, [isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Determine edge color and animation based on label/status
  const getEdgeProperties = () => {
    const currentLabel = (label as string || editLabel || '').toLowerCase();
    const isActive = data?.isActive || false;
    const isCompleted = data?.isCompleted || false;

    // Active state - animated yellow/blue
    if (isActive) {
      return {
        color: '#3b82f6',
        animated: true,
        strokeWidth: 3,
        glow: 'rgba(59, 130, 246, 0.6)',
      };
    }

    // Label-based coloring
    if (currentLabel.includes('success')) {
      return {
        color: isCompleted ? '#10b981' : '#86efac',
        animated: false,
        strokeWidth: isHovered || selected ? 3 : 2.5,
        glow: isCompleted ? 'rgba(16, 185, 129, 0.4)' : 'rgba(134, 239, 172, 0.3)',
      };
    }

    if (currentLabel.includes('failure') || currentLabel.includes('error') || currentLabel.includes('failed')) {
      return {
        color: '#ef4444',
        animated: false,
        strokeWidth: isHovered || selected ? 3 : 2.5,
        glow: 'rgba(239, 68, 68, 0.4)',
      };
    }

    if (currentLabel.includes('retry')) {
      return {
        color: '#f59e0b',
        animated: true,
        strokeWidth: isHovered || selected ? 3 : 2.5,
        glow: 'rgba(245, 158, 11, 0.4)',
      };
    }

    if (currentLabel.includes('timeout')) {
      return {
        color: '#f97316',
        animated: false,
        strokeWidth: isHovered || selected ? 3 : 2.5,
        glow: 'rgba(249, 115, 22, 0.4)',
      };
    }

    // Default gray for custom/pending
    return {
      color: '#94a3b8',
      animated: false,
      strokeWidth: isHovered || selected ? 3 : 2,
      glow: 'rgba(148, 163, 184, 0.2)',
    };
  };

  const edgeProps = getEdgeProperties();

  // Enhanced edge style with glow and animations
  const edgeStyle = {
    ...style,
    stroke: edgeProps.color,
    strokeWidth: edgeProps.strokeWidth,
    filter: (isHovered || selected) ? `drop-shadow(0 0 12px ${edgeProps.glow})` : `drop-shadow(0 0 4px ${edgeProps.glow})`,
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <>
      {/* Invisible wider path for better hover detection */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={20}
        stroke="transparent"
        style={{ cursor: 'pointer' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          if (!isEditing) setShowMenu(false);
        }}
      />

      {/* Animated background path for active edges */}
      {edgeProps.animated && (
        <path
          d={edgePath}
          fill="none"
          stroke={edgeProps.color}
          strokeWidth={edgeProps.strokeWidth + 2}
          strokeOpacity={0.3}
          strokeDasharray="8 4"
          style={{
            animation: 'dash 1s linear infinite',
          }}
        />
      )}

      {/* Main edge path */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={edgeStyle}
        markerEnd={markerEnd || `url(#arrow-${edgeProps.color.replace('#', '')})`}
      />

      {/* Custom arrow markers */}
      <defs>
        <marker
          id={`arrow-${edgeProps.color.replace('#', '')}`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={edgeProps.color} />
        </marker>
      </defs>

      {/* Edge label with edit controls */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            fontSize: 12,
            fontWeight: 500,
            zIndex: 1000,
          }}
          className="nodrag nopan"
          onClick={handleLabelClick}
        >
          {isEditing ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'white',
                border: `2px solid ${edgeProps.color}`,
                borderRadius: '6px',
                padding: '4px 6px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
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
                  fontSize: '12px',
                  minWidth: '60px',
                  maxWidth: '150px',
                  fontWeight: 500,
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
                  padding: '2px',
                  borderRadius: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'white',
                }}
                title="Save"
              >
                <Check size={14} />
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
                  padding: '2px',
                  borderRadius: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'white',
                }}
                title="Cancel"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: isHovered || showMenu ? 'white' : 'rgba(255,255,255,0.95)',
                border: `1.5px solid ${edgeProps.color}`,
                borderRadius: '6px',
                padding: '4px 8px',
                boxShadow: (isHovered || showMenu)
                  ? `0 2px 12px ${edgeProps.glow}`
                  : '0 1px 4px rgba(0,0,0,0.1)',
                transition: 'all 0.2s',
              }}
            >
              <span style={{
                color: edgeProps.color,
                fontWeight: 600,
                userSelect: 'none'
              }}>
                {label || editLabel || 'success'}
              </span>
              {(isHovered || showMenu) && (
                <div style={{ display: 'flex', gap: '2px', marginLeft: '4px' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditing(true);
                      setShowMenu(false);
                    }}
                    style={{
                      background: '#eff6ff',
                      border: '1px solid #3b82f6',
                      cursor: 'pointer',
                      padding: '3px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      color: '#3b82f6',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#3b82f6';
                      e.currentTarget.style.color = 'white';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#eff6ff';
                      e.currentTarget.style.color = '#3b82f6';
                    }}
                    title="Edit label"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('Delete this connection?')) {
                        handleDeleteEdge();
                      }
                    }}
                    style={{
                      background: '#fef2f2',
                      border: '1px solid #ef4444',
                      cursor: 'pointer',
                      padding: '3px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      color: '#ef4444',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#ef4444';
                      e.currentTarget.style.color = 'white';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#fef2f2';
                      e.currentTarget.style.color = '#ef4444';
                    }}
                    title="Delete connection"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>

      {/* Add CSS animation for dashed lines */}
      <style>
        {`
          @keyframes dash {
            from {
              stroke-dashoffset: 0;
            }
            to {
              stroke-dashoffset: -12;
            }
          }
        `}
      </style>
    </>
  );
};

export default EditableInteractiveEdge;