import React, { useState, useCallback } from 'react';
import { EdgeProps, getSmoothStepPath, EdgeLabelRenderer, BaseEdge, useReactFlow, Node } from 'reactflow';
import { EdgeData } from '../types/FlowTypes';

interface InteractiveEdgeProps extends EdgeProps<EdgeData> {
  onEdgeClick?: (edgeId: string, sourceNode: string, targetNode: string) => void;
  isHighlighted?: boolean;
  highlightPath?: boolean;
}

const InteractiveEdge: React.FC<InteractiveEdgeProps> = ({
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
  onEdgeClick,
  isHighlighted,
  highlightPath,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const { getNodes, getEdges, setNodes, setEdges } = useReactFlow();

  // Use SmoothStep for clear connectors
  const [edgePath, rawLabelX, rawLabelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 18,
    offset: 0,
  });

  // Improve label placement
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  const midOffset = 18;

  // Deterministic jitter to avoid collisions
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
  }
  const jitter = ((hash % 7) - 3) * 2;

  // Avoid being too close to endpoints
  const minDist = 40;
  const distToSource = Math.hypot(rawLabelX - sourceX, rawLabelY - sourceY);
  const distToTarget = Math.hypot(rawLabelX - targetX, rawLabelY - targetY);
  let labelX = rawLabelX;
  let labelY = rawLabelY;

  if (distToSource < minDist || distToTarget < minDist) {
    const push = (minDist - Math.min(distToSource, distToTarget)) * 0.6;
    labelX += nx * push;
    labelY += ny * push;
  }

  labelX += nx * midOffset + jitter;
  labelY += ny * midOffset + jitter;

  const isActive = data?.isActive || false;
  const isCompleted = data?.isCompleted || false;
  const isPending = !isActive && !isCompleted;

  // Handle edge click to highlight path
  const handleEdgeClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();

    // Highlight connected nodes
    const nodes = getNodes();
    const edges = getEdges();

    // Find source and target nodes
    const sourceNode = nodes.find(n => n.id === source);
    const targetNode = nodes.find(n => n.id === target);

    if (sourceNode && targetNode) {
      // Highlight the connected nodes
      setNodes(nodes.map(node => {
        if (node.id === source || node.id === target) {
          return {
            ...node,
            data: {
              ...node.data,
              highlighted: true,
            },
            style: {
              ...node.style,
              boxShadow: '0 0 20px rgba(59, 130, 246, 0.5)',
              border: '2px solid #3b82f6',
            }
          };
        }
        return {
          ...node,
          data: {
            ...node.data,
            highlighted: false,
          },
          style: {
            ...node.style,
            opacity: 0.5,
          }
        };
      }));

      // Highlight this edge and dim others
      setEdges(edges.map(edge => {
        if (edge.id === id) {
          return {
            ...edge,
            animated: true,
            style: {
              ...edge.style,
              stroke: '#3b82f6',
              strokeWidth: 3,
            },
            data: {
              ...edge.data,
              highlighted: true,
            }
          };
        }
        return {
          ...edge,
          style: {
            ...edge.style,
            opacity: 0.3,
          },
          data: {
            ...edge.data,
            highlighted: false,
          }
        };
      }));

      // Call external handler if provided
      if (onEdgeClick) {
        onEdgeClick(id, source, target);
      }
    }
  }, [id, source, target, getNodes, getEdges, setNodes, setEdges, onEdgeClick]);

  // Dynamic edge styles
  const getEdgeStyle = () => {
    const baseStyle = {
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
      cursor: 'pointer',
      transition: 'all 0.3s ease',
    };

    if (isHighlighted || selected) {
      return {
        ...baseStyle,
        stroke: '#3b82f6',
        strokeWidth: 3.5,
        filter: 'drop-shadow(0 0 12px rgba(59, 130, 246, 0.6))',
      };
    }

    if (isHovered) {
      return {
        ...baseStyle,
        stroke: '#6366f1',
        strokeWidth: 3,
        filter: 'drop-shadow(0 0 8px rgba(99, 102, 241, 0.4))',
      };
    }

    if (isActive) {
      return {
        ...baseStyle,
        stroke: '#fbbf24',
        strokeWidth: 3,
        filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.4))',
      };
    }

    if (isCompleted) {
      return {
        ...baseStyle,
        stroke: '#22c55e',
        strokeWidth: 2.5,
        filter: 'drop-shadow(0 0 4px rgba(34, 197, 94, 0.2))',
      };
    }

    return {
      ...baseStyle,
      stroke: '#94a3b8',
      strokeWidth: 2,
      opacity: 0.8,
      strokeDasharray: isPending ? '5,5' : 'none',
    };
  };

  const edgeStyle = getEdgeStyle();

  // Get label text with decision info
  const getLabelText = () => {
    if (data?.event) {
      // For decision edges, show the condition
      return `→ ${data.event}`;
    }
    if (data?.label) {
      return data.label;
    }
    // Check for condition in data (may be added dynamically)
    if ((data as any)?.condition) {
      return `if: ${(data as any).condition}`;
    }
    return '';
  };

  const labelText = getLabelText();

  return (
    <>
      {/* Invisible wide path for better click detection */}
      <path
        d={edgePath}
        strokeWidth={20}
        stroke="transparent"
        fill="none"
        style={{ cursor: 'pointer' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleEdgeClick}
      />

      {/* Shadow path for depth */}
      {(isActive || isHovered || isHighlighted) && (
        <path
          d={edgePath}
          strokeWidth={5}
          stroke="rgba(0, 0, 0, 0.08)"
          fill="none"
          style={{
            transform: 'translate(0, 3px)',
          }}
        />
      )}

      {/* Main edge path */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          ...edgeStyle,
        }}
      />

      {/* Animated particles for active edges */}
      {isActive && (
        <>
          <circle r="6" fill="#fbbf24">
            <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
          </circle>
          <circle r="4" fill="#fff">
            <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
          </circle>
          <circle r="6" fill="#fbbf24" opacity="0.5">
            <animateMotion dur="2s" begin="1s" repeatCount="indefinite" path={edgePath} />
          </circle>
        </>
      )}

      {/* Flow direction indicator for hovered edges */}
      {isHovered && (
        <>
          <circle r="4" fill="#6366f1">
            <animateMotion dur="1s" repeatCount="indefinite" path={edgePath} />
          </circle>
          <circle r="4" fill="#6366f1" opacity="0.7">
            <animateMotion dur="1s" begin="0.25s" repeatCount="indefinite" path={edgePath} />
          </circle>
          <circle r="4" fill="#6366f1" opacity="0.4">
            <animateMotion dur="1s" begin="0.5s" repeatCount="indefinite" path={edgePath} />
          </circle>
        </>
      )}

      {/* Completion indicator */}
      {isCompleted && (
        <circle
          cx={labelX}
          cy={labelY}
          r="8"
          fill="#22c55e"
          stroke="#fff"
          strokeWidth="2"
        >
          <animate
            attributeName="r"
            from="8"
            to="12"
            dur="1s"
            repeatCount="3"
          />
          <animate
            attributeName="opacity"
            from="1"
            to="0.3"
            dur="1s"
            repeatCount="3"
          />
        </circle>
      )}

      {/* Enhanced edge label */}
      {labelText && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: '12px',
              fontWeight: 500,
              pointerEvents: 'all',
              zIndex: isHovered || isHighlighted ? 2000 : 1000,
              cursor: 'pointer',
            }}
            className="nodrag nopan"
            onClick={handleEdgeClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <div
              style={{
                padding: '5px 12px',
                borderRadius: '16px',
                background: isHighlighted || isHovered
                  ? 'linear-gradient(135deg, #dbeafe, #bfdbfe)'
                  : isActive
                  ? 'linear-gradient(135deg, #fef3c7, #fed7aa)'
                  : isCompleted
                  ? 'linear-gradient(135deg, #dcfce7, #bbf7d0)'
                  : 'linear-gradient(135deg, #ffffff, #f8fafc)',
                border: `1.5px solid ${
                  isHighlighted || isHovered
                    ? '#3b82f6'
                    : isActive
                    ? '#f59e0b'
                    : isCompleted
                    ? '#16a34a'
                    : '#cbd5e1'
                }`,
                color: isHighlighted || isHovered
                  ? '#1e40af'
                  : isActive
                  ? '#92400e'
                  : isCompleted
                  ? '#14532d'
                  : '#475569',
                backdropFilter: 'blur(8px)',
                boxShadow: isHighlighted || isHovered
                  ? '0 6px 16px rgba(59, 130, 246, 0.3)'
                  : isActive
                  ? '0 4px 12px rgba(245, 158, 11, 0.2)'
                  : '0 2px 8px rgba(0, 0, 0, 0.06)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                transition: 'all 0.2s ease',
              }}
            >
              {/* Status/Direction icon */}
              {isHighlighted || isHovered ? (
                <span style={{ fontSize: '11px' }}>🔍</span>
              ) : isActive ? (
                <span style={{ fontSize: '11px' }}>⚡</span>
              ) : isCompleted ? (
                <span style={{ fontSize: '11px' }}>✓</span>
              ) : data?.event ? (
                <span style={{ fontSize: '11px' }}>➜</span>
              ) : null}

              <span>{labelText}</span>

              {/* Additional info on hover */}
              {isHovered && (
                <span style={{ fontSize: '10px', opacity: 0.7 }}>
                  Click to trace path
                </span>
              )}
            </div>

            {/* Tooltip with connection info */}
            {isHovered && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: '8px',
                  padding: '6px 10px',
                  background: 'rgba(30, 41, 59, 0.95)',
                  color: '#f1f5f9',
                  borderRadius: '8px',
                  fontSize: '11px',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                }}
              >
                <div>{`From: ${source}`}</div>
                <div>{`To: ${target}`}</div>
                {(data as any)?.probability && (
                  <div>{`Probability: ${(data as any).probability}%`}</div>
                )}
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default InteractiveEdge;