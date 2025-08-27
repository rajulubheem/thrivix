// Enhanced ExecutionTimeline.tsx - Comprehensive timeline with detailed metadata
import React, { useState, useMemo, useEffect, useRef } from 'react';

interface ExecutionTimelineProps {
  events: any[];
  activities?: any[];
  agents?: any[];
  currentAgent?: string;
  streamingMessages?: Map<string, string>;
  autoScroll?: boolean;
}

interface TimelineEvent {
  id: string;
  type: string;
  agent?: string;
  timestamp: Date;
  content: string;
  icon: string;
  color: string;
  metadata?: any;
  duration?: number;
}

const ExecutionTimeline: React.FC<ExecutionTimelineProps> = ({
                                                               events = [],
                                                               activities = [],
                                                               agents = [],
                                                               currentAgent,
                                                               streamingMessages = new Map(),
                                                               autoScroll = false
                                                             }) => {
  const [viewMode, setViewMode] = useState<'timeline' | 'grouped'>('timeline');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [showMetadata, setShowMetadata] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events.length, autoScroll]);

  // Process events into timeline format
  const timelineEvents = useMemo(() => {
    const processed: TimelineEvent[] = [];
    const agentStartTimes = new Map<string, Date>();
    const agentTextMap = new Map<string, { lastContent: string; timestamp: Date; wordCount: number }>();

    events.forEach((event, index) => {
      const timestamp = new Date(event.timestamp);
      let content = '';
      let icon = '📋';
      let color = '#6b7280';
      let metadata = event.data || {};

      switch (event.type) {
        case 'execution_started':
          content = `Execution started: ${event.data?.task || 'Unknown task'}`;
          icon = '🚀';
          color = '#059669';
          break;

        case 'agent_started':
          if (event.agent) {
            agentStartTimes.set(event.agent, timestamp);
            content = `Agent "${event.agent}" started`;
            icon = '🤖';
            color = '#3b82f6';
          }
          break;

        case 'text_generation':
          if (event.agent && event.data?.accumulated) {
            const agentName = event.agent;
            const currentContent = event.data.accumulated;
            const wordCount = currentContent.split(' ').length;

            // Only add/update text generation events, don't spam individual chunks
            const existingData = agentTextMap.get(agentName);
            if (!existingData || wordCount - existingData.wordCount >= 50) { // Only update every 50 words
              const isFirstEntry = !existingData;

              if (isFirstEntry) {
                content = `Started generating text`;
                icon = '✍️';
                color = '#8b5cf6';
                metadata = {
                  wordCount,
                  charCount: currentContent.length,
                  sample: currentContent.substring(0, 100) + (currentContent.length > 100 ? '...' : '')
                };

                processed.push({
                  id: `text-start-${agentName}-${index}`,
                  type: 'text_start',
                  agent: agentName,
                  timestamp,
                  content,
                  icon,
                  color,
                  metadata
                });
              } else {
                // Update the latest text generation entry for this agent
                const existingIndex = processed.findIndex(e =>
                    e.agent === agentName && (e.type === 'text_start' || e.type === 'text_update')
                );

                if (existingIndex !== -1) {
                  processed[existingIndex] = {
                    ...processed[existingIndex],
                    type: 'text_update',
                    content: `Generating text (${wordCount} words)`,
                    timestamp,
                    metadata: {
                      wordCount,
                      charCount: currentContent.length,
                      sample: currentContent.substring(0, 100) + (currentContent.length > 100 ? '...' : '')
                    }
                  };
                }
              }

              agentTextMap.set(agentName, { lastContent: currentContent, timestamp, wordCount });
            }
            return; // Skip adding individual text generation events
          }
          break;

        case 'tool_execution':
        case 'tool_use':
        case 'tool_called':
          content = `Used tool: ${event.data?.tool || 'unknown'}`;
          icon = '🔧';
          color = '#f59e0b';
          metadata = {
            ...metadata,
            tool: event.data?.tool,
            filename: event.data?.filename,
            language: event.data?.language
          };
          break;

        case 'handoff':
          content = `Handoff: ${event.data?.from_agent} → ${event.data?.to_agent}`;
          icon = '🔄';
          color = '#06b6d4';
          break;

        case 'agent_completed':
          if (event.agent) {
            const startTime = agentStartTimes.get(event.agent);
            const duration = startTime ? timestamp.getTime() - startTime.getTime() : 0;

            // Get final text stats
            const finalTextData = agentTextMap.get(event.agent);
            const finalWordCount = finalTextData?.wordCount || 0;

            content = `Agent "${event.agent}" completed (${finalWordCount} words generated)`;
            icon = '✅';
            color = '#10b981';
            metadata = {
              ...metadata,
              duration: Math.round(duration / 1000),
              tokens: event.data?.tokens || 0,
              output_length: event.data?.output?.length || 0,
              final_word_count: finalWordCount
            };
          }
          break;

        case 'execution_completed':
          content = 'Execution completed successfully';
          icon = '🎉';
          color = '#059669';
          break;

        case 'execution_failed':
          content = `Execution failed: ${event.data?.error || 'Unknown error'}`;
          icon = '❌';
          color = '#dc2626';
          break;

        default:
          // Skip unknown events or events we don't want to display
          return;
      }

      processed.push({
        id: `${event.type}-${index}-${timestamp.getTime()}`,
        type: event.type,
        agent: event.agent,
        timestamp,
        content,
        icon,
        color,
        metadata
      });
    });

    return processed.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }, [events]);

  // Group events by agent
  const groupedEvents = useMemo(() => {
    const groups = new Map<string, TimelineEvent[]>();
    const systemEvents: TimelineEvent[] = [];

    timelineEvents.forEach(event => {
      if (event.agent) {
        if (!groups.has(event.agent)) {
          groups.set(event.agent, []);
        }
        groups.get(event.agent)!.push(event);
      } else {
        systemEvents.push(event);
      }
    });

    return { groups, systemEvents };
  }, [timelineEvents]);

  const getAgentStats = (agentName: string) => {
    const agentEvents = timelineEvents.filter(e => e.agent === agentName);
    const completedEvent = agentEvents.find(e => e.type === 'agent_completed');
    const toolUses = agentEvents.filter(e => e.type.includes('tool')).length;
    const textEvents = agentEvents.filter(e => e.type === 'text_generation');
    const totalWords = textEvents.reduce((acc, e) => acc + (e.metadata?.wordCount || 0), 0);

    return {
      duration: completedEvent?.metadata?.duration || 0,
      toolUses,
      totalWords,
      tokens: completedEvent?.metadata?.tokens || 0,
      events: agentEvents.length
    };
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getAgentColor = (agentName: string) => {
    const colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
    const hash = agentName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  return (
      <div className="execution-timeline-enhanced">
        <style>{`
        .execution-timeline-enhanced {
          height: 100%;
          background: var(--bg-primary);
          display: flex;
          flex-direction: column;
          color: var(--text-primary);
        }
        
        .timeline-header-enhanced {
          padding: 16px 20px;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-primary);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .timeline-title-enhanced {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }
        
        .timeline-stats-enhanced {
          display: flex;
          gap: 16px;
          font-size: 14px;
          padding: 12px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          color: var(--text-primary);
        }
        
        .stat-item-enhanced {
          display: flex;
          align-items: center;
          gap: 4px;
          color: var(--text-primary);
        }
        
        .stat-item-enhanced span:last-child {
          color: var(--accent-primary);
          font-weight: 600;
        }
        
        .timeline-controls-enhanced {
          display: flex;
          gap: 8px;
        }
        
        .view-toggle-enhanced {
          background: var(--bg-tertiary);
          border-radius: 8px;
          display: flex;
          padding: 2px;
        }
        
        .view-btn-enhanced {
          padding: 6px 12px;
          background: transparent;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          color: var(--text-secondary);
          transition: all 0.2s;
        }
        
        .view-btn-enhanced:hover {
          background: var(--hover-bg);
          color: var(--text-primary);
        }
        
        .view-btn-enhanced.active {
          background: var(--accent-primary);
          color: white;
          box-shadow: none;
        }
        
        .timeline-content-enhanced {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }
        
        .timeline-list-enhanced {
          display: flex;
          flex-direction: column;
          gap: 12px;
          position: relative;
        }
        
        .timeline-line-enhanced {
          position: absolute;
          left: 20px;
          top: 0;
          bottom: 0;
          width: 2px;
          background: var(--border-primary);
        }
        
        .timeline-event-enhanced {
          display: flex;
          gap: 16px;
          position: relative;
          animation: slideIn 0.3s ease;
        }
        
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .event-dot-enhanced {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: var(--bg-secondary);
          border: 3px solid;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          z-index: 1;
          flex-shrink: 0;
          box-shadow: none;
        }
        
        .event-content-enhanced {
          flex: 1;
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          padding: 12px 16px;
          box-shadow: none;
        }
        
        .event-header-enhanced {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
        }
        
        .event-info-enhanced {
          flex: 1;
        }
        
        .event-title-enhanced {
          font-weight: 500;
          color: var(--text-primary);
          font-size: 14px;
          margin-bottom: 4px;
        }
        
        .event-agent-enhanced {
          color: var(--text-secondary);
          font-size: 12px;
          text-transform: capitalize;
        }
        
        .event-time-enhanced {
          font-size: 12px;
          color: var(--text-secondary);
          text-align: right;
        }
        
        .event-metadata-enhanced {
          margin-top: 8px;
          padding: 8px;
          background: var(--bg-tertiary);
          border-radius: 6px;
          border-left: 3px solid var(--border-primary);
          font-size: 12px;
          color: var(--text-primary);
        }
        
        .metadata-toggle-enhanced {
          color: var(--text-secondary);
          cursor: pointer;
          user-select: none;
          font-size: 12px;
          margin-top: 4px;
        }
        
        .metadata-toggle-enhanced:hover {
          color: var(--text-primary);
        }
        
        .metadata-content-enhanced {
          margin-top: 8px;
          padding: 8px;
          background: var(--bg-tertiary);
          color: var(--text-primary);
          border-radius: 4px;
          font-family: monospace;
          font-size: 11px;
          white-space: pre-wrap;
          word-break: break-all;
          max-height: 200px;
          overflow-y: auto;
        }
        
        .grouped-view-enhanced {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        .agent-group-enhanced {
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          overflow: hidden;
        }
        
        .agent-header-enhanced {
          padding: 12px 16px;
          background: var(--bg-tertiary);
          border-bottom: 1px solid var(--border-primary);
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .agent-name-enhanced {
          font-weight: 600;
          color: var(--text-primary);
          text-transform: capitalize;
        }
        
        .agent-stats-enhanced {
          display: flex;
          gap: 12px;
          font-size: 12px;
          color: var(--text-secondary);
        }
        
        .agent-events-enhanced {
          padding: 12px 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .agent-event-enhanced {
          display: flex;
          gap: 12px;
          padding: 8px 12px;
          background: var(--bg-tertiary);
          border-radius: 6px;
          border-left: 3px solid;
        }
        
        .system-events-enhanced {
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          padding: 16px;
        }
        
        .section-title-enhanced {
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 12px;
          font-size: 14px;
        }
      `}</style>

        <div className="timeline-header-enhanced">
          <div>
            <h2 className="timeline-title-enhanced">Execution Timeline</h2>
            <div className="timeline-stats-enhanced">
              <div className="stat-item-enhanced">
                <span>📊</span>
                <span>{timelineEvents.length} events</span>
              </div>
              <div className="stat-item-enhanced">
                <span>🤖</span>
                <span>{agents.length} agents</span>
              </div>
              <div className="stat-item-enhanced">
                <span>🔄</span>
                <span>{timelineEvents.filter(e => e.type === 'handoff').length} handoffs</span>
              </div>
              <div className="stat-item-enhanced">
                <span>🔧</span>
                <span>{timelineEvents.filter(e => e.type.includes('tool')).length} tool uses</span>
              </div>
            </div>
          </div>

          <div className="timeline-controls-enhanced">
            <div className="view-toggle-enhanced">
              <button
                  className={`view-btn-enhanced ${viewMode === 'timeline' ? 'active' : ''}`}
                  onClick={() => setViewMode('timeline')}
              >
                Timeline
              </button>
              <button
                  className={`view-btn-enhanced ${viewMode === 'grouped' ? 'active' : ''}`}
                  onClick={() => setViewMode('grouped')}
              >
                By Agent
              </button>
            </div>
          </div>
        </div>

        <div className="timeline-content-enhanced" ref={containerRef}>
          {viewMode === 'timeline' ? (
              <div className="timeline-list-enhanced">
                <div className="timeline-line-enhanced"></div>
                {timelineEvents.map((event) => (
                    <div key={event.id} className="timeline-event-enhanced">
                      <div
                          className="event-dot-enhanced"
                          style={{
                            borderColor: event.color,
                            background: `${event.color}15`
                          }}
                      >
                        {event.icon}
                      </div>

                      <div className="event-content-enhanced">
                        <div className="event-header-enhanced">
                          <div className="event-info-enhanced">
                            <div className="event-title-enhanced">{event.content}</div>
                            {event.agent && (
                                <div
                                    className="event-agent-enhanced"
                                    style={{ color: event.color }}
                                >
                                  {event.agent.replace(/_/g, ' ')}
                                </div>
                            )}
                          </div>
                          <div className="event-time-enhanced">
                            {event.timestamp.toLocaleTimeString()}
                          </div>
                        </div>

                        {Object.keys(event.metadata || {}).length > 0 && (
                            <div>
                              <div
                                  className="metadata-toggle-enhanced"
                                  onClick={() => setShowMetadata(
                                      showMetadata === event.id ? null : event.id
                                  )}
                              >
                                {showMetadata === event.id ? '▼ Hide details' : '▶ Show details'}
                              </div>
                              {showMetadata === event.id && (
                                  <div className="metadata-content-enhanced">
                                    {JSON.stringify(event.metadata, null, 2)}
                                  </div>
                              )}
                            </div>
                        )}
                      </div>
                    </div>
                ))}
              </div>
          ) : (
              <div className="grouped-view-enhanced">
                {groupedEvents.systemEvents.length > 0 && (
                    <div className="system-events-enhanced">
                      <div className="section-title-enhanced">System Events</div>
                      {groupedEvents.systemEvents.map(event => (
                          <div
                              key={event.id}
                              className="agent-event-enhanced"
                              style={{ borderLeftColor: event.color }}
                          >
                            <span>{event.icon}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 500, fontSize: '13px' }}>{event.content}</div>
                              <div style={{ fontSize: '11px', color: '#6b7280' }}>
                                {event.timestamp.toLocaleTimeString()}
                              </div>
                            </div>
                          </div>
                      ))}
                    </div>
                )}

                {Array.from(groupedEvents.groups.entries()).map(([agentName, agentEvents]) => {
                  const stats = getAgentStats(agentName);
                  const agentColor = getAgentColor(agentName);
                  const isExpanded = selectedAgent === agentName;

                  return (
                      <div key={agentName} className="agent-group-enhanced">
                        <div
                            className="agent-header-enhanced"
                            onClick={() => setSelectedAgent(isExpanded ? null : agentName)}
                            style={{ borderLeft: `4px solid ${agentColor}` }}
                        >
                          <div className="agent-name-enhanced">
                            {agentName.replace(/_/g, ' ')}
                          </div>
                          <div className="agent-stats-enhanced">
                            <span>⏱️ {formatDuration(stats.duration)}</span>
                            <span>🔧 {stats.toolUses} tools</span>
                            <span>💬 {stats.totalWords} words</span>
                            <span>🎯 {stats.tokens} tokens</span>
                            <span>{isExpanded ? '▼' : '▶'}</span>
                          </div>
                        </div>

                        {isExpanded && (
                            <div className="agent-events-enhanced">
                              {agentEvents.map(event => (
                                  <div
                                      key={event.id}
                                      className="agent-event-enhanced"
                                      style={{ borderLeftColor: event.color }}
                                  >
                                    <span>{event.icon}</span>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontWeight: 500, fontSize: '13px' }}>
                                        {event.content}
                                      </div>
                                      <div style={{ fontSize: '11px', color: '#6b7280' }}>
                                        {event.timestamp.toLocaleTimeString()}
                                      </div>
                                      {event.metadata?.sample && (
                                          <div style={{
                                            fontSize: '11px',
                                            color: '#6b7280',
                                            fontStyle: 'italic',
                                            marginTop: '4px'
                                          }}>
                                            "{event.metadata.sample}"
                                          </div>
                                      )}
                                    </div>
                                  </div>
                              ))}
                            </div>
                        )}
                      </div>
                  );
                })}
              </div>
          )}
        </div>
      </div>
  );
};

export default ExecutionTimeline;