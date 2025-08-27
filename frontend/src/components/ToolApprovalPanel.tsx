/**
 * Tool Approval Panel for SwarmChat
 * Integrates with existing backend handoff_to_user tool
 */

import React, { useState, useEffect } from 'react';
import './ToolApprovalPanel.css';

interface ToolApprovalRequest {
  id: string;
  agent: string;
  tool: string;
  parameters: Record<string, any>;
  timestamp: Date;
  message?: string;
}

interface ToolApprovalPanelProps {
  requests: ToolApprovalRequest[];
  onApprove: (requestId: string, modifiedParams?: Record<string, any>) => void;
  onReject: (requestId: string, reason?: string) => void;
  position?: 'top' | 'bottom' | 'floating';
}

const ToolApprovalPanel: React.FC<ToolApprovalPanelProps> = ({
  requests,
  onApprove,
  onReject,
  position = 'floating'
}) => {
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);
  const [editedParams, setEditedParams] = useState<Record<string, any>>({});
  const [rejectionReason, setRejectionReason] = useState<string>('');

  // Auto-expand first request
  useEffect(() => {
    if (requests.length === 1 && !expandedRequest) {
      setExpandedRequest(requests[0].id);
    }
  }, [requests, expandedRequest]);

  if (requests.length === 0) {
    return null;
  }

  const handleParamEdit = (requestId: string, paramName: string, value: any) => {
    setEditedParams(prev => ({
      ...prev,
      [requestId]: {
        ...(prev[requestId] || {}),
        [paramName]: value
      }
    }));
  };

  const handleApprove = (requestId: string) => {
    const params = editedParams[requestId];
    onApprove(requestId, params);
    
    // Clean up
    setEditedParams(prev => {
      const newParams = { ...prev };
      delete newParams[requestId];
      return newParams;
    });
    setExpandedRequest(null);
  };

  const handleReject = (requestId: string) => {
    onReject(requestId, rejectionReason || 'User rejected');
    setRejectionReason('');
    setExpandedRequest(null);
  };

  // Determine safe vs sensitive tools
  const getSafetyLevel = (toolName: string): 'safe' | 'caution' | 'danger' => {
    const safeTools = ['file_read', 'http_request', 'calculator', 'current_time'];
    const dangerTools = ['shell', 'file_write', 'editor', 'python_repl'];
    
    if (safeTools.includes(toolName)) return 'safe';
    if (dangerTools.includes(toolName)) return 'danger';
    return 'caution';
  };

  return (
    <div className={`tool-approval-panel ${position}`}>
      <div className="approval-header">
        <div className="header-title">
          <span className="approval-icon">🔐</span>
          <h3>Tool Approval Required</h3>
          <span className="request-count">{requests.length}</span>
        </div>
        
        {requests.length > 1 && (
          <div className="bulk-actions">
            <button 
              className="approve-all-safe"
              onClick={() => {
                requests.forEach(req => {
                  if (getSafetyLevel(req.tool) === 'safe') {
                    handleApprove(req.id);
                  }
                });
              }}
            >
              Approve Safe Tools
            </button>
          </div>
        )}
      </div>

      <div className="approval-requests">
        {requests.map(request => {
          const isExpanded = expandedRequest === request.id;
          const safetyLevel = getSafetyLevel(request.tool);
          const params = editedParams[request.id] || request.parameters;

          return (
            <div 
              key={request.id} 
              className={`approval-request ${safetyLevel} ${isExpanded ? 'expanded' : ''}`}
            >
              <div 
                className="request-summary"
                onClick={() => setExpandedRequest(isExpanded ? null : request.id)}
              >
                <div className="request-info">
                  <span className={`agent-badge ${request.agent}`}>
                    {request.agent}
                  </span>
                  <span className="tool-name">
                    {request.tool}
                  </span>
                  <span className={`safety-indicator ${safetyLevel}`}>
                    {safetyLevel === 'safe' ? '✅' : safetyLevel === 'danger' ? '⚠️' : '⚡'}
                  </span>
                </div>
                
                <div className="expand-indicator">
                  {isExpanded ? '▼' : '▶'}
                </div>
              </div>

              {isExpanded && (
                <div className="request-details">
                  {request.message && (
                    <div className="request-message">
                      {request.message}
                    </div>
                  )}

                  <div className="parameters">
                    <h4>Parameters:</h4>
                    {Object.entries(params).map(([key, value]) => (
                      <div key={key} className="parameter">
                        <label>{key}:</label>
                        {typeof value === 'string' || typeof value === 'number' ? (
                          <input
                            type="text"
                            value={value}
                            onChange={(e) => handleParamEdit(request.id, key, e.target.value)}
                            className="param-input"
                          />
                        ) : (
                          <pre className="param-value">{JSON.stringify(value, null, 2)}</pre>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="request-actions">
                    <input
                      type="text"
                      placeholder="Rejection reason (optional)"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="rejection-input"
                    />
                    
                    <div className="action-buttons">
                      <button 
                        className="approve-btn"
                        onClick={() => handleApprove(request.id)}
                      >
                        ✅ Approve
                      </button>
                      
                      <button 
                        className="reject-btn"
                        onClick={() => handleReject(request.id)}
                      >
                        ❌ Reject
                      </button>
                    </div>
                  </div>

                  {safetyLevel === 'danger' && (
                    <div className="safety-warning">
                      ⚠️ This tool can modify your system. Review parameters carefully.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ToolApprovalPanel;