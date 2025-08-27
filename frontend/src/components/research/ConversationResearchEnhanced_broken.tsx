/**
 * Enhanced Conversation Research Interface with Radix UI
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Box,
  Flex,
  Text,
  Button,
  Card,
  Badge,
  ScrollArea,
  Avatar,
  TextArea,
  Heading,
} from '@radix-ui/themes';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import ChatHistory from './ChatHistory';
import PageLayout from '../layout/PageLayout';
import './ConversationResearchProfessional.css';
import {
  PaperPlaneIcon,
  ReloadIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PersonIcon,
  RocketIcon,
  MagnifyingGlassIcon,
  ImageIcon,
  ActivityLogIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  InfoCircledIcon,
} from '@radix-ui/react-icons';
import { 
  Send, Sparkles, Loader2, User, Bot, ThumbsUp, ThumbsDown,
  Globe, Brain, Search, FileText, CheckCircle, AlertCircle,
  Clock, ExternalLink, Image, Plus, ChevronDown, Loader,
  Target, Zap, Shuffle, Lightbulb
} from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  sources?: Source[];
  screenshots?: any[];
  thoughts?: Thought[];
  feedback?: 'positive' | 'negative' | null;
  is_clarification?: boolean;
  mode?: 'fast' | 'deep' | 'scholar'; // Track which mode was used
  status?: string; // Research status
  progress?: number; // Research progress percentage
  awaiting_response?: boolean; // Whether system is waiting for user input
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
}

const ConversationResearchEnhanced: React.FC = () => {
  const { sessionId: urlSessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  
  const [sessionId, setSessionId] = useState<string | null>(urlSessionId || null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [modalImage, setModalImage] = useState<{src: string; alt: string; url?: string} | null>(null);
  const [expandedThoughts, setExpandedThoughts] = useState<{ [key: number]: boolean }>({});
  const [mode, setMode] = useState<'fast' | 'deep' | 'scholar'>('fast');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  const [userScrolled, setUserScrolled] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = (force = false) => {
    if (force || (!userScrolled && isNearBottom)) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    // Auto-scroll for new messages, but respect user's scroll position
    if (messages.length > 0) {
      // Always scroll for new user messages
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === 'user') {
        scrollToBottom(true); // Force scroll to bottom for user messages
        setUserScrolled(false); // Reset scroll state
      } else {
        // For assistant messages, only scroll if not user-scrolled
        scrollToBottom();
      }
    }
  }, [messages, userScrolled, isNearBottom]);

  // Enhanced scroll detection with debouncing and direction tracking
  const handleScroll = (e: any) => {
    const element = e.target;
    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;
    
    // Check if user is near bottom (within 100px)
    const nearBottom = scrollHeight - scrollTop - clientHeight <= 100;
    setIsNearBottom(nearBottom);
    
    // Detect scroll direction
    const scrollingUp = scrollTop < lastScrollTopRef.current;
    const scrollingDown = scrollTop > lastScrollTopRef.current;
    
    // If user scrolls up deliberately, mark as user-scrolled
    if (scrollingUp && scrollTop < scrollHeight - clientHeight - 200) {
      setUserScrolled(true);
    }
    
    // If user scrolls to near bottom, resume auto-scroll
    if (nearBottom && scrollingDown) {
      setUserScrolled(false);
    }
    
    lastScrollTopRef.current = scrollTop;
    
    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Set timeout to detect when scrolling stops
    scrollTimeoutRef.current = setTimeout(() => {
      // If stopped near bottom, consider it intentional return to bottom
      if (nearBottom) {
        setUserScrolled(false);
      }
    }, 150);
  };

  useEffect(() => {
    // Load sessions on mount
    const loadSessions = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/v1/conversation/sessions`);
        if (response.ok) {
          const data = await response.json();
          setSessions(data.sessions || []);
        }
      } catch (error) {
        console.error('Error loading sessions:', error);
      }
    };
    
    loadSessions();
    
    // Load session if ID is provided in URL
    if (urlSessionId) {
      loadSession(urlSessionId);
    }
    
    // Cleanup function
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const pollResearchStatus = useCallback(async (sid: string) => {
    try {
      // Use conversation status endpoint for deep research mode in conversations
      const response = await fetch(`${apiUrl}/api/v1/conversation/status/${sid}`);
      if (!response.ok) return;
      
      const data = await response.json();
      console.log('Research status update:', data.status, 'Progress:', data.progress);
      
      // Handle research-specific response format
      if (data.thoughts && data.thoughts.length > 0) {
        setThoughts(data.thoughts);
      }
      
      // Build content from steps if content is empty but we have steps
      let displayContent = data.content || '';
      
      // If we're still running but have steps, show progress
      if (data.status === 'running' && data.steps && data.steps.length > 0) {
        const activeSteps = data.steps.filter((step: any) => step.status === 'active' || step.status === 'completed');
        if (!displayContent && activeSteps.length > 0) {
          displayContent = `🔄 Research in progress... (${Math.round(data.progress || 0)}% complete)\n\n`;
          displayContent += activeSteps.map((step: any) => `• ${step.title}: ${step.description}`).join('\n');
        }
      }
      
      // Always update if we have content or steps - with progressive streaming
      if (displayContent || data.content) {
        setMessages(prevMessages => {
          const lastMessage = prevMessages[prevMessages.length - 1];
          
          // If last message is from user, add assistant message
          if (lastMessage?.role === 'user') {
            const assistantMessage = {
              role: 'assistant' as const,
              content: displayContent || 'Researching...',
              timestamp: new Date().toISOString(),
              thoughts: data.thoughts || [],
              screenshots: data.screenshots || [],
              sources: data.sources || [],
              mode: 'deep' as const,
              status: data.status,
              progress: data.progress
            };
            return [...prevMessages, assistantMessage];
          } else if (lastMessage?.role === 'assistant') {
            // Progressive content update for deep mode
            const updatedMessages = [...prevMessages];
            const currentContent = lastMessage.content || '';
            const newContent = data.content || displayContent || '';
            
            // Only update if we have new or longer content
            if (newContent.length > currentContent.length || newContent !== currentContent) {
              updatedMessages[updatedMessages.length - 1] = {
                ...lastMessage,
                content: newContent,
                thoughts: data.thoughts || lastMessage.thoughts || [],
                screenshots: data.screenshots || lastMessage.screenshots || [],
                sources: data.sources || lastMessage.sources || [],
                mode: 'deep' as const,
                status: data.status,
                progress: data.progress
              };
            }
            return updatedMessages;
          }
          return prevMessages;
        });
      }
      
      if (data.sources && data.sources.length > 0) {
        setSources(data.sources);
      }
      
      // Auto-scroll if user hasn't manually scrolled and is near bottom
      if (!userScrolled && isNearBottom && scrollAreaRef.current) {
        scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
      }
      
      // Stop polling when research is completed
      if (data.status === 'completed' || data.status === 'error') {
        setIsLoading(false);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        console.log('Research completed');
      }
    } catch (error) {
      console.error('Research polling error:', error);
    }
  }, [apiUrl, userScrolled, isNearBottom]);

  const pollForUpdates = useCallback(async (sid: string) => {
    try {
      const response = await fetch(`${apiUrl}/api/v1/conversation/status/${sid}`);
      if (!response.ok) throw new Error('Failed to get status');
      
      const data = await response.json();
      
      // Update thoughts immediately for real-time display
      if (data.thoughts && data.thoughts.length > 0) {
        setThoughts(data.thoughts);
      }
      
      // Update messages with progressive content streaming for deep mode
      if (data.messages) {
        setMessages(prevMessages => {
          const backendMessages = [...data.messages];
          
          // For deep mode, ensure progressive content updates
          if (mode === 'deep' && data.status === 'running') {
            // Find the last assistant message in backend data
            const lastBackendAssistant = backendMessages.reverse().find(msg => msg.role === 'assistant');
            
            if (lastBackendAssistant) {
              // Update the last assistant message with new content
              setMessages(current => {
                const updated = [...current];
                const lastAssistantIndex = updated.length - 1;
                
                if (updated[lastAssistantIndex]?.role === 'assistant') {
                  // Progressive content update - append new content if it's longer
                  const currentContent = updated[lastAssistantIndex].content || '';
                  const newContent = lastBackendAssistant.content || '';
                  
                  // Only update if we have new content
                  if (newContent.length > currentContent.length || 
                      newContent !== currentContent) {
                    updated[lastAssistantIndex] = {
                      ...updated[lastAssistantIndex],
                      content: newContent,
                      status: data.status,
                      progress: data.progress || Math.min(95, (data.thoughts?.length || 0) * 10),
                      thoughts: data.thoughts || updated[lastAssistantIndex].thoughts || [],
                      screenshots: data.screenshots || updated[lastAssistantIndex].screenshots || []
                    };
                  }
                }
                return updated;
              });
              return prevMessages; // Return early to avoid double update
            }
          }
          
          // For non-deep mode or when not running, use regular message update
          const updatedMessages = [...backendMessages.reverse()];
          
          // Attach screenshots and thoughts to the last assistant message
          for (let i = updatedMessages.length - 1; i >= 0; i--) {
            if (updatedMessages[i].role === 'assistant') {
              if (data.screenshots && data.screenshots.length > 0) {
                updatedMessages[i].screenshots = data.screenshots;
              }
              if (data.thoughts && data.thoughts.length > 0) {
                updatedMessages[i].thoughts = data.thoughts;
              }
              // Add progress info for deep mode
              if (mode === 'deep' && data.status === 'running') {
                updatedMessages[i].status = data.status;
                updatedMessages[i].progress = data.progress || 0;
              }
              // Add mode info for tracking
              if (!updatedMessages[i].mode) {
                updatedMessages[i].mode = mode;
              }
              break;
            }
          }
          return updatedMessages;
        });
      }
      
      if (data.sources) setSources(data.sources);
      
      // Auto-scroll when new content arrives, but only if user is near bottom
      if (!userScrolled && isNearBottom) {
        scrollToBottom();
      }
      
      // Update status for deep mode progress
      if (mode === 'deep' && data.status === 'running') {
        // Update progress in the last assistant message
        setMessages(prevMessages => {
          if (prevMessages.length > 0) {
            const updatedMessages = [...prevMessages];
            for (let i = updatedMessages.length - 1; i >= 0; i--) {
              if (updatedMessages[i].role === 'assistant' && updatedMessages[i].mode === 'deep') {
                updatedMessages[i].status = 'running';
                updatedMessages[i].progress = Math.min(95, (data.thoughts?.length || 0) * 10);
                break;
              }
            }
            return updatedMessages;
          }
          return prevMessages;
        });
      }
      
      // Handle waiting for clarification
      if (data.status === 'waiting_for_clarification') {
        setIsLoading(false);
        setAwaitingResponse(data.awaiting_response || true);
        
        // Update the last assistant message to show clarification status
        setMessages(prevMessages => {
          if (prevMessages.length > 0) {
            const updatedMessages = [...prevMessages];
            for (let i = updatedMessages.length - 1; i >= 0; i--) {
              if (updatedMessages[i].role === 'assistant') {
                updatedMessages[i].status = 'waiting_for_clarification';
                updatedMessages[i].awaiting_response = true;
                break;
              }
            }
            return updatedMessages;
          }
          return prevMessages;
        });
        
        // Don't stop polling yet - continue until clarification is provided
        return;
      }
      
      // Stop polling when completed or error
      if (data.status === 'completed' || data.status === 'error') {
        setIsLoading(false);
        setAwaitingResponse(false);
        
        // For fast mode, ensure we've received the actual content before stopping
        // Fast mode often completes immediately but we need the message content
        const hasAssistantContent = data.messages && data.messages.some(
          (msg: Message) => msg.role === 'assistant' && msg.content && msg.content.length > 0
        );
        
        // Only stop polling if we have the content or it's an error
        if (hasAssistantContent || data.status === 'error') {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }
        
        // Mark deep mode as complete
        if (mode === 'deep') {
          setMessages(prevMessages => {
            if (prevMessages.length > 0) {
              const updatedMessages = [...prevMessages];
              for (let i = updatedMessages.length - 1; i >= 0; i--) {
                if (updatedMessages[i].role === 'assistant' && updatedMessages[i].mode === 'deep') {
                  updatedMessages[i].status = 'completed';
                  updatedMessages[i].progress = 100;
                  updatedMessages[i].awaiting_response = false;
                  break;
                }
              }
              return updatedMessages;
            }
            return prevMessages;
          });
        }
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, [apiUrl, mode, userScrolled, isNearBottom]);

  const loadSession = async (sid: string) => {
    try {
      // Clear any existing polling
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      
      // Set the session ID first
      setSessionId(sid);
      
      // Load the session messages by polling the status endpoint
      const response = await fetch(`${apiUrl}/api/v1/conversation/status/${sid}`);
      if (response.ok) {
        const data = await response.json();
        
        // Process messages to attach thoughts and screenshots
        const processedMessages = data.messages || [];
        
        // The API returns thoughts and screenshots separately for the current message
        // We need to attach them to the appropriate assistant messages
        if (data.thoughts && data.thoughts.length > 0) {
          // Find the last assistant message and attach thoughts
          for (let i = processedMessages.length - 1; i >= 0; i--) {
            if (processedMessages[i].role === 'assistant') {
              processedMessages[i].thoughts = data.thoughts;
              break;
            }
          }
        }
        
        if (data.screenshots && data.screenshots.length > 0) {
          // Find the last assistant message and attach screenshots
          for (let i = processedMessages.length - 1; i >= 0; i--) {
            if (processedMessages[i].role === 'assistant') {
              processedMessages[i].screenshots = data.screenshots;
              break;
            }
          }
        }
        
        setMessages(processedMessages);
        
        // Load sources if available
        if (data.sources) {
          setSources(data.sources);
        }
        
        // Clear current thoughts state (they're now attached to messages)
        setThoughts([]);
      }
      
      setIsLoading(false);
      navigate(`/conversation/${sid}`);
    } catch (error) {
      console.error('Error loading session:', error);
    }
  };

  const deleteSession = async (sid: string) => {
    try {
      await fetch(`${apiUrl}/api/v1/conversation/session/${sid}`, {
        method: 'DELETE',
      });
      setSessions(sessions.filter(s => s.session_id !== sid));
      if (sid === sessionId) {
        startNewConversation();
      }
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  };

  const startNewConversation = () => {
    // Clear polling if active
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    // Clear ALL state for new conversation
    setSessionId(null);
    setMessages([]);
    setThoughts([]);
    setSources([]);
    setIsLoading(false);
    setAwaitingResponse(false);
    setModalImage(null);
    setExpandedThoughts({});
    // Clear URL to prevent reloading old session
    navigate('/conversation', { replace: true });
    // Force clear the input
    setInput('');
  };

  const clearAllMessages = () => {
    // Clear messages but keep the session
    setMessages([]);
    setThoughts([]);
    setSources([]);
    setIsLoading(false);
    setAwaitingResponse(false);
    setModalImage(null);
    setExpandedThoughts({});
    // Clear input
    setInput('');
  };

  const sendMessage = async () => {
    if (!input.trim() || (isLoading && !awaitingResponse)) return;
    
    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);
    setAwaitingResponse(false); // Reset awaiting response state
    setThoughts([]);
    setSources([]);
    setUserScrolled(false); // Reset scroll flag when sending new message
    setIsNearBottom(true); // Ensure we're considered near bottom for new messages
    
    // Add user message with current mode
    setMessages(prev => [...prev, { 
      role: 'user', 
      content: userMessage,
      timestamp: new Date().toISOString(),
      mode: mode // Track which mode is being used
    }]);
    
    try {
      let response;
      let newSessionId: string;
      
      // Show mode-specific starting message
      const modeMessages: Record<string, string> = {
        'fast': '⚡ Getting quick response...',
        'deep': '🔬 Starting comprehensive research...',
        'scholar': '📚 Conducting scholarly analysis...'
      };
      
      // Always use conversation endpoint with mode parameter
      console.log(`Starting ${mode} mode conversation for query:`, userMessage);
      
      // For continuing a session vs starting new
      const endpoint = sessionId ? `${apiUrl}/api/v1/conversation/continue` : `${apiUrl}/api/v1/conversation/start`;
      const requestBody = sessionId 
        ? { 
            message: userMessage,
            session_id: sessionId,
            mode: mode  // Allow mode switching within same session
          }
        : {
            message: userMessage,
            session_id: null,
            mode: mode
          };
      
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) throw new Error('Failed to start conversation');
      
      const data = await response.json();
      newSessionId = data.session_id;
      
      // Update session if needed
      if (newSessionId !== sessionId) {
        setSessionId(newSessionId);
        navigate(`/conversation/${newSessionId}`, { replace: true });
        
        if (!sessions.find(s => s.session_id === newSessionId)) {
          const newSession: ConversationSession = {
            session_id: newSessionId,
            conversation_count: 1,
            timestamp: new Date().toISOString(),
            active: true
          };
          setSessions(prev => [newSession, ...prev.map(s => ({...s, active: false}))]);
        }
      }
      
      // Add initial status message for the mode
      if (mode === 'deep') {
        setMessages(prev => [...prev, {
          role: 'assistant' as const,
          content: modeMessages[mode],
          timestamp: new Date().toISOString(),
          mode: mode,
          status: 'running',
          progress: 0
        }]);
      }
      
      // Use unified polling for all modes since backend handles mode differences
      // For fast mode, poll immediately; for deep mode, add a small delay
      if (mode === 'fast') {
        // Fast mode: Poll immediately since it completes quickly
        setTimeout(() => pollForUpdates(newSessionId), 100);  // Small delay to let backend process
      } else {
        // Deep mode: Poll immediately for thinking stream
        pollForUpdates(newSessionId);
      }
      
      // Continue polling every 500ms
      pollingIntervalRef.current = setInterval(() => {
        pollForUpdates(newSessionId);
      }, 500);
    } catch (error) {
      console.error('Error sending message:', error);
      setIsLoading(false);
    }
  };

  const handleSubmit = async (predefinedQuery?: string) => {
    if (predefinedQuery) {
      setInput(predefinedQuery);
      await sendMessage();
    } else {
      await sendMessage();
    }
  };

  return (
    <PageLayout>
      <div className="conversation-research-container">
        {/* Left Sidebar - Chat History */}
        <div className="conversation-sidebar">
          <ChatHistory
            sessions={sessions.map(s => ({ ...s, active: s.active ?? false }))}
            currentSessionId={sessionId}
            onSelectSession={loadSession}
            onDeleteSession={deleteSession}
            onNewChat={startNewConversation}
          />
        </div>
        
        {/* Main Chat Area - Center */}
        <div className="conversation-main">
          {/* Header Bar */}
          <div className="conversation-header">
            <div className="header-content">
              <div className="header-left">
                <div className="header-title">
                  <Brain size={20} />
                  Research Assistant
                </div>
                {sessionId && (
                  <Badge color="violet" variant="soft">
                    {messages.length} messages
                  </Badge>
                )}
              </div>
              <div className="header-actions">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <Button variant="soft" size="2">
                      {mode === 'deep' ? 'Deep Research' : mode.charAt(0).toUpperCase() + mode.slice(1)} Mode
                      <ChevronDown size={16} />
                    </Button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content className="dropdown-content">
                    <DropdownMenu.Item onClick={() => setMode('fast')}>Fast</DropdownMenu.Item>
                    <DropdownMenu.Item onClick={() => setMode('deep')}>Deep Research</DropdownMenu.Item>
                    <DropdownMenu.Item onClick={() => setMode('scholar')}>Scholar</DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
                {messages.length > 0 && (
                  <Button
                    variant="soft"
                    size="2"
                    color="red"
                    onClick={clearAllMessages}
                  >
                    Clear All
                  </Button>
                )}
                <Button
                  variant="soft"
                  size="2"
                  color="gray"
                  onClick={startNewConversation}
                >
                  <Plus size={16} />
                  New Chat
                </Button>
              </div>
            </div>
          </div>

          {/* Content Area with Messages and Sources */}
          <div className="conversation-content">
            {/* Messages Container - Center */}
            <div className="messages-container">
              <div 
                className="messages-scroll-area" 
                onScroll={handleScroll}
                ref={scrollAreaRef}
                style={{ overflowY: 'auto', height: '100%' }}
              >
                <div className="messages-inner">
                  {messages.length === 0 ? (
                    /* Welcome Screen */
                    <div className="welcome-container">
                      <div className="welcome-content">
                        <div className="welcome-icon">
                          <Brain size={64} />
                        </div>
                        <h1 className="welcome-title">
                          Welcome to Research Assistant
                        </h1>
                        <p className="welcome-subtitle">
                          Choose a mode and start researching
                        </p>
                        <div className="suggestion-grid">
                          <div
                            className="suggestion-card"
                            onClick={() => handleSubmit("What are the latest AI breakthroughs?")}
                          >
                            <Text size="2" weight="medium">Latest AI News</Text>
                          </div>
                          <div
                            className="suggestion-card"
                            onClick={() => handleSubmit("Explain quantum computing simply")}
                          >
                            <Text size="2" weight="medium">Quantum Computing</Text>
                          </div>
                          <div
                            className="suggestion-card"
                            onClick={() => handleSubmit("Climate change solutions 2024")}
                          >
                            <Text size="2" weight="medium">Climate Solutions</Text>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Messages */
                    <div>
                      {messages.map((message, index) => (
                        <div key={index} className="message">
                          <Avatar
                            className="message-avatar"
                            src={message.role === 'user' ? undefined : '/ai-avatar.png'}
                            fallback={message.role === 'user' ? 'U' : 'AI'}
                            color={message.role === 'user' ? 'blue' : 'violet'}
                            size="3"
                          />
                          <div className="message-content-wrapper">
                            <div className="message-header">
                              <span className="message-role">
                                {message.role === 'user' ? 'You' : 'Assistant'}
                              </span>
                              <span className="message-time">
                                {new Date(message.timestamp || Date.now()).toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="message-body">
                              {message.role === 'user' ? (
                                <Text>{message.content}</Text>
                              ) : (
                                <>
                                  {/* Show clarification prompt */}
                                  {message.status === 'waiting_for_clarification' && message.awaiting_response && (
                                    <div style={{ marginBottom: '1rem' }}>
                                      <Flex align="center" gap="2" mb="2">
                                        <InfoCircledIcon style={{ color: 'var(--amber-9)', width: '16px', height: '16px' }} />
                                        <Text size="2" weight="medium" style={{ color: 'var(--amber-11)' }}>
                                          Waiting for your response
                                        </Text>
                                        <Badge size="1" color="amber" variant="soft">
                                          Input required
                                        </Badge>
                                      </Flex>
                                      <div style={{ 
                                        padding: '0.75rem',
                                        background: 'var(--amber-a2)',
                                        border: '1px solid var(--amber-a5)',
                                        borderRadius: '6px',
                                        fontSize: '0.875rem',
                                        color: 'var(--amber-11)'
                                      }}>
                                        Please provide additional details or clarification to continue.
                                      </div>
                                    </div>
                                  )}
                                  
                                  {/* Show progress bar for research messages */}
                                  {message.mode === 'deep' && message.status === 'running' && (
                                    <div style={{ marginBottom: '1rem' }}>
                                      <Flex align="center" gap="2" mb="2">
                                        <Loader className="animate-spin" size={16} />
                                        <Text size="2" weight="medium">Deep Research in Progress</Text>
                                        <Badge size="1" color="violet" variant="soft">
                                          {Math.round(message.progress || 0)}%
                                        </Badge>
                                      </Flex>
                                      <div style={{ 
                                        width: '100%', 
                                        height: '4px', 
                                        background: 'var(--gray-a5)', 
                                        borderRadius: '2px',
                                        overflow: 'hidden'
                                      }}>
                                        <div style={{
                                          width: `${message.progress || 0}%`,
                                          height: '100%',
                                          background: 'var(--violet-9)',
                                          transition: 'width 0.3s ease'
                                        }} />
                                      </div>
                                    </div>
                                  )}
                                  {/* Show thoughts FIRST, before content - ChatGPT style */}
                                  {message.role === 'assistant' && (
                                    (() => {
                                      const messageThoughts = message.thoughts || 
                                        (index === messages.filter(m => m.role === 'assistant').length - 1 ? thoughts : []);
                                      
                                      if (messageThoughts.length > 0) {
                                        return (
                                          <div className="thinking-container" style={{ marginBottom: '1rem' }}>
                                            <div className="thinking-box">
                                              <details className="thinking-details" open={isLoading}>
                                                <summary className="thinking-summary">
                                                  <Flex align="center" gap="2">
                                                    <div className="thinking-icon">
                                                      <Brain size={16} />
                                                    </div>
                                                    <Text size="2" weight="medium">Thinking</Text>
                                                    <ChevronDown size={14} className="thinking-chevron" />
                                                    <Badge size="1" color="violet" variant="soft" ml="auto">
                                                      {messageThoughts.length} steps
                                                    </Badge>
                                                  </Flex>
                                                </summary>
                                                <div className="thinking-steps-container">
                                                  <div className="thinking-steps-scroll">
                                                    {messageThoughts.map((thought, idx) => (
                                                      <div key={idx} className="thinking-step-item">
                                                        <div className="thinking-step-icon">
                                                          {thought.type === 'planning' ? (
                                                            <Target size={14} className="step-icon" />
                                                          ) : thought.type === 'analyzing' ? (
                                                            <Brain size={14} className="step-icon" />
                                                          ) : thought.type === 'searching' ? (
                                                            <Search size={14} className="step-icon" />
                                                          ) : thought.type === 'evaluating' ? (
                                                            <Zap size={14} className="step-icon" />
                                                          ) : thought.type === 'synthesizing' ? (
                                                            <Shuffle size={14} className="step-icon" />
                                                          ) : thought.type === 'deciding' ? (
                                                            <Lightbulb size={14} className="step-icon" />
                                                          ) : thought.type === 'browsing' || thought.type === 'browse' ? (
                                                            <Globe size={14} className="step-icon" />
                                                          ) : thought.content.includes('🔧') ? (
                                                            <div className="tool-icon">🔧</div>
                                                          ) : (
                                                            <CheckCircle size={14} className="step-done" />
                                                          )}
                                                        </div>
                                                        <div className="thinking-step-text">
                                                          <Text size="2" color="gray">
                                                            {thought.content}
                                                          </Text>
                                                        </div>
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                              </details>
                                            </div>
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()
                                  )}

                                  {/* Then show the actual content */}
                                  <div className="markdown-content">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                      {message.content || ''}
                                    </ReactMarkdown>
                                  </div>

                                  {/* Screenshots for this message */}
                                  {message.screenshots && message.screenshots.length > 0 && (
                                    <div className="screenshots-container">
                                      <div className="screenshots-header">
                                        <Image size={16} />
                                        <Text size="2" weight="medium">Screenshots</Text>
                                        <Badge size="1">{message.screenshots.length}</Badge>
                                      </div>
                                      <div className="screenshots-scroll">
                                        {message.screenshots.map((screenshot, sIdx) => (
                                          <div
                                            key={sIdx}
                                            className="screenshot-card"
                                            onClick={() => {
                                              if (screenshot.data || screenshot.screenshot) {
                                                setModalImage({
                                                  src: screenshot.data || screenshot.screenshot,
                                                  alt: screenshot.description || `Screenshot ${sIdx + 1}`,
                                                  url: screenshot.url
                                                });
                                              } else if (screenshot.url) {
                                                window.open(screenshot.url, '_blank');
                                              }
                                            }}
                                          >
                                            {(screenshot.data || screenshot.screenshot) ? (
                                              <img
                                                className="screenshot-image"
                                                src={screenshot.data || screenshot.screenshot}
                                                alt={screenshot.description || `Screenshot ${sIdx + 1}`}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                onError={(e) => {
                                                  const target = e.target as HTMLImageElement;
                                                  target.style.display = 'none';
                                                  const fallback = document.createElement('div');
                                                  fallback.style.padding = '20px';
                                                  fallback.style.textAlign = 'center';
                                                  fallback.style.background = 'var(--gray-a3)';
                                                  fallback.innerHTML = '<div>Image preview unavailable</div>';
                                                  target.parentElement!.appendChild(fallback);
                                                }}
                                              />
                                            ) : (
                                              <div style={{ padding: '20px', textAlign: 'center', background: 'var(--gray-a3)', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <div>
                                                  <Image size={24} style={{ opacity: 0.5 }} />
                                                  <div style={{ fontSize: '12px', marginTop: '8px', color: 'var(--gray-11)' }}>No preview</div>
                                                </div>
                                              </div>
                                            )}
                                            {screenshot.description && (
                                              <div className="screenshot-info">
                                                <Text size="1">{screenshot.description}</Text>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      {/* Loading Indicator - Only show if no assistant messages yet or still loading */}
                      {isLoading && messages.filter(m => m.role === 'assistant').length === 0 && (
                        <div className="message thinking-message">
                          <Avatar
                            className="message-avatar"
                            fallback="AI"
                            color="violet"
                            size="3"
                          />
                          <div className="message-content-wrapper">
                            <div className="message-header">
                              <span className="message-role">Assistant</span>
                              <Badge size="1" color="violet" variant="soft">
                                Thinking...
                              </Badge>
                            </div>
                            <div className="message-body">
                              {/* Show thoughts inline during loading */}
                              {thoughts.length > 0 && (
                                <div className="thoughts-inline" style={{ marginBottom: '1rem' }}>
                                  <details open>
                                    <summary className="thoughts-header">
                                      <Flex align="center" gap="2">
                                        <Brain size={16} />
                                        <Text size="2" weight="medium">AI Thinking Process</Text>
                                        <Badge size="1" color="violet" variant="soft">
                                          {thoughts.length} steps
                                        </Badge>
                                      </Flex>
                                    </summary>
                                    <div className="thoughts-content">
                                      {thoughts.map((thought, idx) => (
                                        <div key={idx} className="thought-item">
                                          <Flex align="center" gap="2">
                                            <div className="thinking-indicator">
                                              {idx === thoughts.length - 1 ? (
                                                <>
                                                  <div className="thinking-dot"></div>
                                                  <div className="thinking-dot"></div>
                                                  <div className="thinking-dot"></div>
                                                </>
                                              ) : (
                                                <CheckCircle size={12} className="step-complete" />
                                              )}
                                            </div>
                                            <Text size="2">{thought.content}</Text>
                                          </Flex>
                                        </div>
                                      ))}
                                    </div>
                                  </details>
                                </div>
                              )}
                              
                              {/* Loading message */}
                              <div className="thinking-status">
                                <Flex align="center" gap="2">
                                  <Loader size={16} className="animate-spin" />
                                  <Text size="2">Researching with {mode} mode...</Text>
                                </Flex>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>
            </div>

            {/* Sources Sidebar - Right */}
            {sources.length > 0 && (
              <div className="sources-sidebar">
                <div className="sources-header">
                  <Globe size={20} />
                  <span className="sources-title">Sources</span>
                  <span className="sources-count">{sources.length}</span>
                </div>
                <div className="sources-list">
                  {sources.map((source, index) => (
                    <a
                      key={source.id || index}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="source-card"
                    >
                      <div className="source-content">
                        {/* Source favicon and domain */}
                        <div className="source-header">
                          <img 
                            src={source.favicon || `https://www.google.com/s2/favicons?domain=${source.domain}&sz=32`}
                            alt=""
                            className="source-favicon"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = `https://www.google.com/s2/favicons?domain=${source.domain}&sz=32`;
                            }}
                          />
                          <div className="source-text">
                            <Text size="2" weight="medium" className="source-title" style={{ color: 'var(--gray-12)' }}>
                              {source.title}
                            </Text>
                            <Text size="1" className="source-domain" style={{ color: 'var(--gray-10)' }}>
                              {source.domain}
                            </Text>
                          </div>
                          <ExternalLink size={14} className="source-link-icon" />
                        </div>
                        
                        {/* Source snippet */}
                        {source.snippet && (
                          <Text size="1" className="source-snippet" style={{ color: 'var(--gray-10)', display: 'block', marginTop: '0.5rem' }}>
                            {source.snippet.slice(0, 100)}...
                          </Text>
                        )}
                        
                        {/* Source thumbnail if available */}
                        {source.thumbnail && (
                          <div className="source-thumbnail">
                            <img 
                              src={source.thumbnail} 
                              alt={source.title}
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Input Container - Bottom */}
          <div className="input-container">
            {/* Clarification indicator above input */}
            {awaitingResponse && (
              <div style={{ 
                marginBottom: '0.75rem',
                padding: '0.5rem 1rem',
                background: 'var(--amber-a2)',
                border: '1px solid var(--amber-a5)',
                borderRadius: '6px',
                maxWidth: '900px',
                margin: '0 auto 0.75rem'
              }}>
                <Flex align="center" gap="2">
                  <InfoCircledIcon style={{ color: 'var(--amber-9)', width: '14px', height: '14px' }} />
                  <Text size="1" style={{ color: 'var(--amber-11)' }}>
                    The assistant is waiting for your clarification. Please provide additional details.
                  </Text>
                </Flex>
              </div>
            )}
            <div className="input-wrapper">
              <TextArea
                className="input-field"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={awaitingResponse ? "Please provide clarification..." : `Ask anything... (${mode} mode)`}
                disabled={isLoading && !awaitingResponse}
              />
              <button
                className="send-button"
                onClick={() => sendMessage()}
                disabled={!input.trim() || (isLoading && !awaitingResponse)}
              >
                <Send size={20} />
                {awaitingResponse ? 'Clarify' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Image Modal */}
      {modalImage && (
        <Box
          onClick={() => setModalImage(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <Box onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh' }}>
            <img 
              src={modalImage.src} 
              alt={modalImage.alt}
              style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
            />
            <Flex justify="center" gap="3" mt="3">
              {modalImage.url && (
                <Button variant="soft" asChild>
                  <a href={modalImage.url} target="_blank" rel="noopener noreferrer">
                    Visit Page
                  </a>
                </Button>
              )}
              <Button variant="soft" onClick={() => setModalImage(null)}>
                Close
              </Button>
            </Flex>
          </Box>
        </Box>
      )}
    </PageLayout>
  );
};

export default ConversationResearchEnhanced;