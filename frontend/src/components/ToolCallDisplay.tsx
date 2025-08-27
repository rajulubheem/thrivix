// components/ToolCallDisplay.tsx (make sure this is the file name)
import React, { useState } from 'react';
import './ToolCallDisplay.css';

// Export with the correct name
export interface ToolExecutionDisplayProps {
    toolName: string;
    parameters?: any;
    result?: any;
    status: 'pending' | 'awaiting_approval' | 'approved' | 'rejected' | 'executing' | 'success' | 'error';
    timestamp?: string;
    rawData?: any;
}

export const ToolExecutionDisplay: React.FC<ToolExecutionDisplayProps> = ({
                                                                              toolName,
                                                                              parameters,
                                                                              result,
                                                                              status,
                                                                              timestamp,
                                                                              rawData
                                                                          }) => {
    const [expanded, setExpanded] = useState(false);
    const [showRaw, setShowRaw] = useState(false);

    const getStatusIcon = () => {
        switch (status) {
            case 'pending': return '⏳';
            case 'awaiting_approval': return '🔐';
            case 'approved': return '✅';
            case 'rejected': return '🚫';
            case 'executing': return '🔄';
            case 'success': return '✅';
            case 'error': return '❌';
            default: return '🔧';
        }
    };

    const getStatusText = () => {
        switch (status) {
            case 'pending': return 'PENDING';
            case 'awaiting_approval': return 'AWAITING APPROVAL';
            case 'approved': return 'APPROVED';
            case 'rejected': return 'REJECTED';
            case 'executing': return 'EXECUTING...';
            case 'success': return 'COMPLETED';
            case 'error': return 'FAILED';
            default: return 'UNKNOWN';
        }
    };

    const getStatusColor = () => {
        switch (status) {
            case 'pending': return '#fbbf24';
            case 'awaiting_approval': return '#f97316';
            case 'approved': return '#10b981';
            case 'rejected': return '#dc2626';
            case 'executing': return '#3b82f6';
            case 'success': return '#10b981';
            case 'error': return '#ef4444';
            default: return '#6b7280';
        }
    };

    const formatToolName = (name: string) => {
        return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    const renderResult = () => {
        if (!result) return null;

        // If result is an array of search results
        if (Array.isArray(result)) {
            return (
                <div className="tool-results-grid">
                    {result.map((item, index) => (
                        <div key={index} className="result-item">
                            <div className="result-index">{index + 1}</div>
                            <div className="result-content">
                                {item.title && <div className="result-title">{item.title}</div>}
                                {item.url && (
                                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="result-url">
                                        {new URL(item.url).hostname}
                                    </a>
                                )}
                                {item.content && (
                                    <div className="result-snippet">
                                        {item.content.substring(0, 150)}...
                                    </div>
                                )}
                                {item.score && (
                                    <div className="result-score">
                                        Relevance: {(item.score * 100).toFixed(1)}%
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            );
        }

        // For other types of results
        if (typeof result === 'object') {
            return (
                <div className="tool-result-object">
                    <pre>{JSON.stringify(result, null, 2)}</pre>
                </div>
            );
        }

        return <div className="tool-result-text">{result}</div>;
    };

    return (
        <div className={`tool-execution-display ${status}`}>
            <div
                className="tool-header"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="tool-info">
                    <span className="tool-icon">{getStatusIcon()}</span>
                    <span className="tool-name">{formatToolName(toolName)}</span>
                    <span
                        className={`tool-status ${status}`}
                        style={{
                            backgroundColor: `${getStatusColor()}20`,
                            color: getStatusColor()
                        }}
                    >
            {getStatusText()}
          </span>
                </div>
                <div className="tool-meta">
                    {timestamp && (
                        <span className="tool-time">
              {new Date(timestamp).toLocaleTimeString()}
            </span>
                    )}
                    <span className={`expand-icon ${expanded ? 'expanded' : ''}`}>
            ▼
          </span>
                </div>
            </div>

            {expanded && (
                <div className="tool-details">
                    {/* Approval Status Section */}
                    {(status === 'awaiting_approval' || status === 'approved' || status === 'rejected') && (
                        <div className="tool-section approval-section">
                            <div className="section-title">
                                <span className="section-icon">🔐</span>
                                APPROVAL STATUS
                            </div>
                            <div className="approval-info">
                                {status === 'awaiting_approval' && (
                                    <div className="approval-pending">
                                        ⏳ Waiting for user approval...
                                    </div>
                                )}
                                {status === 'approved' && (
                                    <div className="approval-approved">
                                        ✅ Tool execution approved by user
                                    </div>
                                )}
                                {status === 'rejected' && (
                                    <div className="approval-rejected">
                                        🚫 Tool execution rejected by user
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Input Section */}
                    {parameters && (
                        <div className="tool-section">
                            <div className="section-title">
                                <span className="section-icon">📥</span>
                                INPUT
                            </div>
                            <div className="code-block">
                                <pre>{JSON.stringify(parameters, null, 2)}</pre>
                            </div>
                        </div>
                    )}

                    {/* Output Section */}
                    {result && (
                        <div className="tool-section">
                            <div className="section-title">
                                <span className="section-icon">📤</span>
                                OUTPUT
                                <button
                                    className="toggle-raw"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowRaw(!showRaw);
                                    }}
                                >
                                    {showRaw ? 'Formatted' : 'Raw JSON'}
                                </button>
                            </div>
                            {showRaw ? (
                                <div className="code-block">
                                    <pre>{JSON.stringify(result, null, 2)}</pre>
                                </div>
                            ) : (
                                renderResult()
                            )}
                        </div>
                    )}

                    {/* Raw Data Section (if different from result) */}
                    {rawData && rawData !== result && (
                        <div className="tool-section">
                            <div className="section-title">
                                <span className="section-icon">🔍</span>
                                RAW RESPONSE
                            </div>
                            <div className="code-block">
                                <pre>{JSON.stringify(rawData, null, 2)}</pre>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};