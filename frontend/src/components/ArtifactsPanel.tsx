// components/swarm-v2/ArtifactsPanel.tsx - Updated to match SwarmExecutor usage

import React, { useState, useMemo } from 'react';
import {
  FileText, Code, Database, Image, TestTube,
  Download, Copy, Eye, Check, File, Globe,
  Search, X, Clock, User, Trash2
} from 'lucide-react';
import { Artifact } from '../types/artifacts'; // Import unified Artifact type

// Updated interface to match the usage in SwarmExecutor
export interface ArtifactsPanelProps {
  artifacts: Artifact[];
  title?: string; // Added title prop
  showActions?: boolean; // Added showActions prop
  onArtifactSelect?: (artifact: Artifact) => void;
  onArtifactDelete?: (artifactId: string) => void;
}

const ArtifactsPanel: React.FC<ArtifactsPanelProps> = ({
                                                         artifacts = [],
                                                         title = "Artifacts",
                                                         showActions = true,
                                                         onArtifactSelect,
                                                         onArtifactDelete
                                                       }) => {
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const getArtifactIcon = (type: Artifact['type']) => {
    switch (type) {
      case 'code': return <Code size={16} />;
      case 'html': return <Globe size={16} />;
      case 'document': return <FileText size={16} />;
      case 'data': return <Database size={16} />;
      case 'image': return <Image size={16} />;
      case 'test_result': return <TestTube size={16} />;
      default: return <File size={16} />;
    }
  };

  const getLanguageEmoji = (language?: string): string => {
    if (!language) return '📄';
    const icons: Record<string, string> = {
      javascript: '🟨', typescript: '🔷', python: '🐍',
      html: '🌐', css: '🎨', json: '📋', sql: '🗃️',
      shell: '⚡', bash: '⚡', yaml: '📄', xml: '📄'
    };
    return icons[language.toLowerCase()] || '📝';
  };

  const formatSize = (content: string): string => {
    const bytes = new Blob([content]).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getCodeStats = (content: string): { lines: number; chars: number } => {
    return {
      lines: content.split('\n').length,
      chars: content.length
    };
  };

  const handleCopy = async (artifact: Artifact) => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopiedId(artifact.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownload = (artifact: Artifact) => {
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = artifact.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleView = (artifact: Artifact) => {
    setSelectedArtifact(artifact);
    onArtifactSelect?.(artifact);
  };

  const handleDelete = (artifactId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (window.confirm('Are you sure you want to delete this artifact?')) {
      onArtifactDelete?.(artifactId);
    }
  };

  const filteredArtifacts = useMemo(() => {
    if (!searchQuery) return artifacts;

    const query = searchQuery.toLowerCase();
    return artifacts.filter(a =>
        a.name.toLowerCase().includes(query) ||
        a.content.toLowerCase().includes(query) ||
        a.metadata?.language?.toLowerCase().includes(query) ||
        a.metadata?.agent?.toLowerCase().includes(query)
    );
  }, [artifacts, searchQuery]);

  return (
      <div className="artifacts-panel">
        <style>{`
        .artifacts-panel {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--bg-primary);
          border-radius: 8px;
          overflow: hidden;
          color: var(--text-primary);
        }
        
        .artifacts-header {
          padding: 16px;
          border-bottom: 1px solid var(--border-primary);
          background: var(--bg-secondary);
        }
        
        .panel-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0 0 12px 0;
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
        }
        
        .search-container {
          position: relative;
        }
        
        .search-input {
          width: 100%;
          padding: 8px 36px 8px 12px;
          border: 1px solid var(--border-primary);
          border-radius: 6px;
          font-size: 14px;
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }
        
        .search-input:focus {
          outline: none;
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        
        .search-input::placeholder {
          color: var(--text-secondary);
        }
        
        .search-icon {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-secondary);
        }
        
        .artifacts-container {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
          background: var(--bg-primary);
        }
        
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 200px;
          color: var(--text-secondary);
          text-align: center;
        }
        
        .empty-state h4 {
          margin: 12px 0 4px 0;
          font-size: 16px;
          font-weight: 500;
          color: var(--text-primary);
        }
        
        .empty-state p {
          margin: 0;
          font-size: 14px;
          color: var(--text-secondary);
        }
        
        .artifacts-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .artifact-item {
          border: 1px solid var(--border-primary);
          border-radius: 8px;
          padding: 12px;
          background: var(--bg-secondary);
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .artifact-item:hover {
          border-color: var(--border-secondary);
          background: var(--bg-hover);
        }
        
        .artifact-item.selected {
          border-color: var(--accent-primary);
          background: var(--bg-tertiary);
        }
        
        .artifact-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 8px;
        }
        
        .artifact-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          background: var(--bg-tertiary);
          border-radius: 6px;
          color: var(--text-secondary);
        }
        
        .language-emoji {
          font-size: 18px;
        }
        
        .artifact-info {
          flex: 1;
          min-width: 0;
        }
        
        .artifact-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
          margin: 0 0 4px 0;
          word-break: break-word;
        }
        
        .artifact-meta {
          display: flex;
          gap: 8px;
          font-size: 12px;
          color: var(--text-secondary);
        }
        
        .artifact-controls {
          display: flex;
          gap: 4px;
        }
        
        .control-btn {
          padding: 4px;
          background: transparent;
          border: 1px solid var(--border-primary);
          border-radius: 4px;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .control-btn:hover {
          background: var(--bg-hover);
          border-color: var(--border-secondary);
        }
        
        .delete-btn:hover {
          color: var(--danger-color);
          border-color: var(--danger-color);
        }
        
        .artifact-actions {
          display: flex;
          gap: 8px;
          margin-top: 8px;
        }
        
        .action-btn {
          padding: 6px 12px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-primary);
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: all 0.2s;
          color: var(--text-primary);
        }
        
        .action-btn:hover {
          background: var(--bg-hover);
        }
        
        .action-btn.primary {
          background: var(--accent-primary);
          color: white;
          border-color: var(--accent-primary);
        }
        
        .action-btn.primary:hover {
          background: var(--primary-hover);
        }
        
        .artifact-tags {
          display: flex;
          gap: 6px;
          margin-top: 8px;
          flex-wrap: wrap;
        }
        
        .tag {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 2px 6px;
          background: var(--bg-tertiary);
          border-radius: 4px;
          font-size: 10px;
          color: var(--text-secondary);
        }
        
        .agent-tag {
          background: var(--info-bg);
          color: var(--accent-info);
        }
        
        .time-tag {
          background: var(--warning-bg);
          color: var(--accent-warning);
        }
        
        .language-tag {
          background: var(--success-bg);
          color: var(--accent-success);
        }
        
        .artifact-preview {
          margin-top: 16px;
          padding: 16px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 8px;
        }
        
        .preview-header {
          display: flex;
          justify-content: between;
          align-items: center;
          margin-bottom: 12px;
        }
        
        .preview-title {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
        }
        
        .preview-close {
          padding: 4px;
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--text-secondary);
        }
        
        .preview-content {
          background: var(--code-bg);
          border: 1px solid var(--code-border);
          border-radius: 6px;
          padding: 12px;
          max-height: 300px;
          overflow: auto;
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 12px;
          color: var(--code-text);
          line-height: 1.5;
          white-space: pre-wrap;
        }
      `}</style>

        {/* Header */}
        <div className="artifacts-header">
          <h3 className="panel-title">
            <File size={18} />
            {title} ({artifacts.length})
          </h3>

          {showActions && (
              <div className="search-container">
                <input
                    type="text"
                    placeholder="Search artifacts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-input"
                />
                <Search size={16} className="search-icon" />
              </div>
          )}
        </div>

        {/* Artifacts Container */}
        <div className="artifacts-container">
          {filteredArtifacts.length === 0 ? (
              <div className="empty-state">
                {searchQuery ? <Search size={48} /> : <File size={48} />}
                <h4>
                  {searchQuery
                      ? `No artifacts match "${searchQuery}"`
                      : 'No artifacts yet'
                  }
                </h4>
                <p>
                  {searchQuery
                      ? 'Try adjusting your search terms'
                      : 'Artifacts will appear here as agents create them'
                  }
                </p>
              </div>
          ) : (
              <div className="artifacts-list">
                {filteredArtifacts.map(artifact => {
                  const stats = getCodeStats(artifact.content);

                  return (
                      <div
                          key={artifact.id}
                          className={`artifact-item ${selectedArtifact?.id === artifact.id ? 'selected' : ''}`}
                          onClick={() => handleView(artifact)}
                      >
                        <div className="artifact-header">
                          <div className="artifact-icon">
                            {artifact.metadata?.language ? (
                                <span className="language-emoji">
                          {getLanguageEmoji(artifact.metadata.language)}
                        </span>
                            ) : (
                                getArtifactIcon(artifact.type)
                            )}
                          </div>

                          <div className="artifact-info">
                            <h4 className="artifact-name" title={artifact.name}>
                              {artifact.name}
                            </h4>
                            <div className="artifact-meta">
                              <span>{artifact.type}</span>
                              <span>{formatSize(artifact.content)}</span>
                              {stats.lines > 0 && (
                                  <span>{stats.lines} lines</span>
                              )}
                            </div>
                          </div>

                          {showActions && (
                              <div className="artifact-controls">
                                {onArtifactDelete && (
                                    <button
                                        className="control-btn delete-btn"
                                        onClick={(e) => handleDelete(artifact.id, e)}
                                        title="Delete artifact"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                )}
                              </div>
                          )}
                        </div>

                        {showActions && (
                            <div className="artifact-actions">
                              <button
                                  className="action-btn primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleView(artifact);
                                  }}
                              >
                                <Eye size={14} />
                                View
                              </button>
                              <button
                                  className="action-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopy(artifact);
                                  }}
                              >
                                {copiedId === artifact.id ? <Check size={14} /> : <Copy size={14} />}
                                {copiedId === artifact.id ? 'Copied!' : 'Copy'}
                              </button>
                              <button
                                  className="action-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(artifact);
                                  }}
                              >
                                <Download size={14} />
                                Download
                              </button>
                            </div>
                        )}

                        {/* Metadata Tags */}
                        <div className="artifact-tags">
                          {artifact.metadata?.agent && (
                              <span className="tag agent-tag">
                        <User size={10} />
                                {artifact.metadata.agent}
                      </span>
                          )}
                          {artifact.metadata?.timestamp && (
                              <span className="tag time-tag">
                        <Clock size={10} />
                                {new Date(artifact.metadata.timestamp).toLocaleTimeString()}
                      </span>
                          )}
                          {artifact.metadata?.language && (
                              <span className="tag language-tag">
                        {artifact.metadata.language}
                      </span>
                          )}
                        </div>
                      </div>
                  );
                })}
              </div>
          )}
        </div>

        {/* Inline Preview */}
        {selectedArtifact && (
            <div className="artifact-preview">
              <div className="preview-header">
                <span className="preview-title">{selectedArtifact.name}</span>
                <button
                    className="preview-close"
                    onClick={() => setSelectedArtifact(null)}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="preview-content">
                {selectedArtifact.content}
              </div>
            </div>
        )}
      </div>
  );
};

export default ArtifactsPanel;