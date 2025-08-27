import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, StopCircle, Clock, Zap, FileText, 
  CheckCircle, AlertCircle, ArrowRight, Brain, Search, Code, TestTube, Shield
} from 'lucide-react';
import './SwarmTimeline.css';

export interface TimelineAgent {
  id: string;
  name: string;
  color: string;
  avatar: string;
  status: 'idle' | 'working' | 'complete' | 'failed';
}

export interface TimelineEvent {
  id: string;
  agentId: string;
  action: string;
  status: 'running' | 'complete' | 'failed';
  timestamp: Date;
  duration?: number;
  artifacts?: string[];
  details?: string;
}

interface SwarmTimelineProps {
  agents: TimelineAgent[];
  events: TimelineEvent[];
  isRunning: boolean;
  metrics: {
    stepsCompleted: number;
    totalSteps: number;
    toolCalls: number;
    elapsedTime: number;
    tokensUsed: number;
  };
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
}

const SwarmTimeline: React.FC<SwarmTimelineProps> = ({
  agents,
  events,
  isRunning,
  metrics,
  onPause,
  onResume,
  onStop
}) => {
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const timelineRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  
  // Auto-scroll to latest event
  useEffect(() => {
    if (autoScroll && timelineRef.current) {
      const lastCard = timelineRef.current.querySelector('.agent-card:last-child');
      if (lastCard) {
        lastCard.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
  }, [events, autoScroll]);
  
  // Group events by agent
  const eventsByAgent = events.reduce((acc, event) => {
    if (!acc[event.agentId]) acc[event.agentId] = [];
    acc[event.agentId].push(event);
    return acc;
  }, {} as Record<string, TimelineEvent[]>);
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Play size={12} className="status-icon running" />;
      case 'complete': return <CheckCircle size={12} className="status-icon complete" />;
      case 'failed': return <AlertCircle size={12} className="status-icon failed" />;
      default: return null;
    }
  };
  
  const getActionIcon = (action: string) => {
    const actionLower = action.toLowerCase();
    if (actionLower.includes('research') || actionLower.includes('search')) 
      return <Search size={14} />;
    if (actionLower.includes('code') || actionLower.includes('build') || actionLower.includes('implement'))
      return <Code size={14} />;
    if (actionLower.includes('test') || actionLower.includes('validate'))
      return <TestTube size={14} />;
    if (actionLower.includes('review') || actionLower.includes('check'))
      return <Shield size={14} />;
    if (actionLower.includes('think') || actionLower.includes('plan'))
      return <Brain size={14} />;
    return <Zap size={14} />;
  };
  
  const toggleAgent = (agentId: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };
  
  return (
    <div className="swarm-timeline">
      {/* Timeline Header */}
      <div className="timeline-header">
        <div className="header-title">
          <h2>Agent Timeline</h2>
          <div className="timeline-controls">
            {isRunning ? (
              <button className="control-btn pause" onClick={onPause}>
                <Pause size={16} /> Pause
              </button>
            ) : (
              <button className="control-btn play" onClick={onResume}>
                <Play size={16} /> Resume
              </button>
            )}
            <button className="control-btn stop" onClick={onStop}>
              <StopCircle size={16} /> Stop
            </button>
            <button 
              className={`control-btn ${autoScroll ? 'active' : ''}`}
              onClick={() => setAutoScroll(!autoScroll)}
            >
              Auto-scroll
            </button>
          </div>
        </div>
        
        {/* Live Metrics Bar */}
        <div className="metrics-bar">
          <div className="metric">
            <span className="metric-label">Steps</span>
            <span className="metric-value">{metrics.stepsCompleted}/{metrics.totalSteps}</span>
          </div>
          <div className="metric">
            <span className="metric-label">Tools</span>
            <span className="metric-value">{metrics.toolCalls}</span>
          </div>
          <div className="metric">
            <span className="metric-label">Tokens</span>
            <span className="metric-value">{metrics.tokensUsed.toLocaleString()}</span>
          </div>
          <div className="metric">
            <Clock size={14} />
            <span className="metric-value">{formatTime(metrics.elapsedTime)}</span>
          </div>
        </div>
      </div>
      
      {/* Agent Lanes */}
      <div className="agent-lanes" ref={timelineRef}>
        {agents.map((agent, idx) => {
          const agentEvents = eventsByAgent[agent.id] || [];
          const isExpanded = expandedAgents.has(agent.id) || agent.status === 'working';
          const latestEvent = agentEvents[agentEvents.length - 1];
          
          return (
            <div key={agent.id} className={`agent-lane ${agent.status}`}>
              {/* Lane Header */}
              <div 
                className="lane-header"
                style={{ borderLeftColor: agent.color }}
                onClick={() => toggleAgent(agent.id)}
              >
                <div className="agent-info">
                  <span className="agent-avatar">{agent.avatar}</span>
                  <span className="agent-name">{agent.name}</span>
                  {agent.status === 'working' && (
                    <span className="agent-status working">
                      <div className="pulse-dot"></div>
                      Working
                    </span>
                  )}
                  {agent.status === 'complete' && (
                    <span className="agent-status complete">
                      <CheckCircle size={12} /> Done
                    </span>
                  )}
                </div>
                
                {latestEvent && (
                  <div className="lane-summary">
                    <span className="event-count">{agentEvents.length} actions</span>
                    <span className="latest-action">{latestEvent.action}</span>
                  </div>
                )}
              </div>
              
              {/* Agent Events */}
              {isExpanded && (
                <div className="agent-events">
                  {agentEvents.length === 0 ? (
                    <div className="no-events">Waiting for tasks...</div>
                  ) : (
                    agentEvents.map((event, idx) => (
                      <div 
                        key={event.id} 
                        className={`agent-card ${event.status}`}
                        style={{ 
                          borderLeftColor: agent.color,
                          animationDelay: `${idx * 0.1}s`
                        }}
                      >
                        <div className="card-header">
                          <div className="card-action">
                            {getActionIcon(event.action)}
                            <span>{event.action}</span>
                          </div>
                          <div className="card-status">
                            {getStatusIcon(event.status)}
                            {event.status}
                          </div>
                        </div>
                        
                        {event.details && (
                          <div className="card-details">{event.details}</div>
                        )}
                        
                        {event.artifacts && event.artifacts.length > 0 && (
                          <div className="card-artifacts">
                            {event.artifacts.map((artifact, i) => (
                              <span key={i} className="artifact-tag">
                                <FileText size={10} /> {artifact}
                              </span>
                            ))}
                          </div>
                        )}
                        
                        <div className="card-footer">
                          <span className="timestamp">
                            {event.timestamp.toLocaleTimeString()}
                          </span>
                          {event.duration && (
                            <span className="duration">
                              {event.duration}ms
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
              
              {/* Handoff Indicator */}
              {idx < agents.length - 1 && agentEvents.some(e => e.status === 'complete') && (
                <div className="handoff-arrow">
                  <ArrowRight size={16} />
                  <span>Handoff to {agents[idx + 1]?.name}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Progress Bar */}
      <div className="timeline-progress">
        <div 
          className="progress-fill"
          style={{ 
            width: `${(metrics.stepsCompleted / Math.max(metrics.totalSteps, 1)) * 100}%` 
          }}
        />
        <div className="progress-text">
          Progress: {Math.round((metrics.stepsCompleted / Math.max(metrics.totalSteps, 1)) * 100)}%
        </div>
      </div>
    </div>
  );
};

export default SwarmTimeline;