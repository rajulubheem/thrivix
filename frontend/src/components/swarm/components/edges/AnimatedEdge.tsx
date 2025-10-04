import React from 'react';
import { BaseEdge, getBezierPath, EdgeProps } from 'reactflow';

const AnimatedEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isDark = data?.isDarkMode !== false;

  const getEdgeColor = () => {
    if (data?.isActive) return '#fbbf24';
    if (data?.isCompleted) return '#10b981';
    return isDark ? '#4b5563' : '#d1d5db';
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: getEdgeColor(),
          strokeWidth: data?.isActive ? 3 : 2,
          opacity: data?.dimmed ? 0.2 : 1,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
      {data?.isActive && (
        <>
          <circle r="5" fill={getEdgeColor()}>
            <animateMotion
              dur="2s"
              repeatCount="indefinite"
              path={edgePath}
            />
          </circle>
          <circle r="5" fill={getEdgeColor()} opacity="0.5">
            <animateMotion
              dur="2s"
              begin="0.5s"
              repeatCount="indefinite"
              path={edgePath}
            />
          </circle>
        </>
      )}
    </>
  );
};

export default AnimatedEdge;