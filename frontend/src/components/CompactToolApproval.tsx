import React, { useState } from 'react';
import './CompactToolApproval.css';

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

interface CompactToolApprovalProps {
    requests: ToolApprovalRequest[];
    onApprove: (requestId: string, modifiedParams?: Record<string, any>) => void;
    onReject: (requestId: string, reason?: string) => void;
}

const CompactToolApproval: React.FC<CompactToolApprovalProps> = ({
                                                                     requests,
                                                                     onApprove,
                                                                     onReject
                                                                 }) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});

    if (requests.length === 0) return null;

    const handleApprove = (request: ToolApprovalRequest) => {
        onApprove(request.id);
        setExpandedId(null);
    };

    const handleReject = (request: ToolApprovalRequest) => {
        onReject(request.id, rejectionReasons[request.id] || 'User rejected');
        setExpandedId(null);
        setRejectionReasons(prev => {
            const updated = { ...prev };
            delete updated[request.id];
            return updated;
        });
    };

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
            'http_request': '🌐'
        };
        return icons[tool] || '🔧';
    };

    const formatAgentName = (name: string): string => {
        return name.replace(/_/g, ' ').toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    // Stack multiple requests vertically
    return (
        <div className="compact-approval-container">
            {requests.map((request, index) => (
                <div
                    key={request.id}
                    className={`compact-approval-bar ${expandedId === request.id ? 'expanded' : ''}`}
                    style={{
                        marginBottom: index < requests.length - 1 ? '4px' : '0',
                        zIndex: requests.length - index
                    }}
                >
                    {/* Compact View - Always Visible */}
                    <div className="compact-bar">
                        <div className="compact-indicator">
                            <span className="pulse-dot"></span>
                        </div>

                        <div className="compact-content">
                            <span className="compact-icon">{getToolIcon(request.tool)}</span>
                            <span className="compact-agent">{request.agent.toUpperCase()}</span>
                            <span className="compact-action">requests</span>
                            <span className="compact-tool">{request.tool}</span>
                            {request.execution_paused && (
                                <span className="compact-paused">• Execution Paused</span>
                            )}
                        </div>

                        <div className="compact-actions">
                            <button
                                className="compact-btn approve"
                                onClick={() => handleApprove(request)}
                                title="Approve"
                            >
                                ✓
                            </button>
                            <button
                                className="compact-btn reject"
                                onClick={() => handleReject(request)}
                                title="Reject"
                            >
                                ✕
                            </button>
                            <button
                                className="compact-btn expand"
                                onClick={() => setExpandedId(expandedId === request.id ? null : request.id)}
                                title="Details"
                            >
                                {expandedId === request.id ? '▲' : '▼'}
                            </button>
                        </div>
                    </div>

                    {/* Expanded Details - Only When Clicked */}
                    {expandedId === request.id && (
                        <div className="compact-details">
                            <div className="detail-section">
                                <div className="detail-label">Parameters</div>
                                <div className="detail-params">
                                    {Object.entries(request.parameters).map(([key, value]) => (
                                        <div key={key} className="param-row">
                                            <span className="param-key">{key}:</span>
                                            <span className="param-value">
                        {typeof value === 'object'
                            ? JSON.stringify(value, null, 2)
                            : String(value)}
                      </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="detail-actions">
                                <input
                                    type="text"
                                    placeholder="Rejection reason (optional)"
                                    className="rejection-input-compact"
                                    value={rejectionReasons[request.id] || ''}
                                    onChange={(e) => setRejectionReasons(prev => ({
                                        ...prev,
                                        [request.id]: e.target.value
                                    }))}
                                />
                                <div className="action-buttons-compact">
                                    <button
                                        className="action-btn approve-full"
                                        onClick={() => handleApprove(request)}
                                    >
                                        Approve & Continue
                                    </button>
                                    <button
                                        className="action-btn reject-full"
                                        onClick={() => handleReject(request)}
                                    >
                                        Reject
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default CompactToolApproval;