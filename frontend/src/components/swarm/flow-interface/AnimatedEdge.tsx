import React from 'react';
import { EdgeProps, getBezierPath, EdgeLabelRenderer, BaseEdge, MarkerType } from 'reactflow';

const AnimatedEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  markerEnd,
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isDarkMode = data?.isDarkMode;
  const isActive = data?.isActive;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: isActive
            ? '#fbbf24'
            : isDarkMode
              ? '#475569'
              : '#cbd5e1',
          strokeWidth: isActive ? 3 : 2,
          filter: isActive ? 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.4))' : undefined,
        }}
      />

      {isActive && (
        <circle r="6" fill="#fbbf24">
          <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}

      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              fontSize: '12px',
              fontWeight: 500,
              backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
              padding: '4px 8px',
              borderRadius: '6px',
              border: `1px solid ${isDarkMode ? '#475569' : '#e2e8f0'}`,
              color: isDarkMode ? '#e2e8f0' : '#475569',
              pointerEvents: 'all',
              zIndex: 1000,
            }}
            className="nodrag nopan"
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default AnimatedEdge;