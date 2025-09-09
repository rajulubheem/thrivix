import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, StopCircle } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

type AgentStatus = 'idle' | 'thinking' | 'typing' | 'working' | 'done';

export interface AgentPipelineProps {
  agents: string[];
  statusMap: Map<string, AgentStatus>;
  handoffs: Array<{ from: string; to: string; reason?: string; timestamp: string }>;
  stats?: {
    calls: Record<string, number>;
    results: Record<string, number>;
    artifacts: Record<string, number>;
  };
  onStopAgent?: (agent: string) => void;
  startTsMap?: Map<string, number>; // ms timestamp
  timeoutSecMap?: Map<string, number>; // seconds
  onSetTimeout?: (agent: string, seconds: number) => void;
}

const roleFor = (name: string) => {
  const n = (name || '').toLowerCase();
  if (n.includes('analy') || n.includes('research')) return { role: 'Analyzer', color: '#8b5cf6', emoji: '🔍' };
  if (n.includes('develop') || n.includes('coder') || n.includes('build')) return { role: 'Developer', color: '#10b981', emoji: '💻' };
  if (n.includes('review') || n.includes('qa') || n.includes('test')) return { role: 'Reviewer', color: '#f59e0b', emoji: '🧪' };
  return { role: 'Specialist', color: '#3b82f6', emoji: '🤖' };
};

const columns = [
  { key: 'thinking', title: 'Thinking' },
  { key: 'typing', title: 'Streaming' },
  { key: 'working', title: 'Working' },
  { key: 'review', title: 'Review' },
  { key: 'done', title: 'Done' }
] as const;

export const AgentPipeline: React.FC<AgentPipelineProps> = ({ agents, statusMap, handoffs, stats, onStopAgent, startTsMap, timeoutSecMap, onSetTimeout }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const byColumn = useMemo(() => {
    const map: Record<string, string[]> = { thinking: [], typing: [], working: [], review: [], done: [] };
    const sorted = [...agents].sort();
    for (const a of sorted) {
      const raw = (statusMap as any).get(a);
      const status: AgentStatus = (typeof raw === 'string' ? raw : raw?.status) || 'thinking';
      if (status === 'done') map.done.push(a);
      else if (status === 'typing') map.typing.push(a);
      else if (status === 'working') map.working.push(a);
      else {
        // Put reviewers in Review column if idle/thinking
        const isReviewer = a.toLowerCase().includes('review');
        if (isReviewer) map.review.push(a); else map.thinking.push(a);
      }
    }
    return map;
  }, [agents, statusMap]);

  const lastHandoffTo = useMemo(() => {
    const latest: Record<string, { from: string; ts: number }> = {};
    for (const h of handoffs.slice(-10)) {
      const ts = new Date(h.timestamp).getTime();
      latest[h.to] = { from: h.from, ts };
    }
    return latest;
  }, [handoffs]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
      {columns.map(col => (
        <Card key={col.key} className="p-3 bg-white/80 dark:bg-gray-900/60">
          <div className="text-sm font-semibold mb-2">{col.title}</div>
          <div className="space-y-2 min-h-[120px]">
            <AnimatePresence initial={false}>
              {(byColumn[col.key as keyof typeof byColumn] || []).map(agent => {
                const meta = roleFor(agent);
                const rawS = (statusMap as any).get(agent);
                const s: AgentStatus = (typeof rawS === 'string' ? rawS : rawS?.status) || 'idle';
                const c = stats?.calls?.[agent] || 0;
                const r = stats?.results?.[agent] || 0;
                const f = stats?.artifacts?.[agent] || 0;
                const handoff = lastHandoffTo[agent];
                const started = startTsMap?.get(agent);
                const timeout = timeoutSecMap?.get(agent) || 0;
                const elapsed = started ? Math.max(0, Math.floor((now - started) / 1000)) : 0;
                const ratio = timeout > 0 ? Math.min(1, elapsed / timeout) : 0;
                return (
                  <motion.div
                    layout
                    key={agent}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="rounded border border-gray-200 dark:border-gray-700 p-2 shadow-sm bg-white/70 dark:bg-gray-800/70"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="p-1.5 rounded-full" style={{ background: `${meta.color}20` }}>
                          <Bot className="h-4 w-4" style={{ color: meta.color }} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate" title={`${agent} • ${meta.role}`}>{meta.emoji} {agent}</div>
                          <div className="text-xs text-gray-500 truncate">{meta.role} • {s}</div>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => onStopAgent?.(agent)} title="Stop agent">
                        <StopCircle className="h-4 w-4" />
                      </Button>
                    </div>
                    {/* Progress / timeout */}
                    <div className="mt-2">
                      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded">
                        <div className="h-1.5 bg-blue-500 rounded" style={{ width: `${ratio*100}%` }}></div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-gray-500 mt-1">
                        <span>{started ? `${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}` : '—:—'}</span>
                        <div className="flex items-center gap-1">
                          <span>timeout:</span>
                          <select className="bg-transparent border rounded px-1 py-0.5"
                            value={timeout || 0}
                            onChange={(e) => onSetTimeout?.(agent, parseInt(e.target.value))}
                          >
                            <option value={0}>none</option>
                            <option value={30}>30s</option>
                            <option value={60}>60s</option>
                            <option value={120}>120s</option>
                            <option value={180}>180s</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3 mt-2 text-xs text-gray-600 dark:text-gray-300">
                      <div>🔧 {c}</div>
                      <div>📊 {r}</div>
                      <div>📦 {f}</div>
                    </div>
                    {handoff && (
                      <div className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                        ← handoff from {handoff.from}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default AgentPipeline;
