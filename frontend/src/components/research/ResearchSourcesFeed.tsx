/**
 * Research Sources Feed Component
 * TikTok-inspired vertical feed for research sources with message-based grouping
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Globe, Clock, ArrowUpRight, ChevronUp, ChevronDown,
  Bookmark, BookmarkCheck, Share2, MessageSquare,
  Zap, Brain, GraduationCap, Filter, X, Hash,
  Eye, Copy, ExternalLink, Info, TrendingUp,
  Calendar, User, Building, Tag, FileText,
  CheckCircle, AlertCircle, ChevronLeft, ChevronRight,
  Monitor, Grid3X3, List, RotateCcw, Maximize2, RefreshCw
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import '../../styles/research-sources-feed.css';

interface Source {
  id: string;
  number?: number;
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  favicon?: string;
  thumbnail?: string;
  publishDate?: string;
  author?: string;
  readTime?: string;
  relevanceScore?: number;
  tags?: string[];
  messageId?: string;
  conversationId?: string;
  researchType?: 'fast' | 'deep' | 'academic' | 'scholar';
}

interface ResearchGroup {
  id: string;
  messageId: string;
  query: string;
  timestamp: string;
  researchType: 'fast' | 'deep' | 'academic' | 'scholar';
  sources: Source[];
  totalSources: number;
  status?: 'active' | 'completed';
}

interface ResearchSourcesFeedProps {
  groups?: ResearchGroup[];
  currentSources?: Source[];
  onSourceClick?: (source: Source) => void;
  onBookmark?: (sourceId: string) => void;
  bookmarkedSources?: Set<string>;
  activeMessageId?: string;
  showGroupHeaders?: boolean;
  compactMode?: boolean;
}

const ResearchSourcesFeed: React.FC<ResearchSourcesFeedProps> = ({
  groups = [],
  currentSources = [],
  onSourceClick,
  onBookmark,
  bookmarkedSources = new Set(),
  activeMessageId,
  showGroupHeaders = true,
  compactMode = false
}) => {
  const { isDark } = useTheme();
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'feed' | 'grid' | 'compact' | 'browser'>('feed');
  const [filterType, setFilterType] = useState<'all' | 'fast' | 'deep' | 'academic' | 'scholar'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  const feedRef = useRef<HTMLDivElement>(null);
  const sourceRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  
  // Combine current sources with grouped sources
  const allSources = React.useMemo(() => {
    if (currentSources.length > 0) {
      return [{
        id: 'current',
        messageId: activeMessageId || 'current',
        query: 'Current Research',
        timestamp: new Date().toISOString(),
        researchType: 'fast' as const,
        sources: currentSources,
        totalSources: currentSources.length,
        status: 'active' as const
      }];
    }
    return groups;
  }, [currentSources, groups, activeMessageId]);

  // Filter sources by research type
  const filteredGroups = React.useMemo(() => {
    if (filterType === 'all') return allSources;
    return allSources.filter(group => group.researchType === filterType);
  }, [allSources, filterType]);

  // Research type configurations
  const researchTypeConfig = {
    fast: {
      icon: Zap,
      label: 'Fast Research',
      color: 'var(--accent-yellow)',
      bgColor: 'var(--accent-yellow-bg)',
      description: 'Quick insights and summaries'
    },
    deep: {
      icon: Brain,
      label: 'Deep Research',
      color: 'var(--accent-blue)',
      bgColor: 'var(--accent-blue-bg)',
      description: 'Comprehensive analysis'
    },
    academic: {
      icon: GraduationCap,
      label: 'Academic Review',
      color: 'var(--accent-purple)',
      bgColor: 'var(--accent-purple-bg)',
      description: 'Scholarly sources and citations'
    },
    scholar: {
      icon: GraduationCap,
      label: 'Scholar Mode',
      color: 'var(--accent-purple)',
      bgColor: 'var(--accent-purple-bg)',
      description: 'Academic paper-style research'
    }
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't handle keyboard shortcuts if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      
      if (viewMode !== 'feed') return;
      
      switch (e.key) {
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          navigateSource('prev');
          break;
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          navigateSource('next');
          break;
        case 'Enter':
          e.preventDefault();
          const currentSource = getCurrentSource();
          if (currentSource && onSourceClick) {
            onSourceClick(currentSource);
          }
          break;
        case 'b':
          e.preventDefault();
          const source = getCurrentSource();
          if (source && onBookmark) {
            onBookmark(source.id);
          }
          break;
        // Don't prevent default for space key - let it work normally
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [activeSourceIndex, viewMode]);

  const getCurrentSource = (): Source | null => {
    let index = 0;
    for (const group of filteredGroups) {
      if (index + group.sources.length > activeSourceIndex) {
        return group.sources[activeSourceIndex - index];
      }
      index += group.sources.length;
    }
    return null;
  };

  const navigateSource = (direction: 'prev' | 'next') => {
    const totalSources = filteredGroups.reduce((acc, group) => acc + group.sources.length, 0);
    
    if (direction === 'next') {
      setActiveSourceIndex((prev) => (prev + 1) % totalSources);
    } else {
      setActiveSourceIndex((prev) => (prev - 1 + totalSources) % totalSources);
    }
    
    // Scroll to active source
    const sourceKey = `source-${activeSourceIndex}`;
    if (sourceRefs.current[sourceKey]) {
      sourceRefs.current[sourceKey]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  };

  const copySourceUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const toggleGroupExpansion = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffHours < 48) return 'Yesterday';
    if (diffHours < 168) return `${Math.floor(diffHours / 24)}d ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const renderFeedView = () => (
    <div className="sources-feed-view" ref={feedRef}>
      {filteredGroups.map((group, groupIndex) => (
        <div key={group.id} className="source-group">
          {showGroupHeaders && (
            <div className="group-header">
              <div className="group-info">
                <div className="group-type">
                  {React.createElement(researchTypeConfig[group.researchType || 'fast'].icon, { size: 16 })}
                  <span>{researchTypeConfig[group.researchType || 'fast'].label}</span>
                </div>
                <div className="group-query">
                  <MessageSquare size={14} />
                  <span>{group.query}</span>
                </div>
                <div className="group-meta">
                  <Clock size={12} />
                  <span>{formatDate(group.timestamp)}</span>
                  <span className="source-count">{group.totalSources} sources</span>
                </div>
              </div>
              <button
                onClick={() => toggleGroupExpansion(group.id)}
                className="expand-toggle"
              >
                {expandedGroups.has(group.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
          )}
          
          {(!showGroupHeaders || expandedGroups.has(group.id) || group.status === 'active') && (
            <div className="source-feed-items">
              {group.sources.map((source, sourceIndex) => {
                const globalIndex = filteredGroups.slice(0, groupIndex).reduce(
                  (acc, g) => acc + g.sources.length, 0
                ) + sourceIndex;
                const isActive = globalIndex === activeSourceIndex;
                
                return (
                  <div
                    key={source.id}
                    ref={el => { sourceRefs.current[`source-${globalIndex}`] = el; }}
                    className={`source-feed-item ${isActive ? 'active' : ''} ${
                      bookmarkedSources.has(source.id) ? 'bookmarked' : ''
                    }`}
                    onClick={() => {
                      setActiveSourceIndex(globalIndex);
                      onSourceClick?.(source);
                    }}
                  >
                    {/* Source Content Area */}
                    <div className="source-main">
                      {source.thumbnail && (
                        <div className="source-visual">
                          <img src={source.thumbnail} alt={source.title} />
                          <div className="source-overlay">
                            <button 
                              className="view-source-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(source.url, '_blank');
                              }}
                            >
                              <Eye size={16} />
                              <span>View</span>
                            </button>
                          </div>
                        </div>
                      )}
                      
                      <div className="source-details">
                        <div className="source-header">
                          <div className="source-badges">
                            <span className="source-number">#{globalIndex + 1}</span>
                            {source.relevanceScore && (
                              <span className="relevance-score">
                                <TrendingUp size={12} />
                                {Math.round(source.relevanceScore * 100)}%
                              </span>
                            )}
                          </div>
                          
                          <div className="source-domain-info">
                            {source.favicon && (
                              <img src={source.favicon} alt="" className="domain-favicon" />
                            )}
                            <span className="domain-name">{source.domain}</span>
                          </div>
                        </div>
                        
                        <h3 className="source-title">{source.title}</h3>
                        
                        {source.snippet && (
                          <p className="source-snippet">{source.snippet}</p>
                        )}
                        
                        <div className="source-metadata">
                          {source.author && (
                            <span className="meta-item">
                              <User size={12} />
                              {source.author}
                            </span>
                          )}
                          {source.publishDate && (
                            <span className="meta-item">
                              <Calendar size={12} />
                              {formatDate(source.publishDate)}
                            </span>
                          )}
                          {source.readTime && (
                            <span className="meta-item">
                              <Clock size={12} />
                              {source.readTime}
                            </span>
                          )}
                        </div>
                        
                        {source.tags && source.tags.length > 0 && (
                          <div className="source-tags">
                            {source.tags.map((tag, idx) => (
                              <span key={idx} className="tag">
                                <Hash size={10} />
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Action Sidebar - Simplified */}
                    <div className="source-actions">
                      <button
                        className={`action-btn primary ${
                          bookmarkedSources.has(source.id) ? 'bookmarked' : ''
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onBookmark?.(source.id);
                        }}
                        title={bookmarkedSources.has(source.id) ? 'Remove bookmark' : 'Bookmark this source'}
                      >
                        {bookmarkedSources.has(source.id) ? 
                          <BookmarkCheck size={18} /> : <Bookmark size={18} />
                        }
                      </button>
                      
                      <button
                        className="action-btn secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(source.url, '_blank');
                        }}
                        title="Open source"
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderGridView = () => (
    <div className="sources-grid-view">
      {filteredGroups.map((group) => (
        <div key={group.id} className="grid-group">
          {showGroupHeaders && (
            <div className="grid-group-header">
              <div className="group-type">
                {React.createElement(researchTypeConfig[group.researchType || 'fast'].icon, { size: 14 })}
                <span>{researchTypeConfig[group.researchType || 'fast'].label}</span>
              </div>
              <span className="group-query">{group.query}</span>
            </div>
          )}
          
          <div className="sources-grid">
            {group.sources.map((source) => (
              <div
                key={source.id}
                className={`source-grid-item ${
                  bookmarkedSources.has(source.id) ? 'bookmarked' : ''
                }`}
                onClick={() => onSourceClick?.(source)}
              >
                {source.thumbnail && (
                  <div className="grid-thumbnail">
                    <img src={source.thumbnail} alt={source.title} />
                  </div>
                )}
                
                <div className="grid-content">
                  <div className="grid-header">
                    {source.favicon && (
                      <img src={source.favicon} alt="" className="grid-favicon" />
                    )}
                    <span className="grid-domain">{source.domain}</span>
                  </div>
                  
                  <h4 className="grid-title">{source.title}</h4>
                  
                  <div className="grid-actions">
                    <button
                      className={`grid-action ${
                        bookmarkedSources.has(source.id) ? 'bookmarked' : ''
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onBookmark?.(source.id);
                      }}
                    >
                      {bookmarkedSources.has(source.id) ? 
                        <BookmarkCheck size={14} /> : <Bookmark size={14} />
                      }
                    </button>
                    
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="grid-action"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ArrowUpRight size={14} />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderCompactView = () => (
    <div className="sources-compact-view">
      {filteredGroups.map((group) => (
        <div key={group.id} className="compact-group">
          {showGroupHeaders && (
            <div className="compact-group-header">
              <div className="group-info">
                {React.createElement(researchTypeConfig[group.researchType || 'fast'].icon, { size: 12 })}
                <span className="group-label">{group.query}</span>
                <span className="group-count">({group.totalSources})</span>
              </div>
            </div>
          )}
          
          <div className="compact-sources">
            {group.sources.map((source, idx) => (
              <div
                key={source.id}
                className={`compact-source ${
                  bookmarkedSources.has(source.id) ? 'bookmarked' : ''
                }`}
              >
                <span className="compact-number">[{idx + 1}]</span>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="compact-link"
                  title={source.snippet}
                >
                  {source.title}
                </a>
                <button
                  className="compact-bookmark"
                  onClick={() => onBookmark?.(source.id)}
                >
                  {bookmarkedSources.has(source.id) ? 
                    <BookmarkCheck size={12} /> : <Bookmark size={12} />
                  }
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  // Mini Browser Component
  const MiniBrowser: React.FC<{ source: Source; onBookmark: () => void; isBookmarked: boolean }> = ({ 
    source, onBookmark, isBookmarked 
  }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [useProxy, setUseProxy] = useState(false);
    const [showFallback, setShowFallback] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

    // Check if domain is known to block iframes (more conservative list)
    const isLikelyBlocked = useMemo(() => {
      const blockedDomains = [
        'github.com', 'youtube.com', 'facebook.com', 
        'twitter.com', 'linkedin.com', 'instagram.com',
        'microsoft.com', 'apple.com', 'netflix.com'
      ];
      return blockedDomains.some(domain => source.domain?.toLowerCase().includes(domain));
    }, [source.domain]);
    
    useEffect(() => {
      // Reset states when source changes
      setIsLoading(true);
      setLoadError(false);
      setUseProxy(false);
      setShowFallback(false);
      
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // Set timeout to detect failed loads (8 seconds)
      timeoutRef.current = setTimeout(() => {
        setIsLoading(false);
        setLoadError(true);
        setShowFallback(true);
      }, 8000);
      
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, [source.url]); // Remove circular dependencies

    const handleIframeLoad = () => {
      setIsLoading(false);
      setLoadError(false);
      // Clear timeout since iframe loaded successfully
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
    
    const handleIframeError = () => {
      setIsLoading(false);
      setLoadError(true);
      setShowFallback(true);
      // Clear timeout since we got an error
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };

    const renderFallbackPreview = () => (
      <div className="browser-fallback">
        <div className="fallback-header">
          <Globe size={20} />
          <div>
            <h4>{source.title}</h4>
            <span className="fallback-domain">{source.domain}</span>
          </div>
        </div>
        
        {source.snippet && (
          <div className="fallback-content">
            <p>{source.snippet}</p>
          </div>
        )}
        
        <div className="fallback-actions">
          <button 
            onClick={() => window.open(source.url, '_blank')}
            className="fallback-btn primary"
          >
            <ArrowUpRight size={16} />
            Open in New Tab
          </button>
          <button 
            onClick={() => {
              setIsLoading(true);
              setLoadError(false);
              setShowFallback(false);
              
              // Restart timeout
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
              }
              timeoutRef.current = setTimeout(() => {
                setIsLoading(false);
                setLoadError(true);
                setShowFallback(true);
              }, 8000);
            }}
            className="fallback-btn secondary"
          >
            <RotateCcw size={16} />
            Try Again
          </button>
        </div>
        
        <div className="fallback-notice">
          <AlertCircle size={14} />
          <span>This site prevents embedding for security reasons</span>
        </div>
      </div>
    );

    const getIframeSrc = () => {
      return source.url;
    };

    return (
      <div className="mini-browser">
        {/* Browser Header */}
        <div className="mini-browser-header">
          <div className="browser-controls">
            <div className="traffic-lights">
              <span className="traffic-light close"></span>
              <span className="traffic-light minimize"></span>
              <span className="traffic-light maximize"></span>
            </div>
            <div className="browser-url">
              <Globe size={12} />
              <span>{source.domain}</span>
              {isLikelyBlocked && (
                <span className="blocked-indicator" title="May be blocked from embedding">
                  <AlertCircle size={12} />
                </span>
              )}
            </div>
          </div>
          <div className="browser-actions">
            <button
              onClick={onBookmark}
              className={`browser-action ${isBookmarked ? 'bookmarked' : ''}`}
              title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
            >
              {isBookmarked ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
            </button>
            <button
              onClick={() => window.open(source.url, '_blank')}
              className="browser-action"
              title="Open in new tab"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </div>
        
        {/* Browser Content */}
        <div className="mini-browser-content">
          {isLoading && (
            <div className="browser-loading">
              <div className="loading-spinner"></div>
              <p>Loading {source.domain}...</p>
            </div>
          )}
          
          {showFallback ? (
            renderFallbackPreview()
          ) : (
            <iframe
              ref={iframeRef}
              src={getIframeSrc()}
              title={source.title}
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
              loading="lazy"
              style={{ display: loadError && showFallback ? 'none' : 'block' }}
            />
          )}
        </div>
        
        {/* Source Info */}
        <div className="mini-browser-footer">
          <h4>{source.title}</h4>
          {source.snippet && (
            <p className="source-snippet">{source.snippet}</p>
          )}
        </div>
      </div>
    );
  };

  const renderBrowserView = () => (
    <div className="sources-browser-view">
      {filteredGroups.map((group) => (
        <div key={group.id} className="browser-group">
          {showGroupHeaders && (
            <div className="browser-group-header">
              <div className="group-info">
                {React.createElement(researchTypeConfig[group.researchType || 'fast'].icon, { size: 16 })}
                <span className="group-query">{group.query}</span>
                <span className="group-count">({group.totalSources} sources)</span>
              </div>
            </div>
          )}
          
          <div className="browser-grid">
            {group.sources.map((source) => (
              <MiniBrowser
                key={source.id}
                source={source}
                onBookmark={() => onBookmark?.(source.id)}
                isBookmarked={bookmarkedSources.has(source.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className={`research-sources-feed ${isDark ? 'dark' : 'light'} ${compactMode ? 'compact' : ''}`}>
      {/* Header Controls */}
      <div className="feed-header">
        <div className="feed-title">
          <h3>Research Sources</h3>
          <span className="total-count">
            {filteredGroups.reduce((acc, g) => acc + g.sources.length, 0)} sources
          </span>
        </div>
        
        <div className="feed-controls">
          {/* Filter Toggle */}
          <button
            className={`control-btn ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={16} />
          </button>
          
          {/* View Mode Selector */}
          <div className="view-mode-selector">
            <button
              className={`mode-btn ${viewMode === 'feed' ? 'active' : ''}`}
              onClick={() => setViewMode('feed')}
              title="Feed View"
            >
              <List size={16} />
            </button>
            <button
              className={`mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid View"
            >
              <Grid3X3 size={16} />
            </button>
            <button
              className={`mode-btn ${viewMode === 'compact' ? 'active' : ''}`}
              onClick={() => setViewMode('compact')}
              title="Compact View"
            >
              <FileText size={16} />
            </button>
            <button
              className={`mode-btn ${viewMode === 'browser' ? 'active' : ''}`}
              onClick={() => setViewMode('browser')}
              title="Browser Preview View"
            >
              <Monitor size={16} />
            </button>
          </div>
        </div>
      </div>
      
      {/* Filter Bar */}
      {showFilters && (
        <div className="filter-bar">
          <button
            className={`filter-chip ${filterType === 'all' ? 'active' : ''}`}
            onClick={() => setFilterType('all')}
          >
            All Types
          </button>
          <button
            className={`filter-chip fast ${filterType === 'fast' ? 'active' : ''}`}
            onClick={() => setFilterType('fast')}
          >
            <Zap size={14} />
            Fast
          </button>
          <button
            className={`filter-chip deep ${filterType === 'deep' ? 'active' : ''}`}
            onClick={() => setFilterType('deep')}
          >
            <Brain size={14} />
            Deep
          </button>
          <button
            className={`filter-chip academic ${filterType === 'academic' ? 'active' : ''}`}
            onClick={() => setFilterType('academic')}
          >
            <GraduationCap size={14} />
            Academic
          </button>
          <button
            className={`filter-chip scholar ${filterType === 'scholar' ? 'active' : ''}`}
            onClick={() => setFilterType('scholar')}
          >
            <GraduationCap size={14} />
            Scholar
          </button>
        </div>
      )}
      
      {/* Navigation Instructions (Feed View) */}
      {viewMode === 'feed' && (
        <div className="navigation-hint">
          <span>Use ↑↓ or J/K to navigate (when not typing) • Enter to open • B to bookmark</span>
        </div>
      )}
      
      {/* Main Content Area */}
      <div className="feed-content">
        {viewMode === 'feed' && renderFeedView()}
        {viewMode === 'grid' && renderGridView()}
        {viewMode === 'compact' && renderCompactView()}
        {viewMode === 'browser' && renderBrowserView()}
      </div>
      
      {/* Quick Navigation (Feed View) */}
      {viewMode === 'feed' && filteredGroups.length > 0 && (
        <div className="quick-nav">
          <button
            className="nav-btn prev"
            onClick={() => navigateSource('prev')}
          >
            <ChevronUp size={20} />
          </button>
          <span className="nav-indicator">
            {activeSourceIndex + 1} / {filteredGroups.reduce((acc, g) => acc + g.sources.length, 0)}
          </span>
          <button
            className="nav-btn next"
            onClick={() => navigateSource('next')}
          >
            <ChevronDown size={20} />
          </button>
        </div>
      )}
    </div>
  );
};

export default ResearchSourcesFeed;