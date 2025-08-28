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
  X,
  ArrowRight,
  Terminal,
  Clock,
  TrendingUp,
  UserPlus
} from 'lucide-react';
import { ModernLayout } from '../components/layout/ModernLayout';
import { ModernChatInterface } from '../components/chat/ModernChatInterface';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { ScrollArea } from '../components/ui/scroll-area';
import { Separator } from '../components/ui/separator';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem
} from '../components/ui/dropdown-menu';
import { cn } from '../lib/utils';

// Import existing hooks
import { useSwarmExecution } from '../hooks/useSwarmExecution';
import { useStreamingPolling } from '../hooks/useStreamingPolling';
import { useChatSessions } from '../hooks/useChatSessions';
import { chatApi } from '../services/chatApi';

interface LocalAgent {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'thinking' | 'executing' | 'completed' | 'waiting';
  progress: number;
  icon: React.ElementType;
  color: string;
  tasks: number;
  successRate: number;
  currentTask?: string;
  toolsUsed?: string[];
  lastUpdate?: string;
}

interface ToolExecution {
  id: string;
  agent: string;
  tool: string;
  parameters?: any;
  result?: any;
  status: 'executing' | 'success' | 'error';
  timestamp: Date;
}

const availableAgents: LocalAgent[] = [
  {
    id: 'research_agent',
    name: 'Research Agent',
    role: 'Information gathering',
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
    role: 'Programming support',
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
    role: 'Data processing',
    status: 'idle',
    progress: 0,
    icon: Activity,
    color: 'text-green-500',
    tasks: 0,
    successRate: 97.8
  },
  {
    id: 'ux_researcher',
    name: 'UX Researcher',
    role: 'User experience',
    status: 'idle',
    progress: 0,
    icon: Zap,
    color: 'text-yellow-500',
    tasks: 0,
    successRate: 94.5
  }
];

export const ModernSwarmChatFixed: React.FC = () => {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  
  // Session management
  const {
    currentSession,
    createSession,
    loadSession,
  } = useChatSessions();

  // State management
  const [messages, setMessages] = useState<any[]>([]);
  const [activeAgents, setActiveAgents] = useState<LocalAgent[]>([]);
  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([]);
  const [isSwarmActive, setIsSwarmActive] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<string[]>(['research_agent', 'ux_researcher']);
  const [isLoading, setIsLoading] = useState(false);
  
  // Metrics
  const [swarmMetrics, setSwarmMetrics] = useState({
    totalTasks: 0,
    completedTasks: 0,
    avgResponseTime: 0,
    efficiency: 0,
    activeTime: '0m'
  });

  // Streaming hook with proper callbacks
  const {
    startStream,
    stopStream,
    isStreaming,
    error: streamError,
    metrics: streamMetrics
  } = useStreamingPolling({
    onToken: (agent: string, token: string) => {
      appendStreamingMessage(agent, token);
    },
    onAgentStart: (agent: string) => {
      updateAgentStatus(agent, 'thinking', 'Analyzing request...');
    },
    onAgentComplete: (agent: string, content: string) => {
      updateAgentStatus(agent, 'completed', 'Task completed');
      finalizeStreamingMessage(agent);
    },
    onTool: (agent: string, tool: string, filename?: string) => {
      // Add tool execution tracking
      const toolExec: ToolExecution = {
        id: `tool-${Date.now()}`,
        agent,
        tool,
        parameters: filename ? { filename } : {},
        status: 'executing',
        timestamp: new Date()
      };
      setToolExecutions(prev => [...prev, toolExec]);
      updateAgentStatus(agent, 'executing', `Using ${tool}...`);
    },
    onToolExecuted: (agent: string, data: any) => {
      // Update tool execution with result
      setToolExecutions(prev => {
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].agent === agent && updated[i].status === 'executing') {
            updated[i] = {
              ...updated[i],
              result: data.result || data.output || data,
              status: data.error ? 'error' : 'success',
              parameters: data.parameters || updated[i].parameters
            };
            break;
          }
        }
        return updated;
      });
    },
    onHandoff: (from: string, to: string) => {
      // Visual handoff
      updateAgentStatus(from, 'completed', 'Handing off...');
      updateAgentStatus(to, 'thinking', `Taking over from ${from}`);
      
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: `🔄 Agent handoff: ${from} → ${to}`,
        timestamp: new Date(),
        status: 'info'
      }]);
    },
    onComplete: () => {
      setIsLoading(false);
      setActiveAgents(prev => prev.map(a => ({
        ...a,
        status: 'completed',
        progress: 100
      })));
    },
    onError: (error: string) => {
      console.error('Stream error:', error);
      setIsLoading(false);
    }
  });

  // Helper functions
  const updateAgentStatus = (agentName: string, status: LocalAgent['status'], task?: string) => {
    setActiveAgents(prev => prev.map(agent => {
      if (agent.name === agentName) {
        return {
          ...agent,
          status,
          progress: status === 'completed' ? 100 :
                   status === 'executing' ? Math.min(75, agent.progress + 25) :
                   status === 'thinking' ? 25 : 0,
          currentTask: task || agent.currentTask,
          lastUpdate: new Date().toLocaleTimeString(),
          tasks: status === 'completed' ? agent.tasks + 1 : agent.tasks
        };
      }
      return agent;
    }));
  };

  const appendStreamingMessage = (agent: string, token: string) => {
    setMessages(prev => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg?.metadata?.agent === agent && lastMsg?.status === 'streaming') {
        return [
          ...prev.slice(0, -1),
          { ...lastMsg, content: lastMsg.content + token }
        ];
      }
      return [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: token,
        timestamp: new Date(),
        status: 'streaming',
        metadata: { agent }
      }];
    });
  };

  const finalizeStreamingMessage = (agent: string) => {
    setMessages(prev => {
      const updated = [...prev];
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].metadata?.agent === agent && updated[i].status === 'streaming') {
          updated[i] = { ...updated[i], status: 'sent' };
          break;
        }
      }
      return updated;
    });
  };

  const executeSwarm = async (query: string) => {
    setIsLoading(true);
    setToolExecutions([]);
    
    // Initialize active agents
    const agents = selectedAgents.map(id => {
      const agent = availableAgents.find(a => a.id === id)!;
      return { ...agent, status: 'thinking' as const, progress: 10 };
    });
    setActiveAgents(agents);
    setIsSwarmActive(true);

    // Prepare agent configs
    const agentConfigs = agents.map(agent => ({
      name: agent.name,
      system_prompt: `You are ${agent.name}. ${agent.role}. Be concise and effective.`,
      tools: ['tavily_search', 'file_write', 'file_read']
    }));

    try {
      await startStream(query, agentConfigs, 10);
      
      setSwarmMetrics(prev => ({
        ...prev,
        totalTasks: prev.totalTasks + 1
      }));
    } catch (error) {
      console.error('Swarm execution failed:', error);
      setIsLoading(false);
    }
  };

  // Compact Agent Card
  const CompactAgentCard = ({ agent }: { agent: LocalAgent }) => {
    const Icon = agent.icon;
    
    return (
      <div className={cn(
        "p-3 rounded-lg border transition-all duration-300",
        agent.status === 'executing' && "border-primary bg-primary/5 shadow-sm",
        agent.status === 'thinking' && "border-blue-500/50 bg-blue-500/5",
        agent.status === 'completed' && "border-green-500/50 bg-green-500/5",
        agent.status === 'idle' && "border-muted"
      )}>
        <div className="flex items-center gap-3 mb-2">
          <div className={cn(
            "p-1.5 rounded-md transition-all",
            agent.status === 'executing' && "bg-primary/20 animate-pulse",
            agent.status === 'thinking' && "bg-blue-500/20",
            agent.status === 'completed' && "bg-green-500/20",
            agent.status === 'idle' && "bg-muted"
          )}>
            <Icon className={cn(
              "h-4 w-4",
              agent.color,
              agent.status === 'executing' && "animate-spin"
            )} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{agent.name}</div>
            <div className="text-xs text-muted-foreground truncate">{agent.role}</div>
          </div>
          <Badge variant={
            agent.status === 'completed' ? 'default' :
            agent.status === 'executing' ? 'secondary' :
            agent.status === 'thinking' ? 'outline' : 'outline'
          } className="text-xs">
            {agent.status}
          </Badge>
        </div>
        
        {agent.currentTask && (
          <div className="text-xs text-muted-foreground mb-2 truncate">
            {agent.currentTask}
          </div>
        )}
        
        <Progress value={agent.progress} className="h-1.5" />
        
        {agent.toolsUsed && agent.toolsUsed.length > 0 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {agent.toolsUsed.slice(0, 3).map((tool, idx) => (
              <Badge key={idx} variant="outline" className="text-xs py-0 px-1">
                {tool}
              </Badge>
            ))}
            {agent.toolsUsed.length > 3 && (
              <Badge variant="outline" className="text-xs py-0 px-1">
                +{agent.toolsUsed.length - 3}
              </Badge>
            )}
          </div>
        )}
      </div>
    );
  };

  // Compact Tool Display
  const CompactToolDisplay = ({ execution }: { execution: ToolExecution }) => {
    return (
      <div className={cn(
        "p-2 rounded-md border text-xs",
        execution.status === 'executing' && "border-primary/50 bg-primary/5 animate-pulse",
        execution.status === 'success' && "border-green-500/50 bg-green-500/5",
        execution.status === 'error' && "border-red-500/50 bg-red-500/5"
      )}>
        <div className="flex items-center gap-2 mb-1">
          <Terminal className={cn(
            "h-3 w-3",
            execution.status === 'executing' && "text-primary animate-spin",
            execution.status === 'success' && "text-green-500",
            execution.status === 'error' && "text-red-500"
          )} />
          <span className="font-medium">{execution.tool}</span>
          <span className="text-muted-foreground">by {execution.agent}</span>
        </div>
        {execution.result && (
          <div className="text-xs text-muted-foreground truncate">
            {typeof execution.result === 'string' ? 
              execution.result.substring(0, 50) + '...' : 
              'Result available'}
          </div>
        )}
      </div>
    );
  };

  return (
    <ModernLayout>
      <div className="flex h-full">
        {/* Main Content Area - 2/3 width */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Enhanced Header */}
          <div className="border-b bg-gradient-to-r from-background via-card/50 to-background px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-primary" />
                <h1 className="text-lg font-semibold">Swarm Intelligence</h1>
                <Badge variant={isSwarmActive ? "default" : "outline"} className="text-xs">
                  {isSwarmActive ? "Active" : "Standby"}
                </Badge>
                {isStreaming && (
                  <Badge variant="secondary" className="text-xs animate-pulse">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Processing
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {/* Agent Selector */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <UserPlus className="h-4 w-4 mr-1" />
                      Agents ({selectedAgents.length})
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end">
                    <div className="px-2 py-1.5 text-sm font-semibold">Select Agents</div>
                    {availableAgents.map(agent => (
                      <DropdownMenuCheckboxItem
                        key={agent.id}
                        checked={selectedAgents.includes(agent.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedAgents(prev => [...prev, agent.id]);
                          } else {
                            setSelectedAgents(prev => prev.filter(id => id !== agent.id));
                          }
                        }}
                      >
                        <div>
                          <div className="font-medium">{agent.name}</div>
                          <div className="text-xs text-muted-foreground">{agent.role}</div>
                        </div>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/swarm/orchestrator')}
                >
                  <Settings className="h-4 w-4 mr-1" />
                  Orchestrator
                </Button>
              </div>
            </div>
          </div>

          {/* Chat Interface */}
          <div className="flex-1 overflow-hidden">
            <ModernChatInterface
              messages={messages}
              onSendMessage={executeSwarm}
              isLoading={isLoading || isStreaming}
              placeholder="Ask the swarm to help with any task..."
            />
          </div>
        </div>

        {/* Right Sidebar - 1/3 width */}
        <div className="w-96 border-l bg-card/50 flex flex-col">
          <Tabs defaultValue="agents" className="flex-1 flex flex-col">
            <TabsList className="m-3">
              <TabsTrigger value="agents" className="flex-1">
                Agents ({activeAgents.length})
              </TabsTrigger>
              <TabsTrigger value="tools" className="flex-1">
                Tools ({toolExecutions.length})
              </TabsTrigger>
              <TabsTrigger value="metrics" className="flex-1">
                Metrics
              </TabsTrigger>
            </TabsList>
            
            <ScrollArea className="flex-1">
              <TabsContent value="agents" className="px-3 pb-3 space-y-2">
                {activeAgents.length > 0 ? (
                  activeAgents.map(agent => (
                    <CompactAgentCard key={agent.id} agent={agent} />
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No active agents. Start a conversation to begin.
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="tools" className="px-3 pb-3 space-y-2">
                {toolExecutions.length > 0 ? (
                  toolExecutions.slice(-10).reverse().map(exec => (
                    <CompactToolDisplay key={exec.id} execution={exec} />
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No tools executed yet.
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="metrics" className="px-3 pb-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Performance</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Tasks</span>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-3 w-3 text-green-500" />
                        <span className="text-sm font-medium">
                          {swarmMetrics.completedTasks}/{swarmMetrics.totalTasks}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Avg Response</span>
                      <span className="text-sm font-medium">
                        {swarmMetrics.avgResponseTime.toFixed(1)}s
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Efficiency</span>
                      <Badge variant="default" className="text-xs">
                        {swarmMetrics.efficiency}%
                      </Badge>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground">Agent Performance</div>
                      {activeAgents.map(agent => (
                        <div key={agent.id} className="flex justify-between items-center">
                          <span className="text-xs">{agent.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {agent.tasks} tasks
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {agent.successRate}%
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>
      </div>
    </ModernLayout>
  );
};