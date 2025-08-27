import React, { useState } from 'react';
import './InlineToolApproval.css';

interface ToolApprovalRequest {
    id: string;
    approval_id?: string | null;
    agent: string;
    tool: string;
    parameters: Record<string, any>;
    timestamp: Date;
    message?: string;
    execution_paused?: boolean;
}

interface InlineToolApprovalProps {
    request: ToolApprovalRequest;
    onApprove: (requestId: string, modifiedParams?: Record<string, any>) => void;
    onReject: (requestId: string, reason?: string) => void;
}

const InlineToolApproval: React.FC<InlineToolApprovalProps> = ({
                                                                   request,
                                                                   onApprove,
                                                                   onReject
                                                               }) => {
    const [showDetails, setShowDetails] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');

    const getToolIcon = (tool: string): string => {
        const icons: Record<string, string> = {
            'tavily_search': '🔍',
            'web_search': '🌐',
            'file_write': '📝',
            'file_read': '📖',
            'shell': '💻',
            'python_repl': '🐍',
            'code_interpreter': '⚡',
            'editor': '✏️',
            'http_request': '🌐',
            'calculator': '🧮',
            'database': '🗄️'
        };
        return icons[request.tool] || '🔧';
    };

    const getSafetyLevel = (tool: string): 'safe' | 'caution' | 'danger' => {
        const safeTools = ['file_read', 'calculator', 'tavily_search'];
        const dangerTools = ['shell', 'file_write', 'editor', 'python_repl'];

        if (safeTools.includes(tool)) return 'safe';
        if (dangerTools.includes(tool)) return 'danger';
        return 'caution';
    };

    const safetyLevel = getSafetyLevel(request.tool);

    const handleApprove = () => {
        onApprove(request.id, request.parameters);
    };

    const handleReject = () => {
        onReject(request.id, rejectionReason || 'User rejected');
    };

    return (
        <div className={`inline-tool-approval ${safetyLevel}`}>
            <div className="approval-header">
                <div className="approval-left">
                    <div className="tool-icon">{getToolIcon(request.tool)}</div>
                    <div className="approval-info">
                        <div className="approval-title">
                            <span className="agent-name">{request.agent.replace(/_/g, ' ')}</span>
                            <span className="approval-action">requests permission to use</span>
                            <span className="tool-name">{request.tool.replace(/_/g, ' ')}</span>
                        </div>
                        {request.execution_paused && (
                            <div className="execution-paused">
                                <span className="paused-icon">⏸️</span>
                                Execution paused - waiting for approval
                            </div>
                        )}
                    </div>
                </div>

                <div className="approval-actions">
                    <button
                        className="quick-approve"
                        onClick={handleApprove}
                        title="Approve"
                    >
                        ✓ Approve
                    </button>
                    <button
                        className="quick-reject"
                        onClick={handleReject}
                        title="Reject"
                    >
                        ✕ Reject
                    </button>
                    <button
                        className="details-toggle"
                        onClick={() => setShowDetails(!showDetails)}
                        title="Show details"
                    >
                        {showDetails ? '▲' : '▼'}
                    </button>
                </div>
            </div>

            {showDetails && (
                <div className="approval-details">
                    <div className="parameters-section">
                        <h4>Parameters:</h4>
                        <div className="parameters-list">
                            {Object.entries(request.parameters).length > 0 ? (
                                Object.entries(request.parameters).map(([key, value]) => (
                                    <div key={key} className="parameter-item">
                                        <span className="param-key">{key}:</span>
                                        <span className="param-value">
            {typeof value === 'object'
                ? JSON.stringify(value, null, 2)
                : String(value)}
          </span>
                                    </div>
                                ))
                            ) : (
                                <div className="parameter-item">
                                    <span className="param-value">No parameters provided</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {safetyLevel === 'danger' && (
                        <div className="safety-warning">
                            ⚠️ This tool can modify your system. Review carefully before approving.
                        </div>
                    )}

                    <div className="detailed-actions">
                        <input
                            type="text"
                            placeholder="Rejection reason (optional)"
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            className="rejection-input"
                        />
                        <div className="action-buttons">
                            <button
                                className="btn-approve-full"
                                onClick={handleApprove}
                            >
                                Approve & Continue
                            </button>
                            <button
                                className="btn-reject-full"
                                onClick={handleReject}
                            >
                                Reject with Reason
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Component for rendering multiple approval requests
export const InlineToolApprovalList: React.FC<{
    requests: ToolApprovalRequest[];
    onApprove: (requestId: string, modifiedParams?: Record<string, any>) => void;
    onReject: (requestId: string, reason?: string) => void;
}> = ({ requests, onApprove, onReject }) => {
    if (requests.length === 0) return null;

    return (
        <div className="inline-approvals-container">
            {requests.map(request => (
                <InlineToolApproval
                    key={request.id}
                    request={request}
                    onApprove={onApprove}
                    onReject={onReject}
                />
            ))}
        </div>
    );
};

export default InlineToolApproval;