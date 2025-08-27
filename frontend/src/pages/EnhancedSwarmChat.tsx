import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Sparkles,
  Bot,
  User,
  Zap,
  Activity,
  Brain,
  MessageSquare,
  Settings,
  Play,
  Pause,
  StopCircle,
  RefreshCw,
  ChevronRight,
  Layers,
  GitBranch,
  Target,
  Workflow
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ScrollArea } from '../components/ui/scroll-area';
import { Separator } from '../components/ui/separator';
import { Progress } from '../components/ui/progress';
import { cn } from '../lib/utils';
import { AgentHandoffFlow } from '../components/AgentHandoffFlow';
import { ToolExecutionCard } from '../components/ToolExecutionCard';
import { ModernOrchestratorPanel } from '../components/ModernOrchestratorPanel';
import { useSwarmExecution } from '../hooks/useSwarmExecution';
import { useStreamingPolling } from '../hooks/useStreamingPolling';
import { useChatSessions } from '../hooks/useChatSessions';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  agentName?: string;
  agentColor?: string;
  toolExecutions?: any[];
  status?: 'streaming' | 'complete' | 'error';
}

interface SwarmMetrics {
  totalAgents: number;
  activeAgents: number;
  completedTasks: number;
  totalTokens: number;
  avgResponseTime: number;
}

export const EnhancedSwarmChat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'swarm' | 'conversation' | 'orchestrator'>('swarm');
  const [showOrchestrator, setShowOrchestrator] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [handoffs, setHandoffs] = useState<any[]>([]);
  const [toolExecutions, setToolExecutions] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<SwarmMetrics>({
    totalAgents: 0,
    activeAgents: 0,
    completedTasks: 0,
    totalTokens: 0,
    avgResponseTime: 0
  });
  const [workflowStatus, setWorkflowStatus] = useState<'idle' | 'running' | 'paused' | 'completed'>('idle');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Hooks
  const { sessions, currentSession, createSession } = useChatSessions();
  const { execute, stop, isExecuting } = useSwarmExecution();
  const {
    startStream,
    stopStream,
    isStreaming,
    metrics: streamMetrics
  } = useStreamingPolling({
    onToken: (agent: string, token: string) => {
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage?.agentName === agent && lastMessage?.status === 'streaming') {
          return [...prev.slice(0, -1), {
            ...lastMessage,
            content: lastMessage.content + token
          }];
        }
        return [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: token,
          timestamp: new Date(),
          agentName: agent,
          agentColor: getAgentColor(agent),
          status: 'streaming'
        }];
      });
    },
    onComplete: () => {
      setMessages(prev => prev.map(msg => 
        msg.status === 'streaming' ? { ...msg, status: 'complete' } : msg
      ));
      setWorkflowStatus('completed');
    },
    onError: (error: string) => {
      console.error('Stream error:', error);
      setWorkflowStatus('idle');
    }
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getAgentColor = (agentName: string) => {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    const index = agentName.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setWorkflowStatus('running');

    if (mode === 'swarm') {
      // Execute with swarm
      await execute({
        task: input,
        agents: agents.length > 0 ? agents : []
      });
    } else if (mode === 'conversation') {
      // Start streaming for conversation mode
      if (currentSession) {
        // For conversation mode, pass the input as task and empty agents array
        await startStream(input, []);
      }
    }
  };

  const handleOrchestratorStart = (workflow: any) => {
    setAgents(workflow.agents || []);
    setShowOrchestrator(false);
    setWorkflowStatus('running');
    
    // Start execution with the configured agents
    execute({
      task: workflow.task,
      agents: workflow.agents
    });
  };

  const getModeIcon = (mode: string) => {
    switch (mode) {
      case 'swarm': return <GitBranch className="h-4 w-4" />;
      case 'conversation': return <MessageSquare className="h-4 w-4" />;
      case 'orchestrator': return <Workflow className="h-4 w-4" />;
      default: return <Brain className="h-4 w-4" />;
    }
  };

  const getModeDescription = (mode: string) => {
    switch (mode) {
      case 'swarm': return 'Multi-agent collaboration for complex tasks';
      case 'conversation': return 'Research and analysis with persistent memory';
      case 'orchestrator': return 'Configure and deploy custom agent teams';
      default: return '';
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500">
                  <Brain className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    Thrivix Swarm Intelligence
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    {getModeDescription(mode)}
                  </p>
                </div>
              </div>
            </div>

            {/* Mode Selector */}
            <Tabs value={mode} onValueChange={(v: any) => setMode(v)} className="w-auto">
              <TabsList className="grid grid-cols-3 w-[400px]">
                <TabsTrigger value="swarm" className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  Swarm
                </TabsTrigger>
                <TabsTrigger value="conversation" className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Research
                </TabsTrigger>
                <TabsTrigger value="orchestrator" className="flex items-center gap-2">
                  <Workflow className="h-4 w-4" />
                  Orchestrator
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Metrics */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  <span className="font-semibold">{metrics.activeAgents}</span>
                  <span className="text-muted-foreground">/{metrics.totalAgents} agents</span>
                </span>
              </div>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  <span className="font-semibold">{metrics.completedTasks}</span>
                  <span className="text-muted-foreground"> tasks</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <div className="container mx-auto px-4 py-4 h-full">
          <div className="grid grid-cols-12 gap-4 h-full">
            {/* Agent Flow Panel */}
            {mode === 'swarm' && agents.length > 0 && (
              <div className="col-span-12 lg:col-span-4 space-y-4 overflow-y-auto">
                <AgentHandoffFlow
                  agents={agents.map(a => ({
                    ...a,
                    status: workflowStatus === 'running' ? 'working' : 'idle'
                  }))}
                  handoffs={handoffs}
                  workflowStatus={workflowStatus}
                />
                
                {/* Tool Executions */}
                {toolExecutions.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Tool Executions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
                      {toolExecutions.slice(-5).reverse().map((exec, index) => (
                        <ToolExecutionCard key={index} execution={exec} />
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Chat Panel */}
            <div className={cn(
              "space-y-4 flex flex-col",
              mode === 'swarm' && agents.length > 0 ? "col-span-12 lg:col-span-8" : "col-span-12"
            )}>
              {/* Orchestrator Panel */}
              {mode === 'orchestrator' && (
                <div className="flex-1 overflow-hidden">
                  <ModernOrchestratorPanel
                    onWorkflowStart={handleOrchestratorStart}
                    onClose={() => setMode('swarm')}
                  />
                </div>
              )}

              {/* Chat Messages */}
              {mode !== 'orchestrator' && (
                <>
                  <Card className="flex-1 overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Chat</CardTitle>
                        {workflowStatus !== 'idle' && (
                          <Badge variant={workflowStatus === 'running' ? 'default' : 'outline'}>
                            {workflowStatus}
                          </Badge>
                        )}
                      </div>
                      {isExecuting && (
                        <Progress value={50} className="h-1 mt-2" />
                      )}
                    </CardHeader>
                    <CardContent className="p-0">
                      <ScrollArea className="h-[calc(100vh-320px)] px-4">
                        <div className="space-y-4 py-4">
                          {messages.map((message) => (
                            <div
                              key={message.id}
                              className={cn(
                                "flex gap-3",
                                message.role === 'user' ? "justify-end" : "justify-start"
                              )}
                            >
                              {message.role !== 'user' && (
                                <div className="flex-shrink-0">
                                  <div 
                                    className="h-8 w-8 rounded-full flex items-center justify-center"
                                    style={{ 
                                      backgroundColor: message.agentColor || '#6366f1',
                                      opacity: 0.1
                                    }}
                                  >
                                    <Bot 
                                      className="h-5 w-5" 
                                      style={{ color: message.agentColor || '#6366f1' }}
                                    />
                                  </div>
                                </div>
                              )}
                              
                              <div className={cn(
                                "max-w-[70%] space-y-1",
                                message.role === 'user' ? "items-end" : "items-start"
                              )}>
                                {message.agentName && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold" style={{ color: message.agentColor }}>
                                      {message.agentName}
                                    </span>
                                    {message.status === 'streaming' && (
                                      <Badge variant="outline" className="text-xs py-0 h-4">
                                        <Activity className="h-3 w-3 mr-1 animate-pulse" />
                                        streaming
                                      </Badge>
                                    )}
                                  </div>
                                )}
                                
                                <div className={cn(
                                  "rounded-2xl px-4 py-2 text-sm",
                                  message.role === 'user' 
                                    ? "bg-primary text-primary-foreground ml-auto" 
                                    : "bg-muted",
                                  message.status === 'streaming' && "animate-pulse"
                                )}>
                                  {message.content}
                                </div>
                                
                                <span className="text-xs text-muted-foreground">
                                  {new Date(message.timestamp).toLocaleTimeString()}
                                </span>
                              </div>

                              {message.role === 'user' && (
                                <div className="flex-shrink-0">
                                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                    <User className="h-5 w-5 text-primary" />
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                          <div ref={messagesEndRef} />
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>

                  {/* Input Area */}
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex gap-2">
                        <Input
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                          placeholder={
                            mode === 'swarm' 
                              ? "Describe a complex task for the agent swarm..." 
                              : "Ask anything for research and analysis..."
                          }
                          className="flex-1"
                          disabled={isExecuting || isStreaming}
                        />
                        
                        {(isExecuting || isStreaming) ? (
                          <Button 
                            onClick={() => isExecuting ? stop('current') : stopStream()}
                            variant="destructive"
                            size="icon"
                          >
                            <StopCircle className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button onClick={handleSend} size="icon">
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                        
                        {mode === 'swarm' && (
                          <Button
                            onClick={() => setShowOrchestrator(!showOrchestrator)}
                            variant="outline"
                            size="icon"
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};