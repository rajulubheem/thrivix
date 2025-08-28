import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  List,
  ListItem,
  ListItemButton,
  Drawer,
  IconButton,
  Chip,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Card,
  CardContent,
  Tooltip,
} from '@mui/material';
import {
  Send as SendIcon,
  Menu as MenuIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  SmartToy as BotIcon,
  Person as PersonIcon,
  Psychology as PsychologyIcon,
  Handshake as HandshakeIcon,
  Build as BuildIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: any;
}

interface ChatSession {
  id: number;
  session_id: string;
  title: string;
  description?: string;
  created_at: string;
  message_count: number;
}

interface SwarmEvent {
  type: string;
  timestamp?: string;
  agent?: string;
  tool?: string;
  message?: string;
  output?: string;
  error?: string;
  [key: string]: any;
}

const TrueSwarmChat: React.FC = () => {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [taskType, setTaskType] = useState<'general' | 'research' | 'coding'>('general');
  const [swarmMode, setSwarmMode] = useState<'dynamic' | 'fixed'>('dynamic');
  const [swarmEvents, setSwarmEvents] = useState<SwarmEvent[]>([]);
  const [isSwarmRunning, setIsSwarmRunning] = useState(false);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  // Load specific session when sessionId changes
  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
      loadMessages(sessionId);
    }
  }, [sessionId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, swarmEvents]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadSessions = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/v1/true-swarm/sessions`);
      setSessions(response.data);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const loadSession = async (sessionId: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/v1/true-swarm/sessions/${sessionId}`);
      setCurrentSession(response.data);
      // Set task type from session config if available
      if (response.data.agents_config?.task_type) {
        setTaskType(response.data.agents_config.task_type);
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  };

  const loadMessages = async (sessionId: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/v1/true-swarm/sessions/${sessionId}/messages`);
      const formattedMessages = response.data.messages.map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.created_at,
        metadata: msg.message_metadata,
      }));
      setMessages(formattedMessages);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const createNewSession = async () => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/v1/true-swarm/sessions`, {
        title: `True Swarm Chat ${new Date().toLocaleString()}`,
        description: 'Autonomous agent collaboration with True Strands Swarm',
        agents_config: {
          type: 'true_swarm',
          task_type: taskType,
        },
      });
      
      const newSession = response.data;
      setSessions([newSession, ...sessions]);
      navigate(`/true-swarm/${newSession.session_id}`);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const deleteSession = async (sessionIdToDelete: string) => {
    try {
      await axios.delete(`${API_BASE_URL}/api/v1/true-swarm/sessions/${sessionIdToDelete}`);
      setSessions(sessions.filter(s => s.session_id !== sessionIdToDelete));
      if (sessionId === sessionIdToDelete) {
        navigate('/true-swarm');
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || !sessionId || isSwarmRunning) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages([...messages, userMessage]);
    setInputMessage('');
    setIsSwarmRunning(true);
    setSwarmEvents([]);

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Create POST request body
    const requestBody = {
      message: inputMessage,
      task_type: taskType,
      swarm_mode: swarmMode,
      max_handoffs: swarmMode === 'dynamic' ? 30 : 10,
      max_iterations: swarmMode === 'dynamic' ? 50 : 20,
    };

    // Use fetch with streaming response
    fetch(`${API_BASE_URL}/api/v1/true-swarm/sessions/${sessionId}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: abortController.signal,
    })
      .then(response => {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) throw new Error('No reader available');

        const readStream = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  
                  // Add event to swarm events
                  setSwarmEvents(prev => [...prev, data]);

                  // Handle different event types
                  if (data.type === 'complete') {
                    console.log('Complete event received:', data);
                    const output = data.output || 'Task completed';
                    console.log('Output length:', output.length);
                    const assistantMessage: ChatMessage = {
                      id: Date.now().toString(),
                      role: 'assistant',
                      content: output,
                      timestamp: new Date().toISOString(),
                      metadata: data,
                    };
                    setMessages(prev => [...prev, assistantMessage]);
                    setIsSwarmRunning(false);
                  } else if (data.type === 'done') {
                    // Final done event - swarm execution finished
                    console.log('Done event received');
                    setIsSwarmRunning(false);
                  } else if (data.type === 'error') {
                    console.error('Swarm error:', data.error);
                    setIsSwarmRunning(false);
                  }
                } catch (error) {
                  console.error('Failed to parse event:', error);
                }
              }
            }
          }
        };

        readStream().catch(error => {
          console.error('Stream reading error:', error);
          setIsSwarmRunning(false);
        });
      })
      .catch(error => {
        console.error('Fetch error:', error);
        setIsSwarmRunning(false);
      });
  };

  const renderSwarmEvent = (event: SwarmEvent) => {
    const getEventIcon = () => {
      switch (event.type) {
        case 'swarm_init':
        case 'swarm_planning':
        case 'swarm_ready':
          return <PsychologyIcon />;
        case 'agent_created':
        case 'agent_active':
        case 'agent_thinking':
        case 'agent_planning':
          return <PsychologyIcon color="primary" />;
        case 'agent_completed':
          return <CheckIcon color="success" />;
        case 'handoff':
          return <HandshakeIcon color="secondary" />;
        case 'tool_call':
        case 'tool_invocation':
        case 'tool_execution':
          return <BuildIcon color="action" />;
        case 'tool_result':
          return event.status === 'success' ? <CheckIcon color="success" /> : <ErrorIcon color="error" />;
        case 'execution_started':
          return <InfoIcon color="primary" />;
        case 'status_update':
          return <InfoIcon />;
        case 'complete':
          return <CheckIcon color="success" />;
        case 'error':
          return <ErrorIcon color="error" />;
        default:
          return <InfoIcon />;
      }
    };

    const getEventColor = () => {
      switch (event.type) {
        case 'agent_active':
        case 'agent_thinking':
        case 'agent_planning': return 'primary';
        case 'agent_completed': return 'success';
        case 'handoff': return 'secondary';
        case 'tool_call':
        case 'tool_invocation':
        case 'tool_execution': return 'default';
        case 'tool_result': return event.status === 'success' ? 'success' : 'error';
        case 'complete': return 'success';
        case 'error': return 'error';
        default: return 'default';
      }
    };

    const getEventLabel = () => {
      switch (event.type) {
        // Dynamic swarm events
        case 'task_analysis':
          const reqs = event.requirements;
          if (reqs) {
            const needs = Object.entries(reqs)
              .filter(([k, v]) => k.startsWith('needs_') && v)
              .map(([k]) => k.replace('needs_', ''));
            return `🔍 Task analysis: Detected requirements for ${needs.join(', ')}`;
          }
          return '🔍 Analyzing task requirements...';
        case 'creating_agents':
          return '🏗️ Creating specialized agent teams based on task...';
        case 'swarm_init':
          if (event.agent_count) {
            return `🚀 Dynamic swarm created with ${event.agent_count} specialized agents`;
          }
          return `🚀 Swarm initialized with ${event.agents?.length} agents: ${event.agents?.join(', ')}`;
        case 'swarm_planning':
          return `📋 Planning: ${event.message}`;
        case 'swarm_ready':
          return event.message || '✅ Swarm ready to execute';
        case 'agent_created':
          if (event.reason) {
            return `🤖 ${event.agent} created (${event.role}) - ${event.reason}`;
          }
          return `🤖 ${event.agent} created (${event.role}) with tools: ${event.tools?.join(', ')}`;
        case 'agent_active':
          return `👁 ${event.agent} is now active ${event.iteration ? `(iteration ${event.iteration})` : ''}`;
        case 'agent_thinking':
          return `🤔 ${event.agent || 'Agent'}: ${event.message || 'thinking...'}`;
        case 'agent_planning':
          return `📝 ${event.agent} is planning next steps`;
        case 'agent_completed':
          return `✅ ${event.agent} completed its task`;
        case 'handoff':
          if (event.from_agent && event.to_agent) {
            return `🤝 Handoff: ${event.from_agent} → ${event.to_agent}`;
          }
          return `🤝 ${event.message || 'Agent handoff occurring'}`;
        case 'tool_invocation':
          return `🔧 ${event.agent} invoking tool #${event.tool_number}: ${event.tool}`;
        case 'tool_execution':
          return `⚙️ Executing ${event.tool}: ${JSON.stringify(event.params || {}).substring(0, 100)}`;
        case 'tool_result':
          if (event.status === 'success') {
            return `✅ ${event.tool} succeeded${event.summary ? `: ${event.summary}` : ''}`;
          } else {
            return `❌ ${event.tool} failed: ${event.error}`;
          }
        case 'execution_started':
          return '🏁 Swarm execution started';
        case 'status':
        case 'status_update':
          return null; // Don't show status updates
        case 'heartbeat':
          return null; // Don't show heartbeats
        case 'complete':
          if (event.agents_used) {
            return `🎉 Swarm completed with ${event.agents_used} agents`;
          }
          return `🎉 Swarm completed${event.summary?.total_iterations ? ` (${event.summary.total_iterations} iterations)` : ''}`;
        case 'done':
          return null; // Don't show done events in the UI
        case 'error':
          return `❌ Error: ${event.error}`;
        default:
          return event.message || event.type;
      }
    };

    const label = getEventLabel();
    if (!label) return null;

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        {getEventIcon()}
        <Chip
          label={label}
          size="small"
          color={getEventColor()}
          variant="outlined"
          sx={{ maxWidth: '100%' }}
        />
      </Box>
    );
  };

  return (
    <Container maxWidth={false} sx={{ height: '100vh', display: 'flex', p: 0 }}>
      {/* Sessions Drawer */}
      <Drawer
        variant="persistent"
        anchor="left"
        open={drawerOpen}
        sx={{
          width: drawerOpen ? 300 : 0,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: 300,
            boxSizing: 'border-box',
            position: 'relative',
            height: '100%',
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            True Swarm Sessions
          </Typography>
          <Button
            fullWidth
            variant="contained"
            startIcon={<AddIcon />}
            onClick={createNewSession}
            sx={{ mb: 2 }}
          >
            New Swarm Chat
          </Button>
          
          <FormControl fullWidth size="small" sx={{ mb: 1 }}>
            <InputLabel>Swarm Mode</InputLabel>
            <Select
              value={swarmMode}
              onChange={(e) => setSwarmMode(e.target.value as any)}
              label="Swarm Mode"
            >
              <MenuItem value="dynamic">Dynamic (Auto-create agents)</MenuItem>
              <MenuItem value="fixed">Fixed (Predefined agents)</MenuItem>
            </Select>
          </FormControl>
          
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>Task Type</InputLabel>
            <Select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as any)}
              label="Task Type"
              disabled={swarmMode === 'dynamic'}
            >
              <MenuItem value="general">General</MenuItem>
              <MenuItem value="research">Research</MenuItem>
              <MenuItem value="coding">Coding</MenuItem>
            </Select>
          </FormControl>

          <Divider sx={{ mb: 2 }} />
          
          <List>
            {sessions.map((session) => (
              <ListItem key={session.session_id} disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={sessionId === session.session_id}
                  onClick={() => navigate(`/true-swarm/${session.session_id}`)}
                  sx={{ borderRadius: 1 }}
                >
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="body2" noWrap>
                      {session.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {session.message_count} messages
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(session.session_id);
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>

      {/* Main Chat Area */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={() => setDrawerOpen(!drawerOpen)}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h5" sx={{ flexGrow: 1 }}>
            True Strands Swarm
          </Typography>
          <Chip
            icon={<PsychologyIcon />}
            label="Autonomous Collaboration"
            color="primary"
            variant="outlined"
          />
        </Paper>

        {/* Messages Area */}
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
          {!sessionId ? (
            <Alert severity="info">
              Select a session or create a new one to start chatting with the True Swarm
            </Alert>
          ) : (
            <>
              {messages.map((message) => (
                <Card
                  key={message.id}
                  sx={{
                    mb: 2,
                    ml: message.role === 'user' ? 'auto' : 0,
                    mr: message.role === 'assistant' ? 'auto' : 0,
                    maxWidth: '70%',
                    bgcolor: message.role === 'user' ? 'primary.50' : 'grey.50',
                  }}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      {message.role === 'user' ? <PersonIcon /> : <BotIcon />}
                      <Typography variant="subtitle2" color="text.secondary">
                        {message.role === 'user' ? 'You' : 'Swarm'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </Typography>
                    </Box>
                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                      {message.content}
                    </Typography>
                    {message.metadata?.agents && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          Agents: {message.metadata.agents.join(', ')}
                        </Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              ))}

              {/* Swarm Events */}
              {swarmEvents.length > 0 && (
                <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Swarm Activity
                  </Typography>
                  {swarmEvents.map((event, index) => (
                    <React.Fragment key={index}>
                      {renderSwarmEvent(event)}
                    </React.Fragment>
                  ))}
                  {isSwarmRunning && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                      <CircularProgress size={16} />
                      <Typography variant="caption">Swarm working...</Typography>
                    </Box>
                  )}
                </Paper>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </Box>

        {/* Input Area */}
        {sessionId && (
          <Paper sx={{ p: 2, display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Ask the swarm..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              disabled={isSwarmRunning}
              multiline
              maxRows={4}
            />
            <Button
              variant="contained"
              endIcon={<SendIcon />}
              onClick={sendMessage}
              disabled={!inputMessage.trim() || isSwarmRunning}
            >
              Send
            </Button>
          </Paper>
        )}
      </Box>
    </Container>
  );
};

export default TrueSwarmChat;