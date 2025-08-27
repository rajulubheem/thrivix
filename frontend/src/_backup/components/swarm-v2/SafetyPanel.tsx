import React, { useState } from 'react';
import { 
  Shield, AlertTriangle, AlertCircle, Info, 
  CheckCircle, X, ChevronDown, ChevronRight
} from 'lucide-react';
import { SafetyFlag, RunCaps } from '../../types/swarm-v2';
import './SafetyPanel.css';

interface SafetyPanelProps {
  flags: SafetyFlag[];
  runCaps: RunCaps;
}

const SafetyPanel: React.FC<SafetyPanelProps> = ({ flags, runCaps }) => {
  const [expandedFlags, setExpandedFlags] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | SafetyFlag['severity']>('all');

  const getSeverityIcon = (severity: SafetyFlag['severity']) => {
    switch (severity) {
      case 'critical': return <AlertTriangle size={16} className="icon-critical" />;
      case 'error': return <AlertCircle size={16} className="icon-error" />;
      case 'warning': return <AlertTriangle size={16} className="icon-warning" />;
      case 'info': return <Info size={16} className="icon-info" />;
    }
  };

  const getTypeLabel = (type: SafetyFlag['type']): string => {
    const labels: Record<SafetyFlag['type'], string> = {
      pii: 'PII Detected',
      unsafe_content: 'Unsafe Content',
      policy_violation: 'Policy Violation',
      cost_exceeded: 'Cost Exceeded',
      time_exceeded: 'Time Exceeded'
    };
    return labels[type] || type;
  };

  const toggleFlag = (flagId: string) => {
    setExpandedFlags(prev => {
      const next = new Set(prev);
      if (next.has(flagId)) {
        next.delete(flagId);
      } else {
        next.add(flagId);
      }
      return next;
    });
  };

  const filteredFlags = filter === 'all' 
    ? flags 
    : flags.filter(f => f.severity === filter);

  const severityCounts = {
    critical: flags.filter(f => f.severity === 'critical').length,
    error: flags.filter(f => f.severity === 'error').length,
    warning: flags.filter(f => f.severity === 'warning').length,
    info: flags.filter(f => f.severity === 'info').length
  };

  const unresolvedCount = flags.filter(f => !f.resolved).length;

  return (
    <div className="safety-panel">
      {/* Safety Settings */}
      <div className="safety-section">
        <h3>Safety Configuration</h3>
        <div className="safety-config">
          <div className="config-item">
            <Shield size={20} />
            <div className="config-info">
              <span className="config-label">Safety Level</span>
              <span className={`config-value level-${runCaps.safetyLevel}`}>
                {runCaps.safetyLevel}
              </span>
            </div>
          </div>
          <div className="config-item">
            <span className="config-label">Require Approvals</span>
            <span className="config-value">
              {runCaps.requireApprovals ? (
                <CheckCircle size={16} className="enabled" />
              ) : (
                <X size={16} className="disabled" />
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="safety-section">
        <h3>Safety Summary</h3>
        <div className="summary-stats">
          <div className="summary-stat">
            <span className="stat-value">{flags.length}</span>
            <span className="stat-label">Total Flags</span>
          </div>
          <div className="summary-stat">
            <span className="stat-value">{unresolvedCount}</span>
            <span className="stat-label">Unresolved</span>
          </div>
          <div className="summary-stat critical">
            <span className="stat-value">{severityCounts.critical}</span>
            <span className="stat-label">Critical</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="safety-filter">
        <button
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({flags.length})
        </button>
        <button
          className={`filter-btn severity-critical ${filter === 'critical' ? 'active' : ''}`}
          onClick={() => setFilter('critical')}
        >
          Critical ({severityCounts.critical})
        </button>
        <button
          className={`filter-btn severity-error ${filter === 'error' ? 'active' : ''}`}
          onClick={() => setFilter('error')}
        >
          Error ({severityCounts.error})
        </button>
        <button
          className={`filter-btn severity-warning ${filter === 'warning' ? 'active' : ''}`}
          onClick={() => setFilter('warning')}
        >
          Warning ({severityCounts.warning})
        </button>
        <button
          className={`filter-btn severity-info ${filter === 'info' ? 'active' : ''}`}
          onClick={() => setFilter('info')}
        >
          Info ({severityCounts.info})
        </button>
      </div>

      {/* Flags List */}
      <div className="flags-container">
        {filteredFlags.length === 0 ? (
          <div className="empty-flags">
            <Shield size={48} />
            <p>No safety flags</p>
            <small>All checks passed successfully</small>
          </div>
        ) : (
          <div className="flags-list">
            {filteredFlags.map(flag => {
              const isExpanded = expandedFlags.has(flag.id);
              
              return (
                <div 
                  key={flag.id}
                  className={`flag-item severity-${flag.severity} ${flag.resolved ? 'resolved' : ''}`}
                >
                  <div 
                    className="flag-header"
                    onClick={() => toggleFlag(flag.id)}
                  >
                    <div className="flag-icon">
                      {getSeverityIcon(flag.severity)}
                    </div>
                    <div className="flag-info">
                      <div className="flag-title">
                        <span className="flag-type">{getTypeLabel(flag.type)}</span>
                        {flag.resolved && (
                          <span className="flag-resolved">Resolved</span>
                        )}
                      </div>
                      <div className="flag-meta">
                        <span className="flag-agent">{flag.agent}</span>
                        <span className="flag-time">
                          {new Date(flag.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                    <div className="flag-expand">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="flag-details">
                      <p className="flag-message">{flag.message}</p>
                      {flag.stepId && (
                        <div className="flag-step">
                          Related Step: <code>{flag.stepId}</code>
                        </div>
                      )}
                      {!flag.resolved && flag.severity === 'critical' && (
                        <div className="flag-actions">
                          <button className="action-btn resolve">
                            Mark as Resolved
                          </button>
                          <button className="action-btn halt">
                            Halt Execution
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Policy Guidelines */}
      <div className="safety-section">
        <h3>Active Policies</h3>
        <div className="policies-list">
          <div className="policy-item">
            <CheckCircle size={14} className="policy-icon" />
            <span>PII detection and redaction</span>
          </div>
          <div className="policy-item">
            <CheckCircle size={14} className="policy-icon" />
            <span>Content safety filtering</span>
          </div>
          <div className="policy-item">
            <CheckCircle size={14} className="policy-icon" />
            <span>Cost and time limits enforcement</span>
          </div>
          {runCaps.requireApprovals && (
            <div className="policy-item">
              <CheckCircle size={14} className="policy-icon" />
              <span>Human approval for external actions</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SafetyPanel;