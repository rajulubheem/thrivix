import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Users, 
  Bot, 
  Activity, 
  Zap, 
  Brain,
  Play,
  Pause,
  Settings,
  CheckCircle,
  AlertCircle,
  Info,
  Loader2,
  Sparkles,
  X
} from 'lucide-react';
import { ModernLayout } from '../components/layout/ModernLayout';
import { ModernChatInterface } from '../components/chat/ModernChatInterface';
import { ModernOrchestratorPanel } from '../components/ModernOrchestratorPanel';
import { ToolExecutionDisplay } from '../components/ToolExecutionDisplay';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { ScrollArea } from '../components/ui/scroll-area';
import { Separator } from '../components/ui/separator';
import { Switch } from '../components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { cn } from '../lib/utils';

// Import existing hooks and services
import { useSwarmExecution } from '../hooks/useSwarmExecution';
import { useStreamingPolling } from '../hooks/useStreamingPolling';
import { useChatSessions } from '../hooks/useChatSessions';
import { chatApi } from '../services/chatApi';
import { apiService } from '../services/api';
import { SwarmExecutionRequest, SwarmEvent } from '../types/swarm';

interface LocalAgent {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'thinking' | 'executing' | 'completed';
  progress: number;
  icon: React.ElementType;
  color: string;
  tasks: number;
  successRate: number;
  contributions?: number;
  lastActivity?: string;
  currentTask?: string;
  tokensUsed?: number;
  toolsUsed?: string[];
}

const availableAgents: LocalAgent[] = [
  {
    id: 'research_agent',
    name: 'Research Agent',
    role: 'Information gathering and analysis',
    status: 'idle',
    progress: 0,
    icon: Brain,
    color: 'text-purple-500',
    tasks: 0,
    successRate: 98.5
  },
  {
    id: 'code_assistant',
    name: 'Code Assistant',
    role: 'Programming and debugging',
    status: 'idle',
    progress: 0,
    icon: Bot,
    color: 'text-blue-500',
    tasks: 0,
    successRate: 96.2
  },
  {
    id: 'data_analyst',
    name: 'Data Analyst',
    role: 'Data processing and visualization',
    status: 'idle',
    progress: 0,
    icon: Activity,
    color: 'text-green-500',
    tasks: 0,
    successRate: 97.8
  },
  {
    id: 'creative_writer',
    name: 'Creative Writer',
    role: 'Content generation and editing',
    status: 'idle',
    progress: 0,
    icon: Zap,
    color: 'text-yellow-500',
    tasks: 0,
    successRate: 94.5
  }
];

interface StreamEvent {
  type: string;
  agent?: string;
  timestamp: string;
  data?: any;
}

export const ModernSwarmChat: React.FC = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  
  // Use existing hooks for backend integration
  const {
    currentSession,
    createSession,
    loadSession,
  } = useChatSessions();
  
  const {
    isExecuting,
    executionId,
    result,
    error: executionError,
    metrics,
    agentStates,
    streamingMessages,
    events,
    execute,
    stop: stopExecution,
    reset: resetExecution
  } = useSwarmExecution();

  // State management - Must be declared before hooks that use them
  const [messages, setMessages] = useState<any[]>([]);
  const [activeAgents, setActiveAgents] = useState<LocalAgent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toolExecutions, setToolExecutions] = useState<any[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  
  const {
    startStream,
    stopStream,
    isStreaming,
    error: streamError,
    metrics: streamMetrics
  } = useStreamingPolling({
    onToken: (agent: string, token: string) => {
      // Append token to the current streaming message
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        
        // If last message is from same agent and is streaming, update it
        if (lastMessage?.metadata?.agent === agent && lastMessage?.status === 'streaming') {
          return [
            ...prev.slice(0, -1),
            {
              ...lastMessage,
              content: lastMessage.content + token
            }
          ];
        }
        
        // Otherwise create new streaming message
        return [...prev, {
          id: Date.now().toString(),
          role: 'assistant' as const,
          content: token,
          timestamp: new Date(),
          status: 'streaming' as const,
          metadata: { agent }
        }];
      });
    },
    onAgentStart: (agent: string) => {
      setActiveAgents(prev => 
        prev.map(a => 
          a.name === agent 
            ? { ...a, status: 'thinking' as const, progress: 25 }
            : a
        )
      );
    },
    onAgentComplete: (agent: string, content: string) => {
      setActiveAgents(prev => 
        prev.map(a => 
          a.name === agent 
            ? { ...a, status: 'idle' as const, progress: 100, tasks: a.tasks + 1 }
            : a
        )
      );
      // Mark the streaming message as complete
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage?.metadata?.agent === agent && lastMessage?.status === 'streaming') {
          return [
            ...prev.slice(0, -1),
            { ...lastMessage, status: 'completed' }
          ];
        }
        return prev;
      });
    },
    onTool: (agent: string, tool: string, filename?: string) => {
      // Track tool execution start with beautiful animations
      const toolExec = {
        id: `tool-${Date.now()}-${Math.random()}`,
        agent,
        tool,
        parameters: filename ? { filename } : {},
        status: 'executing' as const,
        timestamp: new Date()
      };
      setToolExecutions(prev => [...prev, toolExec]);
      
      // Update agent to executing status with animation
      setActiveAgents(prev => 
        prev.map(a => 
          a.name === agent 
            ? { 
                ...a, 
                status: 'executing' as const, 
                progress: Math.min(75, a.progress + 15),
                currentTask: `Using ${tool}...`,
                toolsUsed: [...(a.toolsUsed || []), tool].filter((v, i, arr) => arr.indexOf(v) === i)
              }
            : a
        )
      );
    },
    onToolExecuted: (agent: string, data: any) => {
      // Update the tool execution with result
      setToolExecutions(prev => {
        const updated = [...prev];
        // Find the last executing tool for this agent
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].agent === agent && updated[i].status === 'executing') {
            updated[i] = {
              ...updated[i],
              result: data.result || data.output || data,
              status: data.error ? 'error' as const : 'success' as const,
              parameters: data.parameters || data.args || updated[i].parameters
            };
            break;
          }
        }
        return updated;
      });
      
      // Update agent progress
      setActiveAgents(prev => 
        prev.map(a => 
          a.name === agent 
            ? { 
                ...a, 
                progress: Math.min(90, a.progress + 10)
              }
            : a
        )
      );
    },
    onHandoff: (from: string, to: string) => {
      // Visual handoff animation
      setActiveAgents(prev => prev.map(a => {
        if (a.name === from) {
          return { ...a, status: 'completed' as const, progress: 100 };
        }
        if (a.name === to) {
          return { 
            ...a, 
            status: 'thinking' as const, 
            progress: 10,
            currentTask: `Taking over from ${from}...`
          };
        }
        return a;
      }));
      
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: `🔄 Handoff from ${from} to ${to}`,
        timestamp: new Date(),
        status: 'info'
      }]);
    },
    onComplete: () => {
      setIsLoading(false);
    },
    onError: (error: string) => {
      console.error('Streaming error:', error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: `Error: ${error}`,
        timestamp: new Date(),
        status: 'error'
      }]);
      setIsLoading(false);
    }
  });

  // Additional state management
  const [isSwarmActive, setIsSwarmActive] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<string[]>(['research_agent', 'code_assistant']);
  const [swarmMetrics, setSwarmMetrics] = useState({
    totalTasks: 0,
    completedTasks: 0,
    avgResponseTime: 0,
    efficiency: 0
  });
  const [pollingEvents, setPollingEvents] = useState<StreamEvent[]>([]);
  const [showOrchestrator, setShowOrchestrator] = useState(false);
  const [orchestratorState, setOrchestratorState] = useState<any>(null);

  // Initialize session
  useEffect(() => {
    const initializeSession = async () => {
      if (sessionId) {
        await loadSession(sessionId);
      } else {
        // Create a new session
        const newSession = await createSession({
          title: 'Swarm Chat Session',
          description: 'Multi-agent collaboration session',
          agents_config: {
            agents: selectedAgents.map(id => ({
              id,
              name: availableAgents.find(a => a.id === id)?.name || id
            }))
          }
        });
        if (newSession) {
          navigate(`/swarm/${newSession.session_id}`);
        }
      }
    };
    
    initializeSession();
    // eslint-disable-next-line
  }, [sessionId]);

  // Load messages from current session
  useEffect(() => {
    const loadMessages = async () => {
      if (currentSession?.session_id) {
        try {
          const sessionData = await chatApi.getSessionWithMessages(currentSession.session_id);
          const formattedMessages = sessionData.messages.map(msg => ({
            id: msg.message_id,
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.created_at),
            status: 'sent' as const,
            metadata: msg.message_metadata
          }));
          setMessages(formattedMessages);
        } catch (error) {
          console.error('Failed to load messages:', error);
        }
      }
    };
    
    loadMessages();
  }, [currentSession]);

  // Process events from execution
  useEffect(() => {
    if (events && events.length > 0) {
      const latestEvent = events[events.length - 1] as SwarmEvent;
      
      // Convert to stream event for display
      const streamEvent: StreamEvent = {
        type: latestEvent.type,
        agent: latestEvent.agent,
        timestamp: typeof latestEvent.timestamp === 'string' ? latestEvent.timestamp : latestEvent.timestamp.toString(),
        data: latestEvent.data
      };
      
      setPollingEvents(prev => [...prev, streamEvent]);
      
      switch (latestEvent.type) {
        case 'agent_started':
          updateAgentStatus(latestEvent.agent || '', 'thinking');
          // Add initial tool execution tracking
          setToolExecutions(prev => [...prev, {
            id: `tool-init-${Date.now()}`,
            agent: latestEvent.agent || 'Unknown',
            tool: 'Initializing',
            status: 'executing',
            timestamp: new Date()
          }]);
          break;
        
        case 'text_generation':
          updateAgentStatus(latestEvent.agent || '', 'executing');
          if (latestEvent.data?.content) {
            appendStreamingMessage(latestEvent.agent || 'assistant', latestEvent.data.content);
          }
          break;
        
        case 'tool_executed':
          updateAgentStatus(latestEvent.agent || '', 'executing');
          break;
        
        case 'agent_completed':
          updateAgentStatus(latestEvent.agent || '', 'completed');
          // Update last tool execution for this agent to completed
          setToolExecutions(prev => {
            const updated = [...prev];
            for (let i = updated.length - 1; i >= 0; i--) {
              if (updated[i].agent === latestEvent.agent && updated[i].status === 'executing') {
                updated[i] = { ...updated[i], status: 'success' };
                break;
              }
            }
            return updated;
          });
          break;
        
        case 'execution_completed':
          handleExecutionComplete();
          break;
      }
    }
    // eslint-disable-next-line
  }, [events]);

  // Update agent states from execution
  useEffect(() => {
    if (Array.isArray(agentStates) && agentStates.length > 0) {
      const updatedAgents = activeAgents.map(agent => {
        const state = agentStates.find((s: any) => s.name === agent.name);
        if (state) {
          return {
            ...agent,
            status: state.status as LocalAgent['status'],
            contributions: state.contributions,
            tokensUsed: state.tokensUsed,
            toolsUsed: state.toolsUsed,
            currentTask: state.currentTask,
            progress: state.status === 'complete' ? 100 : 
                     state.status === 'working' ? 50 : 
                     state.status === 'thinking' ? 25 : 0
          };
        }
        return agent;
      });
      setActiveAgents(updatedAgents);
    }
    // eslint-disable-next-line
  }, [agentStates]);

  // Handle sending messages
  const handleSendMessage = async (message: string) => {
    if (!currentSession) {
      // Create session if doesn't exist
      const newSession = await createSession({
        title: message.substring(0, 50),
        description: 'Swarm chat session'
      });
      if (!newSession) return;
    }

    // Add user message
    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: message,
      timestamp: new Date(),
      status: 'sent' as const
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Save message to backend
    if (currentSession) {
      await chatApi.addMessage(currentSession.session_id, {
        content: message,
        role: 'user',
        message_type: 'text'
      });
    }
    
    if (isSwarmActive) {
      await executeSwarm(message);
    } else {
      // Regular chat response (single agent)
      await executeSingleAgent(message);
    }
  };

  const executeSwarm = async (query: string, customAgents?: any[]) => {
    setIsLoading(true);
    
    // Update agent statuses
    setActiveAgents(agents => 
      agents.map(agent => ({
        ...agent,
        status: 'thinking' as const,
        progress: 10
      }))
    );

    try {
      // Use custom agents from orchestrator if provided
      const agentsList = customAgents || selectedAgents.map(id => {
        const agent = availableAgents.find(a => a.id === id);
        return {
          name: agent?.name || id,
          system_prompt: `You are ${agent?.name || id}. ${agent?.role || 'Help with the task.'}`,
          tools: ['web_search', 'file_write', 'file_read']
        };
      });

      // Start streaming with the polling hook
      await startStream(query, agentsList, 10);

      // Update metrics
      setSwarmMetrics(prev => ({
        ...prev,
        totalTasks: prev.totalTasks + 1
      }));
      
    } catch (error) {
      console.error('Swarm execution failed:', error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: 'Failed to execute swarm. Please try again.',
        timestamp: new Date(),
        status: 'error'
      }]);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleOrchestratorWorkflow = async (workflow: any) => {
    // Convert orchestrator workflow to agents and execute
    const customAgents = workflow.agents.map((agent: any) => ({
      name: agent.name,
      system_prompt: agent.system_prompt,
      tools: agent.tools,
      model_id: agent.model
    }));
    
    // Execute with custom agents
    await executeSwarm(workflow.task, customAgents);
    
    // Close orchestrator panel after starting
    setShowOrchestrator(false);
  };

  const executeSingleAgent = async (query: string) => {
    setIsLoading(true);
    
    try {
      // For single agent mode, use the first selected agent
      const agentId = selectedAgents[0] || 'research_agent';
      const agent = availableAgents.find(a => a.id === agentId);
      
      const agentConfig = {
        name: agent?.name || 'Assistant',
        system_prompt: `You are ${agent?.name || 'Assistant'}. ${agent?.role || 'Help with the task.'}`,
        tools: ['web_search']
      };

      // Use streaming polling hook for single agent
      await startStream(query, [agentConfig], 3);
      
    } catch (error) {
      console.error('Single agent execution failed:', error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: 'Failed to execute. Please try again.',
        timestamp: new Date(),
        status: 'error'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const appendStreamingMessage = (agent: string, content: string) => {
    setMessages(prev => {
      const lastMessage = prev[prev.length - 1];
      
      // If last message is from same agent and is streaming, update it
      if (lastMessage?.metadata?.agent === agent && lastMessage?.status === 'streaming') {
        return [
          ...prev.slice(0, -1),
          {
            ...lastMessage,
            content: lastMessage.content + content
          }
        ];
      }
      
      // Otherwise create new streaming message
      return [...prev, {
        id: Date.now().toString(),
        role: 'assistant' as const,
        content,
        timestamp: new Date(),
        status: 'streaming' as const,
        metadata: { agent }
      }];
    });
  };

  const updateAgentStatus = (agentName: string, status: LocalAgent['status']) => {
    setActiveAgents(prev => 
      prev.map(agent => 
        agent.name === agentName 
          ? { 
              ...agent, 
              status,
              progress: status === 'completed' ? 100 : 
                       status === 'executing' ? 50 : 
                       status === 'thinking' ? 25 : 0,
              tasks: status === 'completed' ? agent.tasks + 1 : agent.tasks
            }
          : agent
      )
    );
  };

  const handleExecutionComplete = useCallback(() => {
    // Mark all agents as complete
    setActiveAgents(prev => 
      prev.map(agent => ({
        ...agent,
        status: 'completed' as const,
        progress: 100
      }))
    );
    
    // Update metrics
    setSwarmMetrics(prev => ({
      ...prev,
      completedTasks: prev.completedTasks + 1,
      avgResponseTime: 2.3,
      efficiency: 94
    }));
    
    // Mark last streaming message as complete
    setMessages(prev => {
      const updated = [...prev];
      // Find last streaming message from the end
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].status === 'streaming') {
          updated[i] = {
            ...updated[i],
            status: 'sent'
          };
          break;
        }
      }
      return updated;
    });
    
    if (isStreaming) {
      stopStream();
    }
  }, [isStreaming, stopStream]);

  const toggleAgent = (agentId: string) => {
    setSelectedAgents(prev => 
      prev.includes(agentId)
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    );
  };

  const toggleSwarmMode = () => {
    const newState = !isSwarmActive;
    setIsSwarmActive(newState);
    
    if (newState) {
      // Initialize selected agents
      const initialAgents = availableAgents.filter(agent => 
        selectedAgents.includes(agent.id)
      );
      setActiveAgents(initialAgents);
    } else {
      // Clear active agents
      setActiveAgents([]);
    }
  };

  // Demo mode to showcase UI enhancements
  const startDemoMode = () => {
    setDemoMode(true);
    
    // Add a welcome message for demo mode
    setMessages([
      {
        id: 'demo-welcome',
        role: 'system' as const,
        content: '🎭 Demo Mode Active! Watch the agents collaborate with beautiful animations and real-time tool execution tracking.',
        timestamp: new Date(),
        status: 'sent' as const
      },
      {
        id: 'demo-task',
        role: 'user' as const,
        content: 'Analyze the latest breakthroughs in quantum computing and create a comprehensive report with code examples.',
        timestamp: new Date(),
        status: 'sent' as const
      }
    ]);
    
    // Set some agents to active with different statuses
    const demoAgents: LocalAgent[] = [
      {
        ...availableAgents[0],
        status: 'executing',
        progress: 65,
        currentTask: 'Analyzing research papers on quantum computing...',
        tasks: 3,
        toolsUsed: ['web_search', 'file_read', 'text_summary']
      },
      {
        ...availableAgents[1],
        status: 'completed',
        progress: 100,
        currentTask: 'Code optimization completed',
        tasks: 5,
        toolsUsed: ['code_execute', 'python_repl']
      },
      {
        ...availableAgents[2],
        status: 'thinking',
        progress: 30,
        currentTask: 'Processing dataset...',
        tasks: 2,
        toolsUsed: ['data_query']
      }
    ];
    setActiveAgents(demoAgents);
    setIsSwarmActive(true);
    
    // Add some mock tool executions with enhanced details
    const mockExecutions = [
      {
        id: 'demo-1',
        agent: 'Research Agent',
        tool: 'web_search',
        parameters: { 
          query: 'quantum computing breakthroughs 2024', 
          limit: 10,
          sort: 'relevance',
          date_range: 'last_month'
        },
        result: {
          found: 10,
          articles: [
            { title: 'Google Achieves Quantum Supremacy Milestone', url: 'example.com/1', score: 0.98 },
            { title: 'IBM Unveils 1000-Qubit Processor', url: 'example.com/2', score: 0.95 }
          ],
          summary: 'Found highly relevant recent articles on quantum computing advances'
        },
        status: 'success',
        timestamp: new Date(Date.now() - 5000)
      },
      {
        id: 'demo-2',
        agent: 'Code Assistant',
        tool: 'python_repl',
        parameters: { 
          code: 'from qiskit import QuantumCircuit\ncircuit = QuantumCircuit(2)\ncircuit.h(0)\ncircuit.cx(0, 1)\nprint("Bell state created")',
          environment: 'quantum_computing',
          timeout: 30
        },
        result: {
          output: 'Bell state created\nCircuit depth: 2\nGates used: H, CNOT',
          execution_time: '0.23s',
          memory_used: '12.3MB'
        },
        status: 'success',
        timestamp: new Date(Date.now() - 3000)
      },
      {
        id: 'demo-3',
        agent: 'Data Analyst',
        tool: 'data_visualization',
        parameters: { 
          dataset: 'quantum_performance_metrics',
          chart_type: 'line_chart',
          x_axis: 'time',
          y_axis: 'qubit_coherence',
          aggregation: 'mean'
        },
        status: 'executing',
        timestamp: new Date()
      },
      {
        id: 'demo-4',
        agent: 'Creative Writer',
        tool: 'text_generation',
        parameters: {
          prompt: 'Create an executive summary of quantum computing advances',
          max_tokens: 500,
          style: 'professional'
        },
        status: 'executing',
        timestamp: new Date()
      }
    ];
    setToolExecutions(mockExecutions);
    
    // Simulate progress updates with status changes
    let progressInterval = setInterval(() => {
      setActiveAgents(prev => prev.map(agent => {
        // Progress updates
        if (agent.status === 'executing' && agent.progress < 95) {
          return { ...agent, progress: Math.min(95, agent.progress + Math.random() * 10) };
        }
        if (agent.status === 'thinking') {
          if (agent.progress < 90) {
            return { ...agent, progress: agent.progress + Math.random() * 15 };
          } else {
            // Transition from thinking to executing
            return { 
              ...agent, 
              status: 'executing', 
              progress: 50,
              currentTask: 'Processing findings...'
            };
          }
        }
        return agent;
      }));
      
      // Add new streaming messages periodically
      if (Math.random() > 0.7) {
        const agents = ['Research Agent', 'Code Assistant', 'Data Analyst'];
        const randomAgent = agents[Math.floor(Math.random() * agents.length)];
        appendStreamingMessage(randomAgent, '\n\n💡 Found interesting pattern in the data...');
      }
    }, 1500);
    
    // Stop demo after 30 seconds
    setTimeout(() => {
      clearInterval(progressInterval);
      setDemoMode(false);
      setActiveAgents(prev => prev.map(agent => ({
        ...agent,
        status: 'completed',
        progress: 100,
        currentTask: 'Task completed successfully'
      })));
      
      // Add completion message
      setMessages(prev => [...prev, {
        id: 'demo-complete',
        role: 'system' as const,
        content: '✨ Demo completed! The agents have successfully collaborated to analyze quantum computing breakthroughs. Click "Demo Mode" again to replay.',
        timestamp: new Date(),
        status: 'sent' as const
      }]);
    }, 30000);
  };

  const stopDemoMode = () => {
    setDemoMode(false);
    setActiveAgents([]);
    setToolExecutions([]);
  };

  const AgentCard = ({ agent }: { agent: LocalAgent }) => {
    const Icon = agent.icon;
    
    return (
      <Card className={cn(
        "relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:scale-105 card-hover",
        agent.status === 'executing' && "ring-2 ring-primary ring-offset-2 animate-pulse shadow-lg shadow-primary/30",
        agent.status === 'thinking' && "ring-1 ring-blue-500 ring-offset-1 shadow-md shadow-blue-500/20",
        agent.status === 'completed' && "ring-1 ring-green-500 ring-offset-1"
      )}>
        {/* Enhanced status indicator glow */}
        {agent.status === 'executing' && (
          <>
            <div className="absolute inset-0 bg-gradient-to-r from-primary/30 via-purple-500/20 to-pink-500/10 animate-pulse" />
            <div className="absolute inset-0 bg-gradient-to-br from-transparent via-primary/10 to-transparent animate-shimmer" />
          </>
        )}
        {agent.status === 'thinking' && (
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-cyan-500/10 to-transparent animate-pulse" />
        )}
        {agent.status === 'completed' && (
          <div className="absolute inset-0 bg-gradient-to-r from-green-500/10 via-emerald-500/5 to-transparent" />
        )}
        
        <CardHeader className="pb-3 relative">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg transition-all duration-300 relative",
                agent.status === 'executing' ? "bg-primary/30 scale-110 shadow-lg shadow-primary/50" : 
                agent.status === 'thinking' ? "bg-blue-500/20 scale-105" :
                agent.status === 'completed' ? "bg-green-500/20" : "bg-muted",
                agent.color
              )}>
                {agent.status === 'executing' && (
                  <div className="absolute inset-0 rounded-lg animate-ping bg-primary/30" />
                )}
                <Icon className={cn(
                  "h-5 w-5 transition-transform duration-300 relative z-10",
                  agent.status === 'executing' && "animate-spin",
                  agent.status === 'thinking' && "animate-pulse"
                )} />
              </div>
              <div>
                <CardTitle className="text-base">{agent.name}</CardTitle>
                <CardDescription className="text-xs">{agent.role}</CardDescription>
              </div>
            </div>
            <Badge 
              variant={agent.status === 'completed' ? 'default' : 
                      agent.status === 'executing' ? 'secondary' : 'outline'}
              className={cn(
                "text-xs transition-all",
                agent.status === 'executing' && "animate-pulse"
              )}
            >
              {agent.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pb-3 relative">
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-semibold">{agent.progress}%</span>
            </div>
            <div className="relative">
              <Progress value={agent.progress} className="h-2" />
              {agent.status === 'executing' && (
                <div className="absolute inset-0 h-2 bg-gradient-to-r from-transparent via-primary/50 to-transparent animate-shimmer" />
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <div className="text-center p-2 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground">Tasks</div>
                <div className="text-sm font-bold">{agent.tasks}</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground">Success</div>
                <div className="text-sm font-bold text-green-600">{agent.successRate}%</div>
              </div>
            </div>
            {agent.currentTask && (
              <div className="pt-2 border-t">
                <div className="text-xs text-muted-foreground mb-1">Current Task</div>
                <div className={cn(
                  "text-xs font-medium p-2 rounded relative overflow-hidden",
                  agent.status === 'executing' ? "bg-gradient-to-r from-primary/20 via-purple-500/15 to-pink-500/10 animate-pulse" : "bg-primary/10"
                )}>
                  {agent.status === 'executing' && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
                  )}
                  <span className="relative">{agent.currentTask}</span>
                </div>
              </div>
            )}
            {agent.toolsUsed && agent.toolsUsed.length > 0 && (
              <div className="pt-2 border-t">
                <div className="text-xs text-muted-foreground mb-1">Tools Used</div>
                <div className="flex flex-wrap gap-1">
                  {agent.toolsUsed.map((tool, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {tool}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <ModernLayout>
      <div className="flex h-full">
        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="border-b bg-card/50 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <h1 className="text-xl font-semibold">Swarm Intelligence</h1>
                </div>
                <Badge variant={isSwarmActive ? "default" : "outline"}>
                  {isSwarmActive ? "Active" : "Standby"}
                </Badge>
                {isExecuting && (
                  <Badge variant="secondary" className="animate-pulse">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Processing
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center gap-3">
                {/* Demo Mode Button */}
                {!demoMode ? (
                  <Button
                    onClick={startDemoMode}
                    variant="outline"
                    size="sm"
                    className="relative overflow-hidden group"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 via-pink-600/20 to-blue-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <Sparkles className="h-4 w-4 mr-2 text-purple-500 group-hover:animate-pulse" />
                    <span className="relative">Demo Mode</span>
                    <Badge variant="secondary" className="ml-2 text-xs animate-pulse">
                      NEW
                    </Badge>
                  </Button>
                ) : (
                  <Button
                    onClick={stopDemoMode}
                    variant="default"
                    size="sm"
                    className="relative animate-pulse"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Stop Demo
                    <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 opacity-30 blur-sm animate-pulse" />
                  </Button>
                )}
                
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Auto Mode</span>
                  <Switch
                    checked={autoMode}
                    onCheckedChange={setAutoMode}
                  />
                </div>
                
                <Button
                  variant={isSwarmActive ? "destructive" : "default"}
                  size="sm"
                  onClick={toggleSwarmMode}
                  disabled={isExecuting}
                >
                  {isSwarmActive ? (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause Swarm
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Activate Swarm
                    </>
                  )}
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowOrchestrator(!showOrchestrator)}
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Orchestrator
                </Button>
                
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Configure
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[625px]">
                    <DialogHeader>
                      <DialogTitle>Swarm Configuration</DialogTitle>
                      <DialogDescription>
                        Select and configure agents for your swarm
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      {availableAgents.map((agent) => {
                        const Icon = agent.icon;
                        return (
                          <div key={agent.id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <Icon className={cn("h-5 w-5", agent.color)} />
                              <div>
                                <div className="font-medium">{agent.name}</div>
                                <div className="text-sm text-muted-foreground">{agent.role}</div>
                              </div>
                            </div>
                            <Switch
                              checked={selectedAgents.includes(agent.id)}
                              onCheckedChange={() => toggleAgent(agent.id)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>

          {/* Chat Interface */}
          <div className="flex-1 overflow-hidden">
            <ModernChatInterface
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isLoading || isExecuting}
              placeholder={isSwarmActive ? "Ask the swarm..." : "Type your message..."}
            />
          </div>
        </div>

        {/* Orchestrator Panel (Overlay) */}
        {showOrchestrator && (
          <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm">
            <div className="absolute right-0 top-0 h-full w-[500px] bg-background border-l shadow-xl">
              <ModernOrchestratorPanel
                onWorkflowStart={handleOrchestratorWorkflow}
                onClose={() => setShowOrchestrator(false)}
              />
            </div>
          </div>
        )}
        
        {/* Right Sidebar - Agent Panel */}
        <div className="w-80 border-l bg-card/30">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Active Agents</h2>
            <p className="text-sm text-muted-foreground">
              {activeAgents.length} agents collaborating
            </p>
          </div>
          
          <ScrollArea className="h-[calc(100vh-140px)] p-4">
            <div className="space-y-3">
              {activeAgents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
            
            <Separator className="my-6" />
            
            {/* Swarm Metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Swarm Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Total Tasks</span>
                  <span className="text-sm font-medium">{swarmMetrics.totalTasks}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Completed</span>
                  <span className="text-sm font-medium">{swarmMetrics.completedTasks}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Avg Response</span>
                  <span className="text-sm font-medium">{swarmMetrics.avgResponseTime}s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Efficiency</span>
                  <Badge variant="default">{swarmMetrics.efficiency}%</Badge>
                </div>
              </CardContent>
            </Card>
            
            {/* Tool Executions */}
            {toolExecutions.length > 0 && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base">Tool Executions</CardTitle>
                  <CardDescription className="text-xs">
                    {toolExecutions.length} tools executed
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {toolExecutions.slice(-3).reverse().map((execution, idx) => (
                      <ToolExecutionDisplay 
                        key={idx} 
                        execution={execution} 
                        compact={true}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Activity Feed */}
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Activity Feed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pollingEvents.slice(-5).reverse().map((event: StreamEvent, idx: number) => {
                    let icon = Info;
                    let color = 'text-blue-500';
                    let text = event.type.replace(/_/g, ' ');
                    
                    if (event.type.includes('completed')) {
                      icon = CheckCircle;
                      color = 'text-green-500';
                    } else if (event.type.includes('failed') || event.type.includes('error')) {
                      icon = AlertCircle;
                      color = 'text-red-500';
                    }
                    
                    const Icon = icon;
                    return (
                      <div key={idx} className="flex items-start gap-2 text-xs">
                        <Icon className={cn("h-3 w-3 mt-0.5", color)} />
                        <div className="flex-1">
                          <div className="capitalize">{text}</div>
                          <div className="text-muted-foreground">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </ScrollArea>
        </div>
      </div>
    </ModernLayout>
  );
};