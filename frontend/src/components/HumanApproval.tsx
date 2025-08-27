/**
 * Human Approval Component
 * Handles tool approval requests and user interventions
 */

import React, { useState, useEffect, useCallback } from 'react';
import { HumanApprovalRequest, ToolCall, StrandsAgent } from '../types/strands';
import toolRegistry from '../services/toolRegistry';
import './HumanApproval.css';

interface HumanApprovalProps {
  requests: HumanApprovalRequest[];
  onApprove: (requestId: string, modifiedParams?: any) => void;
  onReject: (requestId: string, reason?: string) => void;
  agents: StrandsAgent[];
  trustSettings?: {
    autoApproveReadOnly: boolean;
    autoApproveForTrustedAgents: boolean;
    requireReasonForRejection: boolean;
  };
}

const HumanApproval: React.FC<HumanApprovalProps> = ({
  requests,
  onApprove,
  onReject,
  agents,
  trustSettings = {
    autoApproveReadOnly: false,
    autoApproveForTrustedAgents: false,
    requireReasonForRejection: true
  }
}) => {
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);
  const [editedParams, setEditedParams] = useState<Record<string, any>>({});
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [autoApprovalEnabled, setAutoApprovalEnabled] = useState(false);
  const [processedRequests, setProcessedRequests] = useState<Set<string>>(new Set());
  const [isMinimized, setIsMinimized] = useState(false);

  // Auto-approve safe operations if enabled
  useEffect(() => {
    if (!autoApprovalEnabled) return;

    requests.forEach(request => {
      if (processedRequests.has(request.id)) return;

      const shouldAutoApprove = checkAutoApproval(request);
      if (shouldAutoApprove) {
        console.log(`🤖 Auto-approving request ${request.id}`);
        onApprove(request.id);
        setProcessedRequests(prev => new Set(prev).add(request.id));
      }
    });
  }, [requests, autoApprovalEnabled, processedRequests, onApprove]);

  const checkAutoApproval = (request: HumanApprovalRequest): boolean => {
    if (!autoApprovalEnabled) return false;

    // Check if it's a tool execution request
    if (request.type === 'tool_execution' && request.details.toolCall) {
      const toolCall = request.details.toolCall;
      const tool = toolRegistry.getTool(toolCall.toolName);
      
      if (!tool) return false;

      // Auto-approve read-only operations if enabled
      if (trustSettings.autoApproveReadOnly && tool.category === 'file_ops' && toolCall.toolName === 'file_read') {
        return true;
      }

      // Auto-approve for high-trust agents if enabled
      if (trustSettings.autoApproveForTrustedAgents) {
        const agent = agents.find(a => a.name === request.requestedBy);
        if (agent?.trustLevel === 'high' && !toolRegistry.getSafetyConfig().sensitiveTools.includes(toolCall.toolName)) {
          return true;
        }
      }
    }

    return false;
  };

  const handleApprove = useCallback((requestId: string) => {
    const params = editedParams[requestId];
    onApprove(requestId, params);
    
    // Clean up state
    setEditedParams(prev => {
      const newParams = { ...prev };
      delete newParams[requestId];
      return newParams;
    });
    setExpandedRequest(null);
  }, [onApprove, editedParams]);

  const handleReject = useCallback((requestId: string) => {
    const reason = rejectionReasons[requestId];
    
    if (trustSettings.requireReasonForRejection && !reason) {
      alert('Please provide a reason for rejection');
      return;
    }

    onReject(requestId, reason);
    
    // Clean up state
    setRejectionReasons(prev => {
      const newReasons = { ...prev };
      delete newReasons[requestId];
      return newReasons;
    });
    setExpandedRequest(null);
  }, [onReject, rejectionReasons, trustSettings.requireReasonForRejection]);

  const handleParamEdit = (requestId: string, paramName: string, value: any) => {
    setEditedParams(prev => ({
      ...prev,
      [requestId]: {
        ...(prev[requestId] || {}),
        [paramName]: value
      }
    }));
  };

  const renderToolCallDetails = (toolCall: ToolCall) => {
    const tool = toolRegistry.getTool(toolCall.toolName);
    if (!tool) return null;

    const validation = toolRegistry.validateToolCall(toolCall);

    return (
      <div className="tool-call-details">
        <div className="tool-header">
          <span className="tool-name">{toolCall.toolName}</span>
          <span className={`tool-category ${tool.category}`}>{tool.category}</span>
        </div>
        
        <p className="tool-description">{tool.description}</p>

        {!validation.valid && (
          <div className="validation-errors">
            <strong>⚠️ Validation Issues:</strong>
            <ul>
              {validation.errors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="parameters">
          <h4>Parameters:</h4>
          {tool.parameters.map(param => {
            const value = editedParams[toolCall.id]?.[param.name] ?? toolCall.parameters[param.name];
            const isEditing = expandedRequest === toolCall.id;

            return (
              <div key={param.name} className="parameter">
                <label>
                  <span className="param-name">
                    {param.name}
                    {param.required && <span className="required">*</span>}
                  </span>
                  <span className="param-type">({param.type})</span>
                </label>
                
                {isEditing ? (
                  <input
                    type={param.type === 'number' ? 'number' : 'text'}
                    value={value || param.default || ''}
                    onChange={(e) => handleParamEdit(
                      toolCall.id,
                      param.name,
                      param.type === 'number' ? Number(e.target.value) : e.target.value
                    )}
                    className="param-input"
                  />
                ) : (
                  <span className="param-value">
                    {JSON.stringify(value || param.default || 'null')}
                  </span>
                )}
                
                {param.description && (
                  <span className="param-description">{param.description}</span>
                )}
              </div>
            );
          })}
        </div>

        {tool.requiresApproval && (
          <div className="approval-warning">
            ⚠️ This tool requires approval for safety reasons
          </div>
        )}
      </div>
    );
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');

  if (pendingRequests.length === 0) {
    return null;
  }

  return (
    <div className={`human-approval-panel ${isMinimized ? 'minimized' : ''}`}>
      <div 
        className="approval-header"
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div className="header-left">
          <span className="approval-icon">🔐</span>
          <h3>Approval Required</h3>
          <span className="request-count">{pendingRequests.length}</span>
        </div>
        
        <div className="header-controls">
          <div className="auto-approval-toggle" onClick={(e) => e.stopPropagation()}>
            <label>
              <input
                type="checkbox"
                checked={autoApprovalEnabled}
                onChange={(e) => setAutoApprovalEnabled(e.target.checked)}
              />
              Auto-approve safe
            </label>
          </div>
          
          <button 
            className="minimize-toggle"
            onClick={(e) => {
              e.stopPropagation();
              setIsMinimized(!isMinimized);
            }}
          >
            {isMinimized ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          <div className="approval-requests">
            {pendingRequests.map(request => (
          <div key={request.id} className={`approval-request ${request.type}`}>
            <div className="request-header">
              <div className="request-info">
                <span className="request-type">{request.type.replace('_', ' ')}</span>
                <span className="requested-by">by {request.requestedBy}</span>
                <span className="request-time">
                  {new Date(request.timestamp).toLocaleTimeString()}
                </span>
              </div>
              
              {request.expiresAt && (
                <div className="expiry-warning">
                  Expires: {new Date(request.expiresAt).toLocaleTimeString()}
                </div>
              )}
            </div>

            <div className="request-message">
              {request.message}
            </div>

            {request.type === 'tool_execution' && request.details.toolCall && (
              <div className="request-details">
                {renderToolCallDetails(request.details.toolCall)}
              </div>
            )}

            {request.type === 'agent_handoff' && request.details.handoff && (
              <div className="handoff-details">
                <strong>Handoff Request:</strong>
                <p>{request.details.handoff.from} → {request.details.handoff.to}</p>
                <p>Reason: {request.details.handoff.reason}</p>
              </div>
            )}

            {request.type === 'content_generation' && request.details.content && (
              <div className="content-preview">
                <strong>Content Preview:</strong>
                <pre>{request.details.content.preview}</pre>
              </div>
            )}

            <div className="request-actions">
              {trustSettings.requireReasonForRejection && (
                <input
                  type="text"
                  placeholder="Reason for rejection (optional for approval)"
                  value={rejectionReasons[request.id] || ''}
                  onChange={(e) => setRejectionReasons(prev => ({
                    ...prev,
                    [request.id]: e.target.value
                  }))}
                  className="rejection-reason"
                />
              )}

              <div className="action-buttons">
                <button
                  onClick={() => setExpandedRequest(
                    expandedRequest === request.id ? null : request.id
                  )}
                  className="edit-button"
                >
                  {expandedRequest === request.id ? '✏️ Done Editing' : '✏️ Edit Parameters'}
                </button>

                <button
                  onClick={() => handleApprove(request.id)}
                  className="approve-button"
                >
                  ✅ Approve
                </button>

                <button
                  onClick={() => handleReject(request.id)}
                  className="reject-button"
                >
                  ❌ Reject
                </button>
              </div>
            </div>

            {/* Quick approve for trusted operations */}
            {checkAutoApproval(request) && !autoApprovalEnabled && (
              <div className="quick-approve-hint">
                💡 This appears to be a safe operation. Consider enabling auto-approval.
              </div>
            )}
          </div>
            ))}
          </div>

          <div className="approval-footer">
        <div className="trust-settings">
          <h4>Trust Settings:</h4>
          <label>
            <input
              type="checkbox"
              checked={trustSettings.autoApproveReadOnly}
              disabled
            />
            Auto-approve read-only operations
          </label>
          <label>
            <input
              type="checkbox"
              checked={trustSettings.autoApproveForTrustedAgents}
              disabled
            />
            Auto-approve for high-trust agents
          </label>
        </div>

        <div className="bulk-actions">
          <button
            onClick={() => {
              pendingRequests.forEach(r => {
                if (checkAutoApproval(r)) {
                  handleApprove(r.id);
                }
              });
            }}
            className="bulk-approve-safe"
          >
            ✅ Approve All Safe
          </button>

          <button
            onClick={() => {
              if (window.confirm('Reject all pending requests?')) {
                pendingRequests.forEach(r => handleReject(r.id));
              }
            }}
            className="bulk-reject"
          >
            ❌ Reject All
          </button>
          </div>
          </div>
        </>
      )}
    </div>
  );
};

export default HumanApproval;