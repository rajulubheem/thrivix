import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  Code,
  Link,
  Callout,
  Grid,
  HoverCard
} from '@radix-ui/themes';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  PaperPlaneIcon,
  PersonIcon,
  MixIcon,
  ExternalLinkIcon,
  DownloadIcon,
  TrashIcon,
  DotsVerticalIcon,
  StarIcon,
  StarFilledIcon,
  ImageIcon,
  GlobeIcon,
  LightningBoltIcon,
  CheckIcon,
  CrossCircledIcon,
  InfoCircledIcon,
  ReloadIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ClockIcon,
  CopyIcon,
  Share1Icon
} from '@radix-ui/react-icons';
import { motion, AnimatePresence } from 'framer-motion';
import './RadixConversationUI.css';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  sources?: any[];
  images?: string[];
  thoughts?: any[];
}

interface Session {
  id: string;
  title: string;
  messages: Message[];
  timestamp: string;
  sources?: any[];
  mode?: string;
}

const RadixConversationUI: React.FC = () => {
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();

  // Core state from ConversationResearch
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [sources, setSources] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(urlSessionId || null);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [showSidebar, setShowSidebar] = useState(true);
  const [showSourcesPanel, setShowSourcesPanel] = useState(false);
  const [activeTab, setActiveTab] = useState('sources');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);

  // Load sessions from localStorage on mount
  useEffect(() => {
    const loadSessions = () => {
      const savedSessions = localStorage.getItem('conversation_sessions');
      if (savedSessions) {
        try {
          const parsed = JSON.parse(savedSessions);
          setSessions(parsed);
        } catch (e) {
          console.error('Failed to load sessions:', e);
        }
      }
    };
    loadSessions();
  }, []);

  // Save sessions to localStorage
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('conversation_sessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  // Load session from URL parameter
  useEffect(() => {
    if (urlSessionId && sessions.length > 0) {
      const session = sessions.find(s => s.id === urlSessionId);
      if (session) {
        setCurrentSession(session);
        setMessages(session.messages || []);
        setSessionId(session.id);
      }
    }
  }, [urlSessionId, sessions]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Polling for updates (from ConversationResearch)
  const pollForUpdates = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`http://localhost:8000/api/v1/conversation/status/${sessionId}`);
      if (!response.ok) throw new Error('Failed to fetch status');
      
      const data = await response.json();
      
      // Show assistant messages immediately as they arrive
      if (data.messages && data.messages.length > 0) {
        const assistantMessages = data.messages.filter((m: any) => m.role === 'assistant');
        if (assistantMessages.length > 0) {
          // Only add if we don't already have this message
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.content));
            const newMessages = assistantMessages.filter((m: any) => !existingIds.has(m.content));
            if (newMessages.length > 0) {
              return [...prev, ...newMessages];
            }
            return prev;
          });
        }
      }
      
      if (data.sources && data.sources.length > 0) {
        setSources(data.sources);
        setShowSourcesPanel(true);
      }
      
      if (data.status === 'completed' || data.status === 'error' || data.status === 'waiting_for_clarification') {
        clearInterval(pollingInterval.current!);
        setIsLoading(false);
        setShowThinking(false);
        
        if (data.status === 'error' && data.error) {
          setError(data.error);
        }
        
        // Update session with final state
        if (currentSession) {
          const updatedSession = {
            ...currentSession,
            messages: messages
          };
          setSessions(prev => prev.map(s => 
            s.id === sessionId ? updatedSession : s
          ));
        }
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, [currentSession, messages]);

  // Send message (from ConversationResearch logic)
  const sendMessage = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: trimmedInput,
      timestamp: new Date().toISOString()
    };

    // Create or update session
    let session = currentSession;
    if (!session) {
      session = {
        id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: trimmedInput.slice(0, 50),
        messages: [userMessage],
        timestamp: new Date().toISOString()
      };
      setCurrentSession(session);
      setSessions(prev => [session!, ...prev]);
      setSessionId(session.id);
      navigate(`/conversation/${session.id}`);
    } else {
      session = {
        ...session,
        messages: [...session.messages, userMessage]
      };
      setCurrentSession(session);
      setSessions(prev => prev.map(s => s.id === session!.id ? session! : s));
    }

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setShowThinking(true);
    setError(null);

    try {
      const endpoint = messages.length === 0 
        ? 'http://localhost:8000/api/v1/conversation/start'
        : 'http://localhost:8000/api/v1/conversation/continue';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmedInput,
          session_id: session.id,
          mode: 'research'
        })
      });

      if (!response.ok) throw new Error('Failed to send message');
      
      const data = await response.json();
      
      // Start polling
      pollingInterval.current = setInterval(() => {
        pollForUpdates(session!.id);
      }, 500);

    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
      setShowThinking(false);
    }
  };

  // Delete session
  const deleteSession = (sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (currentSession?.id === sessionId) {
      setCurrentSession(null);
      setMessages([]);
      setSources([]);
      navigate('/conversation');
    }
  };

  // Quick action buttons
  const quickActions = [
    { icon: '🚀', text: 'Latest AI breakthroughs', color: 'blue' },
    { icon: '💡', text: 'Explain quantum computing', color: 'purple' },
    { icon: '🌍', text: 'Climate change solutions', color: 'green' },
    { icon: '📈', text: 'Market trends analysis', color: 'orange' }
  ];

  // Filter sessions based on search
  const filteredSessions = sessions.filter(s =>
    s.title && s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Theme appearance="dark" accentColor="violet" radius="medium">
      <Box className="radix-conversation-container">
        <Flex className="radix-conversation-layout">
          {/* Sidebar */}
          <AnimatePresence>
            {showSidebar && (
              <motion.div
                className="conversation-sidebar"
                initial={{ x: -320 }}
                animate={{ x: 0 }}
                exit={{ x: -320 }}
                transition={{ type: 'spring', damping: 20 }}
              >
                <Box className="sidebar-header">
                  <Flex justify="between" align="center" mb="3">
                    <Heading size="5">Research Chat</Heading>
                    <Tooltip content="New conversation">
                      <IconButton 
                        size="2" 
                        onClick={() => {
                          setCurrentSession(null);
                          setMessages([]);
                          setSources([]);
                          navigate('/conversation');
                        }}
                      >
                        <PlusIcon />
                      </IconButton>
                    </Tooltip>
                  </Flex>

                  <TextField.Root
                    placeholder="Search conversations..."
                    value={searchQuery}
                    onChange={(e: any) => setSearchQuery(e.target.value)}
                    mb="3"
                  >
                    <TextField.Slot>
                      <MagnifyingGlassIcon />
                    </TextField.Slot>
                  </TextField.Root>
                </Box>

                <ScrollArea className="sidebar-sessions">
                  {filteredSessions.length === 0 ? (
                    <Card mx="3" my="2">
                      <Text size="2" color="gray" align="center">
                        No conversations yet
                      </Text>
                    </Card>
                  ) : (
                    <Box p="2">
                      {filteredSessions.map(session => (
                        <Card
                          key={session.id}
                          className={`session-card ${currentSession?.id === session.id ? 'active' : ''}`}
                          onClick={() => {
                            setCurrentSession(session);
                            setMessages(session.messages);
                            setSessionId(session.id);
                            navigate(`/conversation/${session.id}`);
                          }}
                          mb="2"
                        >
                          <Flex justify="between" align="start">
                            <Box style={{ flex: 1 }}>
                              <Text size="2" weight="bold" className="session-title">
                                {session.title}
                              </Text>
                              <Text size="1" color="gray">
                                {session.messages.length} messages
                              </Text>
                              <Text size="1" color="gray">
                                {new Date(session.timestamp).toLocaleDateString()}
                              </Text>
                            </Box>
                            <DropdownMenu.Root>
                              <DropdownMenu.Trigger>
                                <IconButton size="1" variant="ghost">
                                  <DotsVerticalIcon />
                                </IconButton>
                              </DropdownMenu.Trigger>
                              <DropdownMenu.Content>
                                <DropdownMenu.Item onClick={() => deleteSession(session.id)}>
                                  <TrashIcon />
                                  Delete
                                </DropdownMenu.Item>
                              </DropdownMenu.Content>
                            </DropdownMenu.Root>
                          </Flex>
                        </Card>
                      ))}
                    </Box>
                  )}
                </ScrollArea>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Content */}
          <Box className={`conversation-main ${!showSidebar ? 'sidebar-hidden' : ''} ${showSourcesPanel && sources.length > 0 ? 'sources-visible' : ''}`}>
            {/* Header */}
            <Box className="main-header">
              <Flex justify="between" align="center">
                <Flex gap="3" align="center">
                  <IconButton
                    size="2"
                    variant="soft"
                    onClick={() => setShowSidebar(!showSidebar)}
                  >
                    {showSidebar ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  </IconButton>
                  
                  {currentSession && (
                    <>
                      <Heading size="3">{currentSession.title}</Heading>
                      <Badge color="green" variant="soft">
                        {messages.length} messages
                      </Badge>
                    </>
                  )}
                </Flex>

                <Flex gap="2">
                  <Tooltip content="Toggle sources">
                    <IconButton
                      size="2"
                      variant="soft"
                      onClick={() => setShowSourcesPanel(!showSourcesPanel)}
                    >
                      <GlobeIcon />
                    </IconButton>
                  </Tooltip>
                </Flex>
              </Flex>
            </Box>

            {/* Messages Area */}
            <ScrollArea className="messages-area">
              <Container size="3">
                {messages.length === 0 ? (
                  <Box className="empty-state">
                    <Heading size="6" align="center" mb="4">
                      Start a Research Conversation
                    </Heading>
                    <Text size="3" color="gray" align="center" mb="5">
                      Ask anything and I'll search the web for you
                    </Text>
                    
                    <Grid columns="2" gap="3" className="quick-actions">
                      {quickActions.map((action, idx) => (
                        <Card
                          key={idx}
                          className="quick-action-card"
                          onClick={() => {
                            setInput(action.text);
                            inputRef.current?.focus();
                          }}
                        >
                          <Flex align="center" gap="2">
                            <Text size="4">{action.icon}</Text>
                            <Text size="2">{action.text}</Text>
                          </Flex>
                        </Card>
                      ))}
                    </Grid>
                  </Box>
                ) : (
                  <Box className="messages-list">
                    <AnimatePresence>
                      {messages.map((message, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className={`message ${message.role}`}
                        >
                          <Flex gap="3" align="start">
                            <Avatar
                              size="3"
                              radius="full"
                              fallback={message.role === 'user' ? <PersonIcon /> : <MixIcon />}
                              color={message.role === 'user' ? 'blue' : 'violet'}
                            />
                            <Box className="message-content">
                              <Flex align="center" gap="2" mb="2">
                                <Text size="2" weight="bold">
                                  {message.role === 'user' ? 'You' : 'Research AI'}
                                </Text>
                                {message.timestamp && (
                                  <Text size="1" color="gray">
                                    {new Date(message.timestamp).toLocaleTimeString()}
                                  </Text>
                                )}
                              </Flex>
                              
                              <Card>
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
                                            {children} <ExternalLinkIcon className="inline-icon" />
                                          </Link>
                                        )
                                      }}
                                    >
                                      {message.content}
                                    </ReactMarkdown>
                                  </Box>
                                ) : (
                                  <Text size="3">{message.content}</Text>
                                )}

                                {/* Display images if present */}
                                {message.images && message.images.length > 0 && (
                                  <Grid columns="3" gap="2" mt="3">
                                    {message.images.map((img, imgIdx) => (
                                      <Box
                                        key={imgIdx}
                                        className="message-image"
                                        onClick={() => setSelectedImage(img)}
                                      >
                                        <img
                                          src={img}
                                          alt={`Screenshot ${imgIdx + 1}`}
                                          onError={(e) => {
                                            (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="150"%3E%3Crect fill="%23333" width="200" height="150"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage unavailable%3C/text%3E%3C/svg%3E';
                                          }}
                                        />
                                      </Box>
                                    ))}
                                  </Grid>
                                )}
                              </Card>
                            </Box>
                          </Flex>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {/* Thinking indicator */}
                    {showThinking && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="thinking-indicator"
                      >
                        <Flex gap="3" align="start">
                          <Avatar
                            size="3"
                            radius="full"
                            fallback={<MixIcon />}
                            color="violet"
                          />
                          <Card>
                            <Flex align="center" gap="2">
                              <Spinner size="2" />
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
                    <CrossCircledIcon />
                  </Callout.Icon>
                  <Callout.Text>{error}</Callout.Text>
                </Callout.Root>
              )}

              <Flex gap="2" align="end">
                <TextArea
                  ref={inputRef}
                  placeholder="Ask anything..."
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
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading}
                >
                  <PaperPlaneIcon />
                  Send
                </Button>
              </Flex>
            </Box>
          </Box>

          {/* Sources Panel */}
          <AnimatePresence>
            {showSourcesPanel && sources.length > 0 && (
              <motion.div
                className="sources-panel"
                initial={{ x: 320 }}
                animate={{ x: 0 }}
                exit={{ x: 320 }}
                transition={{ type: 'spring', damping: 20 }}
              >
                <Box className="panel-header">
                  <Heading size="4">Sources</Heading>
                </Box>
                
                <ScrollArea className="sources-list">
                  {sources.map((source, idx) => (
                    <Card key={idx} className="source-card" mb="2">
                      <a href={source.url} target="_blank" rel="noopener noreferrer">
                        <Flex align="center" gap="2" mb="1">
                          <GlobeIcon />
                          <Text size="2" weight="bold">{source.title || source.url}</Text>
                        </Flex>
                        {source.snippet && (
                          <Text size="1" color="gray">{source.snippet}</Text>
                        )}
                      </a>
                    </Card>
                  ))}
                </ScrollArea>
              </motion.div>
            )}
          </AnimatePresence>
        </Flex>

        {/* Image Modal */}
        <Dialog.Root open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
          <Dialog.Content maxWidth="90vw">
            <Dialog.Title>Image View</Dialog.Title>
            {selectedImage && (
              <Box className="modal-image">
                <img src={selectedImage} alt="Full size" />
              </Box>
            )}
            <Flex gap="3" mt="3" justify="end">
              <Dialog.Close>
                <Button variant="soft">Close</Button>
              </Dialog.Close>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>
      </Box>
    </Theme>
  );
};

export default RadixConversationUI;