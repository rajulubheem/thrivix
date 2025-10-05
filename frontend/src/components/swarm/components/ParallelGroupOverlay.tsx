import React, { useState } from 'react';
import { Node, useReactFlow } from 'reactflow';

interface ParallelTooltip {
  id: string;
  x: number;
  y: number;
  lines: Array<{
    child: string;
    event: string;
    durationMs: number;
  }>;
}

interface ParallelGroupOverlayProps {
  nodes: Node[];
  collapsedGroups: Record<string, boolean>;
  isDarkMode: boolean;
}

export const ParallelGroupOverlay: React.FC<ParallelGroupOverlayProps> = ({
  nodes,
  collapsedGroups,
  isDarkMode,
}) => {
  const [parallelTooltip, setParallelTooltip] = useState<ParallelTooltip | null>(null);
  const { getViewport } = useReactFlow();

  const running = nodes.filter(n => (n.data as any)?.parallelRunning || (n.data as any)?.parallelSummary);
  if (running.length === 0) return null;

  const groups = running.map(n => {
    const data: any = n.data || {};
    const children: string[] = data.parallelChildren || [];
    const members = [n, ...nodes.filter(nn => children.includes(nn.id))];
    if (members.length === 0) return null;
    const minX = Math.min(...members.map(m => m.position.x)) - 20;
    const minY = Math.min(...members.map(m => m.position.y)) - 30;
    const maxX = Math.max(...members.map(m => m.position.x + ((m as any).width || 260))) + 20;
    const maxY = Math.max(...members.map(m => m.position.y + ((m as any).height || 120))) + 30;
    return {
      id: n.id,
      node: n,
      data,
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY,
      label: data?.label || n.id,
      children
    };
  }).filter(Boolean) as Array<{
    id: string;
    node: Node;
    data: any;
    x: number;
    y: number;
    w: number;
    h: number;
    label: string;
    children: string[];
  }>;

  if (groups.length === 0) return null;

  const xs = groups.flatMap(g => [g.x, g.x + g.w]);
  const ys = groups.flatMap(g => [g.y, g.y + g.h]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const maxX = Math.max(...xs), maxY = Math.max(...ys);

  return (
    <>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto', zIndex: 0 }}>
        <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} style={{ width: '100%', height: '100%' }}>
          {groups.map(g => {
            const aggCenterX = g.node.position.x + (((g.node as any).width) || 260) / 2;
            const aggCenterY = g.node.position.y + (((g.node as any).height) || 120) / 2;
            const collapsed = !!collapsedGroups[g.id];
            return (
              <g key={g.id}>
                {/* Group box */}
                <rect
                  x={g.x}
                  y={g.y}
                  rx={10}
                  ry={10}
                  width={g.w}
                  height={g.h}
                  fill={g.data.parallelRunning ? 'rgba(59,130,246,0.10)' : 'rgba(59,130,246,0.06)'}
                  stroke="rgba(59,130,246,0.35)"
                  strokeWidth={2}
                  onMouseEnter={(e) => {
                    const vp = getViewport();
                    const tooltipLines: Array<{ child: string; event: string; durationMs: number }> = [];
                    const childEvents = (g.data.parallelChildEvents || {}) as Record<string, { event: string; durationMs: number }>;
                    g.children.forEach(cid => {
                      const ce = childEvents[cid];
                      tooltipLines.push({ child: cid, event: ce?.event || 'pending', durationMs: ce?.durationMs || 0 });
                    });
                    const screenX = (aggCenterX * vp.zoom) + vp.x;
                    const screenY = (g.y * vp.zoom) + vp.y + 24;
                    setParallelTooltip({ id: g.id, x: screenX, y: screenY, lines: tooltipLines });
                  }}
                  onMouseLeave={() => setParallelTooltip(null)}
                />
                {/* Label and summary */}
                <text x={g.x + 12} y={g.y + 18} fill="#93c5fd" fontSize={12} fontWeight={700}>
                  Parallel Group · {g.label}
                </text>
                {g.data.parallelCompleted ? (
                  <text x={g.x + 12} y={g.y + 34} fill="#93c5fd" fontSize={11}>
                    Completed: {g.data.parallelCompleted}/{g.children.length} · {g.data.parallelSummary ?
                      `Result: ${g.data.parallelSummary}` :
                      (g.data.parallelRunning ? 'Aggregating…' : '')}
                  </text>
                ) : null}
                {/* Ribbons */}
                {g.children.map(cid => {
                  const child = nodes.find(nn => nn.id === cid);
                  if (!child) return null;
                  const ccenterX = child.position.x + (((child as any).width) || 260) / 2;
                  const ccenterY = child.position.y + (((child as any).height) || 120) / 2;
                  const mx = (ccenterX + aggCenterX) / 2;
                  const my = (ccenterY + aggCenterY) / 2 - 20; // upward bow
                  const ev = (g.data.parallelChildEvents || {})[cid]?.event;
                  const stroke = ev ? (ev === 'failure' ? '#ef4444' : '#22c55e') : '#fde047';
                  const width = ev ? 2.5 : 2;
                  return (
                    <path
                      key={`${g.id}-${cid}`}
                      d={`M ${ccenterX} ${ccenterY} Q ${mx} ${my} ${aggCenterX} ${aggCenterY}`}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={width}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={collapsed ? 0.2 : 0.9}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Tooltip overlay */}
      {parallelTooltip && (
        <div
          style={{
            position: 'absolute',
            left: parallelTooltip.x,
            top: parallelTooltip.y,
            transform: 'translate(-50%, 0)',
            background: isDarkMode ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.98)',
            color: isDarkMode ? '#e2e8f0' : '#111',
            border: `1px solid ${isDarkMode ? '#334155' : '#cbd5e1'}`,
            borderRadius: 8,
            padding: '8px 10px',
            boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
            pointerEvents: 'none',
            minWidth: 240,
            zIndex: 2
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12 }}>Branch Summary</div>
          {parallelTooltip.lines.length === 0 ? (
            <div style={{ fontSize: 12, opacity: 0.8 }}>No children</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6 }}>
              {parallelTooltip.lines.map((ln) => (
                <React.Fragment key={ln.child}>
                  <div style={{ fontSize: 12, opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ln.child}
                  </div>
                  <div style={{ fontSize: 12, textAlign: 'right' }}>
                    <span style={{
                      color: ln.event === 'failure' ? '#ef4444' : ln.event === 'pending' ? '#eab308' : '#22c55e',
                      fontWeight: 700
                    }}>
                      {ln.event}
                    </span>
                    <span style={{ opacity: 0.7 }}> · {(ln.durationMs / 1000).toFixed(1)}s</span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
};