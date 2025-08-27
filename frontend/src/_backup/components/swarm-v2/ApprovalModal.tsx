import React, { useState } from 'react';
import { 
  AlertTriangle, CheckCircle, XCircle, 
  Shield, Info, Clock, DollarSign
} from 'lucide-react';
import { ApprovalRequest } from '../../types/swarm-v2';
import './ApprovalModal.css';

interface ApprovalModalProps {
  approval: ApprovalRequest;
  onApprove: (details: any) => void;
  onReject: (reason: string) => void;
  onClose: () => void;
}

const ApprovalModal: React.FC<ApprovalModalProps> = ({
  approval,
  onApprove,
  onReject,
  onClose
}) => {
  const [rejectReason, setRejectReason] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [conditions, setConditions] = useState({
    limitScope: false,
    requireLogging: false,
    oneTimeOnly: false
  });

  const getRiskIcon = () => {
    switch (approval.risk) {
      case 'high': return <AlertTriangle size={24} className="risk-high" />;
      case 'medium': return <Info size={24} className="risk-medium" />;
      case 'low': return <CheckCircle size={24} className="risk-low" />;
    }
  };

  const getRiskColor = () => {
    switch (approval.risk) {
      case 'high': return 'risk-high';
      case 'medium': return 'risk-medium';
      case 'low': return 'risk-low';
    }
  };

  const getTypeLabel = () => {
    const labels: Record<ApprovalRequest['type'], string> = {
      tool_execution: 'Tool Execution',
      external_api: 'External API Call',
      code_execution: 'Code Execution',
      data_export: 'Data Export',
      handoff: 'Agent Handoff'
    };
    return labels[approval.type] || approval.type;
  };

  const handleApprove = () => {
    onApprove({
      conditions,
      notes: additionalNotes,
      timestamp: new Date().toISOString()
    });
  };

  const handleReject = () => {
    if (!rejectReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }
    onReject(rejectReason);
  };

  return (
    <div className="approval-modal-overlay">
      <div className="approval-modal">
        <div className="modal-header">
          <h2>Approval Required</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Risk Level */}
          <div className={`risk-indicator ${getRiskColor()}`}>
            {getRiskIcon()}
            <div className="risk-info">
              <span className="risk-label">Risk Level</span>
              <span className="risk-value">{approval.risk.toUpperCase()}</span>
            </div>
          </div>

          {/* Request Details */}
          <div className="approval-details">
            <div className="detail-item">
              <span className="detail-label">Type</span>
              <span className="detail-value">{getTypeLabel()}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Agent</span>
              <span className="detail-value">{approval.agent}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Step</span>
              <span className="detail-value">{approval.stepId}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Time</span>
              <span className="detail-value">
                {new Date(approval.requestedAt).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Description */}
          <div className="approval-description">
            <h3>Description</h3>
            <p>{approval.description}</p>
          </div>

          {/* Additional Details */}
          {approval.details && Object.keys(approval.details).length > 0 && (
            <div className="approval-extra-details">
              <h3>Additional Information</h3>
              <pre>{JSON.stringify(approval.details, null, 2)}</pre>
            </div>
          )}

          {/* Conditions */}
          <div className="approval-conditions">
            <h3>Approval Conditions</h3>
            <label className="condition-item">
              <input
                type="checkbox"
                checked={conditions.limitScope}
                onChange={(e) => setConditions({
                  ...conditions,
                  limitScope: e.target.checked
                })}
              />
              <span>Limit scope to current task only</span>
            </label>
            <label className="condition-item">
              <input
                type="checkbox"
                checked={conditions.requireLogging}
                onChange={(e) => setConditions({
                  ...conditions,
                  requireLogging: e.target.checked
                })}
              />
              <span>Require detailed logging</span>
            </label>
            <label className="condition-item">
              <input
                type="checkbox"
                checked={conditions.oneTimeOnly}
                onChange={(e) => setConditions({
                  ...conditions,
                  oneTimeOnly: e.target.checked
                })}
              />
              <span>One-time approval only</span>
            </label>
          </div>

          {/* Notes */}
          <div className="approval-notes">
            <h3>Additional Notes (Optional)</h3>
            <textarea
              placeholder="Add any instructions or conditions..."
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Rejection Reason */}
          <div className="rejection-reason">
            <h3>Rejection Reason</h3>
            <textarea
              placeholder="If rejecting, please provide a reason..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button 
            className="btn btn-reject"
            onClick={handleReject}
          >
            <XCircle size={18} />
            Reject
          </button>
          <button 
            className="btn btn-cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button 
            className="btn btn-approve"
            onClick={handleApprove}
          >
            <CheckCircle size={18} />
            Approve
          </button>
        </div>

        {/* Warning for high-risk actions */}
        {approval.risk === 'high' && (
          <div className="high-risk-warning">
            <AlertTriangle size={16} />
            <span>This is a high-risk action. Please review carefully before approving.</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApprovalModal;