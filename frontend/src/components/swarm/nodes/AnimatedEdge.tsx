import React from 'react';
import { EdgeProps, getBezierPath, BaseEdge, MarkerType } from 'reactflow';

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
  selected,
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isDark = data?.isDarkMode !== false;
  const isActive = data?.status === 'running' || data?.isActive;
  const isDimmed = data?.dimmed;

  const getEdgeStyle = () => {
    const baseStyle = {
      ...style,
      strokeWidth: isActive ? 3 : 2,
      transition: 'all 0.3s ease',
    };

    if (isDimmed) {
      return {
        ...baseStyle,
        stroke: isDark ? '#334155' : '#e2e8f0',
        opacity: 0.3,
      };
    }

    if (isActive) {
      return {
        ...baseStyle,
        stroke: '#fbbf24',
        filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.4))',
      };
    }

    if (selected) {
      return {
        ...baseStyle,
        stroke: '#3b82f6',
        filter: 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.4))',
      };
    }

    return {
      ...baseStyle,
      stroke: isDark ? '#64748b' : '#cbd5e1',
    };
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={getEdgeStyle()}
      />

      {isActive && !isDimmed && (
        <>
          <circle r="4" fill="#fbbf24">
            <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
          </circle>
          <circle r="3" fill="#fef3c7" opacity="0.6">
            <animateMotion dur="2s" begin="0.5s" repeatCount="indefinite" path={edgePath} />
          </circle>
          <circle r="3" fill="#fef3c7" opacity="0.6">
            <animateMotion dur="2s" begin="1s" repeatCount="indefinite" path={edgePath} />
          </circle>
        </>
      )}

      {/* Edge label */}
      {data?.label && (
        <text
          x={labelX}
          y={labelY}
          style={{
            fontSize: 11,
            fill: isDark ? '#94a3b8' : '#64748b',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {data.label}
        </text>
      )}
    </>
  );
};

export default AnimatedEdge;