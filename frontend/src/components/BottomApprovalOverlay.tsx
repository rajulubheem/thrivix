// components/BottomApprovalOverlay.tsx
import React, { useState, useEffect } from 'react';

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

interface BottomApprovalOverlayProps {
    requests: ToolApprovalRequest[];
    onApprove: (requestId: string, modifiedParams?: Record<string, any>) => void;
    onReject: (requestId: string, reason?: string) => void;
}

export const BottomApprovalOverlay: React.FC<BottomApprovalOverlayProps> = ({
                                                                                requests,
                                                                                onApprove,
                                                                                onReject
                                                                            }) => {
    const [showDetails, setShowDetails] = useState<string | null>(null);
    const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({});

    // Auto-minimize after a few seconds
    useEffect(() => {
        if (requests.length > 0 && !showDetails) {
            const timer = setTimeout(() => {
                setShowDetails(null);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [requests.length, showDetails]);

    if (requests.length === 0) return null;

    const currentRequest = requests[0]; // Show one at a time for cleaner UX

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
        return icons[tool] || '🔧';
    };

    const getSafetyLevel = (tool: string): string => {
        const dangerTools = ['shell', 'file_write', 'editor', 'python_repl'];
        return dangerTools.includes(tool) ? 'danger' : 'normal';
    };

    const handleApprove = (request: ToolApprovalRequest) => {
        onApprove(request.id, request.parameters);
        setShowDetails(null);
    };

    const handleReject = (request: ToolApprovalRequest) => {
        const reason = rejectionReason[request.id] || 'User rejected';
        onReject(request.id, reason);
        setShowDetails(null);
        setRejectionReason(prev => {
            const newReasons = { ...prev };
            delete newReasons[request.id];
            return newReasons;
        });
    };

    return (
        <div className="approval-overlay">
            <div className="approval-container">
                <div className={`approval-card ${getSafetyLevel(currentRequest.tool)}`}>
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
                  <span className="pause-icon">⏸️</span>
                  Chat paused - waiting for your approval
                </span>
                                {requests.length > 1 && (
                                    <span> • {requests.length - 1} more pending</span>
                                )}
                            </div>
                        </div>

                        <div className="approval-actions">
                            <button
                                className="approve-btn"
                                onClick={() => handleApprove(currentRequest)}
                                title="Approve and continue"
                            >
                                ✓ Approve
                            </button>
                            <button
                                className="reject-btn"
                                onClick={() => handleReject(currentRequest)}
                                title="Reject request"
                            >
                                ✕ Reject
                            </button>
                            {Object.keys(currentRequest.parameters).length > 0 && (
                                <button
                                    className="details-btn"
                                    onClick={() => setShowDetails(
                                        showDetails === currentRequest.id ? null : currentRequest.id
                                    )}
                                    title="Show parameters"
                                >
                                    {showDetails === currentRequest.id ? '▲' : '▼'}
                                </button>
                            )}
                        </div>
                    </div>

                    {showDetails === currentRequest.id && (
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
                            <input
                                type="text"
                                placeholder="Rejection reason (optional)"
                                value={rejectionReason[currentRequest.id] || ''}
                                onChange={(e) => setRejectionReason(prev => ({
                                    ...prev,
                                    [currentRequest.id]: e.target.value
                                }))}
                                className="rejection-input"
                                style={{
                                    width: '100%',
                                    padding: '6px 10px',
                                    fontSize: '12px',
                                    borderRadius: '4px',
                                    border: '1px solid var(--border-secondary)',
                                    background: 'var(--bg-primary)',
                                    color: 'var(--text-primary)',
                                    marginTop: '8px'
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Enhanced Tool Result Display Component
interface ToolResultDisplayProps {
    result: {
        tool_name: string;
        success: boolean;
        summary?: string;
        results_count?: number;
        results?: any[];
        display_text?: string;
        timestamp?: string;
    };
    className?: string;
    collapsible?: boolean;
    defaultExpanded?: boolean;
}

export const ToolResultDisplay: React.FC<ToolResultDisplayProps> = ({
                                                                        result,
                                                                        className = '',
                                                                        collapsible = true,
                                                                        defaultExpanded = false
                                                                    }) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    const getToolIcon = (toolName: string): string => {
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
        return icons[toolName] || '🔧';
    };

    return (
        <div className={`tool-result-display ${className}`}>
            <div
                className="tool-result-header"
                onClick={() => collapsible && setIsExpanded(!isExpanded)}
                style={{ cursor: collapsible ? 'pointer' : 'default' }}
            >
                <div className="tool-result-info">
                    <div className="tool-icon">
                        {getToolIcon(result.tool_name)}
                    </div>
                    <span className="tool-name">
            {result.tool_name.replace(/_/g, ' ')}
          </span>
                </div>

                <div className="tool-status">
          <span className={`tool-status-badge ${result.success ? 'success' : 'error'}`}>
            {result.success ? '✓ Success' : '✕ Failed'}
          </span>
                    {result.results_count !== undefined && (
                        <span className="tool-results-count" style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            marginLeft: '8px'
                        }}>
              {result.results_count} results
            </span>
                    )}
                    {collapsible && (
                        <button className={`collapse-toggle ${isExpanded ? 'expanded' : ''}`}>
                            ▶
                        </button>
                    )}
                </div>
            </div>

            <div className={`tool-result-content ${!isExpanded && collapsible ? 'collapsed' : ''}`}>
                {result.summary && (
                    <div className="tool-result-summary">
                        {result.summary}
                    </div>
                )}

                {result.display_text && (
                    <div className="tool-result-data">
                        {result.display_text}
                    </div>
                )}

                {result.results && result.results.length > 0 && (
                    <div className="tool-result-data">
                        {JSON.stringify(result.results, null, 2)}
                    </div>
                )}

                {result.timestamp && (
                    <div className="tool-result-timestamp" style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        marginTop: '8px'
                    }}>
                        Executed at: {new Date(result.timestamp).toLocaleTimeString()}
                    </div>
                )}
            </div>
        </div>
    );
};

export default BottomApprovalOverlay;