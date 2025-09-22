import React from 'react';
import {
  EdgeProps,
  getSmoothStepPath,
  EdgeLabelRenderer,
  BaseEdge,
} from 'reactflow';
import { EdgeData } from '../types/FlowTypes';

const SmoothAnimatedEdge: React.FC<EdgeProps<EdgeData>> = ({
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
  // Use smooth step path for cleaner connections
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 20, // Rounded corners for smoother appearance
    offset: 0,
  });

  const isActive = data?.isActive || false;
  const isCompleted = data?.isCompleted || false;

  return (
    <>
      {/* Shadow edge for depth */}
      <path
        d={edgePath}
        strokeWidth={4}
        stroke="rgba(0, 0, 0, 0.1)"
        fill="none"
        style={{
          transform: 'translate(0, 2px)',
        }}
      />
      
      {/* Main edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: isActive ? 3 : 2,
          stroke: isActive 
            ? '#fbbf24' 
            : isCompleted 
              ? '#22c55e' 
              : '#94a3b8',
          filter: isActive ? 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.5))' : undefined,
        }}
      />

      {/* Animated dot for active edges */}
      {isActive && (
        <>
          <circle r="5" fill="#fbbf24">
            <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
          </circle>
          <circle r="3" fill="#fff">
            <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
          </circle>
        </>
      )}

      {/* Edge label */}
      {(data?.label || data?.event) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: '11px',
              fontWeight: 500,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <div
              style={{
                padding: '3px 8px',
                borderRadius: '12px',
                background: isActive
                  ? 'rgba(251, 191, 36, 0.1)'
                  : 'rgba(255, 255, 255, 0.9)',
                border: `1px solid ${
                  isActive
                    ? 'rgba(251, 191, 36, 0.3)'
                    : 'rgba(148, 163, 184, 0.2)'
                }`,
                color: isActive ? '#92400e' : '#475569',
                backdropFilter: 'blur(4px)',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
              }}
            >
              {data?.label || data?.event}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default SmoothAnimatedEdge;