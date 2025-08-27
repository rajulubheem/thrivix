import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Theme,
  Container,
  Section,
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
  DataList,
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
  Blockquote,
  Link
} from '@radix-ui/themes';
import { 
  PaperPlaneIcon,
  MagnifyingGlassIcon,
  ReloadIcon,
  TrashIcon,
  DownloadIcon,
  Share2Icon,
  DotsVerticalIcon,
  PersonIcon,
  ChatBubbleIcon,
  BookmarkIcon,
  BookmarkFilledIcon,
  ExternalLinkIcon,
  ImageIcon,
  CheckIcon,
  Cross2Icon,
  PlusIcon,
  ClockIcon,
  GlobeIcon,
  LightningBoltIcon,
  RocketIcon,
  StarIcon,
  StarFilledIcon,
  InfoCircledIcon,
  ExclamationTriangleIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  CopyIcon,
  EnterIcon,
  StopIcon,
  PlayIcon,
  UpdateIcon,
  ArchiveIcon,
  DrawingPinIcon,
  DrawingPinFilledIcon,
  MixIcon,
  CardStackIcon,
  QuestionMarkCircledIcon,
  TargetIcon,
  CodeIcon,
  FileTextIcon
} from '@radix-ui/react-icons';
import { motion, AnimatePresence } from 'framer-motion';

// TypeScript Interfaces
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  sources?: Source[];
  feedback?: 'positive' | 'negative' | null;
  is_clarification?: boolean;
  thinking?: boolean;
  error?: string;
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
  relevance_score?: number;
}

interface Thought {
  type: string;
  content: string;
  timestamp: string;
  progress?: number;
}

interface Screenshot {
  url: string;
  data?: string;
  timestamp?: string;
  title?: string;
  description?: string;
}

interface ConversationSession {
  session_id: string;
  status: string;
  conversation_count: number;
  timestamp: string;
  active: boolean;
  title?: string;
  preview?: string;
  pinned?: boolean;
}

// Quick action suggestions
const QUICK_ACTIONS = [
  { icon: <RocketIcon />, label: "Latest AI news", query: "What are the latest developments in AI?" },
  { icon: <CodeIcon />, label: "Code help", query: "Help me with coding" },
  { icon: <MixIcon />, label: "Research topic", query: "Research about" },
  { icon: <QuestionMarkCircledIcon />, label: "Explain concept", query: "Explain how" },
  { icon: <TargetIcon />, label: "Best practices", query: "What are the best practices for" },
  { icon: <FileTextIcon />, label: "Summarize", query: "Summarize the latest on" },
];

export const EnhancedConversationUI: React.FC = () => {
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  
  // Core state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(urlSessionId || null);
  
  // Enhanced state
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [conversationCount, setConversationCount] = useState(0);
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [searchMode, setSearchMode] = useState<'instant' | 'deep' | 'scholar'>('instant');
  const [showThoughts, setShowThoughts] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [starredSessions, setStarredSessions] = useState<Set<string>>(new Set());
  const [pinnedSessions, setPinnedSessions] = useState<Set<string>>(new Set());
  const [sessionSearch, setSessionSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
    // Load from localStorage
    const savedStarred = localStorage.getItem('starredSessions');
    const savedPinned = localStorage.getItem('pinnedSessions');
    if (savedStarred) setStarredSessions(new Set(JSON.parse(savedStarred)));
    if (savedPinned) setPinnedSessions(new Set(JSON.parse(savedPinned)));
  }, []);

  // Save starred/pinned to localStorage
  useEffect(() => {
    localStorage.setItem('starredSessions', JSON.stringify(Array.from(starredSessions)));
  }, [starredSessions]);

  useEffect(() => {
    localStorage.setItem('pinnedSessions', JSON.stringify(Array.from(pinnedSessions)));
  }, [pinnedSessions]);

  const loadSessions = async () => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/v1/conversation/sessions`);
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const loadSession = async (sid: string) => {
    try {
      setIsLoading(true);
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/v1/conversation/status/${sid}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        setSources(data.sources || []);
        setScreenshots(data.screenshots || []);
        setConversationCount(data.conversation_count || 0);
      }
    } catch (err) {
      setError('Failed to load session');
      console.error('Failed to load session:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const pollStatus = useCallback(async (sid: string) => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/v1/conversation/status/${sid}`);
      
      if (!response.ok) throw new Error('Failed to get status');
      
      const data = await response.json();
      
      // Update all state
      if (data.messages) setMessages(data.messages);
      if (data.sources) setSources(data.sources);
      if (data.thoughts) setThoughts(data.thoughts);
      if (data.screenshots) setScreenshots(data.screenshots);
      if (data.conversation_count !== undefined) setConversationCount(data.conversation_count);
      if (data.progress !== undefined) setProgress(data.progress);
      
      // Handle status
      if (data.awaiting_response) {
        setAwaitingResponse(true);
        setIsLoading(false);
        setIsTyping(false);
      }
      
      if (data.status === 'completed' || data.status === 'error' || data.status === 'waiting_for_clarification') {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setIsLoading(false);
        setIsTyping(false);
        setProgress(0);
        
        if (data.status === 'error') {
          setError(data.error || 'An error occurred');
        }
      } else if (data.status === 'running') {
        setIsTyping(true);
      }
    } catch (err) {
      console.error('Polling error:', err);
      setError('Connection lost');
    }
  }, []);

  const sendMessage = async (overrideInput?: string) => {
    const messageText = overrideInput || input;
    if (!messageText.trim() || isLoading) return;
    
    setInput('');
    setIsLoading(true);
    setIsTyping(true);
    setError(null);
    setThoughts([]);
    setProgress(0);
    
    // Add user message immediately
    const userMessage: Message = {
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const endpoint = sessionId ? '/api/v1/conversation/continue' : '/api/v1/conversation/start';
      
      const response = await fetch(`${apiUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          session_id: sessionId,
          mode: searchMode
        })
      });

      if (!response.ok) throw new Error(`Failed to send message: ${response.status}`);

      const data = await response.json();
      
      // Set session ID if new conversation
      if (!sessionId) {
        setSessionId(data.session_id);
        navigate(`/conversation/${data.session_id}`, { replace: true });
      }
      
      // Start polling
      pollingIntervalRef.current = setInterval(() => {
        pollStatus(data.session_id);
      }, 500);
      
      // Initial poll
      pollStatus(data.session_id);
      
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewConversation = () => {
    setMessages([]);
    setSessionId(null);
    setSources([]);
    setThoughts([]);
    setScreenshots([]);
    setError(null);
    setProgress(0);
    navigate('/conversation');
    inputRef.current?.focus();
  };

  const deleteSession = async (sid: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      await fetch(`${apiUrl}/api/v1/conversation/session/${sid}`, { method: 'DELETE' });
      await loadSessions();
      if (sid === sessionId) startNewConversation();
    } catch (err) {
      setError('Failed to delete session');
    }
  };

  const toggleStarred = (sid: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setStarredSessions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sid)) {
        newSet.delete(sid);
      } else {
        newSet.add(sid);
      }
      return newSet;
    });
  };

  const togglePinned = (sid: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setPinnedSessions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sid)) {
        newSet.delete(sid);
      } else {
        newSet.add(sid);
      }
      return newSet;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    if (diffMins < 10080) return `${Math.floor(diffMins / 1440)}d ago`;
    return date.toLocaleDateString();
  };

  // Filter sessions based on search
  const filteredSessions = sessions.filter(session => 
    session.title?.toLowerCase().includes(sessionSearch.toLowerCase()) ||
    session.preview?.toLowerCase().includes(sessionSearch.toLowerCase())
  );

  // Sort sessions: pinned first, then by date
  const sortedSessions = [...filteredSessions].sort((a, b) => {
    if (pinnedSessions.has(a.session_id) && !pinnedSessions.has(b.session_id)) return -1;
    if (!pinnedSessions.has(a.session_id) && pinnedSessions.has(b.session_id)) return 1;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return (
    <Theme appearance="dark" accentColor="violet" grayColor="slate" radius="medium">
      <Box style={{ height: '100vh', background: 'var(--color-page-background)' }}>
        <Grid columns={{ initial: '1fr', md: '320px 1fr 360px' }} gap="0" height="100%">
          
          {/* Left Sidebar - Sessions */}
          <Box className="sessions-sidebar" style={{
            borderRight: '1px solid var(--gray-a5)',
            background: 'var(--color-panel-solid)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header */}
            <Box p="4" style={{ borderBottom: '1px solid var(--gray-a5)' }}>
              <Flex justify="between" align="center" mb="3">
                <Flex align="center" gap="2">
                  <MagnifyingGlassIcon width="20" height="20" />
                  <Heading size="5">Research</Heading>
                </Flex>
                <Tooltip content="New conversation">
                  <IconButton size="2" variant="soft" onClick={startNewConversation}>
                    <PlusIcon />
                  </IconButton>
                </Tooltip>
              </Flex>
              
              {/* Search Mode Selector */}
              <SegmentedControl.Root
                size="2"
                value={searchMode}
                onValueChange={(value: string) => setSearchMode(value as any)}
              >
                <SegmentedControl.Item value="instant">
                  <LightningBoltIcon />
                  Fast
                </SegmentedControl.Item>
                <SegmentedControl.Item value="deep">
                  <GlobeIcon />
                  Deep
                </SegmentedControl.Item>
                <SegmentedControl.Item value="scholar">
                  <FileTextIcon />
                  Scholar
                </SegmentedControl.Item>
              </SegmentedControl.Root>
              
              {/* Session Search */}
              <TextField.Root
                mt="3"
                placeholder="Search conversations..."
                value={sessionSearch}
                onChange={(e: any) => setSessionSearch(e.target.value)}
              >
                <TextField.Slot>
                  <MagnifyingGlassIcon height="16" width="16" />
                </TextField.Slot>
              </TextField.Root>
            </Box>

            {/* Sessions List */}
            <ScrollArea style={{ flex: 1 }}>
              <Box p="2">
                {sortedSessions.length === 0 ? (
                  <Card>
                    <Flex direction="column" align="center" py="6">
                      <ChatBubbleIcon width="32" height="32" style={{ opacity: 0.3 }} />
                      <Text size="2" color="gray" mt="2">No conversations yet</Text>
                      <Text size="1" color="gray">Start a new research session</Text>
                    </Flex>
                  </Card>
                ) : (
                  <Flex direction="column" gap="2">
                    {sortedSessions.map((session) => (
                      <Card
                        key={session.session_id}
                        className="session-card"
                        style={{
                          cursor: 'pointer',
                          background: session.session_id === sessionId ? 'var(--accent-a3)' : undefined,
                          position: 'relative'
                        }}
                        onClick={() => {
                          setSessionId(session.session_id);
                          loadSession(session.session_id);
                          navigate(`/conversation/${session.session_id}`);
                        }}
                      >
                        {pinnedSessions.has(session.session_id) && (
                          <Box position="absolute" top="2" right="2">
                            <DrawingPinFilledIcon width="12" height="12" />
                          </Box>
                        )}
                        
                        <Flex justify="between" align="start" gap="2">
                          <Box style={{ flex: 1, minWidth: 0 }}>
                            <Flex align="center" gap="1" mb="1">
                              {starredSessions.has(session.session_id) && (
                                <StarFilledIcon width="12" height="12" color="gold" />
                              )}
                              <Text size="2" weight="medium" style={{ 
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {session.title || `Research #${session.conversation_count}`}
                              </Text>
                            </Flex>
                            
                            {session.preview && (
                              <Text size="1" color="gray" style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical'
                              }}>
                                {session.preview}
                              </Text>
                            )}
                            
                            <Flex align="center" gap="2" mt="2">
                              <Badge size="1" variant="soft">
                                {session.conversation_count} messages
                              </Badge>
                              <Text size="1" color="gray">
                                {formatTimestamp(session.timestamp)}
                              </Text>
                            </Flex>
                          </Box>
                          
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger>
                              <IconButton
                                size="1"
                                variant="ghost"
                                onClick={(e: any) => e.stopPropagation()}
                              >
                                <DotsVerticalIcon />
                              </IconButton>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Content>
                              <DropdownMenu.Item onClick={(e: any) => toggleStarred(session.session_id, e)}>
                                {starredSessions.has(session.session_id) ? <StarIcon /> : <StarFilledIcon />}
                                {starredSessions.has(session.session_id) ? 'Unstar' : 'Star'}
                              </DropdownMenu.Item>
                              <DropdownMenu.Item onClick={(e: any) => togglePinned(session.session_id, e)}>
                                {pinnedSessions.has(session.session_id) ? <DrawingPinIcon /> : <DrawingPinFilledIcon />}
                                {pinnedSessions.has(session.session_id) ? 'Unpin' : 'Pin'}
                              </DropdownMenu.Item>
                              <DropdownMenu.Item>
                                <ArchiveIcon />
                                Archive
                              </DropdownMenu.Item>
                              <DropdownMenu.Separator />
                              <DropdownMenu.Item color="red" onClick={(e: any) => deleteSession(session.session_id, e)}>
                                <TrashIcon />
                                Delete
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Root>
                        </Flex>
                      </Card>
                    ))}
                  </Flex>
                )}
              </Box>
            </ScrollArea>
          </Box>

          {/* Main Content Area */}
          <Flex direction="column" height="100%">
            {/* Header Bar */}
            <Box p="3" style={{ borderBottom: '1px solid var(--gray-a5)' }}>
              <Flex justify="between" align="center">
                <Flex gap="3" align="center">
                  <Badge size="2" color={isLoading ? "orange" : (error ? "red" : "green")}>
                    {isLoading ? (
                      <>
                        <Spinner size="1" />
                        Researching...
                      </>
                    ) : error ? "Error" : "Ready"}
                  </Badge>
                  
                  {searchMode === 'deep' && (
                    <Badge size="2" color="purple" variant="soft">
                      <GlobeIcon />
                      Deep Research Mode
                    </Badge>
                  )}
                  
                  {searchMode === 'scholar' && (
                    <Badge size="2" color="blue" variant="soft">
                      <FileTextIcon />
                      Scholar Mode
                    </Badge>
                  )}
                  
                  {conversationCount > 0 && (
                    <Text size="2" color="gray">
                      {conversationCount} messages • {sources.length} sources
                    </Text>
                  )}
                </Flex>
                
                <Flex gap="2">
                  <Tooltip content={showThoughts ? "Hide thoughts" : "Show thoughts"}>
                    <IconButton
                      variant={showThoughts ? "solid" : "soft"}
                      size="2"
                      onClick={() => setShowThoughts(!showThoughts)}
                    >
                      <ChatBubbleIcon />
                    </IconButton>
                  </Tooltip>
                  
                  <Tooltip content="Export conversation">
                    <IconButton variant="soft" size="2">
                      <DownloadIcon />
                    </IconButton>
                  </Tooltip>
                  
                  <Tooltip content="Share">
                    <IconButton variant="soft" size="2">
                      <Share2Icon />
                    </IconButton>
                  </Tooltip>
                </Flex>
              </Flex>
              
              {/* Progress Bar */}
              {isLoading && progress > 0 && (
                <Box mt="3">
                  <Progress value={progress} max={100} size="1" />
                </Box>
              )}
            </Box>

            {/* Messages Area */}
            <ScrollArea style={{ flex: 1 }}>
              <Container size="3" p="4">
                {messages.length === 0 ? (
                  <Flex direction="column" align="center" justify="center" style={{ minHeight: '60vh' }}>
                    <Box mb="6">
                      <MagnifyingGlassIcon width="64" height="64" style={{ opacity: 0.2 }} />
                    </Box>
                    
                    <Heading size="6" mb="2">Start your research journey</Heading>
                    <Text size="3" color="gray" align="center" mb="6" style={{ maxWidth: '500px' }}>
                      Ask me anything and I'll search the web to find accurate, up-to-date information with sources.
                    </Text>
                    
                    {/* Quick Actions */}
                    <Grid columns="2" gap="3" width="100%" style={{ maxWidth: '600px' }}>
                      {QUICK_ACTIONS.map((action, idx) => (
                        <Card
                          key={idx}
                          asChild
                          style={{ cursor: 'pointer' }}
                        >
                          <button
                            onClick={() => {
                              setInput(action.query);
                              inputRef.current?.focus();
                            }}
                            style={{ 
                              background: 'transparent',
                              border: 'none',
                              textAlign: 'left',
                              width: '100%'
                            }}
                          >
                            <Flex gap="3" align="center">
                              <Box style={{ color: 'var(--accent-9)' }}>
                                {action.icon}
                              </Box>
                              <Text size="2">{action.label}</Text>
                            </Flex>
                          </button>
                        </Card>
                      ))}
                    </Grid>
                  </Flex>
                ) : (
                  <Flex direction="column" gap="4">
                    <AnimatePresence mode="popLayout">
                      {messages.map((message, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.3 }}
                        >
                          <Flex
                            gap="3"
                            align="start"
                            style={{
                              flexDirection: message.role === 'user' ? 'row-reverse' : 'row'
                            }}
                          >
                            <Avatar
                              size="3"
                              radius="full"
                              fallback={message.role === 'user' ? <PersonIcon /> : <RocketIcon />}
                              color={message.role === 'user' ? 'blue' : 'violet'}
                              style={{ flexShrink: 0 }}
                            />
                            
                            <Box style={{ flex: 1, maxWidth: '85%' }}>
                              {message.error ? (
                                <Callout.Root color="red" mb="2">
                                  <Callout.Icon>
                                    <ExclamationTriangleIcon />
                                  </Callout.Icon>
                                  <Callout.Text>{message.error}</Callout.Text>
                                </Callout.Root>
                              ) : (
                                <Card size="2">
                                  <Flex direction="column" gap="2">
                                    {/* Header */}
                                    <Flex justify="between" align="center">
                                      <Text size="2" weight="medium" color="gray">
                                        {message.role === 'user' ? 'You' : 'Research Assistant'}
                                      </Text>
                                      {message.timestamp && (
                                        <Text size="1" color="gray">
                                          {formatTimestamp(message.timestamp)}
                                        </Text>
                                      )}
                                    </Flex>
                                    
                                    <Separator size="4" />
                                    
                                    {/* Content */}
                                    {message.thinking ? (
                                      <Flex align="center" gap="2" py="3">
                                        <Spinner size="2" />
                                        <Text size="3" color="gray">
                                          Thinking and researching...
                                        </Text>
                                      </Flex>
                                    ) : message.role === 'assistant' ? (
                                      <Box className="markdown-content">
                                        <ReactMarkdown
                                          remarkPlugins={[remarkGfm]}
                                          components={{
                                            code({ node, className, children, ...props }: any) {
                                              const match = /language-(\w+)/.exec(className || '');
                                              const inline = !match;
                                              return !inline ? (
                                                <Box my="3">
                                                  <SyntaxHighlighter
                                                    style={oneDark as any}
                                                    language={match[1]}
                                                    PreTag="div"
                                                    {...props}
                                                  >
                                                    {String(children).replace(/\n$/, '')}
                                                  </SyntaxHighlighter>
                                                </Box>
                                              ) : (
                                                <Code size="2">{children}</Code>
                                              );
                                            },
                                            p: ({ children }) => (
                                              <Text as="p" size="3" style={{ marginBottom: '12px', lineHeight: '1.6' }}>
                                                {children}
                                              </Text>
                                            ),
                                            a: ({ href, children }) => (
                                              <Link
                                                href={href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ 
                                                  color: 'var(--accent-9)',
                                                  textDecoration: 'none'
                                                }}
                                              >
                                                {children} <ExternalLinkIcon style={{ display: 'inline', verticalAlign: 'middle' }} />
                                              </Link>
                                            ),
                                            blockquote: ({ children }) => (
                                              <Blockquote size="2" my="3">
                                                {children}
                                              </Blockquote>
                                            ),
                                            ul: ({ children }) => (
                                              <ul style={{ paddingLeft: '1rem', marginTop: '0.75rem', marginBottom: '0.75rem', lineHeight: '1.6' }}>
                                                {children}
                                              </ul>
                                            ),
                                            ol: ({ children }) => (
                                              <ol style={{ paddingLeft: '1rem', marginTop: '0.75rem', marginBottom: '0.75rem', lineHeight: '1.6' }}>
                                                {children}
                                              </ol>
                                            ),
                                            li: ({ children }) => (
                                              <li style={{ fontSize: '0.95rem', marginBottom: '0.25rem' }}>
                                                {children}
                                              </li>
                                            ),
                                            h1: ({ children }) => <Heading size="6" mt="4" mb="2">{children}</Heading>,
                                            h2: ({ children }) => <Heading size="5" mt="3" mb="2">{children}</Heading>,
                                            h3: ({ children }) => <Heading size="4" mt="3" mb="2">{children}</Heading>,
                                          }}
                                        >
                                          {message.content}
                                        </ReactMarkdown>
                                      </Box>
                                    ) : (
                                      <Text size="3" style={{ lineHeight: '1.6' }}>
                                        {message.content}
                                      </Text>
                                    )}
                                    
                                    {/* Actions */}
                                    {message.role === 'assistant' && (
                                      <Flex gap="2" mt="2">
                                        <Tooltip content="Copy message">
                                          <IconButton
                                            size="1"
                                            variant="ghost"
                                            onClick={() => copyToClipboard(message.content)}
                                          >
                                            <CopyIcon />
                                          </IconButton>
                                        </Tooltip>
                                        <Tooltip content="Good response">
                                          <IconButton
                                            size="1"
                                            variant="ghost"
                                            color={message.feedback === 'positive' ? 'green' : undefined}
                                          >
                                            <CheckCircledIcon />
                                          </IconButton>
                                        </Tooltip>
                                        <Tooltip content="Bad response">
                                          <IconButton
                                            size="1"
                                            variant="ghost"
                                            color={message.feedback === 'negative' ? 'red' : undefined}
                                          >
                                            <CrossCircledIcon />
                                          </IconButton>
                                        </Tooltip>
                                        <Tooltip content="Regenerate">
                                          <IconButton size="1" variant="ghost">
                                            <UpdateIcon />
                                          </IconButton>
                                        </Tooltip>
                                      </Flex>
                                    )}
                                  </Flex>
                                </Card>
                              )}
                            </Box>
                          </Flex>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    
                    {/* Typing Indicator */}
                    {isTyping && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <Flex gap="3" align="start">
                          <Avatar
                            size="3"
                            radius="full"
                            fallback={<RocketIcon />}
                            color="violet"
                          />
                          <Card size="2" style={{ maxWidth: '85%' }}>
                            <Flex align="center" gap="2">
                              <Box className="typing-indicator">
                                <span></span>
                                <span></span>
                                <span></span>
                              </Box>
                              <Text size="2" color="gray">
                                Researching your query...
                              </Text>
                            </Flex>
                          </Card>
                        </Flex>
                      </motion.div>
                    )}
                  </Flex>
                )}
                
                <div ref={messagesEndRef} />
              </Container>
            </ScrollArea>

            {/* Input Area */}
            <Box p="4" style={{ borderTop: '1px solid var(--gray-a5)' }}>
              {error && (
                <Callout.Root color="red" mb="3">
                  <Callout.Icon>
                    <ExclamationTriangleIcon />
                  </Callout.Icon>
                  <Callout.Text>{error}</Callout.Text>
                </Callout.Root>
              )}
              
              <Flex gap="2" align="end">
                <Box style={{ flex: 1 }}>
                  <TextArea
                    ref={inputRef}
                    size="3"
                    placeholder={awaitingResponse ? "Waiting for your response..." : "Ask anything... (Shift+Enter for new line)"}
                    value={input}
                    onChange={(e: any) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isLoading}
                    style={{ minHeight: '60px', maxHeight: '200px' }}
                  />
                  
                  <Flex justify="between" align="center" mt="2">
                    <Flex gap="2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        style={{ display: 'none' }}
                        accept="image/*"
                        onChange={(e) => {
                          // Handle file upload
                          const file = e.target.files?.[0];
                          if (file) {
                            // Process image file
                            console.log('File selected:', file);
                          }
                        }}
                      />
                      <Tooltip content="Attach image">
                        <IconButton
                          size="2"
                          variant="soft"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <ImageIcon />
                        </IconButton>
                      </Tooltip>
                      
                      {isLoading && (
                        <Tooltip content="Stop generation">
                          <IconButton
                            size="2"
                            variant="soft"
                            color="red"
                            onClick={() => {
                              if (pollingIntervalRef.current) {
                                clearInterval(pollingIntervalRef.current);
                                pollingIntervalRef.current = null;
                              }
                              setIsLoading(false);
                              setIsTyping(false);
                            }}
                          >
                            <StopIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Flex>
                    
                    <Text size="1" color="gray">
                      Press Enter to send • Shift+Enter for new line
                    </Text>
                  </Flex>
                </Box>
                
                <Button
                  size="3"
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || isLoading}
                >
                  <Spinner loading={isLoading}>
                    <PaperPlaneIcon />
                  </Spinner>
                  Send
                </Button>
              </Flex>
            </Box>
          </Flex>

          {/* Right Panel - Sources, Images & Thoughts */}
          <Box
            style={{
              borderLeft: '1px solid var(--gray-a5)',
              background: 'var(--color-panel-solid)',
              height: '100%',
              overflow: 'hidden'
            }}
          >
            <Tabs.Root defaultValue="sources">
              <Tabs.List size="2">
                <Tabs.Trigger value="sources">
                  <GlobeIcon />
                  Sources
                  {sources.length > 0 && (
                    <Badge size="1" ml="2">{sources.length}</Badge>
                  )}
                </Tabs.Trigger>
                
                {screenshots.length > 0 && (
                  <Tabs.Trigger value="images">
                    <ImageIcon />
                    Images
                    <Badge size="1" ml="2">{screenshots.length}</Badge>
                  </Tabs.Trigger>
                )}
                
                {showThoughts && thoughts.length > 0 && (
                  <Tabs.Trigger value="thoughts">
                    <ChatBubbleIcon />
                    Process
                    <Badge size="1" ml="2">{thoughts.length}</Badge>
                  </Tabs.Trigger>
                )}
              </Tabs.List>

              {/* Sources Tab */}
              <Tabs.Content value="sources">
                <ScrollArea style={{ height: 'calc(100vh - 48px)' }}>
                  <Box p="3">
                    {sources.length === 0 ? (
                      <Flex direction="column" align="center" py="6">
                        <GlobeIcon width="32" height="32" style={{ opacity: 0.3 }} />
                        <Text size="2" color="gray" mt="2">No sources yet</Text>
                        <Text size="1" color="gray">Sources will appear here</Text>
                      </Flex>
                    ) : (
                      <Flex direction="column" gap="3">
                        {sources.map((source, idx) => (
                          <Card key={source.id || idx} asChild>
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ textDecoration: 'none', color: 'inherit' }}
                            >
                              <Flex direction="column" gap="3">
                                {/* Thumbnail */}
                                {source.thumbnail && (
                                  <Box
                                    style={{
                                      width: '100%',
                                      height: '140px',
                                      borderRadius: 'var(--radius-2)',
                                      overflow: 'hidden',
                                      background: 'var(--gray-a3)'
                                    }}
                                  >
                                    <img 
                                      src={source.thumbnail}
                                      alt={source.title}
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover'
                                      }}
                                      onError={(e: any) => {
                                        e.target.style.display = 'none';
                                      }}
                                    />
                                  </Box>
                                )}
                                
                                {/* Content */}
                                <Flex gap="2" align="start">
                                  {source.favicon && (
                                    <img 
                                      src={source.favicon}
                                      alt=""
                                      style={{
                                        width: '20px',
                                        height: '20px',
                                        borderRadius: '4px',
                                        marginTop: '2px'
                                      }}
                                      onError={(e: any) => {
                                        e.target.style.display = 'none';
                                      }}
                                    />
                                  )}
                                  
                                  <Box style={{ flex: 1 }}>
                                    <Text size="2" weight="medium">
                                      {source.title}
                                    </Text>
                                    
                                    <Flex align="center" gap="2" mt="1">
                                      <Text size="1" color="gray">
                                        {source.domain}
                                      </Text>
                                      {source.relevance_score && (
                                        <Badge size="1" variant="soft" color="green">
                                          {Math.round(source.relevance_score * 100)}% relevant
                                        </Badge>
                                      )}
                                    </Flex>
                                    
                                    {source.snippet && (
                                      <Text size="1" color="gray" mt="2" style={{
                                        overflow: 'hidden',
                                        display: '-webkit-box',
                                        WebkitLineClamp: 3,
                                        WebkitBoxOrient: 'vertical'
                                      }}>
                                        {source.snippet}
                                      </Text>
                                    )}
                                  </Box>
                                  
                                  <ExternalLinkIcon style={{ flexShrink: 0 }} />
                                </Flex>
                              </Flex>
                            </a>
                          </Card>
                        ))}
                      </Flex>
                    )}
                  </Box>
                </ScrollArea>
              </Tabs.Content>

              {/* Images Tab */}
              {screenshots.length > 0 && (
                <Tabs.Content value="images">
                  <ScrollArea style={{ height: 'calc(100vh - 48px)' }}>
                    <Box p="3">
                      <Grid columns="1" gap="3">
                        {screenshots.map((screenshot, idx) => (
                          <Card key={idx}>
                            <Box
                              onClick={() => setSelectedImage(screenshot.data || screenshot.url || '')}
                              style={{ cursor: 'pointer' }}
                            >
                              <img
                                src={screenshot.data || screenshot.url}
                                alt={screenshot.title || `Screenshot ${idx + 1}`}
                                style={{
                                  width: '100%',
                                  borderRadius: 'var(--radius-2)',
                                  marginBottom: '8px'
                                }}
                              />
                              
                              {(screenshot.title || screenshot.url) && (
                                <Box>
                                  {screenshot.title && (
                                    <Text size="2" weight="medium">
                                      {screenshot.title}
                                    </Text>
                                  )}
                                  {screenshot.url && (
                                    <Text size="1" color="gray">
                                      {new URL(screenshot.url).hostname}
                                    </Text>
                                  )}
                                </Box>
                              )}
                            </Box>
                          </Card>
                        ))}
                      </Grid>
                    </Box>
                  </ScrollArea>
                </Tabs.Content>
              )}

              {/* Thoughts Tab */}
              {showThoughts && thoughts.length > 0 && (
                <Tabs.Content value="thoughts">
                  <ScrollArea style={{ height: 'calc(100vh - 48px)' }}>
                    <Box p="3">
                      <DataList.Root>
                        {thoughts.map((thought, idx) => (
                          <DataList.Item key={idx} align="start">
                            <DataList.Label minWidth="80px">
                              <Badge size="1" variant="soft">
                                {thought.type}
                              </Badge>
                            </DataList.Label>
                            <DataList.Value>
                              <Text size="2">{thought.content}</Text>
                              {thought.progress && (
                                <Progress value={thought.progress} max={100} size="1" mt="2" />
                              )}
                            </DataList.Value>
                          </DataList.Item>
                        ))}
                      </DataList.Root>
                    </Box>
                  </ScrollArea>
                </Tabs.Content>
              )}
            </Tabs.Root>
          </Box>
        </Grid>

        {/* Image Lightbox */}
        <Dialog.Root open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
          <Dialog.Content maxWidth="90vw">
            <Dialog.Title>Image Preview</Dialog.Title>
            <Box mt="4">
              <img
                src={selectedImage || ''}
                alt="Preview"
                style={{
                  width: '100%',
                  maxHeight: '80vh',
                  objectFit: 'contain'
                }}
              />
            </Box>
          </Dialog.Content>
        </Dialog.Root>
      </Box>

      {/* Styles */}
      <style>{`
        .typing-indicator {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        
        .typing-indicator span {
          width: 8px;
          height: 8px;
          background: var(--gray-9);
          border-radius: 50%;
          animation: typing 1.4s infinite;
        }
        
        .typing-indicator span:nth-child(2) {
          animation-delay: 0.2s;
        }
        
        .typing-indicator span:nth-child(3) {
          animation-delay: 0.4s;
        }
        
        @keyframes typing {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.5;
          }
          30% {
            transform: translateY(-10px);
            opacity: 1;
          }
        }
        
        .session-card:hover {
          background: var(--gray-a3);
        }
        
        .markdown-content {
          color: var(--gray-12);
        }
        
        .markdown-content pre {
          border-radius: var(--radius-3);
          overflow-x: auto;
        }
        
        .markdown-content img {
          max-width: 100%;
          height: auto;
          border-radius: var(--radius-3);
        }
      `}</style>
    </Theme>
  );
};