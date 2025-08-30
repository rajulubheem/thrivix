/**
 * Fixed Conversation Research Interface with Unified Theme
 * Matches the swarm page styling and provides ChatGPT-like thinking box
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTheme } from '../../contexts/ThemeContext';
import { 
  Send, Sparkles, Loader2, User, Bot, 
  Globe, Brain, Search, FileText, CheckCircle,
  Clock, ExternalLink, Image, ChevronDown, ChevronUp,
  Target, Zap, Lightbulb, Copy, RefreshCw, MoreVertical,
  ThumbsUp, ThumbsDown, Share, Bookmark, Trash2, AlertCircle, X, Square,
  GraduationCap, Plus, MessageSquare, Printer, Download
} from 'lucide-react';
import ResearchSourcesFeed from './ResearchSourcesFeed';
import { handlePrint, handleDownloadReport } from '../../utils/researchExportUtils';
import '../../styles/unified-theme.css';
import '../../styles/component-overrides.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  sources?: Source[];
  screenshots?: any[];
  thoughts?: Thought[];
  feedback?: 'positive' | 'negative' | null;
  mode?: 'fast' | 'deep' | 'scholar';
  status?: string;
  progress?: number;
  id?: string;
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
  conversation_count: number;
  timestamp: string;
  active?: boolean;
  mode?: 'fast' | 'deep' | 'scholar';
  title?: string;
  messages?: Message[];
}

const ConversationResearchFixed: React.FC = () => {
  const { sessionId: urlSessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { isDark } = useTheme();
  
  const [sessionId, setSessionId] = useState<string | null>(urlSessionId || null);
  const [researchSessionId, setResearchSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [showModeChangeDialog, setShowModeChangeDialog] = useState(false);
  const [pendingMode, setPendingMode] = useState<'fast' | 'deep' | 'scholar' | null>(null);
  const [mode, setMode] = useState<'fast' | 'deep' | 'scholar'>('fast');
  const [showThinking, setShowThinking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [researchSteps, setResearchSteps] = useState<any[]>([]);
  const [processedMessageIds, setProcessedMessageIds] = useState<Set<string>>(new Set());
  const [bookmarkedSources, setBookmarkedSources] = useState<Set<string>>(new Set());
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const thinkingBoxRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Handle bookmark toggle
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

  // Handle source click
  const handleSourceClick = (source: Source) => {
    window.open(source.url, '_blank');
  };

  // Handle print
  const handlePrintReport = () => {
    handlePrint(messages, sessionId, `${modeConfig[mode].name} Research`, sources);
  };

  // Handle download
  const handleDownload = () => {
    handleDownloadReport(messages, sessionId, `${modeConfig[mode].name} Research`, sources);
  };

  // Mode configuration
  const modeConfig = {
    fast: {
      name: 'Fast Mode',
      icon: Zap,
      color: '#22c55e',
      description: 'Quick responses with basic search'
    },
    deep: {
      name: 'Deep Research',
      icon: Brain,
      color: '#6366f1',
      description: 'Comprehensive research with multiple sources'
    },
    scholar: {
      name: 'Scholar Mode',
      icon: GraduationCap,
      color: '#f59e0b',
      description: 'Academic-level research with citations'
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-collapse thinking when done
  useEffect(() => {
    if (!isLoading && thoughts.length > 0 && showThinking) {
      // Keep thinking box open for 2 seconds after completion, then auto-collapse
      const timer = setTimeout(() => {
        setShowThinking(false);
        setIsThinking(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isLoading, thoughts.length, showThinking]);

  // Load sessions on mount
  useEffect(() => {
    fetchSessions();
    if (urlSessionId) {
      loadSession(urlSessionId);
    } else {
      createNewSession();
    }
  }, []);

  // Save session to localStorage periodically
  useEffect(() => {
    if (sessionId && messages.length > 0) {
      const currentSession = {
        session_id: sessionId,
        mode,
        messages,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(`session_${sessionId}`, JSON.stringify(currentSession));
    }
  }, [sessionId, messages, mode]);

  const fetchSessions = async () => {
    try {
      // Fetch from backend
      const response = await fetch(`${apiUrl}/api/v1/conversation/sessions`);
      if (response.ok) {
        const backendSessions = await response.json();
        setSessions(backendSessions);
      }
      
      // Also get sessions from localStorage
      const localSessions: ConversationSession[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('session_')) {
          const sessionData = JSON.parse(localStorage.getItem(key) || '{}');
          if (sessionData.session_id) {
            localSessions.push({
              session_id: sessionData.session_id,
              mode: sessionData.mode || 'fast',
              messages: sessionData.messages || [],
              conversation_count: sessionData.messages?.length || 0,
              timestamp: sessionData.timestamp,
              title: sessionData.messages?.[0]?.content?.substring(0, 50) || 'New conversation'
            });
          }
        }
      }
      
      // Merge sessions
      if (localSessions.length > 0) {
        setSessions(prev => {
          const merged = [...prev];
          localSessions.forEach(local => {
            if (!merged.find(s => s.session_id === local.session_id)) {
              merged.push(local);
            }
          });
          return merged.sort((a, b) => 
            new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
          );
        });
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
  };

  const createNewSession = async () => {
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setSessionId(newSessionId);
    setMessages([]);
    setThoughts([]);
    setSources([]);
    setError(null);
    
    // Save new session
    const newSession = {
      session_id: newSessionId,
      mode,
      messages: [],
      timestamp: new Date().toISOString()
    };
    localStorage.setItem(`session_${newSessionId}`, JSON.stringify(newSession));
    
    // Update URL
    navigate(`/conversation/${newSessionId}`);
    
    // Refresh sessions list
    fetchSessions();
  };

  const handleModeChange = (newMode: 'fast' | 'deep' | 'scholar') => {
    if (messages.length > 0 && newMode !== mode) {
      // Show confirmation dialog
      setPendingMode(newMode);
      setShowModeChangeDialog(true);
    } else {
      setMode(newMode);
    }
  };

  const confirmModeChange = () => {
    if (pendingMode) {
      setMode(pendingMode);
      createNewSession();
      setShowModeChangeDialog(false);
      setPendingMode(null);
    }
  };

  const cancelModeChange = () => {
    setShowModeChangeDialog(false);
    setPendingMode(null);
  };

  // Copy message to clipboard
  const copyToClipboard = async (text: string, messageId?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (messageId) {
        setCopiedMessageId(messageId);
        setTimeout(() => setCopiedMessageId(null), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Handle message actions
  const handleMessageAction = (action: string, message: Message) => {
    switch (action) {
      case 'copy':
        copyToClipboard(message.content, message.id);
        break;
      case 'regenerate':
        // Implement regeneration logic
        console.log('Regenerate message');
        break;
      case 'feedback-positive':
        // Implement positive feedback
        console.log('Positive feedback');
        break;
      case 'feedback-negative':
        // Implement negative feedback
        console.log('Negative feedback');
        break;
      default:
        break;
    }
  };

  const stopResearch = () => {
    // Stop polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    
    // Abort any ongoing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Reset states
    setIsLoading(false);
    setIsThinking(false);
    
    // Add a message indicating the research was stopped
    const stoppedMessage: Message = {
      role: 'assistant',
      content: '⏹️ Research stopped by user.',
      timestamp: new Date().toISOString(),
      mode: mode,
      id: `msg-stopped-${Date.now()}`
    };
    
    setMessages(prev => [...prev, stoppedMessage]);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
      mode: mode,
      id: `msg-${Date.now()}`
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setShowThinking(true);
    setIsThinking(true);
    setThoughts([]);
    setSources([]);
    setError(null);
    setResearchSteps([]);
    setProcessedMessageIds(new Set());

    try {
      // Start research based on mode
      const endpoint = mode === 'fast' 
        ? '/api/v1/conversation/start'
        : '/api/v1/research/start-strands-real';

      const response = await fetch(`${apiUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: userMessage.content,
          session_id: sessionId,
          mode: mode
        })
      });

      const data = await response.json();
      
      if (data.session_id) {
        setSessionId(data.session_id);
        setResearchSessionId(data.research_session_id || data.session_id);
        
        // Start polling for updates
        startPolling(data.research_session_id || data.session_id);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setIsLoading(false);
      setIsThinking(false);
    }
  };

  const startPolling = (pollSessionId: string) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    const pollStatus = async () => {
      try {
        const endpoint = mode === 'fast'
          ? `/api/v1/conversation/status/${pollSessionId}`
          : `/api/v1/research/status-strands-real/${pollSessionId}`;

        const response = await fetch(`${apiUrl}${endpoint}`);
        const data = await response.json();

        // Update research steps if available
        if (data.steps) {
          setResearchSteps(data.steps);
        }

        // Update thoughts
        if (data.thoughts && data.thoughts.length > 0) {
          setThoughts(data.thoughts);
        }

        // Update sources
        if (data.sources && data.sources.length > 0) {
          setSources(data.sources);
        }

        // Handle error state
        if (data.status === 'error' || data.error) {
          setError(data.error || 'An error occurred during research');
          setIsLoading(false);
          setIsThinking(false);
          
          // Show error message in chat
          const errorMessage: Message = {
            role: 'assistant',
            content: `❌ **Error:** ${data.error || 'An error occurred during research'}\n\n**Suggestion:** Please check your API keys in the backend configuration or try again with a simpler query.`,
            timestamp: new Date().toISOString(),
            mode: mode,
            id: `msg-${Date.now()}`
          };
          
          setMessages(prev => [...prev, errorMessage]);
          
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
          }
          return;
        }

        // Handle completion
        if (data.status === 'completed') {
          if (data.answer || data.content) {
            // Generate consistent message ID based on session and timestamp
            const messageId = `msg-${pollSessionId}-${data.timestamp || Date.now()}`;
            
            // Check if we've already processed this message to avoid duplicates
            if (!processedMessageIds.has(messageId)) {
              const assistantMessage: Message = {
                role: 'assistant',
                content: data.answer || data.content || 'Research completed but no answer was generated.',
                sources: data.sources,
                thoughts: data.thoughts,
                timestamp: new Date().toISOString(),
                mode: mode,
                id: messageId
              };

              setMessages(prev => [...prev, assistantMessage]);
              setProcessedMessageIds(prev => new Set(Array.from(prev).concat(messageId)));
            }
          }
          
          setIsLoading(false);
          setIsThinking(false);
          setError(null);
          
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
        setError('Failed to connect to the server. Please check if the backend is running.');
        setIsLoading(false);
        setIsThinking(false);
        
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
      }
    };

    // Poll immediately, then every second
    pollStatus();
    pollingIntervalRef.current = setInterval(pollStatus, 1000);
  };

  const loadSession = async (sessionIdToLoad: string) => {
    try {
      // First try to load from localStorage
      const localSession = localStorage.getItem(`session_${sessionIdToLoad}`);
      if (localSession) {
        const sessionData = JSON.parse(localSession);
        setSessionId(sessionIdToLoad);
        setMessages(sessionData.messages || []);
        setMode(sessionData.mode || 'fast');
        navigate(`/conversation/${sessionIdToLoad}`);
        return;
      }
      
      // Then try backend
      const response = await fetch(`${apiUrl}/api/v1/conversation/session/${sessionIdToLoad}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        setMode(data.mode || 'fast');
        setSessionId(sessionIdToLoad);
        navigate(`/conversation/${sessionIdToLoad}`);
      }
    } catch (error) {
      console.error('Error loading session:', error);
    }
  };

  const getModeIcon = (currentMode: string) => {
    switch (currentMode) {
      case 'fast': return <Zap className="w-4 h-4" />;
      case 'deep': return <Brain className="w-4 h-4" />;
      case 'scholar': return <Target className="w-4 h-4" />;
      default: return <Zap className="w-4 h-4" />;
    }
  };

  return (
    <div className="flex h-screen bg-base">
      {/* Mode Change Dialog */}
      {showModeChangeDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-base rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Switch Research Mode?</h3>
            <p className="text-secondary mb-6">
              Switching to {pendingMode && modeConfig[pendingMode].name} will start a new conversation session.
              Your current conversation will be saved in history.
            </p>
            <div className="flex gap-3 justify-end">
              <button 
                onClick={cancelModeChange}
                className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmModeChange}
                className="px-4 py-2 rounded-lg bg-accent-primary text-white hover:bg-accent-hover transition-colors"
              >
                Switch Mode
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Left Sidebar - Session History */}
      <div className="w-64 bg-chat-sidebar border-r border-default flex flex-col">
        <div className="p-4 border-b border-default">
          <button 
            onClick={createNewSession}
            className="w-full btn-primary flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Conversation
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {sessions.map((session) => (
            <div
              key={session.session_id}
              onClick={() => loadSession(session.session_id)}
              className={`sidebar-item ${session.session_id === sessionId ? 'active' : ''}`}
            >
              <div className="flex items-center gap-2">
                {getModeIcon(session.mode || 'fast')}
                <div className="flex-1 truncate">
                  <div className="text-sm font-medium">
                    Conversation {session.conversation_count}
                  </div>
                  <div className="text-xs text-tertiary">
                    {new Date(session.timestamp).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-chat-main">
        {/* API Key Warning Banner */}
        {error && error.includes('API key') && (
          <div className="bg-warning-bg border-b border-warning p-3 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0" />
            <div className="flex-1 text-sm text-warning">
              <strong>Configuration Required:</strong> Please set up your OpenAI API key in the backend (.env file) to use Deep Research mode. 
              Fast mode may work without it.
            </div>
            <button 
              onClick={() => setError(null)}
              className="text-warning hover:text-warning-dark"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        
        {/* Header with Mode Selector */}
        <div className="bg-surface border-b border-default p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-primary">Research Conversation</h1>
            
            {/* Mode Selector */}
            <div className="mode-selector flex items-center gap-1 p-1">
              <button
                onClick={() => handleModeChange('fast')}
                className={`mode-button px-4 py-2 rounded-md flex items-center gap-2 transition-all ${
                  mode === 'fast' ? 'active' : ''
                }`}
              >
                <Zap className="w-4 h-4" />
                Fast
              </button>
              <button
                onClick={() => handleModeChange('deep')}
                className={`mode-button px-4 py-2 rounded-md flex items-center gap-2 transition-all ${
                  mode === 'deep' ? 'active' : ''
                }`}
              >
                <Brain className="w-4 h-4" />
                Deep Research
              </button>
              <button
                onClick={() => handleModeChange('scholar')}
                className={`mode-button px-4 py-2 rounded-md flex items-center gap-2 transition-all ${
                  mode === 'scholar' ? 'active' : ''
                }`}
              >
                <GraduationCap className="w-4 h-4" />
                Scholar
              </button>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Sparkles className="w-12 h-12 text-accent-royal mb-4" />
              <h2 className="text-2xl font-semibold text-primary mb-2">
                Start a Research Conversation
              </h2>
              <p className="text-secondary max-w-md">
                Choose a mode above and ask anything. I'll search the web and provide comprehensive answers.
              </p>
            </div>
          ) : (
            <>
              {messages.map((message, index) => (
                <div key={message.id || index} className={`message ${message.role} mb-4 fade-in`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      {message.role === 'user' ? (
                        <div className="w-8 h-8 rounded-full bg-message-user flex items-center justify-center">
                          <User className="w-5 h-5 text-on-accent" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center">
                          <Bot className="w-5 h-5 text-accent-royal" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <div className="message-content">
                        {message.role === 'assistant' ? (
                          <div className="markdown-content">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p>{message.content}</p>
                        )}
                      </div>
                      
                      {/* Message Actions */}
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => handleMessageAction('copy', message)}
                          className="text-tertiary hover:text-secondary transition-colors p-1"
                          title="Copy message"
                        >
                          {copiedMessageId === message.id ? (
                            <CheckCircle className="w-4 h-4 text-success" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        
                        {message.role === 'assistant' && (
                          <>
                            <button
                              onClick={() => handleMessageAction('regenerate', message)}
                              className="text-tertiary hover:text-secondary transition-colors p-1"
                              title="Regenerate response"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleMessageAction('feedback-positive', message)}
                              className="text-tertiary hover:text-secondary transition-colors p-1"
                              title="Good response"
                            >
                              <ThumbsUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleMessageAction('feedback-negative', message)}
                              className="text-tertiary hover:text-secondary transition-colors p-1"
                              title="Bad response"
                            >
                              <ThumbsDown className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        
                        <span className="text-xs text-tertiary ml-2">
                          {message.timestamp && new Date(message.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      {/* Sources */}
                      {message.sources && message.sources.length > 0 && (
                        <div className="mt-3 p-3 bg-subtle rounded-lg">
                          <div className="text-sm font-medium text-secondary mb-2">Sources</div>
                          <div className="space-y-2">
                            {message.sources.map((source, idx) => (
                              <a
                                key={idx}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-2 p-2 hover:bg-elevated rounded transition-colors"
                              >
                                <Globe className="w-4 h-4 text-accent-royal mt-0.5" />
                                <div className="flex-1">
                                  <div className="text-sm font-medium text-link hover:opacity-80">
                                    {source.title}
                                  </div>
                                  <div className="text-xs text-tertiary">{source.domain}</div>
                                  {source.snippet && (
                                    <div className="text-xs text-secondary mt-1">{source.snippet}</div>
                                  )}
                                </div>
                                <ExternalLink className="w-3 h-3 text-tertiary" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Thinking Box - ChatGPT Style */}
              {isThinking && (
                <div className="message assistant mb-4 fade-in">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center">
                        <Bot className="w-5 h-5 text-accent-royal" />
                      </div>
                    </div>
                    
                    <div className="flex-1">
                      <div className="bg-elevated border border-muted rounded-lg overflow-hidden">
                        <div className="flex items-center">
                          <button
                            onClick={() => setShowThinking(!showThinking)}
                            className="flex-1 px-4 py-3 flex items-center justify-between hover:bg-subtle transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin text-accent-royal" />
                              <span className="text-sm font-medium text-primary">
                                {isLoading ? 'Thinking...' : `Thought process (${thoughts.length} steps)`}
                              </span>
                            </div>
                            {showThinking ? (
                              <ChevronUp className="w-4 h-4 text-tertiary" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-tertiary" />
                            )}
                          </button>
                          {isLoading && (
                            <button
                              onClick={stopResearch}
                              className="px-3 py-3 hover:bg-subtle transition-colors border-l border-muted"
                              title="Stop research"
                            >
                              <X className="w-4 h-4 text-error" />
                            </button>
                          )}
                        </div>
                        
                        {showThinking && (
                          <div 
                            ref={thinkingBoxRef}
                            className="border-t border-muted"
                            style={{
                              maxHeight: '256px',
                              overflowY: 'auto',
                              overflowX: 'hidden'
                            }}
                          >
                            <div className="p-4 space-y-2">
                              {/* Show research steps if available */}
                              {researchSteps.length > 0 && (
                                <div className="space-y-2 mb-3">
                                  {researchSteps.map((step, idx) => (
                                    <div key={idx} className="flex items-start gap-2 text-sm">
                                      {step.status === 'completed' ? (
                                        <CheckCircle className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                                      ) : step.status === 'active' ? (
                                        <Loader2 className="w-4 h-4 animate-spin text-accent-royal mt-0.5 flex-shrink-0" />
                                      ) : (
                                        <Clock className="w-4 h-4 text-tertiary mt-0.5 flex-shrink-0" />
                                      )}
                                      <div className="flex-1">
                                        <div className="font-medium text-primary">{step.title}</div>
                                        <div className="text-secondary">{step.description}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {/* Show thoughts */}
                              {thoughts.length > 0 ? (
                                <>
                                  {researchSteps.length > 0 && (
                                    <div className="border-t border-muted pt-2 mb-2">
                                      <div className="text-xs font-medium text-tertiary mb-1">Thoughts</div>
                                    </div>
                                  )}
                                  {thoughts.map((thought, idx) => (
                                    <div key={idx} className="flex items-start gap-2 text-sm">
                                      <CheckCircle className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                                      <div className="flex-1">
                                        <span className="text-secondary">{thought.content}</span>
                                      </div>
                                    </div>
                                  ))}
                                </>
                              ) : researchSteps.length === 0 ? (
                                <div className="flex items-center gap-2 text-sm text-secondary">
                                  <div className="loading-dots flex gap-1">
                                    <span></span>
                                    <span></span>
                                    <span></span>
                                  </div>
                                  <span>Searching and analyzing...</span>
                                </div>
                              ) : null}
                              
                              {/* Show error if any */}
                              {error && (
                                <div className="mt-2 p-2 bg-error-bg border border-error rounded text-sm text-error">
                                  {error}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="chat-input-container">
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={`Ask anything... (${mode} mode)`}
              className="chat-input w-full pr-12"
              rows={1}
              disabled={isLoading}
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
            <div className="absolute right-2 bottom-2 flex items-center gap-2">
              {isLoading && (
                <button
                  onClick={stopResearch}
                  className="p-2 rounded-md bg-error text-on-accent hover:opacity-90 transition-opacity"
                  title="Stop research"
                >
                  <Square className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={handleSendMessage}
                disabled={!input.trim() || isLoading}
                className="p-2 rounded-md bg-accent-royal text-on-accent disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Sources & Info */}
      <div className="w-96 bg-chat-sidebar border-l border-default flex flex-col">
        <div className="p-4 border-b border-default flex justify-between items-center">
          <h3 className="font-semibold text-primary">Research Sources</h3>
          <div className="flex gap-2">
            {messages.length > 0 && (
              <>
                <button
                  onClick={handlePrintReport}
                  className="p-2 hover:bg-subtle rounded-lg transition-colors"
                  title="Print Report"
                >
                  <Printer className="w-4 h-4 text-secondary" />
                </button>
                <button
                  onClick={handleDownload}
                  className="p-2 hover:bg-subtle rounded-lg transition-colors"
                  title="Download Report"
                >
                  <Download className="w-4 h-4 text-secondary" />
                </button>
              </>
            )}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {sources.length > 0 ? (
            <ResearchSourcesFeed
              currentSources={sources}
              onSourceClick={handleSourceClick}
              onBookmark={toggleBookmark}
              bookmarkedSources={bookmarkedSources}
              activeMessageId={sessionId}
              showGroupHeaders={false}
              compactMode={true}
            />
          ) : (
            <div className="text-center text-secondary text-sm p-4">
              <Globe className="w-8 h-8 mx-auto mb-2 text-tertiary" />
              <p>Sources will appear here when you start a research conversation</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConversationResearchFixed;