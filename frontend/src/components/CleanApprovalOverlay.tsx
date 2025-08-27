// components/CleanApprovalOverlay.tsx
import React, { useState } from 'react';

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

interface CleanApprovalOverlayProps {
    requests: ToolApprovalRequest[];
    onApprove: (requestId: string, modifiedParams?: Record<string, any>) => void;
    onReject: (requestId: string, reason?: string) => void;
}

export const CleanApprovalOverlay: React.FC<CleanApprovalOverlayProps> = ({
                                                                              requests,
                                                                              onApprove,
                                                                              onReject
                                                                          }) => {
    const [showDetails, setShowDetails] = useState<string | null>(null);

    if (requests.length === 0) return null;

    const currentRequest = requests[0];

    const getToolIcon = (tool: string): string => {
        const icons: Record<string, string> = {
            'tavily_search': '🔍',
            'web_search': '🔍',
            'file_write': '📝',
            'file_read': '📄',
            'shell': '⚙️',
            'python_repl': '🐍',
            'code_interpreter': '⚡',
            'editor': '✏️',
            'http_request': '🌐',
        };
        return icons[tool] || '🔧';
    };

    const handleApprove = () => {
        onApprove(currentRequest.id, currentRequest.parameters);
    };

    const handleReject = () => {
        onReject(currentRequest.id, 'User rejected');
    };

    return (
        <div className="approval-overlay">
            <div className="approval-container">
                <div className="approval-card">
                    <div className="approval-content">
                        <div className="approval-icon-wrapper">
                            <span className="icon">{getToolIcon(currentRequest.tool)}</span>
                        </div>

                        <div className="approval-text">
                            <div className="approval-main-text">
                                <span className="approval-agent">{currentRequest.agent.replace(/_/g, ' ')}</span>
                                {' wants to use '}
                                <span className="approval-tool">{currentRequest.tool.replace(/_/g, ' ')}</span>
                            </div>
                            <div className="approval-sub-text">
                <span className="pause-indicator">
                  <span className="pause-icon">⏸</span>
                  Chat paused - waiting for your approval
                </span>
                            </div>
                        </div>

                        <div className="approval-actions">
                            <button
                                className="approve-btn"
                                onClick={handleApprove}
                            >
                                ✓ Approve
                            </button>
                            <button
                                className="reject-btn"
                                onClick={handleReject}
                            >
                                ✕ Reject
                            </button>
                            <button
                                className="details-btn"
                                onClick={() => setShowDetails(showDetails ? null : currentRequest.id)}
                                title="Show details"
                            >
                                ▼
                            </button>
                        </div>
                    </div>

                    {showDetails === currentRequest.id && Object.keys(currentRequest.parameters).length > 0 && (
                        <div className="approval-details">
                            <div className="approval-params">
                                {Object.entries(currentRequest.parameters).map(([key, value]) => (
                                    <div key={key} className="param-item">
                                        <span className="param-key">{key}:</span>
                                        <span className="param-value">
                      {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                    </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// For the execution banner at the top (optional - cleaner than the card)
export const ExecutionBanner: React.FC<{ message: string; subtitle?: string }> = ({ message, subtitle }) => {
    return (
        <div className="execution-banner">
            <div className="execution-banner-title">{message}</div>
            {subtitle && <div className="execution-banner-subtitle">{subtitle}</div>}
        </div>
    );
};

export default CleanApprovalOverlay;