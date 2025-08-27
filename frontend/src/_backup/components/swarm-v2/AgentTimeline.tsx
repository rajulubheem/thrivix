import React from 'react';
import { 
  Clock, Play, Pause, CheckCircle, XCircle, AlertCircle,
  Wrench, Brain, ArrowRight, RefreshCw, Shield
} from 'lucide-react';
import { 
  SwarmExecution, AgentRole, AgentConfig, AgentState,
  PlanStep, Action
} from '../../types/swarm-v2';
import './AgentTimeline.css';

interface AgentTimelineProps {
  execution: SwarmExecution | null;
  agentConfigs: Record<AgentRole, AgentConfig>;
  expandedAgents: Set<AgentRole>;
  onToggleAgent: (agent: AgentRole) => void;
  selectedStep: string | null;
  onSelectStep: (stepId: string | null) => void;
}

interface TimelineCard {
  id: string;
  agent: AgentRole;
  title: string;
  description?: string;
  status: 'waiting' | 'running' | 'blocked' | 'done' | 'failed';
  startTime?: Date;
  endTime?: Date;
  tools?: string[];
  confidence?: number;
  artifacts?: number;
  retryCount?: number;
  cost?: number;
}

const AgentTimeline: React.FC<AgentTimelineProps> = ({
  execution,
  agentConfigs,
  expandedAgents,
  onToggleAgent,
  selectedStep,
  onSelectStep
}) => {
  // Group actions by agent for swimlane view
  const getAgentCards = (agent: AgentRole): TimelineCard[] => {
    if (!execution) return [];
    
    const cards: TimelineCard[] = [];
    const agentActions = execution.actions.filter(a => a.agent === agent);
    
    agentActions.forEach(action => {
      const step = execution.plan.find(s => s.id === action.stepId);
      if (step) {
        cards.push({
          id: action.id,
          agent,
          title: step.title,
          description: step.description,
          status: mapActionStatusToCardStatus(action.status),
          startTime: action.timestamp,
          tools: action.type === 'tool' ? [action.input?.tool] : undefined,
          confidence: action.confidence,
          cost: action.cost,
          retryCount: step.retryCount
        });
      }
    });
    
    return cards;
  };

  const mapActionStatusToCardStatus = (status: Action['status']): TimelineCard['status'] => {
    switch (status) {
      case 'pending': return 'waiting';
      case 'running': return 'running';
      case 'complete': return 'done';
      case 'failed': return 'failed';
      case 'approved': return 'done';
      case 'rejected': return 'blocked';
      default: return 'waiting';
    }
  };

  const getStatusIcon = (status: TimelineCard['status']) => {
    switch (status) {
      case 'waiting': return <Clock size={14} className="status-icon waiting" />;
      case 'running': return <Play size={14} className="status-icon running" />;
      case 'blocked': return <AlertCircle size={14} className="status-icon blocked" />;
      case 'done': return <CheckCircle size={14} className="status-icon done" />;
      case 'failed': return <XCircle size={14} className="status-icon failed" />;
    }
  };

  const formatDuration = (start?: Date, end?: Date) => {
    if (!start) return '';
    const endTime = end || new Date();
    const duration = Math.floor((endTime.getTime() - start.getTime()) / 1000);
    if (duration < 60) return `${duration}s`;
    return `${Math.floor(duration / 60)}m ${duration % 60}s`;
  };

  const agentRoles = Object.keys(agentConfigs) as AgentRole[];

  return (
    <div className="agent-timeline">
      {/* Timeline Header */}
      <div className="timeline-header">
        <div className="timeline-controls">
          <button className="expand-all" onClick={() => {
            if (expandedAgents.size === agentRoles.length) {
              expandedAgents.clear();
            } else {
              agentRoles.forEach(role => expandedAgents.add(role));
            }
          }}>
            {expandedAgents.size === agentRoles.length ? 'Collapse All' : 'Expand All'}
          </button>
        </div>
        {execution && (
          <div className="timeline-stats">
            <span>
              <Brain size={14} />
              {execution.metrics.totalHandoffs} handoffs
            </span>
            <span>
              <Wrench size={14} />
              {execution.metrics.totalToolCalls} tools
            </span>
            <span>
              <Clock size={14} />
              {formatDuration(execution.startTime)}
            </span>
          </div>
        )}
      </div>

      {/* Agent Swimlanes */}
      <div className="agent-swimlanes">
        {agentRoles.map(role => {
          const config = agentConfigs[role];
          const state = execution?.agentStates[role];
          const cards = getAgentCards(role);
          const isExpanded = expandedAgents.has(role);
          
          return (
            <div key={role} className={`agent-swimlane ${isExpanded ? 'expanded' : ''}`}>
              {/* Swimlane Header */}
              <div 
                className="swimlane-header"
                onClick={() => onToggleAgent(role)}
              >
                <div className="agent-info">
                  <span className="agent-avatar">{config.avatar}</span>
                  <span className="agent-name">{config.name}</span>
                  {state && state.status !== 'idle' && (
                    <span className={`agent-status status-${state.status}`}>
                      {state.status}
                    </span>
                  )}
                </div>
                <div className="agent-stats">
                  {cards.length > 0 && (
                    <span className="card-count">{cards.length} tasks</span>
                  )}
                  {state && state.tokensUsed > 0 && (
                    <span className="token-count">{state.tokensUsed} tokens</span>
                  )}
                </div>
              </div>

              {/* Swimlane Content */}
              {isExpanded && (
                <div className="swimlane-content">
                  {cards.length === 0 ? (
                    <div className="empty-lane">
                      <span>No tasks assigned yet</span>
                    </div>
                  ) : (
                    <div className="timeline-cards">
                      {cards.map(card => (
                        <div 
                          key={card.id}
                          className={`timeline-card status-${card.status} ${
                            selectedStep === card.id ? 'selected' : ''
                          }`}
                          onClick={() => onSelectStep(card.id)}
                        >
                          {/* Card Header */}
                          <div className="card-header">
                            <div className="card-title">
                              {getStatusIcon(card.status)}
                              <span>{card.title}</span>
                            </div>
                            <div className="card-time">
                              {card.startTime && formatDuration(card.startTime, card.endTime)}
                            </div>
                          </div>

                          {/* Card Body */}
                          {card.description && (
                            <div className="card-body">
                              <p>{card.description}</p>
                            </div>
                          )}

                          {/* Card Footer */}
                          <div className="card-footer">
                            <div className="card-meta">
                              {card.tools && card.tools.length > 0 && (
                                <span className="meta-item">
                                  <Wrench size={12} />
                                  {card.tools.length}
                                </span>
                              )}
                              {card.confidence !== undefined && (
                                <span className="meta-item">
                                  <Brain size={12} />
                                  {Math.round(card.confidence * 100)}%
                                </span>
                              )}
                              {card.retryCount && card.retryCount > 0 && (
                                <span className="meta-item">
                                  <RefreshCw size={12} />
                                  {card.retryCount}
                                </span>
                              )}
                              {card.cost !== undefined && (
                                <span className="meta-item">
                                  ${card.cost.toFixed(3)}
                                </span>
                              )}
                            </div>
                            
                            {/* Action buttons */}
                            {card.status === 'failed' && (
                              <button className="card-action retry">
                                Retry
                              </button>
                            )}
                            {card.status === 'blocked' && (
                              <button className="card-action approve">
                                Approve
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Handoff Indicators */}
              {execution && cards.length > 0 && (
                <div className="handoff-indicators">
                  {execution.handoffHistory
                    .filter(h => h.fromAgent === role)
                    .map((handoff, idx) => (
                      <div key={idx} className="handoff-indicator">
                        <ArrowRight size={14} />
                        <span>→ {agentConfigs[handoff.toAgent].name}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Timeline Footer */}
      {execution && execution.status === 'running' && (
        <div className="timeline-footer">
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ 
                width: `${(execution.metrics.stepsCompleted / execution.metrics.stepsTotal) * 100}%` 
              }}
            />
          </div>
          <div className="progress-text">
            {execution.metrics.stepsCompleted} of {execution.metrics.stepsTotal} steps completed
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentTimeline;