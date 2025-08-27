import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Theme,
  Container,
  Flex,
  Box,
  Grid,
  Text,
  Heading,
  TextField,
  TextArea,
  Button,
  Card,
  Avatar,
  Badge,
  Separator,
  ScrollArea,
  Tabs,
  IconButton,
  Dialog,
  DropdownMenu,
  Tooltip,
  Spinner,
  Skeleton,
  SegmentedControl,
  AlertDialog,
  Progress,
  HoverCard,
  Callout,
  Code,
  Link,
  Switch,
  Select,
  RadioGroup
} from '@radix-ui/themes';
import * as Icons from '@radix-ui/react-icons';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import html2pdf from 'html2pdf.js';
import './ProfessionalResearchUI.css';

// Type definitions
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  sources?: Source[];
  images?: string[];
  thoughts?: Thought[];
  metadata?: {
    tokens?: number;
    duration?: number;
    model?: string;
  };
}

interface Source {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  favicon?: string;
  thumbnail?: string;
  relevance?: number;
  publishedDate?: string;
}

interface Thought {
  id: string;
  type: 'search' | 'analysis' | 'synthesis' | 'validation';
  content: string;
  timestamp: string;
}

interface Session {
  id: string;
  title: string;
  preview: string;
  messages: Message[];
  sources: Source[];
  createdAt: string;
  updatedAt: string;
  mode: 'fast' | 'deep' | 'scholar';
  tags?: string[];
  starred?: boolean;
}

// Research modes configuration
const RESEARCH_MODES = {
  fast: {
    name: 'Fast',
    icon: <Icons.LightningBoltIcon />,
    description: 'Quick answers with 1-2 sources',
    color: 'amber',
    searches: 1,
    depth: 'surface',
    max_search_results: 3,
    enable_browser: false
  },
  deep: {
    name: 'Deep',
    icon: <Icons.GlobeIcon />,
    description: 'Comprehensive research with 5-10 sources',
    color: 'blue',
    searches: 3,
    depth: 'thorough',
    max_search_results: 8,
    enable_browser: true
  },
  scholar: {
    name: 'Scholar',
    icon: <Icons.FileTextIcon />,
    description: 'Academic research with papers & citations',
    color: 'purple',
    searches: 5,
    depth: 'academic',
    max_search_results: 10,
    enable_browser: true,
    prefer_academic: true
  }
};

// Quick prompts for engagement
const QUICK_PROMPTS = [
  { icon: '🚀', text: 'Latest AI breakthroughs', category: 'tech' },
  { icon: '💡', text: 'Explain quantum computing', category: 'science' },
  { icon: '🌍', text: 'Climate change solutions', category: 'environment' },
  { icon: '🏥', text: 'Recent medical discoveries', category: 'health' },
  { icon: '📈', text: 'Market trends analysis', category: 'business' },
  { icon: '🎨', text: 'Digital art innovations', category: 'creative' }
];

export const ProfessionalResearchUI: React.FC = () => {
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();

  // Core state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [researchMode, setResearchMode] = useState<'fast' | 'deep' | 'scholar'>('fast');
  const [showSidebar, setShowSidebar] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [activeRightTab, setActiveRightTab] = useState<'sources' | 'insights' | 'visual'>('sources');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [autoSave, setAutoSave] = useState(true);
  const [compactView, setCompactView] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);

  // Load sessions from localStorage on mount
  useEffect(() => {
    const savedSessions = localStorage.getItem('research_sessions');
    if (savedSessions) {
      try {
        const parsed = JSON.parse(savedSessions);
        setSessions(parsed);
        
        // Load session from URL if present
        if (urlSessionId) {
          const session = parsed.find((s: Session) => s.id === urlSessionId);
          if (session) {
            setCurrentSession(session);
            setMessages(session.messages || []);
            setSources(session.sources || []);
          }
        }
      } catch (e) {
        console.error('Failed to load sessions:', e);
      }
    }
  }, [urlSessionId]);

  // Save sessions to localStorage
  useEffect(() => {
    if (autoSave && sessions.length > 0) {
      localStorage.setItem('research_sessions', JSON.stringify(sessions));
    }
  }, [sessions, autoSave]);

  // Smooth scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'end'
      });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Create new session
  const createNewSession = useCallback(() => {
    const newSession: Session = {
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: 'New Research Session',
      preview: '',
      messages: [],
      sources: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mode: researchMode,
      tags: [],
      starred: false
    };

    setCurrentSession(newSession);
    setMessages([]);
    setSources([]);
    setSessions(prev => [newSession, ...prev]);
    navigate(`/conversation/${newSession.id}`);
    
    return newSession;
  }, [researchMode, navigate]);

  // Update current session
  const updateCurrentSession = useCallback((updates: Partial<Session>) => {
    if (!currentSession) return;

    const updatedSession = {
      ...currentSession,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    setCurrentSession(updatedSession);
    setSessions(prev => 
      prev.map(s => s.id === currentSession.id ? updatedSession : s)
    );
  }, [currentSession]);

  // Send message
  const sendMessage = useCallback(async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    let session = currentSession;
    if (!session) {
      session = createNewSession();
    }

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    // Update session preview
    if (messages.length === 0) {
      updateCurrentSession({
        title: messageText.slice(0, 50),
        preview: messageText.slice(0, 100)
      });
    }

    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      
      // Determine if this is a continuation or new conversation
      // Check for assistant messages to determine if this is a continuation
      const hasAssistantMessages = messages.some(m => m.role === 'assistant');
      const isNewConversation = !hasAssistantMessages;
      const endpoint = isNewConversation 
        ? `${apiUrl}/api/v1/conversation/start`
        : `${apiUrl}/api/v1/conversation/continue`;
      
      const requestBody = isNewConversation 
        ? {
            message: messageText,
            session_id: session.id,
            mode: 'research'  // Simple research mode
          }
        : {
            message: messageText,
            session_id: session.id,
            feedback: null
          };
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) throw new Error('Failed to send message');

      const data = await response.json();
      
      // Start polling for updates
      pollForUpdates(data.session_id || session.id);

    } catch (err: any) {
      setError(err.message || 'Failed to send message');
      setIsLoading(false);
    }
  }, [input, isLoading, currentSession, createNewSession, messages, researchMode, updateCurrentSession]);

  // Poll for updates
  const pollForUpdates = useCallback((sessionId: string) => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
    }

    let pollCount = 0;
    const maxPolls = 60; // 60 seconds max

    pollingInterval.current = setInterval(async () => {
      try {
        pollCount++;
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
        const response = await fetch(`${apiUrl}/api/v1/conversation/status/${sessionId}`);
        
        if (!response.ok) {
          console.error('Polling failed:', response.status);
          if (pollCount > maxPolls) {
            throw new Error('Polling timeout');
          }
          return;
        }
        
        const data = await response.json();
        console.log('Poll response:', data);
        
        // Process messages - handle both array and single message
        if (data.messages && data.messages.length > 0) {
          // Filter out user messages from backend since we already have them
          const assistantMessages = data.messages.filter((msg: any) => 
            msg.role === 'assistant' || msg.role === 'system'
          );
          
          // Process assistant messages even if waiting for clarification
          if (assistantMessages.length > 0 || data.status === 'waiting_for_clarification') {
            const processedMessages = assistantMessages.map((msg: any) => {
              // Convert backend format to frontend format
              if (typeof msg === 'string') {
                return {
                  id: `msg_${Date.now()}_${Math.random()}`,
                  role: 'assistant',
                  content: msg,
                  timestamp: new Date().toISOString()
                };
              }
              return {
                id: msg.id || `msg_${Date.now()}_${Math.random()}`,
                role: msg.role || 'assistant',
                content: msg.content || msg.message || msg,
                timestamp: msg.timestamp || new Date().toISOString(),
                sources: msg.sources,
                images: msg.images || msg.screenshots,
                thoughts: msg.thoughts
              };
            });
            
            // Simple message update - just add new assistant messages
            setMessages(prev => {
              // Check if we already have this assistant message
              const existingAssistant = prev.find(m => 
                m.role === 'assistant' && 
                m.content === processedMessages[0]?.content
              );
              
              if (!existingAssistant && processedMessages.length > 0) {
                const updatedMessages = [...prev, ...processedMessages];
                
                // Update session
                if (currentSession) {
                  updateCurrentSession({ 
                    messages: updatedMessages,
                    updatedAt: new Date().toISOString()
                  });
                }
                
                return updatedMessages;
              }
              
              return prev;
            });
          }
        }
        
        // Process sources
        if (data.sources && data.sources.length > 0) {
          const processedSources = data.sources.map((src: any, idx: number) => ({
            id: src.id || `source_${idx}`,
            title: src.title || src.name || 'Unknown Source',
            url: src.url || src.link || '#',
            domain: src.domain || new URL(src.url || 'http://example.com').hostname,
            snippet: src.snippet || src.description || '',
            favicon: src.favicon,
            thumbnail: src.thumbnail || src.image,
            relevance: src.relevance || 0.5
          }));
          setSources(processedSources);
          updateCurrentSession({ sources: processedSources });
        }
        
        // Process screenshots/images
        if (data.screenshots && data.screenshots.length > 0) {
          const images = data.screenshots.map((screenshot: any) => {
            if (typeof screenshot === 'string') {
              // If it's a base64 string or URL
              if (screenshot.startsWith('data:') || screenshot.startsWith('http')) {
                return screenshot;
              }
              // If it's a file path, convert to URL
              return `${apiUrl}/api/v1/files/${screenshot}`;
            }
            return screenshot.url || screenshot.path || screenshot;
          });
          
          // Add images to the latest assistant message
          setMessages(prev => {
            if (prev.length > 0) {
              const lastMessage = prev[prev.length - 1];
              if (lastMessage.role === 'assistant') {
                return [
                  ...prev.slice(0, -1),
                  { ...lastMessage, images }
                ];
              }
            }
            return prev;
          });
        }
        
        // Check if we have received a complete response
        const hasNewAssistantMessage = data.messages?.some((msg: any) => 
          msg.role === 'assistant' && msg.content && msg.content.length > 0
        );
        
        // Simple completion check - stop when status is completed, error, or waiting
        if (data.status === 'completed' || 
            data.status === 'error' || 
            data.status === 'waiting_for_clarification') {
          clearInterval(pollingInterval.current!);
          pollingInterval.current = null;
          setIsLoading(false);
            
            if (data.status === 'error' && data.error) {
              setError(data.error);
            } else if (data.status === 'waiting_for_clarification') {
              // The backend is waiting for clarification - add a message if not already present
              const clarificationMessage = data.awaiting_message || 
                data.messages?.find((m: any) => m.role === 'assistant')?.content ||
                "Please provide more specific details for your research query.";
              
              setMessages(prev => {
                const hasClarification = prev.some(m => 
                  m.role === 'assistant' && (
                    m.content.toLowerCase().includes('clarify') ||
                    m.content.toLowerCase().includes('specific') ||
                    m.content.toLowerCase().includes('assist')
                  )
                );
                
                if (!hasClarification && clarificationMessage) {
                  return [...prev, {
                    id: `msg_clarify_${Date.now()}`,
                    role: 'assistant',
                    content: clarificationMessage,
                    timestamp: new Date().toISOString()
                  }];
                }
                return prev;
              });
            }
        } else if (pollCount > maxPolls) {
          clearInterval(pollingInterval.current!);
          pollingInterval.current = null;
          setIsLoading(false);
          setError('Request timed out. Please try again.');
        }
      } catch (err: any) {
        console.error('Polling error:', err);
        clearInterval(pollingInterval.current!);
        pollingInterval.current = null;
        setIsLoading(false);
        setError(err.message || 'Failed to get response');
      }
    }, 500); // Poll every 500ms for faster response
  }, [currentSession, updateCurrentSession]);

  // Export to PDF
  const exportToPDF = useCallback(() => {
    if (!currentSession) return;

    const element = document.getElementById('conversation-content');
    if (!element) return;

    const opt = {
      margin: 1,
      filename: `research_${currentSession.id}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
  }, [currentSession]);

  // Delete session
  const deleteSession = useCallback((sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (currentSession?.id === sessionId) {
      setCurrentSession(null);
      setMessages([]);
      setSources([]);
      navigate('/conversation');
    }
  }, [currentSession, navigate]);

  // Toggle star
  const toggleStar = useCallback((sessionId: string) => {
    setSessions(prev =>
      prev.map(s =>
        s.id === sessionId ? { ...s, starred: !s.starred } : s
      )
    );
  }, []);

  // Filter sessions
  const filteredSessions = useMemo(() => {
    let filtered = sessions;
    
    if (searchQuery) {
      filtered = filtered.filter(s =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.preview.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    if (selectedTags.length > 0) {
      filtered = filtered.filter(s =>
        s.tags?.some(tag => selectedTags.includes(tag))
      );
    }
    
    return filtered.sort((a, b) => {
      if (a.starred && !b.starred) return -1;
      if (!a.starred && b.starred) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [sessions, searchQuery, selectedTags]);

  return (
    <Theme appearance="dark" accentColor="violet" radius="medium">
      <Box className="research-container" ref={containerRef}>
        {/* Main Layout Grid */}
        <Box className="research-layout">
          {/* Sidebar */}
          <AnimatePresence>
            {showSidebar && (
              <motion.div
                className="research-sidebar"
                initial={{ x: -320 }}
                animate={{ x: 0 }}
                exit={{ x: -320 }}
                transition={{ type: 'spring', damping: 20 }}
              >
                <Box className="sidebar-header">
                  <Flex justify="between" align="center" mb="3">
                    <Heading size="4">Research</Heading>
                    <Tooltip content="New session">
                      <IconButton size="2" onClick={createNewSession}>
                        <Icons.PlusIcon />
                      </IconButton>
                    </Tooltip>
                  </Flex>

                  <TextField.Root
                    placeholder="Search sessions..."
                    value={searchQuery}
                    onChange={(e: any) => setSearchQuery(e.target.value)}
                    mb="3"
                  >
                    <TextField.Slot>
                      <Icons.MagnifyingGlassIcon />
                    </TextField.Slot>
                  </TextField.Root>

                  <SegmentedControl.Root
                    value={researchMode}
                    onValueChange={(v: any) => setResearchMode(v)}
                  >
                    {Object.entries(RESEARCH_MODES).map(([key, mode]) => (
                      <SegmentedControl.Item key={key} value={key}>
                        {mode.icon}
                        {mode.name}
                      </SegmentedControl.Item>
                    ))}
                  </SegmentedControl.Root>
                </Box>

                <ScrollArea className="sidebar-sessions">
                  <Box p="2">
                    {filteredSessions.length === 0 ? (
                      <Card>
                        <Text size="2" color="gray" align="center">
                          No sessions yet. Start a new research!
                        </Text>
                      </Card>
                    ) : (
                      <LayoutGroup>
                        {filteredSessions.map(session => (
                          <motion.div
                            key={session.id}
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                          >
                            <Card
                              className={`session-card ${currentSession?.id === session.id ? 'active' : ''}`}
                              onClick={() => {
                                setCurrentSession(session);
                                setMessages(session.messages);
                                setSources(session.sources);
                                navigate(`/conversation/${session.id}`);
                              }}
                              mb="2"
                            >
                              <Flex justify="between" align="start">
                                <Box style={{ flex: 1 }}>
                                  <Flex align="center" gap="1" mb="1">
                                    {session.starred && (
                                      <Icons.StarFilledIcon className="star-icon" />
                                    )}
                                    <Text size="2" weight="bold" className="session-title">
                                      {session.title}
                                    </Text>
                                  </Flex>
                                  <Text size="1" color="gray" className="session-preview">
                                    {session.preview}
                                  </Text>
                                  <Flex gap="2" mt="2">
                                    <Badge size="1" variant="soft" color={RESEARCH_MODES[session.mode].color as any}>
                                      {RESEARCH_MODES[session.mode].name}
                                    </Badge>
                                    <Text size="1" color="gray">
                                      {new Date(session.updatedAt).toLocaleDateString()}
                                    </Text>
                                  </Flex>
                                </Box>
                                <DropdownMenu.Root>
                                  <DropdownMenu.Trigger>
                                    <IconButton size="1" variant="ghost" onClick={(e: any) => e.stopPropagation()}>
                                      <Icons.DotsVerticalIcon />
                                    </IconButton>
                                  </DropdownMenu.Trigger>
                                  <DropdownMenu.Content>
                                    <DropdownMenu.Item onClick={() => toggleStar(session.id)}>
                                      {session.starred ? <Icons.StarIcon /> : <Icons.StarFilledIcon />}
                                      {session.starred ? 'Unstar' : 'Star'}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item onClick={() => exportToPDF()}>
                                      <Icons.DownloadIcon />
                                      Export PDF
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Separator />
                                    <DropdownMenu.Item color="red" onClick={() => deleteSession(session.id)}>
                                      <Icons.TrashIcon />
                                      Delete
                                    </DropdownMenu.Item>
                                  </DropdownMenu.Content>
                                </DropdownMenu.Root>
                              </Flex>
                            </Card>
                          </motion.div>
                        ))}
                      </LayoutGroup>
                    )}
                  </Box>
                </ScrollArea>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Content */}
          <Box className="research-main">
            {/* Header */}
            <Box className="main-header">
              <Flex justify="between" align="center">
                <Flex gap="3" align="center">
                  <IconButton
                    size="2"
                    variant="soft"
                    onClick={() => setShowSidebar(!showSidebar)}
                  >
                    <Icons.HamburgerMenuIcon />
                  </IconButton>

                  <Badge size="2" color={isLoading ? 'orange' : 'green'}>
                    {isLoading ? (
                      <>
                        <Spinner size="1" />
                        Researching...
                      </>
                    ) : (
                      'Ready'
                    )}
                  </Badge>

                  {currentSession && (
                    <>
                      <Badge size="2" variant="soft" color={RESEARCH_MODES[currentSession.mode].color as any}>
                        {RESEARCH_MODES[currentSession.mode].icon}
                        {RESEARCH_MODES[currentSession.mode].name} Mode
                      </Badge>
                      <Text size="2" color="gray">
                        {messages.length} messages • {sources.length} sources
                      </Text>
                    </>
                  )}
                </Flex>

                <Flex gap="2">
                  <Tooltip content="Compact view">
                    <IconButton
                      size="2"
                      variant={compactView ? 'solid' : 'soft'}
                      onClick={() => setCompactView(!compactView)}
                    >
                      <Icons.RowsIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip content="Export PDF">
                    <IconButton size="2" variant="soft" onClick={exportToPDF}>
                      <Icons.DownloadIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip content="Toggle panel">
                    <IconButton
                      size="2"
                      variant="soft"
                      onClick={() => setShowRightPanel(!showRightPanel)}
                    >
                      <Icons.LayoutIcon />
                    </IconButton>
                  </Tooltip>
                </Flex>
              </Flex>
            </Box>

            {/* Messages */}
            <ScrollArea className="messages-area">
              <Container size="3" id="conversation-content">
                {messages.length === 0 ? (
                  <Box className="empty-state">
                    <Icons.MagnifyingGlassIcon className="empty-icon" />
                    <Heading size="6" mb="2">Start Your Research Journey</Heading>
                    <Text size="3" color="gray" mb="5">
                      Choose a mode and ask anything. I'll search and analyze the web for you.
                    </Text>

                    <Grid columns="3" gap="3" className="quick-prompts">
                      {QUICK_PROMPTS.map((prompt, idx) => (
                        <Card
                          key={idx}
                          className="prompt-card"
                          onClick={() => {
                            setInput(prompt.text);
                            inputRef.current?.focus();
                          }}
                        >
                          <Text size="4" mb="1">{prompt.icon}</Text>
                          <Text size="2">{prompt.text}</Text>
                        </Card>
                      ))}
                    </Grid>
                  </Box>
                ) : (
                  <Box className={`messages-list ${compactView ? 'compact' : ''}`}>
                    <AnimatePresence mode="popLayout">
                      {messages.map((message) => (
                        <motion.div
                          key={message.id}
                          layout
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className={`message ${message.role}`}
                        >
                          <Flex gap="3" align="start">
                            <Avatar
                              size={compactView ? '2' : '3'}
                              radius="full"
                              fallback={message.role === 'user' ? <Icons.PersonIcon /> : <Icons.MixIcon />}
                              color={message.role === 'user' ? 'blue' : 'violet'}
                            />
                            <Box className="message-content">
                              <Card>
                                <Box className="message-header">
                                  <Text size="2" weight="bold">
                                    {message.role === 'user' ? 'You' : 'Research AI'}
                                  </Text>
                                  <Text size="1" color="gray">
                                    {new Date(message.timestamp).toLocaleTimeString()}
                                  </Text>
                                </Box>

                                {message.role === 'assistant' ? (
                                  <Box className="markdown-content">
                                    <ReactMarkdown
                                      remarkPlugins={[remarkGfm]}
                                      components={{
                                        code({ className, children, ...props }: any) {
                                          const match = /language-(\w+)/.exec(className || '');
                                          return match ? (
                                            <SyntaxHighlighter
                                              style={oneDark as any}
                                              language={match[1]}
                                              PreTag="div"
                                            >
                                              {String(children).replace(/\n$/, '')}
                                            </SyntaxHighlighter>
                                          ) : (
                                            <Code>{children}</Code>
                                          );
                                        },
                                        a: ({ href, children }) => (
                                          <Link href={href} target="_blank">
                                            {children} <Icons.ExternalLinkIcon className="inline-icon" />
                                          </Link>
                                        ),
                                        img: ({ src, alt }) => (
                                          <Box className="message-image" my="2">
                                            <img 
                                              src={src} 
                                              alt={alt}
                                              style={{ maxWidth: '100%', borderRadius: '8px' }}
                                              onError={(e) => {
                                                console.error('Markdown image failed:', src);
                                                (e.target as HTMLImageElement).style.display = 'none';
                                              }}
                                              onClick={() => window.open(src, '_blank')}
                                            />
                                          </Box>
                                        )
                                      }}
                                    >
                                      {message.content}
                                    </ReactMarkdown>
                                    {message.images && message.images.length > 0 && (
                                      <Flex gap="2" wrap="wrap" mt="3">
                                        {message.images.map((img, idx) => (
                                          <Box key={idx} className="message-screenshot">
                                            <img
                                              src={img}
                                              alt={`Screenshot ${idx + 1}`}
                                              style={{ 
                                                maxWidth: '200px', 
                                                maxHeight: '150px',
                                                borderRadius: '4px',
                                                border: '1px solid var(--gray-6)',
                                                cursor: 'pointer'
                                              }}
                                              onClick={() => window.open(img, '_blank')}
                                              onError={(e) => {
                                                console.error('Screenshot failed:', img);
                                                (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="150"%3E%3Crect fill="%23333" width="200" height="150"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em" font-family="sans-serif" font-size="12"%3EImage unavailable%3C/text%3E%3C/svg%3E';
                                              }}
                                            />
                                          </Box>
                                        ))}
                                      </Flex>
                                    )}
                                  </Box>
                                ) : (
                                  <Text size="3">{message.content}</Text>
                                )}

                                {message.metadata && (
                                  <Flex gap="2" mt="2" className="message-metadata">
                                    <Badge size="1" variant="soft">
                                      {message.metadata.tokens} tokens
                                    </Badge>
                                    <Badge size="1" variant="soft">
                                      {message.metadata.duration}ms
                                    </Badge>
                                  </Flex>
                                )}
                              </Card>
                            </Box>
                          </Flex>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {isLoading && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="typing-indicator"
                      >
                        <Flex gap="3" align="start">
                          <Avatar
                            size="3"
                            radius="full"
                            fallback={<Icons.MixIcon />}
                            color="violet"
                          />
                          <Card>
                            <Flex align="center" gap="2">
                              <Box className="dots">
                                <span></span>
                                <span></span>
                                <span></span>
                              </Box>
                              <Text size="2" color="gray">
                                Researching...
                              </Text>
                            </Flex>
                          </Card>
                        </Flex>
                      </motion.div>
                    )}
                  </Box>
                )}
                <div ref={messagesEndRef} />
              </Container>
            </ScrollArea>

            {/* Input Area */}
            <Box className="input-area">
              {error && (
                <Callout.Root color="red" mb="3">
                  <Callout.Icon>
                    <Icons.ExclamationTriangleIcon />
                  </Callout.Icon>
                  <Callout.Text>{error}</Callout.Text>
                </Callout.Root>
              )}

              <Flex gap="2" align="end">
                <TextArea
                  ref={inputRef}
                  placeholder="Ask anything... (Enter to send, Shift+Enter for new line)"
                  value={input}
                  onChange={(e: any) => setInput(e.target.value)}
                  onKeyDown={(e: any) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  disabled={isLoading}
                  className="input-field"
                />
                <Button
                  size="3"
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || isLoading}
                >
                  <Icons.PaperPlaneIcon />
                  Send
                </Button>
              </Flex>
            </Box>
          </Box>

          {/* Right Panel */}
          <AnimatePresence>
            {showRightPanel && (
              <motion.div
                className="research-right-panel"
                initial={{ x: 360 }}
                animate={{ x: 0 }}
                exit={{ x: 360 }}
                transition={{ type: 'spring', damping: 20 }}
              >
                <Tabs.Root value={activeRightTab} onValueChange={(v: any) => setActiveRightTab(v)}>
                  <Tabs.List>
                    <Tabs.Trigger value="sources">
                      <Icons.GlobeIcon />
                      Sources
                    </Tabs.Trigger>
                    <Tabs.Trigger value="insights">
                      <Icons.LightningBoltIcon />
                      Insights
                    </Tabs.Trigger>
                    <Tabs.Trigger value="visual">
                      <Icons.ImageIcon />
                      Visual
                    </Tabs.Trigger>
                  </Tabs.List>

                  <Box className="panel-content">
                    <Tabs.Content value="sources" className="tab-content">
                      <ScrollArea className="panel-scroll-area">
                        {sources.length === 0 ? (
                          <Box p="3">
                            <Text size="2" color="gray">No sources yet</Text>
                          </Box>
                        ) : (
                          <Box className="sources-list" p="2">
                            {sources.map((source) => (
                              <Card key={source.id} className="source-card" mb="2">
                                <a href={source.url} target="_blank" rel="noopener noreferrer">
                                  {source.thumbnail && (
                                    <Box className="source-thumbnail">
                                      <img 
                                        src={source.thumbnail} 
                                        alt={source.title}
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                      />
                                    </Box>
                                  )}
                                  <Box className="source-content">
                                    <Flex align="center" gap="2" mb="1">
                                      {source.favicon && (
                                        <img 
                                          src={source.favicon} 
                                          className="favicon" 
                                          alt=""
                                          onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                          }}
                                        />
                                      )}
                                      <Text size="2" weight="bold" className="source-title">
                                        {source.title}
                                      </Text>
                                    </Flex>
                                    <Text size="1" color="gray">{source.domain}</Text>
                                    {source.snippet && (
                                      <Text size="1" className="snippet" mt="1">
                                        {source.snippet}
                                      </Text>
                                    )}
                                    {source.relevance && (
                                      <Progress value={source.relevance * 100} max={100} size="1" mt="2" />
                                    )}
                                  </Box>
                                </a>
                              </Card>
                            ))}
                          </Box>
                        )}
                      </ScrollArea>
                    </Tabs.Content>

                    <Tabs.Content value="insights">
                      <ScrollArea>
                        <Box className="insights">
                          {currentSession?.messages.filter(m => m.role === 'assistant').map(msg => (
                            <Card key={msg.id} mb="3">
                              <Heading size="3" mb="2">Key Points</Heading>
                              <Box className="key-points">
                                {msg.content.split('\n')
                                  .filter(line => line.startsWith('•') || line.startsWith('-'))
                                  .slice(0, 5)
                                  .map((point, idx) => (
                                    <Flex key={idx} gap="2" mb="1">
                                      <Icons.CheckIcon className="point-icon" />
                                      <Text size="2">{point.replace(/^[•-]\s*/, '')}</Text>
                                    </Flex>
                                  ))}
                              </Box>
                            </Card>
                          ))}
                        </Box>
                      </ScrollArea>
                    </Tabs.Content>

                    <Tabs.Content value="visual" className="tab-content">
                      <ScrollArea className="panel-scroll-area">
                        <Box className="visual-content" p="2">
                          {messages.filter(m => m.images && m.images.length > 0).length > 0 ? (
                            messages.filter(m => m.images && m.images.length > 0).map(msg => (
                              <Box key={msg.id} mb="3">
                                <Text size="1" color="gray" mb="2">
                                  {new Date(msg.timestamp).toLocaleTimeString()}
                                </Text>
                                {msg.images?.map((img, idx) => (
                                  <Box key={idx} className="visual-item" mb="2">
                                    <img 
                                      src={img} 
                                      alt={`Screenshot ${idx + 1}`}
                                      onError={(e) => {
                                        console.error('Image failed to load:', img);
                                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="150"%3E%3Crect fill="%23333" width="200" height="150"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em" font-family="sans-serif" font-size="14"%3EImage unavailable%3C/text%3E%3C/svg%3E';
                                      }}
                                      onClick={() => window.open(img, '_blank')}
                                      style={{ cursor: 'pointer' }}
                                    />
                                    <Text size="1">Screenshot {idx + 1}</Text>
                                  </Box>
                                ))}
                              </Box>
                            ))
                          ) : sources.filter(s => s.thumbnail).length > 0 ? (
                            sources.filter(s => s.thumbnail).map(source => (
                              <Box key={source.id} className="visual-item" mb="2">
                                <img 
                                  src={source.thumbnail} 
                                  alt={source.title}
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                  onClick={() => window.open(source.thumbnail, '_blank')}
                                  style={{ cursor: 'pointer' }}
                                />
                                <Text size="1">{source.title}</Text>
                              </Box>
                            ))
                          ) : (
                            <Text size="2" color="gray">No images yet</Text>
                          )}
                        </Box>
                      </ScrollArea>
                    </Tabs.Content>
                  </Box>
                </Tabs.Root>
              </motion.div>
            )}
          </AnimatePresence>
        </Box>
      </Box>
    </Theme>
  );
};