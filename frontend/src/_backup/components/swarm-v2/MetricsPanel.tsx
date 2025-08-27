import React from 'react';
import { 
  TrendingUp, Clock, DollarSign, Zap, Brain, 
  RefreshCw, CheckCircle, AlertTriangle, Activity
} from 'lucide-react';
import { SwarmExecution } from '../../types/swarm-v2';
import './MetricsPanel.css';

interface MetricsPanelProps {
  execution: SwarmExecution;
}

const MetricsPanel: React.FC<MetricsPanelProps> = ({ execution }) => {
  const { metrics } = execution;

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getProgressPercentage = (): number => {
    if (metrics.stepsTotal === 0) return 0;
    return (metrics.stepsCompleted / metrics.stepsTotal) * 100;
  };

  const getCostStatus = (): 'good' | 'warning' | 'danger' => {
    const costPercentage = (metrics.totalCost / execution.runCaps.maxCost) * 100;
    if (costPercentage < 50) return 'good';
    if (costPercentage < 80) return 'warning';
    return 'danger';
  };

  const getEfficiencyScore = (): number => {
    // Calculate efficiency based on success rate, retries, and confidence
    const successWeight = metrics.successRate * 0.5;
    const retryPenalty = Math.max(0, 1 - (metrics.retryCount * 0.1)) * 0.25;
    const confidenceWeight = metrics.confidenceAvg * 0.25;
    return Math.round((successWeight + retryPenalty + confidenceWeight) * 100);
  };

  return (
    <div className="metrics-panel">
      {/* Overall Progress */}
      <div className="metrics-section">
        <h3>Progress</h3>
        <div className="progress-container">
          <div className="progress-bar-large">
            <div 
              className="progress-fill-large"
              style={{ width: `${getProgressPercentage()}%` }}
            />
          </div>
          <div className="progress-stats">
            <span>{metrics.stepsCompleted} of {metrics.stepsTotal} steps</span>
            <span>{Math.round(getProgressPercentage())}%</span>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="metrics-section">
        <h3>Key Metrics</h3>
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-icon">
              <Clock size={20} />
            </div>
            <div className="metric-content">
              <div className="metric-value">
                {formatDuration(metrics.totalDuration)}
              </div>
              <div className="metric-label">Duration</div>
            </div>
          </div>

          <div className={`metric-card cost-${getCostStatus()}`}>
            <div className="metric-icon">
              <DollarSign size={20} />
            </div>
            <div className="metric-content">
              <div className="metric-value">
                ${metrics.totalCost.toFixed(3)}
              </div>
              <div className="metric-label">
                Cost ({Math.round((metrics.totalCost / execution.runCaps.maxCost) * 100)}%)
              </div>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon">
              <Zap size={20} />
            </div>
            <div className="metric-content">
              <div className="metric-value">
                {formatNumber(metrics.totalTokens)}
              </div>
              <div className="metric-label">Tokens</div>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon">
              <Activity size={20} />
            </div>
            <div className="metric-content">
              <div className="metric-value">
                {metrics.totalHandoffs}
              </div>
              <div className="metric-label">Handoffs</div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Indicators */}
      <div className="metrics-section">
        <h3>Performance</h3>
        <div className="performance-indicators">
          <div className="indicator">
            <div className="indicator-header">
              <CheckCircle size={16} />
              <span>Success Rate</span>
            </div>
            <div className="indicator-bar">
              <div 
                className="indicator-fill success"
                style={{ width: `${metrics.successRate * 100}%` }}
              />
            </div>
            <span className="indicator-value">
              {Math.round(metrics.successRate * 100)}%
            </span>
          </div>

          <div className="indicator">
            <div className="indicator-header">
              <Brain size={16} />
              <span>Avg Confidence</span>
            </div>
            <div className="indicator-bar">
              <div 
                className="indicator-fill confidence"
                style={{ width: `${metrics.confidenceAvg * 100}%` }}
              />
            </div>
            <span className="indicator-value">
              {Math.round(metrics.confidenceAvg * 100)}%
            </span>
          </div>

          <div className="indicator">
            <div className="indicator-header">
              <TrendingUp size={16} />
              <span>Efficiency Score</span>
            </div>
            <div className="indicator-bar">
              <div 
                className="indicator-fill efficiency"
                style={{ width: `${getEfficiencyScore()}%` }}
              />
            </div>
            <span className="indicator-value">
              {getEfficiencyScore()}%
            </span>
          </div>
        </div>
      </div>

      {/* Detailed Stats */}
      <div className="metrics-section">
        <h3>Detailed Statistics</h3>
        <div className="stats-list">
          <div className="stat-item">
            <span className="stat-label">Tool Calls</span>
            <span className="stat-value">{metrics.totalToolCalls}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Retries</span>
            <span className="stat-value">{metrics.retryCount}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Artifacts</span>
            <span className="stat-value">{metrics.artifactsGenerated}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Safety Flags</span>
            <span className="stat-value">
              {metrics.safetyFlags > 0 ? (
                <span className="warning">
                  <AlertTriangle size={14} /> {metrics.safetyFlags}
                </span>
              ) : (
                <span className="success">0</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Agent Performance */}
      <div className="metrics-section">
        <h3>Agent Activity</h3>
        <div className="agent-stats">
          {Object.entries(execution.agentStates).map(([role, state]) => (
            <div key={role} className="agent-stat">
              <div className="agent-stat-header">
                <span className="agent-role">{role}</span>
                <span className={`agent-status status-${state.status}`}>
                  {state.status}
                </span>
              </div>
              <div className="agent-stat-metrics">
                <span>
                  <Zap size={12} />
                  {formatNumber(state.tokensUsed)} tokens
                </span>
                <span>
                  <Activity size={12} />
                  {state.toolCallsCount} tools
                </span>
                <span>
                  <RefreshCw size={12} />
                  {state.handoffsCount} handoffs
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MetricsPanel;