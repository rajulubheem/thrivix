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
  Reset,
  Code
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
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  ImageIcon,
  CheckIcon,
  Cross2Icon,
  PlusIcon,
  ClockIcon,
  GlobeIcon
} from '@radix-ui/react-icons';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  sources?: Source[];
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
  title?: string;
}

export const ModernConversationResearch: React.FC = () => {
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
  const [screenshots, setScreenshots] = useState<any[]>([]);
  const [searchMode, setSearchMode] = useState<'instant' | 'deep'>('instant');
  const [showThoughts, setShowThoughts] = useState(false);
  const [starredSessions, setStarredSessions] = useState<Set<string>>(new Set());
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const loadSession = async (sid: string) => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/v1/conversation/status/${sid}`);
      if (response.ok) {
        const data = await response.json();
        if (data.messages) {
          setMessages(data.messages);
        }
        if (data.sources) {
          setSources(data.sources);
        }
      }
    } catch (err) {
      console.error('Failed to load session:', err);
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
      
      // Update screenshots
      if (data.screenshots && data.screenshots.length > 0) {
        setScreenshots(data.screenshots);
      }
      
      // Update conversation count
      if (data.conversation_count !== undefined) {
        setConversationCount(data.conversation_count);
      }
      
      // Check if waiting for clarification response
      if (data.awaiting_response) {
        setAwaitingResponse(true);
        setIsLoading(false);
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
    
    setAwaitingResponse(false);
    
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      
      let response;
      if (isNewConversation || !sessionId) {
        response = await fetch(`${apiUrl}/api/v1/conversation/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: userMessage,
            session_id: sessionId,
            mode: searchMode === 'deep' ? 'deep_research' : 'research'
          })
        });
      } else {
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

  const startNewConversation = () => {
    setMessages([]);
    setSessionId(null);
    setSources([]);
    setThoughts([]);
    setScreenshots([]);
    navigate('/conversation');
  };

  const deleteSession = async (sid: string) => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      await fetch(`${apiUrl}/api/v1/conversation/session/${sid}`, {
        method: 'DELETE'
      });
      await loadSessions();
      if (sid === sessionId) {
        startNewConversation();
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const toggleStarred = (sid: string) => {
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

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <Theme>
      <Box style={{ height: '100vh', background: 'var(--color-background)' }}>
        <Grid columns={{ initial: '1fr', md: '280px 1fr 320px' }} gap="0" height="100%">
          
          {/* Sidebar - Sessions */}
          <Box
            style={{
              borderRight: '1px solid var(--gray-a5)',
              height: '100%',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <Flex p="4" justify="between" align="center">
              <Heading size="4">Research</Heading>
              <Tooltip content="New conversation">
                <IconButton
                  size="2"
                  variant="soft"
                  onClick={startNewConversation}
                >
                  <PlusIcon />
                </IconButton>
              </Tooltip>
            </Flex>
            
            <Box px="4" pb="3">
              <SegmentedControl.Root
                defaultValue="instant"
                value={searchMode}
                onValueChange={(value: string) => setSearchMode(value as 'instant' | 'deep')}
              >
                <SegmentedControl.Item value="instant">
                  <MagnifyingGlassIcon />
                  Instant
                </SegmentedControl.Item>
                <SegmentedControl.Item value="deep">
                  <GlobeIcon />
                  Deep Research
                </SegmentedControl.Item>
              </SegmentedControl.Root>
            </Box>

            <ScrollArea style={{ flex: 1 }}>
              <Box p="2">
                {sessions.length === 0 ? (
                  <Box p="4">
                    <Text size="2" color="gray">No conversations yet</Text>
                  </Box>
                ) : (
                  <Flex direction="column" gap="2">
                    {sessions.map((session) => (
                      <Card
                        key={session.session_id}
                        style={{
                          cursor: 'pointer',
                          background: session.session_id === sessionId ? 'var(--accent-a3)' : undefined
                        }}
                        onClick={() => {
                          setSessionId(session.session_id);
                          loadSession(session.session_id);
                          navigate(`/conversation/${session.session_id}`);
                        }}
                      >
                        <Flex justify="between" align="start" gap="2">
                          <Box style={{ flex: 1, minWidth: 0 }}>
                            <Text size="2" weight="medium" style={{ 
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {session.title || `Conversation ${session.conversation_count}`}
                            </Text>
                            <Text size="1" color="gray">
                              {formatTimestamp(session.timestamp)}
                            </Text>
                          </Box>
                          <Flex gap="1">
                            <IconButton
                              size="1"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleStarred(session.session_id);
                              }}
                            >
                              {starredSessions.has(session.session_id) ? 
                                <BookmarkFilledIcon /> : <BookmarkIcon />}
                            </IconButton>
                            <DropdownMenu.Root>
                              <DropdownMenu.Trigger>
                                <IconButton
                                  size="1"
                                  variant="ghost"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <DotsVerticalIcon />
                                </IconButton>
                              </DropdownMenu.Trigger>
                              <DropdownMenu.Content>
                                <DropdownMenu.Item
                                  onClick={() => deleteSession(session.session_id)}
                                >
                                  <TrashIcon />
                                  Delete
                                </DropdownMenu.Item>
                              </DropdownMenu.Content>
                            </DropdownMenu.Root>
                          </Flex>
                        </Flex>
                      </Card>
                    ))}
                  </Flex>
                )}
              </Box>
            </ScrollArea>
          </Box>

          {/* Main Chat Area */}
          <Flex direction="column" height="100%">
            {/* Header */}
            <Flex
              p="4"
              justify="between"
              align="center"
              style={{ borderBottom: '1px solid var(--gray-a5)' }}
            >
              <Flex gap="3" align="center">
                <Badge size="2" color={isLoading ? "orange" : "green"}>
                  {isLoading ? "Researching..." : "Ready"}
                </Badge>
                {conversationCount > 0 && (
                  <Text size="2" color="gray">
                    {conversationCount} messages
                  </Text>
                )}
              </Flex>
              <Flex gap="2">
                <Tooltip content="Show thoughts">
                  <IconButton
                    variant={showThoughts ? "solid" : "soft"}
                    onClick={() => setShowThoughts(!showThoughts)}
                  >
                    <ChatBubbleIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip content="Export conversation">
                  <IconButton variant="soft">
                    <DownloadIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip content="Share">
                  <IconButton variant="soft">
                    <Share2Icon />
                  </IconButton>
                </Tooltip>
              </Flex>
            </Flex>

            {/* Messages Area */}
            <ScrollArea style={{ flex: 1 }}>
              <Container size="3" p="4">
                {messages.length === 0 ? (
                  <Flex direction="column" align="center" justify="center" style={{ minHeight: '400px' }}>
                    <MagnifyingGlassIcon width="48" height="48" style={{ opacity: 0.3, marginBottom: '16px' }} />
                    <Heading size="5" color="gray" mb="2">Start a new research session</Heading>
                    <Text size="3" color="gray" align="center">
                      Ask me anything and I'll search the web to find accurate, up-to-date information.
                    </Text>
                    
                    <Grid columns="3" gap="3" mt="6" width="100%" style={{ maxWidth: '600px' }}>
                      {[
                        "Latest AI developments",
                        "Climate change solutions",
                        "Quantum computing basics",
                        "Best programming practices",
                        "Space exploration news",
                        "Health and wellness tips"
                      ].map((suggestion) => (
                        <Button
                          key={suggestion}
                          variant="soft"
                          size="2"
                          onClick={() => {
                            setInput(suggestion);
                            inputRef.current?.focus();
                          }}
                        >
                          {suggestion}
                        </Button>
                      ))}
                    </Grid>
                  </Flex>
                ) : (
                  <Flex direction="column" gap="4">
                    <AnimatePresence>
                      {messages.map((message, index) => (
                        <motion.div
                          key={`${message.role}-${index}`}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                        >
                          <Flex
                            gap="3"
                            align="start"
                            style={{
                              flexDirection: message.role === 'user' ? 'row-reverse' : 'row'
                            }}
                          >
                            <Avatar
                              size="2"
                              radius="full"
                              fallback={message.role === 'user' ? <PersonIcon /> : <MagnifyingGlassIcon />}
                              color={message.role === 'user' ? 'blue' : 'purple'}
                            />
                            <Box style={{ flex: 1, maxWidth: '80%' }}>
                              <Card>
                                <Flex direction="column" gap="2">
                                  <Flex justify="between" align="center">
                                    <Text size="1" color="gray">
                                      {message.role === 'user' ? 'You' : 'Research Assistant'}
                                    </Text>
                                    {message.timestamp && (
                                      <Text size="1" color="gray">
                                        {formatTimestamp(message.timestamp)}
                                      </Text>
                                    )}
                                  </Flex>
                                  
                                  {message.role === 'assistant' ? (
                                    <Box>
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
                                              <Code {...props}>{children}</Code>
                                            );
                                          },
                                          p: ({children}) => <Text as="p" size="3" style={{ marginBottom: '8px' }}>{children}</Text>,
                                          a: ({href, children}) => (
                                            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-9)' }}>
                                              {children} <ExternalLinkIcon style={{ display: 'inline', verticalAlign: 'middle' }} />
                                            </a>
                                          )
                                        }}
                                      >
                                        {message.content}
                                      </ReactMarkdown>
                                    </Box>
                                  ) : (
                                    <Text size="3">{message.content}</Text>
                                  )}

                                  {message.role === 'assistant' && allMessageSources[index] && (
                                    <Box mt="3">
                                      <Separator size="4" mb="3" />
                                      <Text size="2" weight="medium" mb="2">Sources</Text>
                                      <Flex gap="2" wrap="wrap">
                                        {allMessageSources[index].map((source) => (
                                          <a
                                            key={source.id}
                                            href={source.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ textDecoration: 'none' }}
                                          >
                                            <Badge variant="soft" style={{ cursor: 'pointer' }}>
                                              {source.favicon && (
                                                <img 
                                                  src={source.favicon} 
                                                  alt="" 
                                                  style={{ width: '12px', height: '12px', marginRight: '4px' }}
                                                />
                                              )}
                                              {source.domain}
                                            </Badge>
                                          </a>
                                        ))}
                                      </Flex>
                                    </Box>
                                  )}
                                </Flex>
                              </Card>
                            </Box>
                          </Flex>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {isLoading && (
                      <Flex gap="3" align="start">
                        <Avatar
                          size="2"
                          radius="full"
                          fallback={<MagnifyingGlassIcon />}
                          color="purple"
                        />
                        <Card style={{ flex: 1, maxWidth: '80%' }}>
                          <Flex direction="column" gap="3">
                            <Skeleton>
                              <Text size="3">Searching and analyzing sources...</Text>
                            </Skeleton>
                            <Skeleton>
                              <Text size="3">This might take a few moments while I gather comprehensive information.</Text>
                            </Skeleton>
                          </Flex>
                        </Card>
                      </Flex>
                    )}
                  </Flex>
                )}
                <div ref={messagesEndRef} />
              </Container>
            </ScrollArea>

            {/* Input Area */}
            <Box p="4" style={{ borderTop: '1px solid var(--gray-a5)' }}>
              <Flex gap="2" align="end">
                <TextField.Root
                  ref={inputRef}
                  size="3"
                  placeholder={awaitingResponse ? "Waiting for clarification..." : "Ask anything..."}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  style={{ flex: 1 }}
                  disabled={isLoading}
                />
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
              {searchMode === 'deep' && (
                <Text size="1" color="gray" mt="2">
                  Deep research mode: More thorough analysis with multiple searches
                </Text>
              )}
            </Box>
          </Flex>

          {/* Right Panel - Sources & Thoughts */}
          <Box
            style={{
              borderLeft: '1px solid var(--gray-a5)',
              height: '100%',
              overflow: 'hidden'
            }}
          >
            <Tabs.Root defaultValue="sources">
              <Tabs.List size="2">
                <Tabs.Trigger value="sources">
                  <GlobeIcon />
                  Sources
                </Tabs.Trigger>
                <Tabs.Trigger value="thoughts">
                  <ChatBubbleIcon />
                  Thoughts
                  {thoughts.length > 0 && (
                    <Badge size="1" ml="2">{thoughts.length}</Badge>
                  )}
                </Tabs.Trigger>
                {screenshots.length > 0 && (
                  <Tabs.Trigger value="screenshots">
                    <ImageIcon />
                    Captures
                  </Tabs.Trigger>
                )}
              </Tabs.List>

              <Tabs.Content value="sources">
                <ScrollArea style={{ height: 'calc(100vh - 48px)' }}>
                  <Box p="3">
                    {sources.length === 0 ? (
                      <Text size="2" color="gray">No sources yet</Text>
                    ) : (
                      <Flex direction="column" gap="3">
                        {sources.map((source) => (
                          <Card key={source.id} asChild>
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ textDecoration: 'none', color: 'inherit' }}
                            >
                              <Flex direction="column" gap="2">
                                {source.thumbnail && (
                                  <img 
                                    src={source.thumbnail} 
                                    alt=""
                                    style={{ 
                                      width: '100%', 
                                      height: '120px', 
                                      objectFit: 'cover',
                                      borderRadius: '4px'
                                    }}
                                  />
                                )}
                                <Flex gap="2" align="start">
                                  {source.favicon && (
                                    <img 
                                      src={source.favicon} 
                                      alt=""
                                      style={{ width: '16px', height: '16px', marginTop: '2px' }}
                                    />
                                  )}
                                  <Box style={{ flex: 1 }}>
                                    <Text size="2" weight="medium">
                                      {source.title}
                                    </Text>
                                    <Text size="1" color="gray">
                                      {source.domain}
                                    </Text>
                                    {source.snippet && (
                                      <Text size="1" mt="1">
                                        {source.snippet}
                                      </Text>
                                    )}
                                  </Box>
                                  <ExternalLinkIcon />
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

              <Tabs.Content value="thoughts">
                <ScrollArea style={{ height: 'calc(100vh - 48px)' }}>
                  <Box p="3">
                    {thoughts.length === 0 ? (
                      <Text size="2" color="gray">No thoughts recorded</Text>
                    ) : (
                      <DataList.Root>
                        {thoughts.map((thought, index) => (
                          <DataList.Item key={index}>
                            <DataList.Label>
                              <Badge size="1" variant="soft">
                                {thought.type}
                              </Badge>
                            </DataList.Label>
                            <DataList.Value>
                              <Text size="2">{thought.content}</Text>
                            </DataList.Value>
                          </DataList.Item>
                        ))}
                      </DataList.Root>
                    )}
                  </Box>
                </ScrollArea>
              </Tabs.Content>

              {screenshots.length > 0 && (
                <Tabs.Content value="screenshots">
                  <ScrollArea style={{ height: 'calc(100vh - 48px)' }}>
                    <Box p="3">
                      <Grid columns="1" gap="3">
                        {screenshots.map((screenshot, index) => (
                          <Card key={index}>
                            <img 
                              src={screenshot.data || screenshot}
                              alt={`Screenshot ${index + 1}`}
                              style={{ width: '100%', borderRadius: '4px' }}
                            />
                            {screenshot.url && (
                              <Text size="1" color="gray" mt="2">
                                {screenshot.url}
                              </Text>
                            )}
                          </Card>
                        ))}
                      </Grid>
                    </Box>
                  </ScrollArea>
                </Tabs.Content>
              )}
            </Tabs.Root>
          </Box>
        </Grid>
      </Box>
    </Theme>
  );
};