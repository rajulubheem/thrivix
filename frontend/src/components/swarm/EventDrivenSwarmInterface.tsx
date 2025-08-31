import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  User,
  Sparkles,
  AlertCircle,
  CheckCircle,
  XCircle,
  Activity,
  Users,
  MessageSquare,
  Zap,
  HelpCircle,
  Send,
  Copy,
  Check,
  ArrowDown,
  Square
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { cn } from '../../lib/utils';
import ReactMarkdown from 'react-markdown';

interface SwarmEvent {
  id: string;
  type: string;
  data: any;
  source?: string;
  timestamp: number;
}

interface HumanQuestion {
  id: string;
  question: string;
  context?: any;
  requesting_agent?: string;
  timestamp: string;
}

interface HumanApproval {
  id: string;
  action: string;
  reason: string;
  agent?: string;
  timestamp: string;
}

interface AgentState {
  name: string;
  role: string;
  status: 'idle' | 'working' | 'waiting' | 'complete';
  lastActivity?: string;
  outputCount: number;
  content?: string;
}

interface Message {
  id: string;
  agent: string;
  content: string;
  timestamp: Date;
  type: 'message' | 'handoff' | 'system';
}

export const EventDrivenSwarmInterface: React.FC = () => {
  const [task, setTask] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [events, setEvents] = useState<SwarmEvent[]>([]);
  const [agents, setAgents] = useState<Map<string, AgentState>>(new Map());
  const [humanQuestions, setHumanQuestions] = useState<HumanQuestion[]>([]);
  const [humanApprovals, setHumanApprovals] = useState<HumanApproval[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isExecutingRef = useRef<boolean>(false);
  
  // Swarm configuration controls
  const [showConfig, setShowConfig] = useState(false);
  const [maxConcurrentAgents, setMaxConcurrentAgents] = useState(3);
  const [maxTotalAgents, setMaxTotalAgents] = useState(8);
  const [maxExecutionTime, setMaxExecutionTime] = useState(180);
  const [maxAgentRuntime, setMaxAgentRuntime] = useState(60);

  // Handle auto-scrolling
  useEffect(() => {
    if (autoScroll && messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, autoScroll]);

  // Detect manual scrolling
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const container = messagesContainerRef.current;
    const threshold = 100;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    
    // Only change auto-scroll if user has scrolled away from bottom
    if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    } else if (isAtBottom && !autoScroll) {
      setAutoScroll(true);
    }
  };

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      setAutoScroll(true);
    }
  };

  const handleSwarmEvent = (event: SwarmEvent) => {
    // Add to event log
    setEvents(prev => [...prev, event]);

    // Handle specific event types
    switch (event.type) {
      case 'agent.spawned':
        handleAgentSpawned(event.data);
        break;
      case 'agent.started':
        updateAgentStatus(event.data.agent, 'working');
        break;
      case 'agent.completed':
        updateAgentStatus(event.data.agent, 'complete');
        break;
      case 'human.question':
        setHumanQuestions(prev => [...prev, event.data as HumanQuestion]);
        break;
      case 'human.approval_needed':
        setHumanApprovals(prev => [...prev, event.data as HumanApproval]);
        break;
      case 'task.completed':
        setIsExecuting(false);
        break;
      case 'task.failed':
        setIsExecuting(false);
        break;
    }
  };

  const handleAgentStarted = (data: any) => {
    const agent: AgentState = {
      name: data.agent_id || data.role,
      role: data.role,
      status: 'working',
      outputCount: 0
    };
    setAgents(prev => new Map(prev).set(agent.name, agent));
  };

  const handleAgentSpawned = (data: any) => {
    const agent: AgentState = {
      name: data.agent_id || data.role,
      role: data.role,
      status: 'idle',
      outputCount: 0
    };
    setAgents(prev => new Map(prev).set(agent.name, agent));
  };

  const updateAgentStatus = (agentName: string, status: AgentState['status']) => {
    setAgents(prev => {
      const updated = new Map(prev);
      const agent = updated.get(agentName);
      if (agent) {
        agent.status = status;
        agent.lastActivity = new Date().toISOString();
        if (status === 'complete') {
          agent.outputCount++;
        }
      }
      return updated;
    });
  };

  const stopExecution = async () => {
    if (!executionId) {
      console.error('No execution to stop');
      return;
    }

    try {
      console.log('🛑 Stopping execution:', executionId);
      const response = await fetch(`http://localhost:8000/api/v1/streaming/stop/${executionId}`, {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Execution stopped:', data);
        setIsExecuting(false);
        setExecutionId(null);
        
        // Add stop message to events
        const stopEvent: SwarmEvent = {
          id: Date.now().toString(),
          type: 'execution_stopped',
          data: { message: 'Execution stopped by user' },
          timestamp: Date.now(),
          source: 'user'
        };
        setEvents(prev => [...prev, stopEvent]);
      } else {
        console.error('Failed to stop execution:', response.statusText);
      }
    } catch (error) {
      console.error('Error stopping execution:', error);
    }
  };

  const executeSwarm = async (useTest = false) => {
    if (!task.trim()) return;

    setIsExecuting(true);
    isExecutingRef.current = true;
    setEvents([]);
    setAgents(new Map());
    setHumanQuestions([]);
    setHumanApprovals([]);
    setMessages([]);
    setAutoScroll(true); // Reset scroll state on new execution

    try {
      // Call the streaming endpoint with event-driven mode
      const endpoint = 'http://localhost:8000/api/v1/streaming/start';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task,
          execution_mode: 'event_driven', // Critical: specify event-driven mode
          agents: [], // Let the system decide which agents to spawn
          max_handoffs: 20,
          context: {
            swarm_config: {
              max_concurrent_agents: maxConcurrentAgents,
              max_total_agents: maxTotalAgents,
              max_execution_time: maxExecutionTime,
              max_agent_runtime: maxAgentRuntime
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to start execution: ${response.statusText}`);
      }

      const data = await response.json();
      const sessionId = data.session_id;
      
      if (!sessionId) {
        throw new Error('No session ID received from server');
      }

      console.log('📡 Started event-driven swarm with session:', sessionId);
      setExecutionId(sessionId);

      // Now start polling for updates
      pollForUpdates(sessionId);
      
    } catch (error) {
      console.error('Failed to execute swarm:', error);
      setIsExecuting(false);
      isExecutingRef.current = false;
      handleSwarmEvent({
        id: Date.now().toString(),
        type: 'task.failed',
        data: { error: String(error) },
        timestamp: Date.now()
      });
    }
  };

  // Add polling function
  const pollForUpdates = async (sessionId: string) => {
    let offset = 0;
    let retries = 0;
    const maxRetries = 3;
    const agentMessages = new Map<string, string>(); // Track partial messages per agent
    const startTime = Date.now();
    const maxPollTimeMs = 300000; // 5 minutes maximum polling time

    while (isExecutingRef.current) {
      // Check for timeout to prevent infinite polling
      if (Date.now() - startTime > maxPollTimeMs) {
        console.error('Polling timeout reached (5 minutes), stopping execution');
        setIsExecuting(false);
        isExecutingRef.current = false;
        handleSwarmEvent({
          id: Date.now().toString(),
          type: 'task.failed', 
          data: { error: 'Execution timeout - stopped after 5 minutes' },
          timestamp: Date.now()
        });
        break;
      }
      
      try {
        const response = await fetch(
          `http://localhost:8000/api/v1/streaming/poll/${sessionId}?offset=${offset}&timeout=25`
        );

        if (!response.ok) {
          if (response.status === 404) {
            console.error('Session expired or not found');
            setIsExecuting(false);
            isExecutingRef.current = false;
            break;
          }
          // Handle server errors (5xx) more aggressively to prevent infinite polling
          if (response.status >= 500) {
            console.error(`Server error ${response.status}: ${response.statusText}`);
            retries++;
            if (retries >= maxRetries) {
              console.error('Max retries reached due to server errors, stopping polling');
              setIsExecuting(false);
              isExecutingRef.current = false;
              handleSwarmEvent({
                id: Date.now().toString(),
                type: 'task.failed',
                data: { error: `Server error: ${response.statusText}` },
                timestamp: Date.now()
              });
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait longer for server errors
            continue;
          }
          throw new Error(`Poll failed: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Log polling response for debugging
        console.log(`Polling response - Status: ${data.status}, Chunks: ${data.chunks?.length || 0}, Offset: ${offset}`);
        
        if (data.chunks && data.chunks.length > 0) {
          for (const chunk of data.chunks) {
            processChunk(chunk, agentMessages);
          }
          offset += data.chunks.length;
        }

        // Check for both 'complete' and 'completed' status
        if (data.status === 'complete' || data.status === 'completed' || data.status === 'failed') {
          console.log(`Execution finished with status: ${data.status}`);
          
          // Messages are already finalized via streaming - no need to add duplicates
          
          setIsExecuting(false);
          isExecutingRef.current = false;
          handleSwarmEvent({
            id: Date.now().toString(),
            type: (data.status === 'complete' || data.status === 'completed') ? 'task.completed' : 'task.failed',
            data: {},
            timestamp: Date.now()
          });
          break;
        }

        retries = 0; // Reset retries on successful poll
        
      } catch (error) {
        console.error('Polling error:', error);
        
        // Check for network errors (backend crashed/unavailable)
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('fetch') && (
            errorMessage.includes('ECONNREFUSED') ||
            errorMessage.includes('connection refused') ||
            errorMessage.includes('Failed to fetch') ||
            errorMessage.includes('NetworkError')
          )) {
          console.error('Backend appears to be unavailable, stopping polling');
          setIsExecuting(false);
          isExecutingRef.current = false;
          handleSwarmEvent({
            id: Date.now().toString(),
            type: 'task.failed',
            data: { error: 'Backend connection lost' },
            timestamp: Date.now()
          });
          break;
        }
        
        retries++;
        if (retries >= maxRetries) {
          console.error('Max retries reached, stopping polling');
          setIsExecuting(false);
          isExecutingRef.current = false;
          handleSwarmEvent({
            id: Date.now().toString(),
            type: 'task.failed',
            data: { error: 'Polling failed after max retries' },
            timestamp: Date.now()
          });
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
      }
    }
  };

  // Process chunks from polling
  const processChunk = (chunk: any, agentMessages: Map<string, string>) => {
    switch (chunk.type) {
      case 'agent_start':
        if (chunk.agent) {
          handleAgentStarted({ agent_id: chunk.agent, role: chunk.agent });
          handleSwarmEvent({
            id: Date.now().toString(),
            type: 'agent.started',
            data: { agent: chunk.agent },
            timestamp: Date.now()
          });
          // Initialize message buffer for this agent
          agentMessages.set(chunk.agent, '');
          
          // Create initial streaming message for this agent
          setMessages(prev => {
            // Check if we already have a streaming message for this agent
            const existingIndex = prev.findIndex(m => m.id === `msg-streaming-${chunk.agent}`);
            if (existingIndex === -1) {
              return [...prev, {
                id: `msg-streaming-${chunk.agent}`,
                agent: chunk.agent,
                content: '',
                timestamp: new Date(),
                type: 'message'
              }];
            }
            return prev;
          });
        }
        break;
      
      case 'delta':  // Main content type from backend
      case 'token':
      case 'text':
        if (chunk.agent && chunk.content) {
          // Update agent content
          setAgents(prev => {
            const updated = new Map(prev);
            const agentState = updated.get(chunk.agent) || {
              name: chunk.agent,
              role: chunk.agent,
              status: 'working' as const,
              outputCount: 0,
              content: ''
            };
            agentState.content = (agentState.content || '') + chunk.content;
            agentState.status = 'working';
            updated.set(chunk.agent, agentState);
            return updated;
          });
          
          // Accumulate content for this agent
          const currentContent = agentMessages.get(chunk.agent) || '';
          const newContent = currentContent + chunk.content;
          agentMessages.set(chunk.agent, newContent);
          
          // Update streaming message in real-time
          setMessages(prev => {
            const updated = [...prev];
            const streamingIndex = updated.findIndex(m => m.id === `msg-streaming-${chunk.agent}`);
            if (streamingIndex !== -1) {
              updated[streamingIndex] = {
                ...updated[streamingIndex],
                content: newContent,
                timestamp: new Date()
              };
            } else {
              // If no streaming message exists, create one
              updated.push({
                id: `msg-streaming-${chunk.agent}`,
                agent: chunk.agent,
                content: newContent,
                timestamp: new Date(),
                type: 'message'
              });
            }
            return updated;
          });
        }
        break;
      
      case 'agent_done':
      case 'agent_completed':
        if (chunk.agent) {
          updateAgentStatus(chunk.agent, 'complete');
          
          // Finalize the streaming message
          const content = agentMessages.get(chunk.agent) || '';
          setMessages(prev => {
            const updated = [...prev];
            const streamingIndex = updated.findIndex(m => m.id === `msg-streaming-${chunk.agent}`);
            if (streamingIndex !== -1) {
              // Replace streaming message with final message
              updated[streamingIndex] = {
                id: `msg-${Date.now()}-${chunk.agent}`,
                agent: chunk.agent,
                content: content || updated[streamingIndex].content,
                timestamp: new Date(),
                type: 'message'
              };
            }
            return updated;
          });
          
          // Clear the buffer for this agent
          agentMessages.set(chunk.agent, '');
          
          handleSwarmEvent({
            id: Date.now().toString(),
            type: 'agent.completed',
            data: { agent: chunk.agent, content: chunk.content || '' },
            timestamp: Date.now()
          });
        }
        break;
      
      case 'handoff':
        const from = chunk.from || chunk.data?.from || '?';
        const to = chunk.to || chunk.data?.to || '?';
        
        setMessages(prev => [...prev, {
          id: `handoff-${Date.now()}`,
          agent: 'system',
          content: `🔄 **Handoff:** ${from} → ${to}${chunk.reason ? `\n*Reason: ${chunk.reason}*` : ''}`,
          timestamp: new Date(),
          type: 'handoff'
        }]);
        
        handleSwarmEvent({
          id: Date.now().toString(),
          type: 'agent.handoff',
          data: { from, to, reason: chunk.reason },
          timestamp: Date.now()
        });
        break;
      
      case 'tool':
        if (chunk.agent && chunk.tool) {
          handleSwarmEvent({
            id: Date.now().toString(),
            type: 'tool.execution',
            data: { agent: chunk.agent, tool: chunk.tool },
            timestamp: Date.now()
          });
        }
        break;
      
      case 'error':
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}`,
          agent: 'system',
          content: `❌ **Error:** ${chunk.message || chunk.error || 'Unknown error'}`,
          timestamp: new Date(),
          type: 'system'
        }]);
        
        handleSwarmEvent({
          id: Date.now().toString(),
          type: 'error',
          data: { error: chunk.message || chunk.error || 'Unknown error' },
          timestamp: Date.now()
        });
        break;
    }
  };

  const copyMessage = (message: Message) => {
    navigator.clipboard.writeText(message.content);
    setCopiedId(message.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const answerQuestion = async (questionId: string) => {
    const token = localStorage.getItem('access_token');
    if (!token || !currentAnswer.trim()) return;

    try {
      await fetch('http://localhost:8000/api/v1/event-swarm/human/answer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          question_id: questionId,
          answer: currentAnswer
        })
      });

      // Remove question from list
      setHumanQuestions(prev => prev.filter(q => q.id !== questionId));
      setCurrentAnswer('');
    } catch (error) {
      console.error('Failed to submit answer:', error);
    }
  };

  const provideApproval = async (approvalId: string, approved: boolean) => {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    try {
      await fetch('http://localhost:8000/api/v1/event-swarm/human/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          approval_id: approvalId,
          approved,
          reason: approved ? 'User approved' : 'User rejected'
        })
      });

      // Remove approval from list
      setHumanApprovals(prev => prev.filter(a => a.id !== approvalId));
    } catch (error) {
      console.error('Failed to submit approval:', error);
    }
  };

  const getEventIcon = (type: string) => {
    if (type.startsWith('agent.')) return <Bot className="h-4 w-4" />;
    if (type.startsWith('human.')) return <User className="h-4 w-4" />;
    if (type.startsWith('task.')) return <CheckCircle className="h-4 w-4" />;
    if (type.startsWith('tool.')) return <Zap className="h-4 w-4" />;
    return <Activity className="h-4 w-4" />;
  };

  const getEventColor = (type: string) => {
    if (type.includes('complete')) return 'text-green-500';
    if (type.includes('error') || type.includes('failed')) return 'text-red-500';
    if (type.includes('started') || type.includes('spawned')) return 'text-blue-500';
    if (type.includes('human')) return 'text-purple-500';
    return 'text-gray-500';
  };

  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      {/* Task Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Event-Driven Swarm Execution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Enter your task for the swarm..."
              className="flex-1"
              rows={3}
              disabled={isExecuting}
            />
            <div className="flex gap-2 self-end">
              <Button
                onClick={() => executeSwarm()}
                disabled={isExecuting || !task.trim()}
              >
                {isExecuting ? (
                  <>
                    <Activity className="h-4 w-4 mr-2 animate-spin" />
                    Running
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Execute
                  </>
                )}
              </Button>
              
              {isExecuting && executionId && (
                <Button
                  onClick={stopExecution}
                  variant="destructive"
                  className="bg-red-500 hover:bg-red-600"
                >
                  <Square className="h-4 w-4 mr-2" />
                  Stop
                </Button>
              )}
              
              {/* Swarm Configuration Button */}
              <Button
                onClick={() => setShowConfig(!showConfig)}
                variant="outline"
                className="ml-2"
              >
                ⚙️ Config
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Swarm Configuration Panel */}
      {showConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              ⚙️ Swarm Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Max Concurrent Agents</label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={maxConcurrentAgents}
                  onChange={(e) => setMaxConcurrentAgents(parseInt(e.target.value) || 3)}
                  disabled={isExecuting}
                />
                <p className="text-xs text-gray-500 mt-1">Maximum agents running simultaneously</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Max Total Agents</label>
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={maxTotalAgents}
                  onChange={(e) => setMaxTotalAgents(parseInt(e.target.value) || 8)}
                  disabled={isExecuting}
                />
                <p className="text-xs text-gray-500 mt-1">Maximum agents spawned per execution</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Execution Timeout (seconds)</label>
                <Input
                  type="number"
                  min="30"
                  max="600"
                  value={maxExecutionTime}
                  onChange={(e) => setMaxExecutionTime(parseInt(e.target.value) || 180)}
                  disabled={isExecuting}
                />
                <p className="text-xs text-gray-500 mt-1">Maximum total execution time</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Agent Timeout (seconds)</label>
                <Input
                  type="number"
                  min="10"
                  max="300"
                  value={maxAgentRuntime}
                  onChange={(e) => setMaxAgentRuntime(parseInt(e.target.value) || 60)}
                  disabled={isExecuting}
                />
                <p className="text-xs text-gray-500 mt-1">Maximum time per individual agent</p>
              </div>
            </div>
            
            <div className="mt-4 flex gap-2">
              <Button
                onClick={() => {
                  setMaxConcurrentAgents(3);
                  setMaxTotalAgents(8);
                  setMaxExecutionTime(180);
                  setMaxAgentRuntime(60);
                }}
                variant="outline"
                size="sm"
                disabled={isExecuting}
              >
                Reset to Defaults
              </Button>
              
              <Button
                onClick={() => {
                  setMaxConcurrentAgents(1);
                  setMaxTotalAgents(1);
                  setMaxExecutionTime(60);
                  setMaxAgentRuntime(60);
                }}
                variant="outline"
                size="sm"
                disabled={isExecuting}
              >
                Single Agent Mode
              </Button>
              
              <Button
                onClick={() => {
                  setMaxConcurrentAgents(5);
                  setMaxTotalAgents(15);
                  setMaxExecutionTime(300);
                  setMaxAgentRuntime(120);
                }}
                variant="outline"
                size="sm"
                disabled={isExecuting}
              >
                Extended Mode
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Area */}
      <div className="grid grid-cols-3 gap-4 flex-1 overflow-hidden" style={{ height: 'calc(100vh - 300px)' }}>
        {/* Messages/Output */}
        <Card className="col-span-2 flex flex-col h-full overflow-hidden">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Agent Output
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-0 relative">
            <div 
              ref={messagesContainerRef}
              className="absolute inset-0 overflow-y-auto px-4 pb-4"
              onScroll={handleScroll}
            >
              {messages.length === 0 && !isExecuting && (
                <div className="text-center text-muted-foreground py-8">
                  No output yet. Execute a task to see agent responses.
                </div>
              )}
              
              {messages.map((message) => (
                <div key={message.id} className={cn(
                  "mb-4 group",
                  message.type === 'handoff' && "text-center",
                  message.type === 'system' && "text-center"
                )}>
                  {message.type === 'message' && (
                    <>
                      <div className="flex items-start gap-3">
                        <div className="p-1.5 rounded-md bg-primary/10">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm">{message.agent}</span>
                            <span className="text-xs text-muted-foreground">
                              {message.timestamp.toLocaleTimeString()}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => copyMessage(message)}
                            >
                              {copiedId === message.id ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown>{message.content}</ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  
                  {(message.type === 'handoff' || message.type === 'system') && (
                    <div className="inline-block px-3 py-1 rounded-full bg-muted text-sm">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              ))}
              
            </div>
            
            {/* Scroll to bottom button */}
            {!autoScroll && (
              <Button
                onClick={scrollToBottom}
                size="sm"
                variant="secondary"
                className="absolute bottom-4 right-4 rounded-full shadow-lg"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Status & Active Agents & Events */}
        <div className="space-y-4 flex flex-col" style={{ height: '100%' }}>
          {/* Execution Status */}
          {(isExecuting || executionId) && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className={`h-4 w-4 ${isExecuting ? 'animate-spin text-blue-500' : 'text-gray-400'}`} />
                    <span className="text-sm font-medium">
                      Status: {isExecuting ? 'Running' : 'Stopped'}
                    </span>
                  </div>
                  {executionId && (
                    <Badge variant="secondary" className="text-xs">
                      ID: {executionId.slice(0, 8)}...
                    </Badge>
                  )}
                </div>
                {isExecuting && (
                  <div className="mt-2 text-xs text-gray-600">
                    Agents are working... Use the Stop button to halt execution.
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          
          {/* Active Agents */}
          <Card className="flex-1" style={{ maxHeight: '50%' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4" />
                Active Agents ({agents.size})
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto" style={{ maxHeight: 'calc(100% - 60px)' }}>
              <div className="space-y-2">
                {Array.from(agents.values()).map((agent) => (
                  <div
                    key={agent.name}
                    className="p-2 border rounded-lg space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{agent.name}</span>
                      <Badge
                        variant={
                          agent.status === 'working' ? 'default' :
                          agent.status === 'complete' ? 'secondary' :
                          'outline'
                        }
                        className="text-xs"
                      >
                        {agent.status}
                      </Badge>
                    </div>
                    {agent.outputCount > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Outputs: {agent.outputCount}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Event Stream */}
          <Card className="flex-1" style={{ maxHeight: '50%' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity className="h-4 w-4" />
                Event Stream
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto" style={{ maxHeight: 'calc(100% - 60px)' }}>
              <div className="space-y-1 text-xs">
                {events.slice(-20).map((event, idx) => (
                  <div
                    key={`${event.id}-${idx}`}
                    className={cn(
                      "flex items-start gap-2 p-1",
                      getEventColor(event.type)
                    )}
                  >
                    {getEventIcon(event.type)}
                    <div className="flex-1 break-all">
                      <span className="font-medium">{event.type}</span>
                      {event.source && (
                        <span className="ml-1 opacity-70">({event.source})</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Human Interaction Panel */}
      {(humanQuestions.length > 0 || humanApprovals.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5" />
              Human Interaction Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Questions */}
              {humanQuestions.map((question) => (
                <Alert key={question.id}>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Question from {question.requesting_agent}</AlertTitle>
                  <AlertDescription>
                    <p className="mb-2">{question.question}</p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Your answer..."
                        value={currentAnswer}
                        onChange={(e) => setCurrentAnswer(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        onClick={() => answerQuestion(question.id)}
                      >
                        Send
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              ))}

              {/* Approvals */}
              {humanApprovals.map((approval) => (
                <Alert key={approval.id}>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Approval Required</AlertTitle>
                  <AlertDescription>
                    <p className="mb-1">
                      <strong>{approval.agent}</strong> wants to: {approval.action}
                    </p>
                    <p className="text-sm mb-2">Reason: {approval.reason}</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => provideApproval(approval.id, true)}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => provideApproval(approval.id, false)}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};