import React from 'react';
import {
  EdgeProps,
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
  getStraightPath,
  getSmoothStepPath,
} from 'reactflow';
import { EdgeData } from '../types/FlowTypes';

const AnimatedEdge: React.FC<EdgeProps<EdgeData>> = ({
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
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isActive = data?.isActive || false;
  const hasLabel = data?.label || data?.event;

  return (
    <>
      {/* Main edge path */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: isActive ? '#facc15' : data?.isCompleted ? '#22c55e' : '#52525b',
          strokeWidth: isActive ? 2.5 : 1.5,
          filter: isActive ? 'drop-shadow(0 0 4px rgba(250, 204, 21, 0.4))' : undefined,
        }}
      />

      {/* Animated particle for active edges */}
      {isActive && (
        <>
          <circle r="4" fill="#facc15">
            <animateMotion dur="1.5s" repeatCount="indefinite" path={edgePath} />
          </circle>
          {/* Secondary particle with delay */}
          <circle r="3" fill="#fde047" opacity="0.7">
            <animateMotion 
              dur="1.5s" 
              repeatCount="indefinite" 
              path={edgePath} 
              begin="0.75s"
            />
          </circle>
        </>
      )}

      {/* Edge label with enhanced styling */}
      {hasLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              zIndex: 1000,
            }}
            className="nodrag nopan"
          >
            <div
              className="edge-label-pill"
              style={{
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 500,
                background: data?.isActive 
                  ? 'rgba(250, 204, 21, 0.2)' 
                  : 'rgba(39, 39, 42, 0.9)',
                border: `1px solid ${
                  data?.isActive 
                    ? 'rgba(250, 204, 21, 0.4)' 
                    : 'rgba(63, 63, 70, 0.5)'
                }`,
                color: data?.isActive ? '#fef3c7' : '#a1a1aa',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
              }}
            >
              {data?.label || data?.event}
              {data?.durationMs && (
                <span style={{ marginLeft: 4, opacity: 0.7 }}>
                  ({(data.durationMs / 1000).toFixed(1)}s)
                </span>
              )}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Error indicator */}
      {data?.error && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - 20}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <div
              style={{
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#fca5a5',
              }}
              title={data.error}
            >
              ⚠ Error
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default AnimatedEdge;