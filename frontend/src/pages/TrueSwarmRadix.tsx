/**
 * True Swarm Chat - Radix UI Implementation
 * Multi-agent collaboration with detailed timeline and parallel task visualization
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import * as Collapsible from '@radix-ui/react-collapsible';
import * as Progress from '@radix-ui/react-progress';
import * as Separator from '@radix-ui/react-separator';
import * as Avatar from '@radix-ui/react-avatar';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  Button,
  Card,
  Flex,
  Text,
  TextArea,
  Box,
  Container,
  Heading,
  IconButton,
  Theme,
  Badge
} from '@radix-ui/themes';
import {
  Send,
  Bot,
  User,
  Brain,
  Code,
  Search,
  FileText,
  GitBranch,
  Zap,
  Clock,
  CheckCircle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronRight,
  Layers,
  Activity,
  Cpu,
  Network,
  Package,
  Target,
  Shuffle,
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Minimize2,
  Settings,
  Plus,
  X,
  Eye,
  EyeOff,
  Trash2
} from 'lucide-react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import './TrueSwarmRadix.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Types
interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'thinking' | 'working' | 'complete' | 'error';
  expertise: string[];
  currentTask?: string;
  toolsUsed: string[];
  startTime?: string;
  endTime?: string;
  tokenCount?: number;
}

interface SwarmEvent {
  id: string;
  timestamp: string;
  type: 'handoff' | 'tool_use' | 'thinking' | 'result' | 'error' | 'parallel_start' | 'parallel_end';
  agentId: string;
  agentName: string;
  message: string;
  details?: any;
  toolName?: string;
  targetAgent?: string;
  parallel?: boolean;
  groupId?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  agentName?: string;
  events?: SwarmEvent[];
  thinking?: string[];
  metadata?: any;
}

interface Session {
  id?: number;
  session_id: string;
  title: string;
  description?: string;
  created_at: string;
  message_count: number;
  agents_config?: any;
}

// Agent configurations with better prompts
const AGENT_CONFIGS = {
  orchestrator: {
    name: 'Orchestrator',
    role: 'Task Planning & Coordination',
    expertise: ['task decomposition', 'agent coordination', 'parallel execution'],
    prompt: `You are the Orchestrator Agent - the strategic coordinator of our multi-agent swarm.

Your responsibilities:
1. Analyze complex tasks and decompose them into parallel and sequential sub-tasks
2. Identify which agents should work on each sub-task based on their expertise
3. Coordinate parallel execution when tasks are independent
4. Monitor progress and adjust strategy as needed
5. Synthesize results from multiple agents into cohesive outputs

When analyzing tasks:
- Break down complex problems into clear, actionable components
- Identify dependencies between tasks
- Determine what can be done in parallel vs sequentially
- Consider agent expertise when assigning tasks
- Plan for verification and quality assurance steps

Use deep thinking to create comprehensive execution plans.`
  },
  researcher: {
    name: 'Researcher',
    role: 'Information Gathering & Analysis',
    expertise: ['web search', 'data analysis', 'fact verification', 'source validation'],
    prompt: `You are the Research Agent - the information specialist of our swarm.

Your capabilities:
1. Conduct thorough web searches across multiple sources
2. Analyze and synthesize information from various sources
3. Verify facts and validate source credibility
4. Extract key insights and patterns from data
5. Provide comprehensive research summaries with citations

When researching:
- Use multiple search queries to gather comprehensive information
- Cross-reference facts across sources
- Identify conflicting information and resolve discrepancies
- Prioritize authoritative and recent sources
- Provide clear citations for all claims

Think deeply about the research context and information quality.`
  },
  architect: {
    name: 'Architect',
    role: 'System Design & Architecture',
    expertise: ['system design', 'architecture patterns', 'scalability', 'best practices'],
    prompt: `You are the Architecture Agent - the system design expert of our swarm.

Your responsibilities:
1. Design robust and scalable system architectures
2. Select appropriate technology stacks and frameworks
3. Define clear component interfaces and data flows
4. Consider security, performance, and maintainability
5. Document architectural decisions and trade-offs

When designing systems:
- Start with high-level architecture before diving into details
- Consider both functional and non-functional requirements
- Apply appropriate design patterns and principles
- Plan for future scalability and maintenance
- Provide clear diagrams and documentation

Think systematically about design decisions and their implications.`
  },
  developer: {
    name: 'Developer',
    role: 'Code Implementation',
    expertise: ['coding', 'debugging', 'testing', 'optimization'],
    prompt: `You are the Developer Agent - the coding specialist of our swarm.

Your capabilities:
1. Write clean, efficient, and maintainable code
2. Implement algorithms and data structures
3. Debug and fix issues in existing code
4. Write comprehensive tests
5. Optimize performance and resource usage

When coding:
- Follow best practices and coding standards
- Write self-documenting code with clear naming
- Include appropriate error handling and validation
- Consider edge cases and boundary conditions
- Add helpful comments for complex logic

Think carefully about code quality, efficiency, and maintainability.`
  },
  reviewer: {
    name: 'Reviewer',
    role: 'Quality Assurance & Review',
    expertise: ['code review', 'testing', 'security audit', 'documentation'],
    prompt: `You are the Review Agent - the quality assurance specialist of our swarm.

Your responsibilities:
1. Review code for bugs, security issues, and best practices
2. Verify implementation meets requirements
3. Check for proper error handling and edge cases
4. Ensure adequate test coverage
5. Review documentation completeness and clarity

When reviewing:
- Systematically check for common issues and anti-patterns
- Verify security best practices are followed
- Ensure code is readable and maintainable
- Check for proper resource management
- Validate that all requirements are met

Think critically about potential issues and improvements.`
  },
  analyst: {
    name: 'Analyst',
    role: 'Data Analysis & Insights',
    expertise: ['data analysis', 'visualization', 'statistics', 'reporting'],
    prompt: `You are the Analyst Agent - the data insights specialist of our swarm.

Your capabilities:
1. Analyze complex datasets and identify patterns
2. Perform statistical analysis and hypothesis testing
3. Create meaningful visualizations
4. Generate actionable insights and recommendations
5. Produce comprehensive analytical reports

When analyzing:
- Start with exploratory data analysis
- Apply appropriate statistical methods
- Look for trends, patterns, and anomalies
- Consider multiple perspectives and interpretations
- Present findings clearly with supporting evidence

Think analytically about data relationships and implications.`
  }
};

const TrueSwarmRadix: React.FC = () => {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // State
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [events, setEvents] = useState<SwarmEvent[]>([]);
  const [selectedMode, setSelectedMode] = useState('dynamic');
  const [taskComplexity, setTaskComplexity] = useState('balanced');
  const [showTimeline, setShowTimeline] = useState(true);
  const [showAgentDetails, setShowAgentDetails] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [parallelTasks, setParallelTasks] = useState<Map<string, SwarmEvent[]>>(new Map());

  // Initialize agents
  useEffect(() => {
    const initialAgents = Object.entries(AGENT_CONFIGS).map(([id, config]) => ({
      id,
      name: config.name,
      role: config.role,
      expertise: config.expertise,
      status: 'idle' as const,
      toolsUsed: []
    }));
    setAgents(initialAgents);
  }, []);

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

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Session management functions
  const loadSessions = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/true-swarm/sessions`);
      if (!response.ok) {
        console.error('Failed to load sessions:', response.status, response.statusText);
        setSessions([]);
        return;
      }
      const data = await response.json();
      console.log('Sessions API response:', data); // Debug log
      // Handle both array response and object with sessions property
      const sessionsArray = Array.isArray(data) ? data : (data.sessions || data.items || []);
      setSessions(Array.isArray(sessionsArray) ? sessionsArray : []);
    } catch (error) {
      console.error('Failed to load sessions:', error);
      setSessions([]);
    }
  };

  const loadSession = async (sessionId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/true-swarm/sessions/${sessionId}`);
      const data = await response.json();
      setCurrentSession(data);
      // Set task type from session config if available
      if (data.agents_config?.task_type) {
        setSelectedMode(data.agents_config.task_type);
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  };

  const loadMessages = async (sessionId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/true-swarm/sessions/${sessionId}/messages`);
      const data = await response.json();
      const formattedMessages = data.messages.map((msg: any) => ({
        id: msg.id || Date.now().toString(),
        role: msg.role,
        content: msg.content,
        timestamp: msg.created_at || new Date().toISOString(),
        metadata: msg.message_metadata,
        thinking: msg.thinking || [],
        events: msg.events || []
      }));
      setMessages(formattedMessages);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const createNewSession = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/true-swarm/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `True Swarm Chat ${new Date().toLocaleString()}`,
          description: 'Autonomous agent collaboration with True Strands Swarm',
          agents_config: {
            type: 'true_swarm',
            task_type: selectedMode,
          },
        }),
      });
      
      const newSession = await response.json();
      setSessions([newSession, ...(sessions || [])]);
      navigate(`/true-swarm/${newSession.session_id}`);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const deleteSession = async (sessionIdToDelete: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/v1/true-swarm/sessions/${sessionIdToDelete}`, {
        method: 'DELETE'
      });
      setSessions((sessions || []).filter((s: Session) => s.session_id !== sessionIdToDelete));
      if (sessionId === sessionIdToDelete) {
        navigate('/true-swarm');
        setMessages([]);
        setCurrentSession(null);
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  // Generate swarm prompt based on complexity
  const generateSwarmPrompt = (userMessage: string) => {
    const complexityPrompts = {
      simple: `Process this request efficiently: ${userMessage}`,
      balanced: `Analyze and execute this task with appropriate depth: ${userMessage}

Consider:
- Breaking down the task into logical components
- Using parallel execution where appropriate
- Ensuring comprehensive coverage of requirements`,
      deep: `Perform deep analysis and comprehensive execution of: ${userMessage}

Requirements:
- Thoroughly analyze all aspects of the request
- Decompose into parallel and sequential sub-tasks
- Use multiple agents with specialized expertise
- Cross-verify results and ensure high quality
- Provide detailed reasoning and documentation
- Consider edge cases and alternative approaches`
    };

    return complexityPrompts[taskComplexity as keyof typeof complexityPrompts] || complexityPrompts.balanced;
  };

  // Handle message submission
  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);
    setEvents([]);
    setParallelTasks(new Map());

    // Add user message
    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...(prev || []), newMessage]);

    // Ensure we have a session
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/true-swarm/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `True Swarm Chat ${new Date().toLocaleString()}`,
            description: 'Autonomous agent collaboration with True Strands Swarm',
            agents_config: {
              type: 'true_swarm',
              task_type: selectedMode === 'research' ? 'research' : selectedMode === 'coding' ? 'coding' : 'general',
            },
          }),
        });
        const newSession = await response.json();
        currentSessionId = newSession.session_id;
        navigate(`/true-swarm/${currentSessionId}`);
        setSessions(prev => [newSession, ...(prev || [])]);
        setCurrentSession(newSession);
      } catch (error) {
        console.error('Failed to create session:', error);
        setIsLoading(false);
        return;
      }
    }

    try {
      // Use fetch with streaming response for true-swarm endpoint
      const response = await fetch(`${API_BASE_URL}/api/v1/true-swarm/sessions/${currentSessionId}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: generateSwarmPrompt(userMessage),
          task_type: selectedMode === 'research' ? 'research' : selectedMode === 'coding' ? 'coding' : 'general',
          swarm_mode: taskComplexity === 'simple' ? 'fixed' : 'dynamic'
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                handleSwarmEvent(data);
                
                // Handle completion
                if (data.type === 'complete' || data.type === 'final_response') {
                  console.log('Complete event received:', data); // Debug log
                  const outputContent = data.output || data.result || data.content || 'Task completed successfully.';
                  console.log('Output content:', outputContent); // Debug log
                  
                  const assistantMessage: Message = {
                    id: Date.now().toString(),
                    role: 'assistant',
                    content: outputContent,
                    timestamp: new Date().toISOString(),
                    events: events,
                    metadata: data.metadata || {
                      agents_used: data.agents_used,
                      tools_used: data.tools_used,
                      execution_id: data.execution_id,
                      status: data.status
                    }
                  };
                  setMessages(prev => [...(prev || []), assistantMessage]);
                  setIsLoading(false);
                }
                
                // Handle done event (end of stream)
                if (data.type === 'done') {
                  setIsLoading(false);
                }
              } catch (e) {
                console.error('Failed to parse SSE data:', e);
              }
            }
          }
        }
      }
      setIsLoading(false);
    } catch (error) {
      console.error('Error:', error);
      setIsLoading(false);
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Failed to connect to the swarm service. Please check your connection and try again.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...(prev || []), errorMessage]);
    }
  };

  // Handle swarm events
  const handleSwarmEvent = (data: any) => {
    // Create a proper message based on event type
    let eventMessage = data.message || '';
    let agentName = data.agent || data.agent_name || 'System';
    
    // Parse different event types
    switch (data.type) {
      case 'start':
        eventMessage = `Starting execution (ID: ${data.execution_id})`;
        break;
      case 'task_analysis':
        eventMessage = data.message || `Task analysis: ${data.primary_focus} with ${data.complexity} complexity`;
        break;
      case 'swarm_init':
        eventMessage = data.message || `Initializing swarm with ${data.agent_count} agents`;
        break;
      case 'agent_created':
        agentName = data.agent;
        eventMessage = `Agent created: ${data.role || 'Unknown role'}`;
        break;
      case 'tool_execution':
        eventMessage = `Executing ${data.tool}: ${data.params?.query || JSON.stringify(data.params || {})}`;
        break;
      case 'tool_result':
        eventMessage = `Tool ${data.tool} completed with ${data.results_count || 0} results`;
        break;
      case 'status':
        eventMessage = data.message || 'Processing...';
        break;
      case 'complete':
        eventMessage = `Task completed (${data.agents_used || 0} agents, ${data.tools_used || 0} tools used)`;
        break;
      case 'error':
        eventMessage = `Error: ${data.error || 'Unknown error'}`;
        break;
      default:
        eventMessage = data.message || `${data.type} event`;
    }

    const event: SwarmEvent = {
      id: Date.now().toString() + Math.random(),
      timestamp: data.timestamp || new Date().toISOString(),
      type: data.type,
      agentId: data.agent || data.agent_id || 'system',
      agentName: agentName,
      message: eventMessage,
      details: data,
      toolName: data.tool,
      targetAgent: data.target_agent,
      parallel: data.parallel,
      groupId: data.group_id
    };

    setEvents(prev => [...(prev || []), event]);

    // Update agent status based on events
    if (data.agent || data.agent_id) {
      const agentId = data.agent || data.agent_id;
      setAgents(prev => (prev || []).map(agent => {
        // Match agent by name or id
        if (agent.id === agentId || agent.name.toLowerCase().includes(agentId.toLowerCase().replace('_', ' '))) {
          let status: Agent['status'] = agent.status;
          
          // Update status based on event type
          if (data.type === 'agent_created') status = 'idle';
          else if (data.type === 'tool_execution') status = 'working';
          else if (data.type === 'tool_result') status = 'idle';
          else if (data.type === 'thinking') status = 'thinking';
          else if (data.type === 'complete') status = 'complete';
          else if (data.type === 'error') status = 'error';

          // Update tools used
          const toolsUsed = data.tool && !agent.toolsUsed.includes(data.tool) 
            ? [...agent.toolsUsed, data.tool] 
            : agent.toolsUsed;

          return {
            ...agent,
            status,
            currentTask: event.message,
            toolsUsed
          };
        }
        return agent;
      }));
    }

    // Track parallel tasks
    if (event.parallel && event.groupId) {
      const groupId = event.groupId; // Store in variable to help TypeScript
      setParallelTasks(prev => {
        const map = new Map(prev || new Map());
        const group = map.get(groupId) || [];
        map.set(groupId, [...group, event]);
        return map;
      });
    }
  };

  // Render agent status badge
  const getAgentStatusBadge = (status: Agent['status']) => {
    const configs = {
      idle: { color: 'gray', icon: <Clock size={12} /> },
      thinking: { color: 'blue', icon: <Brain size={12} /> },
      working: { color: 'amber', icon: <Cpu size={12} /> },
      complete: { color: 'green', icon: <CheckCircle size={12} /> },
      error: { color: 'red', icon: <AlertCircle size={12} /> }
    };

    const config = configs[status];
    return (
      <Badge color={config.color as any}>
        <Flex align="center" gap="1">
          {config.icon}
          <Text size="1">{status}</Text>
        </Flex>
      </Badge>
    );
  };

  // Render timeline event
  const renderTimelineEvent = (event: SwarmEvent) => {
    const getEventIcon = () => {
      switch (event.type) {
        case 'handoff': return <Shuffle size={14} />;
        case 'tool_use': return <Package size={14} />;
        case 'thinking': return <Brain size={14} />;
        case 'result': return <CheckCircle size={14} />;
        case 'error': return <AlertCircle size={14} />;
        case 'parallel_start': return <GitBranch size={14} />;
        case 'parallel_end': return <GitBranch size={14} />;
        default: return <Info size={14} />;
      }
    };

    const getEventColor = () => {
      switch (event.type) {
        case 'handoff': return 'violet';
        case 'tool_use': return 'blue';
        case 'thinking': return 'amber';
        case 'result': return 'green';
        case 'error': return 'red';
        default: return 'gray';
      }
    };

    return (
      <Box className="timeline-event" key={event.id}>
        <Flex align="start" gap="3">
          <Box className={`timeline-icon ${getEventColor()}`}>
            {getEventIcon()}
          </Box>
          <Box style={{ flex: 1 }}>
            <Flex align="center" gap="2" mb="1">
              <Text size="2" weight="medium">{event.agentName}</Text>
              {event.parallel && (
                <Badge size="1" color="violet">
                  Parallel
                </Badge>
              )}
              <Text size="1" color="gray">
                {new Date(event.timestamp).toLocaleTimeString()}
              </Text>
            </Flex>
            <Text size="2" color="gray">
              {event.message}
            </Text>
            {event.toolName && (
              <Flex align="center" gap="1" mt="1">
                <Package size={12} />
                <Text size="1" color="blue">
                  {event.toolName}
                </Text>
              </Flex>
            )}
            {event.targetAgent && (
              <Flex align="center" gap="1" mt="1">
                <Shuffle size={12} />
                <Text size="1" color="violet">
                  → {event.targetAgent}
                </Text>
              </Flex>
            )}
          </Box>
        </Flex>
      </Box>
    );
  };

  return (
    <Theme appearance="dark" accentColor="violet" radius="medium">
      <Box className="swarm-container">
        <Flex className="swarm-layout" gap="0">
          {/* Sidebar - Sessions and Agents */}
          {showAgentDetails && (
            <Box className="agents-sidebar">
              <Tabs.Root defaultValue="sessions" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Tabs.List style={{ padding: '0.5rem', borderBottom: '1px solid var(--gray-a5)' }}>
                  <Tabs.Trigger value="sessions" style={{ flex: 1 }}>Sessions</Tabs.Trigger>
                  <Tabs.Trigger value="agents" style={{ flex: 1 }}>Agents</Tabs.Trigger>
                </Tabs.List>
                
                {/* Sessions Tab */}
                <Tabs.Content value="sessions" style={{ flex: 1, overflow: 'hidden' }}>
                  <Box className="sidebar-header">
                    <Flex justify="between" align="center">
                      <Heading size="3">Sessions</Heading>
                      <Button size="1" variant="soft" onClick={createNewSession}>
                        <Plus size={14} />
                        New
                      </Button>
                    </Flex>
                  </Box>
                  <ScrollArea.Root className="agents-list">
                    <ScrollArea.Viewport>
                      {(sessions || []).map((session: Session) => (
                        <Card 
                          key={session.session_id} 
                          className={`agent-card ${session.session_id === sessionId ? 'active' : ''}`} 
                          mb="2"
                          onClick={() => navigate(`/true-swarm/${session.session_id}`)}
                          style={{ cursor: 'pointer' }}
                        >
                          <Flex direction="column" gap="2">
                            <Flex justify="between" align="center">
                              <Text size="2" weight="medium">{session.title}</Text>
                              <IconButton 
                                size="1" 
                                variant="ghost" 
                                color="red"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteSession(session.session_id);
                                }}
                              >
                                <Trash2 size={14} />
                              </IconButton>
                            </Flex>
                            <Text size="1" color="gray">{session.message_count || 0} messages</Text>
                            <Text size="1" color="gray">
                              {new Date(session.created_at).toLocaleDateString()}
                            </Text>
                          </Flex>
                        </Card>
                      ))}
                      {(sessions || []).length === 0 && (
                        <Text size="2" color="gray" style={{ textAlign: 'center', padding: '1rem' }}>
                          No sessions yet. Create one to start!
                        </Text>
                      )}
                    </ScrollArea.Viewport>
                    <ScrollArea.Scrollbar orientation="vertical">
                      <ScrollArea.Thumb />
                    </ScrollArea.Scrollbar>
                  </ScrollArea.Root>
                </Tabs.Content>
                
                {/* Agents Tab */}
                <Tabs.Content value="agents" style={{ flex: 1, overflow: 'hidden' }}>
                  <Box className="sidebar-header">
                    <Heading size="3">Agent Swarm</Heading>
                    <Text size="2" color="gray">
                      {agents.filter(a => a.status !== 'idle').length} active
                    </Text>
                  </Box>
                  <ScrollArea.Root className="agents-list">
                    <ScrollArea.Viewport>
                      {agents.map(agent => (
                        <Card key={agent.id} className="agent-card" mb="2">
                          <Flex direction="column" gap="2">
                            <Flex justify="between" align="center">
                              <Flex align="center" gap="2">
                                <Avatar.Root className="agent-avatar">
                                  <Avatar.Fallback>
                                    {agent.name[0]}
                                  </Avatar.Fallback>
                                </Avatar.Root>
                                <Box>
                                  <Text size="2" weight="bold">{agent.name}</Text>
                                  <Text size="1" color="gray">{agent.role}</Text>
                                </Box>
                              </Flex>
                              {getAgentStatusBadge(agent.status)}
                            </Flex>
                            
                            {agent.currentTask && (
                              <Box className="agent-task">
                                <Text size="1">{agent.currentTask}</Text>
                              </Box>
                            )}
                            
                            {agent.toolsUsed.length > 0 && (
                              <Flex gap="1" wrap="wrap">
                                {agent.toolsUsed.map((tool, i) => (
                                  <Badge key={i} size="1" variant="soft">
                                    {tool}
                                  </Badge>
                                ))}
                              </Flex>
                            )}
                            
                            <Flex gap="1" wrap="wrap">
                              {agent.expertise.map((skill, i) => (
                                <Badge key={i} size="1" variant="outline" color="gray">
                                  {skill}
                                </Badge>
                              ))}
                            </Flex>
                          </Flex>
                        </Card>
                      ))}
                    </ScrollArea.Viewport>
                    <ScrollArea.Scrollbar orientation="vertical">
                      <ScrollArea.Thumb />
                    </ScrollArea.Scrollbar>
                  </ScrollArea.Root>
                </Tabs.Content>
              </Tabs.Root>
            </Box>
          )}

          {/* Main Chat Area */}
          <Box className="chat-main">
            {/* Header */}
            <Box className="chat-header">
              <Flex justify="between" align="center">
                <Flex align="center" gap="3">
                  <Heading size="4">Swarm Intelligence</Heading>
                  <Badge size="2" color={isLoading ? 'amber' : 'green'}>
                    {isLoading ? 'Processing' : 'Ready'}
                  </Badge>
                </Flex>
                
                <Flex gap="2">
                  <Select.Root value={selectedMode} onValueChange={setSelectedMode}>
                    <Select.Trigger className="select-trigger">
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="dynamic">Dynamic Swarm</Select.Item>
                      <Select.Item value="fixed">Fixed Agents</Select.Item>
                      <Select.Item value="parallel">Parallel Execution</Select.Item>
                    </Select.Content>
                  </Select.Root>
                  
                  <Select.Root value={taskComplexity} onValueChange={setTaskComplexity}>
                    <Select.Trigger className="select-trigger">
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="simple">Simple</Select.Item>
                      <Select.Item value="balanced">Balanced</Select.Item>
                      <Select.Item value="deep">Deep Thinking</Select.Item>
                    </Select.Content>
                  </Select.Root>
                  
                  <IconButton 
                    variant="soft"
                    onClick={() => setShowTimeline(!showTimeline)}
                  >
                    {showTimeline ? <EyeOff size={16} /> : <Eye size={16} />}
                  </IconButton>
                  
                  <IconButton 
                    variant="soft"
                    onClick={() => setShowAgentDetails(!showAgentDetails)}
                  >
                    {showAgentDetails ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </IconButton>
                </Flex>
              </Flex>
            </Box>

            {/* Messages Area */}
            <ScrollArea.Root className="messages-area">
              <ScrollArea.Viewport>
                <Box p="4">
                  {messages.length === 0 ? (
                    <Card className="welcome-card">
                      <Flex direction="column" align="center" gap="3" p="5">
                        <Network size={48} />
                        <Heading size="5">Multi-Agent Swarm Intelligence</Heading>
                        <Text size="3" color="gray" style={{ textAlign: 'center' }}>
                          Collaborative AI agents working together to solve complex tasks
                          with parallel execution and specialized expertise.
                        </Text>
                        <Flex gap="2" wrap="wrap" justify="center">
                          <Button 
                            variant="soft" 
                            onClick={() => setInput('Design a scalable microservices architecture for an e-commerce platform')}
                          >
                            System Design
                          </Button>
                          <Button 
                            variant="soft" 
                            onClick={() => setInput('Research and analyze the latest trends in quantum computing')}
                          >
                            Deep Research
                          </Button>
                          <Button 
                            variant="soft" 
                            onClick={() => setInput('Create a comprehensive business plan for a sustainable tech startup')}
                          >
                            Complex Analysis
                          </Button>
                        </Flex>
                      </Flex>
                    </Card>
                  ) : (
                    messages.map((message, index) => (
                      <Box key={message.id} className={`message ${message.role}`} mb="3">
                        <Flex align="start" gap="3">
                          <Avatar.Root className="message-avatar">
                            <Avatar.Fallback>
                              {message.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                            </Avatar.Fallback>
                          </Avatar.Root>
                          
                          <Box style={{ flex: 1 }}>
                            <Flex align="center" gap="2" mb="1">
                              <Text size="2" weight="bold">
                                {message.role === 'user' ? 'You' : message.agentName || 'Swarm'}
                              </Text>
                              <Text size="1" color="gray">
                                {new Date(message.timestamp).toLocaleTimeString()}
                              </Text>
                            </Flex>
                            
                            {message.thinking && message.thinking.length > 0 && (
                              <Collapsible.Root className="thinking-section" defaultOpen>
                                <Collapsible.Trigger className="thinking-trigger">
                                  <Flex align="center" gap="1">
                                    <Brain size={14} />
                                    <Text size="2">Thinking Process</Text>
                                    <ChevronDown size={14} className="thinking-chevron" />
                                  </Flex>
                                </Collapsible.Trigger>
                                <Collapsible.Content className="thinking-content">
                                  {message.thinking.map((thought, i) => (
                                    <Text key={i} size="2" color="gray" className="thought-item">
                                      {thought}
                                    </Text>
                                  ))}
                                </Collapsible.Content>
                              </Collapsible.Root>
                            )}
                            
                            <Box className="message-content">
                              <ReactMarkdown>
                                {message.content}
                              </ReactMarkdown>
                            </Box>
                          </Box>
                        </Flex>
                      </Box>
                    ))
                  )}
                  
                  {isLoading && (
                    <Box className="loading-message" mb="3">
                      <Flex align="center" gap="3">
                        <Box className="loading-spinner">
                          <Activity className="animate-pulse" />
                        </Box>
                        <Text size="2" color="gray">Swarm agents collaborating...</Text>
                      </Flex>
                    </Box>
                  )}
                  
                  <div ref={messagesEndRef} />
                </Box>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar orientation="vertical">
                <ScrollArea.Thumb />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>

            {/* Input Area */}
            <Box className="input-area">
              <Flex gap="2">
                <TextArea
                  placeholder="Describe your task for the swarm..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  className="message-input"
                  disabled={isLoading}
                />
                <Button
                  size="3"
                  onClick={handleSubmit}
                  disabled={!input.trim() || isLoading}
                >
                  <Send size={16} />
                  Send
                </Button>
              </Flex>
            </Box>
          </Box>

          {/* Timeline Sidebar */}
          {showTimeline && (
            <Box className="timeline-sidebar">
              <Box className="sidebar-header">
                <Heading size="3">Execution Timeline</Heading>
                <Text size="2" color="gray">
                  {events.length} events
                </Text>
              </Box>
              
              <ScrollArea.Root className="timeline-container">
                <ScrollArea.Viewport>
                  <Box p="3">
                    {/* Parallel task groups */}
                    {Array.from(parallelTasks.entries()).map(([groupId, groupEvents]) => (
                      <Collapsible.Root 
                        key={groupId}
                        open={expandedGroups.has(groupId)}
                        onOpenChange={(open) => {
                          setExpandedGroups(prev => {
                            const next = new Set(prev);
                            if (open) next.add(groupId);
                            else next.delete(groupId);
                            return next;
                          });
                        }}
                      >
                        <Collapsible.Trigger className="parallel-group-trigger">
                          <Flex align="center" gap="2">
                            <GitBranch size={14} />
                            <Text size="2" weight="medium">
                              Parallel Tasks ({groupEvents.length})
                            </Text>
                            <ChevronRight size={14} className="group-chevron" />
                          </Flex>
                        </Collapsible.Trigger>
                        <Collapsible.Content className="parallel-group-content">
                          {groupEvents.map(event => renderTimelineEvent(event))}
                        </Collapsible.Content>
                      </Collapsible.Root>
                    ))}
                    
                    {/* Regular timeline events */}
                    {events.filter(e => !e.parallel).map(event => renderTimelineEvent(event))}
                    
                    {events.length === 0 && !isLoading && (
                      <Text size="2" color="gray" style={{ textAlign: 'center' }}>
                        Timeline will appear here when agents start working
                      </Text>
                    )}
                  </Box>
                </ScrollArea.Viewport>
                <ScrollArea.Scrollbar orientation="vertical">
                  <ScrollArea.Thumb />
                </ScrollArea.Scrollbar>
              </ScrollArea.Root>
            </Box>
          )}
        </Flex>
      </Box>
    </Theme>
  );
};

export default TrueSwarmRadix;