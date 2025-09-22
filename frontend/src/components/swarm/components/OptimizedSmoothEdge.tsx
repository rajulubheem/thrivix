import React from 'react';
import { EdgeProps, getSmoothStepPath, EdgeLabelRenderer, BaseEdge } from 'reactflow';
import { EdgeData } from '../types/FlowTypes';

const OptimizedSmoothEdge: React.FC<EdgeProps<EdgeData>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
}) => {
  // Use SmoothStep consistently for standard, clear connectors
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

  // Improve label placement: nudge away from nodes and stagger slightly by id
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len; // perpendicular unit vector
  const ny = dx / len;
  const midOffset = 18; // push a bit along perpendicular
  // deterministic small jitter by id hash to avoid collisions
  let hash = 0; for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash) + id.charCodeAt(i);
  const jitter = ((hash % 7) - 3) * 2; // -6..+6 px
  // avoid being too close to either endpoint
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
  // apply perpendicular nudge + jitter
  labelX += nx * midOffset + jitter;
  labelY += ny * midOffset + jitter;

  const isActive = data?.isActive || false;
  const isCompleted = data?.isCompleted || false;
  // pending state: dashed neutral line

  // Dynamic edge colors and styles
  const getEdgeStyle = () => {
    if (isActive) {
      return {
        stroke: '#fbbf24',
        strokeWidth: 3,
        strokeLinecap: 'round' as any,
        strokeLinejoin: 'round' as any,
        filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.4))',
      };
    }
    if (isCompleted) {
      return {
        stroke: '#22c55e',
        strokeWidth: 2.5,
        strokeLinecap: 'round' as any,
        strokeLinejoin: 'round' as any,
        filter: 'drop-shadow(0 0 4px rgba(34, 197, 94, 0.2))',
      };
    }
    return {
      stroke: '#94a3b8',
      strokeWidth: 2.25,
      strokeLinecap: 'round' as any,
      strokeLinejoin: 'round' as any,
      opacity: 0.8,
    };
  };

  const edgeStyle = getEdgeStyle();

  return (
    <>
      {/* Shadow path for depth (only for active edges) */}
      {isActive && (
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

      {/* Edge label with improved styling */}
      {(data?.label || data?.event) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: '11px',
              fontWeight: 500,
              pointerEvents: 'all',
              zIndex: 1000,
            }}
            className="nodrag nopan"
          >
            <div
              style={{
                padding: '4px 10px',
                borderRadius: '14px',
                background: isActive
                  ? 'linear-gradient(135deg, #fef3c7, #fed7aa)'
                  : isCompleted
                  ? 'linear-gradient(135deg, #dcfce7, #bbf7d0)'
                  : 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
                border: `1.5px solid ${
                  isActive
                    ? '#f59e0b'
                    : isCompleted
                    ? '#16a34a'
                    : '#cbd5e1'
                }`,
                color: isActive ? '#92400e' : isCompleted ? '#14532d' : '#475569',
                backdropFilter: 'blur(8px)',
                boxShadow: isActive
                  ? '0 4px 12px rgba(245, 158, 11, 0.2)'
                  : '0 2px 8px rgba(0, 0, 0, 0.06)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {/* Status icon */}
              {isActive && (
                <span style={{ fontSize: '10px' }}>⚡</span>
              )}
              {isCompleted && (
                <span style={{ fontSize: '10px' }}>✓</span>
              )}
              {data?.label || data?.event}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default OptimizedSmoothEdge;
