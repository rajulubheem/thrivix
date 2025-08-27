/**
 * Conversation-based Research Interface with Session Management
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  Send, Sparkles, Loader2, User, Bot, ThumbsUp, ThumbsDown,
  MessageSquare, RefreshCw, Trash2, Download, 
  ChevronDown, Globe, Brain
} from 'lucide-react';
import ChatHistory from './ChatHistory';
import PageLayout from '../layout/PageLayout';
import './ConversationResearch.css';
import './ConversationResearchImages.css';
import './InlineThoughts.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  sources?: Source[];
  screenshots?: any[];
  feedback?: 'positive' | 'negative' | null;
  is_clarification?: boolean;
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

interface ConversationSession {
  session_id: string;
  status: string;
  conversation_count: number;
  timestamp: string;
  active: boolean;
}

export default function ConversationResearch() {
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(urlSessionId || null);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [allMessageSources, setAllMessageSources] = useState<{ [messageIndex: number]: Source[] }>({});
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const [conversationCount, setConversationCount] = useState(0);
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [expandedSources, setExpandedSources] = useState(false);
  const [showAllThumbnails, setShowAllThumbnails] = useState(false);
  const [screenshots, setScreenshots] = useState<any[]>([]);
  const [modalImage, setModalImage] = useState<{src: string; alt: string; url?: string} | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  // Load session from URL if present
  useEffect(() => {
    if (urlSessionId && urlSessionId !== sessionId) {
      setSessionId(urlSessionId);
      loadSession(urlSessionId);
    }
  }, [urlSessionId]);

  const loadSessions = async () => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/v1/conversation/sessions`);
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const pollStatus = useCallback(async (sid: string) => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/v1/conversation/status/${sid}`);
      
      if (!response.ok) {
        throw new Error('Failed to get status');
      }
      
      const data = await response.json();
      
      // Update messages
      if (data.messages && data.messages.length > 0) {
        setMessages(data.messages);
      }
      
      // Update sources
      if (data.sources) {
        setSources(data.sources);
        // Associate sources with the latest assistant message
        const assistantMessages = data.messages?.filter((msg: Message) => msg.role === 'assistant') || [];
        if (assistantMessages.length > 0) {
          setAllMessageSources(prev => ({
            ...prev,
            [assistantMessages.length - 1]: data.sources
          }));
        }
      }
      
      // Update thoughts
      if (data.thoughts) {
        setThoughts(data.thoughts);
      }
      
      // Update screenshots - attach to the latest assistant message
      if (data.screenshots && data.screenshots.length > 0) {
        console.log('Screenshots received:', data.screenshots.length);
        setScreenshots(data.screenshots); // Keep global for backward compatibility
        
        // Also attach to the latest assistant message
        if (data.messages && data.messages.length > 0) {
          const updatedMessages = [...data.messages];
          // Find the latest assistant message
          for (let i = updatedMessages.length - 1; i >= 0; i--) {
            if (updatedMessages[i].role === 'assistant') {
              updatedMessages[i].screenshots = data.screenshots;
              break;
            }
          }
          setMessages(updatedMessages);
        }
      }
      
      // Update conversation count
      if (data.conversation_count !== undefined) {
        setConversationCount(data.conversation_count);
      }
      
      // Check if waiting for clarification response
      if (data.awaiting_response) {
        setAwaitingResponse(true);
        setIsLoading(false);
        // Stop polling while waiting for response
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
      
      // Stop polling when completed
      if (data.status === 'completed' || data.status === 'error' || data.status === 'waiting_for_clarification') {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setIsLoading(false);
        
        if (data.status === 'error') {
          console.error('Research error:', data.error);
        }
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, []);

  const sendMessage = async (isNewConversation: boolean = false) => {
    if (!input.trim() || isLoading) return;
    
    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);
    setThoughts([]);
    
    // Add user message immediately for better UX
    if (!isNewConversation && sessionId) {
      setMessages(prev => [...prev, { 
        role: 'user', 
        content: userMessage,
        timestamp: new Date().toISOString()
      }]);
    }
    
    // Clear awaiting response flag when sending a message
    setAwaitingResponse(false);
    
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      
      let response;
      if (isNewConversation || !sessionId) {
        // Start new conversation
        response = await fetch(`${apiUrl}/api/v1/conversation/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: userMessage,
            session_id: sessionId
          })
        });
      } else {
        // Continue existing conversation
        response = await fetch(`${apiUrl}/api/v1/conversation/continue`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: userMessage,
            session_id: sessionId
          })
        });
      }

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.status}`);
      }

      const data = await response.json();
      
      // Set session ID if new conversation
      if (!sessionId || isNewConversation) {
        setSessionId(data.session_id);
        // Update URL with new session ID
        navigate(`/conversation/${data.session_id}`, { replace: true });
      }
      
      // Start polling for updates
      pollingIntervalRef.current = setInterval(() => {
        pollStatus(data.session_id);
      }, 500);
      
      // Initial poll
      pollStatus(data.session_id);
      
    } catch (err) {
      console.error('Send error:', err);
      setIsLoading(false);
    }
  };


  const sendFeedback = async (messageIndex: number, feedback: 'positive' | 'negative') => {
    if (!sessionId) return;
    
    // Update local state
    const updatedMessages = [...messages];
    updatedMessages[messageIndex].feedback = feedback;
    setMessages(updatedMessages);
    
    // Send feedback as a follow-up message
    const feedbackMessage = feedback === 'positive' 
      ? "Thanks! That was helpful." 
      : "That wasn't quite what I was looking for.";
    
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      await fetch(`${apiUrl}/api/v1/conversation/continue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: "Please continue with the research.",
          session_id: sessionId,
          feedback: feedbackMessage
        })
      });
    } catch (err) {
      console.error('Feedback error:', err);
    }
  };

  const startNewConversation = () => {
    setSessionId(null);
    setMessages([]);
    setSources([]);
    setThoughts([]);
    setScreenshots([]); // Clear screenshots
    setConversationCount(0);
    setAllMessageSources({});
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    // Clear URL
    navigate('/conversation', { replace: false });
    inputRef.current?.focus();
  };

  const loadSession = async (sid: string) => {
    setSessionId(sid);
    setShowSessions(false);
    setIsLoading(true);
    
    // Update URL
    navigate(`/conversation/${sid}`, { replace: false });
    
    // Poll to get session data
    await pollStatus(sid);
    setIsLoading(false);
  };

  const deleteSession = async (sid: string) => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      await fetch(`${apiUrl}/api/v1/conversation/session/${sid}`, {
        method: 'DELETE'
      });
      
      // Reload sessions
      loadSessions();
      
      // Clear if current session
      if (sid === sessionId) {
        startNewConversation();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const exportConversation = () => {
    const exportData = {
      session_id: sessionId,
      messages,
      sources,
      timestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation_${sessionId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Process content to make citations clickable
  const processContentWithCitations = (text: string) => {
    if (!text) return text;
    
    // Replace citation numbers with markdown links
    return text.replace(/\[(\d+)\]/g, (match, num) => {
      const sourceNum = parseInt(num);
      const source = sources.find(s => s.number === sourceNum || sources.indexOf(s) === sourceNum - 1);
      if (source) {
        return `[${num}](${source.url} "${source.title}")`;
      }
      return match;
    });
  };

  return (
    <PageLayout>
      <div className="conversation-research-container">
        {/* Sidebar with Chat History */}
        <div className="conversation-sidebar">
          <ChatHistory
            sessions={sessions}
            currentSessionId={sessionId}
            onSelectSession={loadSession}
            onDeleteSession={deleteSession}
            onNewChat={startNewConversation}
          />
        </div>
        
        {/* Main Chat Area */}
        <div className="conversation-research">
          {/* Session Bar */}
          <div className="session-bar">
            <div className="session-container">
              <div className="session-info">
                <Sparkles className="session-icon" />
                <span className="session-text">AI Research Assistant</span>
                {sessionId && (
                  <span className="session-badge">
                    Session: {conversationCount} turns
                  </span>
                )}
              </div>
              <div className="session-actions">
                <button 
                  className="btn-icon"
                  onClick={() => setShowSessions(!showSessions)}
                  title="Toggle Sessions"
                  style={{ display: 'none' }} // Hide old sessions button
                >
                  <ChevronDown className={showSessions ? 'rotate-180' : ''} />
                  Sessions ({sessions.length})
            </button>
            <button 
              className="btn-icon"
              onClick={exportConversation}
              disabled={messages.length === 0}
              title="Export"
            >
              <Download />
            </button>
            <button 
              className="btn-icon btn-primary"
              onClick={startNewConversation}
              title="New Conversation"
            >
              <RefreshCw />
              New Chat
            </button>
          </div>
        </div>
      </div>

      {/* Sessions Dropdown */}
      {showSessions && (
        <div className="sessions-dropdown">
          <div className="sessions-list">
            {sessions.length === 0 ? (
              <div className="no-sessions">No saved sessions</div>
            ) : (
              sessions.map(session => (
                <div 
                  key={session.session_id}
                  className={`session-item ${session.session_id === sessionId ? 'active' : ''}`}
                >
                  <div 
                    className="session-info"
                    onClick={() => loadSession(session.session_id)}
                  >
                    <span className="session-id">
                      {session.session_id.substring(0, 8)}...
                    </span>
                    <span className="session-meta">
                      {session.conversation_count} turns • {session.active ? 'Active' : 'Saved'}
                    </span>
                  </div>
                  <button
                    className="btn-icon btn-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(session.session_id);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}


      {/* Main Content */}
      <main className="conversation-main">
        <div className="conversation-layout">
          {/* Content Area - Messages and Sources side by side */}
          <div className="content-area">
            {/* Messages */}
            <div className="messages-container">
          {messages.length === 0 ? (
            <div className="welcome-message">
              <Sparkles className="welcome-icon" />
              <h2>Welcome to AI Research Assistant</h2>
              <p>Start a conversation to get comprehensive research with sources</p>
              <div className="suggestions">
                <button onClick={() => setInput('What are the latest developments in quantum computing?')}>
                  Quantum Computing
                </button>
                <button onClick={() => setInput('Explain the impact of AI on healthcare')}>
                  AI in Healthcare
                </button>
                <button onClick={() => setInput('What are sustainable energy solutions for 2024?')}>
                  Sustainable Energy
                </button>
              </div>
            </div>
          ) : (
            <>
              {messages.filter(message => message.content && message.content.trim()).map((message, index) => (
                <div key={index} className={`message ${message.role} ${message.is_clarification ? 'clarification' : ''}`}>
                  <div className="message-header">
                    {message.role === 'user' ? (
                      <User className="message-icon" />
                    ) : (
                      <Bot className="message-icon" />
                    )}
                    <span className="message-role">
                      {message.role === 'user' ? 'You' : message.is_clarification ? 'AI Assistant (Clarification Needed)' : 'AI Assistant'}
                    </span>
                    {message.timestamp && (
                      <span className="message-time">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  
                  <div className="message-content">
                    {message.role === 'assistant' ? (
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
                            const citationMatch = children?.toString().match(/^(\d+)$/);
                            if (citationMatch && href) {
                              const sourceNum = parseInt(citationMatch[1]);
                              const source = sources.find(s => s.number === sourceNum || sources.indexOf(s) === sourceNum - 1);
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
                            return (
                              <a href={href} target="_blank" rel="noopener noreferrer">
                                {children}
                              </a>
                            );
                          }
                        }}
                      >
                        {processContentWithCitations(message.content)}
                      </ReactMarkdown>
                    ) : (
                      <p>{message.content}</p>
                    )}

                    {/* Inline Thoughts Display for Assistant Messages */}
                    {message.role === 'assistant' && index === messages.filter(m => m.role === 'assistant').length - 1 && thoughts.length > 0 && (
                      <div className="inline-thoughts">
                        <details className="thoughts-collapsible">
                          <summary className="thoughts-summary">
                            <Brain size={16} />
                            <span>Thinking Process</span>
                            <span className="thoughts-count">{thoughts.length} thoughts</span>
                          </summary>
                          <div className="thoughts-list">
                            {thoughts.map((thought, idx) => (
                              <div key={idx} className="thought-item" data-type={thought.type.toLowerCase()}>
                                <div className="thought-type">{thought.type}</div>
                                <div className="thought-content">{thought.content}</div>
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                  
                  {message.role === 'assistant' && (
                    <>
                      
                      <div className="message-actions">
                        <button
                          className={`btn-feedback ${message.feedback === 'positive' ? 'active' : ''}`}
                          onClick={() => sendFeedback(index, 'positive')}
                        >
                          <ThumbsUp size={16} />
                        </button>
                        <button
                          className={`btn-feedback ${message.feedback === 'negative' ? 'active' : ''}`}
                          onClick={() => sendFeedback(index, 'negative')}
                        >
                          <ThumbsDown size={16} />
                        </button>
                      </div>
                      
                      {/* Source thumbnails for each assistant message */}
                      {(() => {
                        const assistantMessageIndex = messages.filter(m => m.role === 'assistant').findIndex(m => m === message);
                        const messageSources = allMessageSources[assistantMessageIndex] || (index === messages.length - 1 ? sources : []);
                        return messageSources.length > 0 && (
                          <div className="message-sources">
                            <div className="sources-label">Sources:</div>
                            <div className="sources-thumbnails">
                              {messageSources.slice(0, 6).map((source, idx) => (
                                <a
                                  key={source.id}
                                  href={source.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="source-thumb"
                                  title={source.title}
                                >
                                  <img 
                                    src={source.favicon || `https://www.google.com/s2/favicons?domain=${source.domain}&sz=64`}
                                    alt={source.domain}
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = `https://via.placeholder.com/48x48/f3f4f6/9ca3af?text=${idx + 1}`;
                                    }}
                                  />
                                  <span className="thumb-number">{idx + 1}</span>
                                </a>
                              ))}
                              {messageSources.length > 6 && (
                                <span className="more-sources-indicator">+{messageSources.length - 6} more</span>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}

                  {/* Message Screenshots - Compact Horizontal Gallery */}
                  {message.screenshots && message.screenshots.length > 0 && (
                    <div className="message-screenshots">
                      <div className="message-screenshots-header">
                        <span>📸</span>
                        <span>Screenshots ({message.screenshots.length})</span>
                      </div>
                      <div className="message-screenshots-scroll">
                        {message.screenshots.map((screenshot: any, idx: number) => (
                          <div 
                            key={`msg-${index}-screenshot-${idx}`}
                            className="screenshot-card-compact"
                            onClick={() => {
                              if (screenshot.data) {
                                setModalImage({
                                  src: screenshot.data,
                                  alt: screenshot.description || 'Screenshot',
                                  url: screenshot.url
                                });
                              }
                            }}
                          >
                            <div className="screenshot-image-compact">
                              {screenshot.data ? (
                                <img 
                                  src={screenshot.data} 
                                  alt={screenshot.description || 'Screenshot'}
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgZmlsbD0iI2U1ZTdlYiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzZiNzI4MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBhdmFpbGFibGU8L3RleHQ+PC9zdmc+';
                                  }}
                                />
                              ) : (
                                <div style={{
                                  height: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#6b7280'
                                }}>
                                  📷
                                </div>
                              )}
                            </div>
                            <div className="screenshot-info-compact">
                              <div className="screenshot-title-compact">
                                {screenshot.description || `Screenshot ${idx + 1}`}
                              </div>
                              {screenshot.url && (
                                <div className="screenshot-url-compact">
                                  {new URL(screenshot.url).hostname}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {isLoading && (
                <>
                  <div className="message assistant loading">
                    <div className="message-header">
                      <Bot className="message-icon" />
                      <span className="message-role">AI Assistant</span>
                    </div>
                    <div className="message-content">
                      <div className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                  {/* Screenshots will be shown in separate section */}
                </>
              )}
              
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Sources Sidebar */}
        <div className="sources-sidebar">
          <h3 className="sources-title">
            <Globe size={18} />
            Sources ({sources.length})
          </h3>
          
          {sources.length > 0 ? (
            <>
              {/* Thumbnail Grid */}
              <div className="sources-thumbnails-grid">
                {sources.slice(0, showAllThumbnails ? sources.length : 6).map((source, idx) => (
                  <a
                    key={source.id}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="source-grid-thumb"
                    title={source.title}
                  >
                    <img 
                      src={source.favicon || `https://www.google.com/s2/favicons?domain=${source.domain}&sz=64`}
                      alt={source.domain}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://via.placeholder.com/64x64/f3f4f6/9ca3af?text=${idx + 1}`;
                      }}
                    />
                    <span className="thumb-badge">{idx + 1}</span>
                  </a>
                ))}
              </div>
              
              {sources.length > 6 && (
                <button 
                  className="show-more-btn"
                  onClick={() => setShowAllThumbnails(!showAllThumbnails)}
                >
                  {showAllThumbnails ? 'Show Less' : `Show ${sources.length - 6} More`}
                </button>
              )}
              
              {/* Source Links List */}
              <div className="sources-links">
                <div className="sources-links-header">All References</div>
                {sources.map((source, idx) => (
                  <a
                    key={source.id}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="source-link-item"
                  >
                    <span className="source-link-number">{idx + 1}</span>
                    <div className="source-link-info">
                      <div className="source-link-title">{source.title}</div>
                      <div className="source-link-domain">{source.domain}</div>
                    </div>
                  </a>
                ))}
              </div>
            </>
          ) : (
            <div className="no-sources">
              <p>Sources will appear here as the conversation progresses</p>
            </div>
          )}
        </div>
          </div>{/* End content-area */}
          
        </div>
      </main>

      {/* Global Screenshots Gallery - Hidden since we show inline with messages now */}
      {/* Keeping this commented in case we need to revert */}
      {false && screenshots.length > 0 && (
        <div className="screenshot-gallery">
          <div className="screenshot-gallery-header">
            <span>📸</span>
            <span>Captured Screenshots ({screenshots.length})</span>
          </div>
          <div className="screenshot-grid">
            {screenshots.map((screenshot, idx) => (
              <div key={`screenshot-${idx}-${screenshot.timestamp || idx}`} 
                   className="screenshot-card"
              onClick={() => {
                // Open image in modal
                if (screenshot.data) {
                  setModalImage({
                    src: screenshot.data,
                    alt: screenshot.description || 'Screenshot',
                    url: screenshot.url
                  });
                }
              }}
              >
                <div className="screenshot-image-container">
                  {screenshot.type === 'animated_preview' && (
                    <div className="animated-preview-badge">
                      🎬 GIF
                    </div>
                  )}
                  {screenshot.data ? (
                    <img 
                      src={screenshot.data} 
                      alt={screenshot.description}
                      className="screenshot-image"
                      onError={(e) => {
                        // Fallback for broken images
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2U1ZTdlYiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNiIgZmlsbD0iIzZiNzI4MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBhdmFpbGFibGU8L3RleHQ+PC9zdmc+';
                      }}
                    />
                  ) : (
                    <div className="screenshot-error">
                      <div className="screenshot-error-icon">📷</div>
                      <div>No preview</div>
                    </div>
                  )}
                </div>
                <div className="screenshot-info">
                  <div className="screenshot-title">
                    {screenshot.type === 'animated_preview' && '🎬 '}
                    {screenshot.description || `Screenshot ${idx + 1}`}
                  </div>
                  {screenshot.url && (
                    <a 
                      href={screenshot.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="screenshot-url"
                    >
                      🔗 {screenshot.url}
                    </a>
                  )}
                  <div className="screenshot-hint">
                    {screenshot.type === 'animated_preview' ? (
                      <>🎥 Click to play animation</>
                    ) : (
                      <>🔍 Click to view full size</>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Image Modal */}
      {modalImage && (
        <div 
          className="image-modal-overlay"
          onClick={() => setModalImage(null)}
        >
          <div 
            className="image-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              className="image-modal-close"
              onClick={() => setModalImage(null)}
            >
              ×
            </button>
            <img 
              src={modalImage.src} 
              alt={modalImage.alt}
              className="image-modal-image"
            />
            <div className="image-modal-controls">
              {modalImage.url && (
                <a 
                  href={modalImage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="image-modal-button"
                >
                  🔗 Visit Page
                </a>
              )}
              <button
                className="image-modal-button"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = modalImage.src;
                  link.download = modalImage.alt.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.png';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
              >
                💾 Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="input-container">
        <div className="input-wrapper">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={
              awaitingResponse 
                ? "Please provide clarification..." 
                : sessionId 
                  ? "Continue the conversation..." 
                  : "Start a new research conversation..."
            }
            className="message-input"
            disabled={isLoading}
            rows={1}
          />
          <button
            onClick={() => sendMessage()}
            className="send-button"
            disabled={isLoading || !input.trim()}
          >
            {isLoading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Send />
            )}
          </button>
        </div>
        <div className="input-hints">
          Press Enter to send • Shift+Enter for new line
        </div>
      </div>

        </div>
      </div>
    </PageLayout>
  );
}