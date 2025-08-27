import React, { useState, useMemo } from 'react';
import { 
  FileText, Code, Database, Image, TestTube, 
  Download, Copy, Eye, Check, File, Globe,
  Calendar, User, Tag, Search, X, ExternalLink,
  Trash2, Star, Clock
} from 'lucide-react';
import './ArtifactsPanel.css';

// Enhanced Artifact interface that matches our system
interface Artifact {
  id: string;
  type: 'code' | 'html' | 'document' | 'data' | 'image' | 'test_result';
  title: string;
  content: string;
  language?: string;
  filename?: string;
  agentId?: string;
  timestamp?: Date;
  size?: number;
  metadata?: {
    language?: string;
    agent?: string;
    lines?: number;
    functions?: number;
    [key: string]: any;
  };
}

interface ArtifactsPanelProps {
  artifacts: Artifact[];
  onArtifactSelect?: (artifact: Artifact) => void;
  onArtifactDelete?: (artifactId: string) => void;
  onArtifactFavorite?: (artifactId: string) => void;
  showSearch?: boolean;
  favorites?: string[];
}

const ArtifactsPanel: React.FC<ArtifactsPanelProps> = ({ 
  artifacts, 
  onArtifactSelect,
  onArtifactDelete,
  onArtifactFavorite,
  showSearch = true,
  favorites = []
}) => {
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Artifact['type'] | 'favorites'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'type' | 'agent'>('date');

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

  const getLanguageIcon = (language?: string): string => {
    if (!language) return '📄';
    const icons: Record<string, string> = {
      javascript: '🟨',
      typescript: '🔷',
      python: '🐍',
      html: '🌐',
      css: '🎨',
      json: '📋',
      sql: '🗃️',
      shell: '⚡',
      bash: '⚡',
      yaml: '📄',
      xml: '📄'
    };
    return icons[language.toLowerCase()] || '📝';
  };

  const getFileExtension = (name: string): string => {
    const parts = name.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  };

  const formatSize = (content: string): string => {
    const bytes = new Blob([content]).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getCodeStats = (content: string, language?: string): { lines: number; functions: number } => {
    const lines = content.split('\n').length;
    let functions = 0;
    
    if (language === 'javascript' || language === 'typescript') {
      functions = (content.match(/function\s+\w+|const\s+\w+\s*=\s*\(/g) || []).length;
    } else if (language === 'python') {
      functions = (content.match(/def\s+\w+/g) || []).length;
    }
    
    return { lines, functions };
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
    a.download = artifact.filename || artifact.title;
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
    if (confirm('Are you sure you want to delete this artifact?')) {
      onArtifactDelete?.(artifactId);
    }
  };

  const handleFavorite = (artifactId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    onArtifactFavorite?.(artifactId);
  };

  // Enhanced filtering and sorting
  const filteredAndSortedArtifacts = useMemo(() => {
    let filtered = artifacts;

    // Apply type filter
    if (filter === 'favorites') {
      filtered = artifacts.filter(a => favorites.includes(a.id));
    } else if (filter !== 'all') {
      filtered = artifacts.filter(a => a.type === filter);
    }

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(a =>
        a.title.toLowerCase().includes(query) ||
        a.content.toLowerCase().includes(query) ||
        a.language?.toLowerCase().includes(query) ||
        a.agentId?.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.title.localeCompare(b.title);
        case 'type':
          return a.type.localeCompare(b.type);
        case 'agent':
          return (a.agentId || '').localeCompare(b.agentId || '');
        case 'date':
        default:
          return (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0);
      }
    });

    return filtered;
  }, [artifacts, filter, searchQuery, sortBy, favorites]);

  const artifactTypes = useMemo(() => {
    const types = Array.from(new Set(artifacts.map(a => a.type)));
    return types.map(type => ({
      type,
      count: artifacts.filter(a => a.type === type).length
    }));
  }, [artifacts]);

  const agentStats = useMemo(() => {
    const agents = Array.from(new Set(artifacts.map(a => a.agentId).filter(Boolean)));
    return agents.map(agent => ({
      agent,
      count: artifacts.filter(a => a.agentId === agent).length
    }));
  }, [artifacts]);

  return (
    <div className="artifacts-panel">
      {/* Enhanced Header with Search and Sort */}
      {showSearch && (
        <div className="artifacts-header">
          <div className="search-container">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search artifacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button 
                className="clear-search"
                onClick={() => setSearchQuery('')}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value as any)}
            className="sort-select"
          >
            <option value="date">Sort by Date</option>
            <option value="name">Sort by Name</option>
            <option value="type">Sort by Type</option>
            <option value="agent">Sort by Agent</option>
          </select>
        </div>
      )}

      {/* Enhanced Filter Tabs */}
      <div className="artifacts-filter">
        <button
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({artifacts.length})
        </button>
        
        <button
          className={`filter-btn ${filter === 'favorites' ? 'active' : ''}`}
          onClick={() => setFilter('favorites')}
        >
          <Star size={14} />
          Favorites ({favorites.length})
        </button>

        {artifactTypes.map(({ type, count }) => (
          <button
            key={type}
            className={`filter-btn ${filter === type ? 'active' : ''}`}
            onClick={() => setFilter(type)}
          >
            {getArtifactIcon(type)}
            {type} ({count})
          </button>
        ))}
      </div>

      {/* Agent Statistics */}
      {agentStats.length > 1 && (
        <div className="agent-stats">
          <h4>By Agent:</h4>
          <div className="agent-tags">
            {agentStats.map(({ agent, count }) => (
              <span key={agent} className="agent-tag">
                <User size={12} />
                {agent} ({count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Artifacts Grid */}
      <div className="artifacts-container">
        {filteredAndSortedArtifacts.length === 0 ? (
          <div className="empty-artifacts">
            {searchQuery ? <Search size={48} /> : <File size={48} />}
            <p>
              {searchQuery 
                ? `No artifacts match "${searchQuery}"` 
                : 'No artifacts generated yet'
              }
            </p>
            <small>
              {searchQuery 
                ? 'Try adjusting your search terms'
                : 'Artifacts will appear here as agents create them'
              }
            </small>
          </div>
        ) : (
          <div className="artifacts-grid">
            {filteredAndSortedArtifacts.map(artifact => {
              const stats = getCodeStats(artifact.content, artifact.language);
              const isFavorite = favorites.includes(artifact.id);
              
              return (
                <div
                  key={artifact.id}
                  className={`artifact-card ${selectedArtifact?.id === artifact.id ? 'selected' : ''}`}
                  onClick={() => handleView(artifact)}
                >
                  <div className="artifact-header">
                    <div className="artifact-icon">
                      {artifact.language ? (
                        <span className="language-emoji">
                          {getLanguageIcon(artifact.language)}
                        </span>
                      ) : (
                        getArtifactIcon(artifact.type)
                      )}
                    </div>
                    <div className="artifact-info">
                      <h4 className="artifact-name" title={artifact.title}>
                        {artifact.title}
                      </h4>
                      <div className="artifact-meta">
                        {artifact.language && (
                          <span className="artifact-ext">
                            {artifact.language.toUpperCase()}
                          </span>
                        )}
                        <span className="artifact-size">
                          {formatSize(artifact.content)}
                        </span>
                        {stats.lines > 0 && (
                          <span className="artifact-lines">
                            {stats.lines} lines
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="artifact-controls">
                      <button
                        className={`favorite-btn ${isFavorite ? 'active' : ''}`}
                        onClick={(e) => handleFavorite(artifact.id, e)}
                        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star size={14} fill={isFavorite ? 'currentColor' : 'none'} />
                      </button>
                      {onArtifactDelete && (
                        <button
                          className="delete-btn"
                          onClick={(e) => handleDelete(artifact.id, e)}
                          title="Delete artifact"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="artifact-actions">
                    <button
                      className="action-btn primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleView(artifact);
                      }}
                      title="View"
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
                      title="Copy"
                    >
                      {copiedId === artifact.id ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                    <button
                      className="action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(artifact);
                      }}
                      title="Download"
                    >
                      <Download size={14} />
                    </button>
                  </div>

                  <div className="artifact-metadata">
                    {artifact.agentId && (
                      <span className="meta-tag agent-tag">
                        <User size={10} />
                        {artifact.agentId}
                      </span>
                    )}
                    {artifact.timestamp && (
                      <span className="meta-tag time-tag">
                        <Clock size={10} />
                        {artifact.timestamp.toLocaleTimeString()}
                      </span>
                    )}
                    {stats.functions > 0 && (
                      <span className="meta-tag functions-tag">
                        {stats.functions} functions
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Enhanced Preview Modal */}
      {selectedArtifact && (
        <div className="artifact-preview-modal" onClick={() => setSelectedArtifact(null)}>
          <div className="preview-content" onClick={(e) => e.stopPropagation()}>
            <div className="preview-header">
              <div className="preview-title-section">
                <h3>{selectedArtifact.title}</h3>
                <div className="preview-meta">
                  {selectedArtifact.language && (
                    <span className="preview-language">
                      {getLanguageIcon(selectedArtifact.language)} {selectedArtifact.language}
                    </span>
                  )}
                  <span className="preview-type">{selectedArtifact.type}</span>
                  <span className="preview-size">{formatSize(selectedArtifact.content)}</span>
                </div>
              </div>
              <div className="preview-controls">
                <button 
                  className={`favorite-btn ${favorites.includes(selectedArtifact.id) ? 'active' : ''}`}
                  onClick={() => onArtifactFavorite?.(selectedArtifact.id)}
                  title="Toggle favorite"
                >
                  <Star size={16} fill={favorites.includes(selectedArtifact.id) ? 'currentColor' : 'none'} />
                </button>
                <button 
                  className="close-btn"
                  onClick={() => setSelectedArtifact(null)}
                  title="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            
            <div className="preview-body">
              {selectedArtifact.type === 'code' || selectedArtifact.type === 'html' ? (
                <div className="code-preview">
                  <div className="code-header">
                    <span className="language-info">
                      {getLanguageIcon(selectedArtifact.language)} 
                      {selectedArtifact.language || 'text'}
                    </span>
                    <span className="lines-info">
                      {getCodeStats(selectedArtifact.content, selectedArtifact.language).lines} lines
                    </span>
                  </div>
                  <pre><code>{selectedArtifact.content}</code></pre>
                </div>
              ) : selectedArtifact.type === 'image' ? (
                <div className="image-preview">
                  <img src={selectedArtifact.content} alt={selectedArtifact.title} />
                </div>
              ) : (
                <div className="text-preview">
                  {selectedArtifact.content}
                </div>
              )}
            </div>
            
            <div className="preview-footer">
              <button onClick={() => handleCopy(selectedArtifact)} className="action-button">
                <Copy size={16} />
                Copy Content
              </button>
              <button onClick={() => handleDownload(selectedArtifact)} className="action-button">
                <Download size={16} />
                Download File
              </button>
              {selectedArtifact.type === 'html' && (
                <button className="action-button primary">
                  <ExternalLink size={16} />
                  Open in New Tab
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArtifactsPanel;