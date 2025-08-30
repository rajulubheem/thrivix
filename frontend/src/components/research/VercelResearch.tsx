/**
 * Modern Vercel-style Research Interface with Royal Aesthetics
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  Search, Sparkles, ArrowRight, Loader2, CheckCircle2,
  Globe, ExternalLink, User, Bot, X, AlertCircle, Brain,
  Printer, Download
} from 'lucide-react';
import ThoughtsPanel from './ThoughtsPanel';
import ResearchSourcesFeed from './ResearchSourcesFeed';
import { handlePrint, handleDownloadReport } from '../../utils/researchExportUtils';
import './VercelResearch.css';

interface ResearchStep {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'active' | 'completed' | 'waiting';
  icon: string;
}

interface Source {
  id: string;
  number?: number;
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  favicon?: string;
  thumbnail?: string;
}

interface Thought {
  type: string;
  content: string;
  timestamp: string;
}

export default function VercelResearch() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [researchSteps, setResearchSteps] = useState<ResearchStep[]>([]);
  const [content, setContent] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [bookmarkedSources, setBookmarkedSources] = useState<Set<string>>(new Set());
  
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const contentEndRef = useRef<HTMLDivElement>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Auto-scroll to bottom when content updates
  useEffect(() => {
    if (contentEndRef.current && content) {
      contentEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [content]);

  const pollStatus = useCallback(async (sessionId: string) => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/v1/research/status-strands-real/${sessionId}`);
      
      if (!response.ok) {
        throw new Error('Failed to get status');
      }
      
      const data = await response.json();
      
      setProgress(data.progress || 0);
      
      if (data.steps) {
        setResearchSteps(data.steps);
      }
      
      if (data.content) {
        setContent(data.content);
      }
      
      if (data.sources) {
        setSources(data.sources);
      }
      
      if (data.thoughts) {
        setThoughts(data.thoughts);
      }
      
      if (data.requires_approval) {
        setRequiresApproval(true);
        setApprovalMessage(data.approval_message || 'The AI needs your input to continue');
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
      
      if (data.status === 'completed' || data.status === 'error') {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setIsSearching(false);
        
        if (data.status === 'error') {
          setError(data.error || 'Research failed');
        }
      }
    } catch (err: any) {
      console.error('Polling error:', err);
    }
  }, []);

  const toggleBookmark = (sourceId: string) => {
    setBookmarkedSources(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sourceId)) {
        newSet.delete(sourceId);
      } else {
        newSet.add(sourceId);
      }
      return newSet;
    });
  };

  const handleSourceClick = (source: Source) => {
    window.open(source.url, '_blank');
  };

  const handlePrintReport = () => {
    const allMessages = [
      { role: 'user' as const, content: query },
      { role: 'assistant' as const, content, sources, thoughts }
    ];
    handlePrint(allMessages, sessionId, 'Vercel Research', sources);
  };

  const handleDownload = () => {
    const allMessages = [
      { role: 'user' as const, content: query },
      { role: 'assistant' as const, content, sources, thoughts }
    ];
    handleDownloadReport(allMessages, sessionId, 'Vercel Research', sources);
  };

  const handleSearch = async () => {
    if (!query.trim() || isSearching) return;
    
    setIsSearching(true);
    setError(null);
    setResearchSteps([]);
    setContent('');
    setSources([]);
    setThoughts([]);
    setSessionId(null);
    setProgress(0);
    setRequiresApproval(false);
    setApprovalMessage('');
    
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      
      const response = await fetch(`${apiUrl}/api/v1/research/start-strands-real`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          require_approval: true
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to start research: ${response.status}`);
      }

      const { session_id } = await response.json();
      setSessionId(session_id);
      
      pollingIntervalRef.current = setInterval(() => {
        pollStatus(session_id);
      }, 500);
      
      pollStatus(session_id);
      
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.message || 'Failed to start research');
      setIsSearching(false);
    }
  };

  const handleApproval = async (approved: boolean, userInput?: string) => {
    if (!sessionId) return;
    
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      await fetch(`${apiUrl}/api/v1/research/approve/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          approved,
          user_input: userInput 
        })
      });
      
      setRequiresApproval(false);
      setApprovalMessage('');
      
      if (approved && !pollingIntervalRef.current) {
        setIsSearching(true);
        pollingIntervalRef.current = setInterval(() => {
          pollStatus(sessionId);
        }, 500);
      } else if (!approved) {
        setIsSearching(false);
      }
    } catch (err) {
      console.error('Approval error:', err);
    }
  };

  // Process content to make citations clickable
  const processContentWithCitations = (text: string) => {
    if (!text) return text;
    
    // Replace citation numbers with markdown links
    return text.replace(/\[(\d+)\]/g, (match, num) => {
      const sourceNum = parseInt(num);
      // Find source by number (1-indexed)
      const source = sources.find(s => (s.number && s.number === sourceNum) || sources.indexOf(s) === sourceNum - 1);
      if (source) {
        // Return markdown link with superscript styling
        return `[${num}](${source.url} "${source.title}")`;
      }
      return match;
    });
  };

  return (
    <div className="vercel-research">
      {/* Navigation Bar */}
      <nav className="nav-bar">
        <div className="nav-container">
          <div className="nav-brand">
            <Sparkles className="brand-icon" />
            <span className="brand-text">Deep Research AI</span>
          </div>
          <div className="nav-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {content && (
              <>
                <button 
                  onClick={handlePrintReport}
                  className="nav-action-btn"
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    padding: '8px 16px',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '8px',
                    color: 'white',
                    cursor: 'pointer'
                  }}
                >
                  <Printer size={16} />
                  <span>Print</span>
                </button>
                <button 
                  onClick={handleDownload}
                  className="nav-action-btn"
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    padding: '8px 16px',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '8px',
                    color: 'white',
                    cursor: 'pointer'
                  }}
                >
                  <Download size={16} />
                  <span>Download</span>
                </button>
              </>
            )}
            <div className="nav-badge">
              <span>Powered by Strands AI</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-container">
        {/* Search Section */}
        <div className="search-container">
          <div className="search-header">
            <h1 className="search-title">AI Research Hub</h1>
            <p className="search-subtitle">Get comprehensive insights with 20+ sources and deep analysis</p>
          </div>

          <div className="search-box-wrapper">
            <div className="search-box">
              <Search className="search-icon" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="What would you like to research today?"
                className="search-input"
                disabled={isSearching}
                autoFocus
              />
              <button 
                onClick={handleSearch} 
                className="search-button"
                disabled={isSearching || !query.trim()}
              >
                {isSearching ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ArrowRight />
                )}
              </button>
            </div>

            {/* Quick Examples */}
            {!query && !content && (
              <div className="examples">
                <span className="examples-label">Try:</span>
                <button onClick={() => setQuery('Latest AI breakthroughs in 2024')}>
                  AI Breakthroughs
                </button>
                <button onClick={() => setQuery('Tesla stock analysis with future predictions')}>
                  TSLA Analysis
                </button>
                <button onClick={() => setQuery('Climate change solutions')}>
                  Climate Solutions
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Progress Indicator */}
        {isSearching && (
          <div className="progress-container">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="progress-steps">
              {researchSteps.map((step) => (
                <div key={step.id} className={`step-indicator ${step.status}`}>
                  {step.icon === 'brain' ? (
                    step.status === 'completed' ? (
                      <Brain size={16} className="brain-icon" />
                    ) : step.status === 'active' ? (
                      <Brain size={16} className="brain-icon animate-pulse" />
                    ) : (
                      <Brain size={16} className="brain-icon" />
                    )
                  ) : step.status === 'completed' ? (
                    <CheckCircle2 size={16} />
                  ) : step.status === 'active' ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <div className="step-dot" />
                  )}
                  <span>{step.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="error-container">
            <AlertCircle />
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* Approval Dialog */}
        {requiresApproval && (
          <div className="approval-container">
            <div className="approval-card">
              <div className="approval-header">
                <Bot className="approval-icon" />
                <h3>Your Input Needed</h3>
              </div>
              <p className="approval-message">{approvalMessage}</p>
              <input
                type="text"
                placeholder="Type your response..."
                className="approval-input"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    const input = (e.target as HTMLInputElement).value;
                    handleApproval(true, input);
                  }
                }}
              />
              <div className="approval-actions">
                <button 
                  className="btn-primary"
                  onClick={() => {
                    const input = document.querySelector('.approval-input') as HTMLInputElement;
                    handleApproval(true, input?.value);
                  }}
                >
                  Continue
                </button>
                <button 
                  className="btn-secondary"
                  onClick={() => handleApproval(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Research Content */}
        {content && (
          <div className="content-container">
            {/* Sources - Using new ResearchSourcesFeed component */}
            {sources.length > 0 && (
              <div className="sources-container">
                <ResearchSourcesFeed
                  currentSources={sources}
                  onSourceClick={handleSourceClick}
                  onBookmark={toggleBookmark}
                  bookmarkedSources={bookmarkedSources}
                  activeMessageId={sessionId}
                  showGroupHeaders={false}
                  compactMode={false}
                />
              </div>
            )}

            {/* Article */}
            <article className="article">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  code({node, className, children, ...props}: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    const inline = !match;
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          margin: '1.5rem 0',
                          borderRadius: '12px',
                          fontSize: '0.9rem'
                        }}
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className="inline-code" {...props}>
                        {children}
                      </code>
                    );
                  },
                  a: ({ href, children }) => {
                    // Check if this is a citation link
                    const citationMatch = children?.toString().match(/^(\d+)$/);
                    if (citationMatch && href) {
                      const sourceNum = parseInt(citationMatch[1]);
                      // Find the corresponding source
                      const source = sources.find(s => (s.number && s.number === sourceNum) || sources.indexOf(s) === sourceNum - 1);
                      if (source) {
                        return (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="citation"
                            title={`${source.title} - ${source.domain}`}
                          >
                            <sup>[{sourceNum}]</sup>
                          </a>
                        );
                      }
                    }
                    // Regular link
                    return (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="link">
                        {children}
                      </a>
                    );
                  }
                }}
              >
                {processContentWithCitations(content)}
              </ReactMarkdown>
              {isSearching && <span className="cursor">|</span>}
              <div ref={contentEndRef} />
            </article>
          </div>
        )}

        {/* Loading State */}
        {isSearching && !content && (
          <div className="loading-container">
            <div className="loading-spinner">
              <Loader2 className="animate-spin" size={32} />
            </div>
            <p>Researching your query...</p>
          </div>
        )}
      </main>
      
      {/* Thoughts Panel */}
      <ThoughtsPanel thoughts={thoughts} isSearching={isSearching} />
    </div>
  );
}