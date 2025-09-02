import React, { useState, useEffect, useRef } from 'react';
import {
  Brain,
  Cpu,
  Eye,
  Settings,
  ChevronRight,
  ChevronDown,
  Activity,
  Clock,
  Target,
  AlertTriangle,
  CheckCircle,
  Pause,
  RotateCcw,
  Maximize2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

interface AgentThought {
  id: string;
  agentName: string;
  timestamp: string;
  type: 'reasoning' | 'decision' | 'planning' | 'debug';
  rawContent: string;
  parsedData?: {
    task_complete?: boolean;
    reasoning?: string;
    needed_agents?: Array<{
      role: string;
      reason: string;
      priority: string;
    }>;
    next_phase?: string;
    [key: string]: any;
  };
}

interface AgentStatus {
  name: string;
  status: 'active' | 'thinking' | 'completed' | 'waiting';
  lastThought?: string;
  thoughtCount: number;
}


interface SwarmEvent {
  id: string;
  type: string;
  data?: any;
  timestamp: number;
  agent?: string;
  severity?: 'info' | 'warning' | 'error' | 'success';
}

interface AgentState {
  name: string;
  role: string;
  status: "spawning" | "working" | "complete" | "error" | "waiting";
  content?: string;
  contentPreview: string;
  currentThought: string;
  currentTask: string;
  lastActivity: string;
  outputCount: number;
  toolsUsed: Array<{ name: string; timestamp: string }>;
  recentActions: Array<{
    type: string;
    description: string;
    timestamp: string;
  }>;
  progressHistory: Array<{
    message: string;
    timestamp: string;
    type: "thinking" | "working" | "completed" | "ai_reasoning";
  }>;
  totalTokens: number;
  executionTime: number;
  successRate: number;
  aiReasoning?: {
    task_complete?: boolean;
    reasoning?: string;
    needed_agents?: Array<{
      role: string;
      reason: string;
      priority: string;
    }>;
    next_phase?: string;
    [key: string]: any;
  };
  taskComplete?: boolean;
}

interface AgentMonitorProps {
  agents: Map<string, AgentState>;
  events: SwarmEvent[];
  isExecuting: boolean;
  executionId: string | null;
  className?: string;
}

const AgentMonitor: React.FC<AgentMonitorProps> = ({ agents, events, isExecuting, executionId, className }) => {
  const [thoughts, setThoughts] = useState<AgentThought[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<Map<string, AgentStatus>>(new Map());
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedThoughts, setExpandedThoughts] = useState<Set<string>>(new Set());
  const [isMaximized, setIsMaximized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Convert agent data to thoughts and statuses
  useEffect(() => {
    const newThoughts: AgentThought[] = [];
    const newStatuses = new Map<string, AgentStatus>();

    agents.forEach((agent, name) => {
      // Create agent status
      const status: AgentStatus['status'] = 
        agent.status === 'working' ? 'active' :
        agent.status === 'waiting' ? 'waiting' :
        agent.status === 'complete' ? 'completed' :
        agent.status === 'spawning' ? 'thinking' :
        'thinking';

      newStatuses.set(name, {
        name: name,
        status: status,
        lastThought: agent.lastActivity,
        thoughtCount: agent.progressHistory?.length || 0
      });

      // Create thought from AI reasoning if available
      if (agent.aiReasoning) {
        const thought: AgentThought = {
          id: `${name}-${Date.now()}`,
          agentName: name,
          timestamp: new Date().toISOString(),
          type: 'reasoning',
          rawContent: JSON.stringify(agent.aiReasoning, null, 2),
          parsedData: agent.aiReasoning
        };
        newThoughts.push(thought);
      }

      // Create thoughts from progress history
      agent.progressHistory?.forEach((progress, index) => {
        if (progress.type === 'ai_reasoning') {
          try {
            const parsedData = JSON.parse(progress.message);
            const thought: AgentThought = {
              id: `${name}-progress-${index}`,
              agentName: name,
              timestamp: progress.timestamp,
              type: 'reasoning',
              rawContent: progress.message,
              parsedData: parsedData
            };
            newThoughts.push(thought);
          } catch (e) {
            // If not valid JSON, create a simple thought
            const thought: AgentThought = {
              id: `${name}-progress-${index}`,
              agentName: name,
              timestamp: progress.timestamp,
              type: 'reasoning',
              rawContent: progress.message
            };
            newThoughts.push(thought);
          }
        } else if (progress.type === 'thinking') {
          // Create thought for thinking type
          const thought: AgentThought = {
            id: `${name}-progress-${index}`,
            agentName: name,
            timestamp: progress.timestamp,
            type: 'reasoning',
            rawContent: progress.message
          };
          newThoughts.push(thought);
        } else if (progress.type === 'working' || progress.type === 'completed') {
          // Create thought for decision-type activities
          const thought: AgentThought = {
            id: `${name}-progress-${index}`,
            agentName: name,
            timestamp: progress.timestamp,
            type: 'decision',
            rawContent: progress.message
          };
          newThoughts.push(thought);
        }
      });
    });

    // Sort thoughts by timestamp
    newThoughts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    setThoughts(newThoughts);
    setAgentStatuses(newStatuses);
  }, [agents]);

  // Auto-scroll to bottom when new thoughts arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thoughts, autoScroll]);

  const toggleThoughtExpanded = (thoughtId: string) => {
    setExpandedThoughts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(thoughtId)) {
        newSet.delete(thoughtId);
      } else {
        newSet.add(thoughtId);
      }
      return newSet;
    });
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getStatusIcon = (status: AgentStatus['status']) => {
    switch (status) {
      case 'active': return <Activity className="h-3 w-3 text-green-500 animate-pulse" />;
      case 'thinking': return <Brain className="h-3 w-3 text-blue-500 animate-pulse" />;
      case 'completed': return <CheckCircle className="h-3 w-3 text-gray-500" />;
      case 'waiting': return <Pause className="h-3 w-3 text-yellow-500" />;
      default: return <Cpu className="h-3 w-3 text-gray-400" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const filteredThoughts = selectedAgent 
    ? thoughts.filter(t => t.agentName === selectedAgent)
    : thoughts;

  return (
    <Card className={cn(
      "flex flex-col h-full bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-2 border-blue-200 dark:border-blue-800",
      isMaximized && "fixed inset-4 z-50 shadow-2xl",
      className
    )}>
      <CardHeader className="pb-3 border-b border-blue-200 dark:border-blue-800">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Brain className="h-5 w-5 text-blue-600" />
            Agent Monitor
            <Badge variant="outline" className="ml-2">
              {agentStatuses.size} Active
            </Badge>
          </CardTitle>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAutoScroll(!autoScroll)}
              className={cn("h-7 px-2", autoScroll && "bg-blue-100 dark:bg-blue-900")}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Auto
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMaximized(!isMaximized)}
              className="h-7 px-2"
            >
              <Maximize2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Agent Status Bar */}
        <div className="flex flex-wrap gap-2 mt-3">
          <Button
            variant={selectedAgent === null ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedAgent(null)}
            className="h-7 px-3 text-xs"
          >
            All Agents
          </Button>
          {Array.from(agentStatuses.values()).map(agent => (
            <Button
              key={agent.name}
              variant={selectedAgent === agent.name ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedAgent(agent.name)}
              className="h-7 px-3 text-xs flex items-center gap-1.5"
            >
              {getStatusIcon(agent.status)}
              {agent.name}
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
                {agent.thoughtCount}
              </Badge>
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-4 overflow-hidden">
        <div 
          ref={scrollRef}
          className="h-full overflow-y-auto space-y-4 pr-2"
          style={{ maxHeight: 'calc(100vh - 200px)' }}
        >
          {filteredThoughts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Eye className="h-12 w-12 text-gray-400 mb-3" />
              <p className="text-gray-600 dark:text-gray-400 font-medium">
                No agent thoughts yet
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Agent reasoning and decisions will appear here
              </p>
            </div>
          ) : (
            filteredThoughts.map(thought => {
              const isExpanded = expandedThoughts.has(thought.id);
              
              return (
                <div
                  key={thought.id}
                  className="bg-white dark:bg-gray-900 rounded-lg border shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Thought Header */}
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => toggleThoughtExpanded(thought.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {isExpanded ? 
                          <ChevronDown className="h-4 w-4 text-gray-500" /> : 
                          <ChevronRight className="h-4 w-4 text-gray-500" />
                        }
                        <Brain className="h-4 w-4 text-blue-500" />
                      </div>
                      
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{thought.agentName}</span>
                          <Badge variant="outline" className="text-xs">
                            {thought.type}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="h-3 w-3 text-gray-400" />
                          <span className="text-xs text-gray-500">
                            {formatTimestamp(thought.timestamp)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {thought.parsedData?.task_complete !== undefined && (
                      <Badge 
                        variant={thought.parsedData.task_complete ? "secondary" : "outline"}
                        className="ml-2"
                      >
                        {thought.parsedData.task_complete ? "Complete" : "In Progress"}
                      </Badge>
                    )}
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t bg-gray-50 dark:bg-gray-800/50">
                      {thought.parsedData ? (
                        <div className="p-4 space-y-4">
                          {/* Reasoning */}
                          {thought.parsedData.reasoning && (
                            <div>
                              <h4 className="flex items-center gap-2 text-sm font-medium mb-2">
                                <Brain className="h-4 w-4 text-purple-500" />
                                Agent Reasoning
                              </h4>
                              <div className="bg-purple-50 dark:bg-purple-950/30 p-3 rounded border-l-4 border-purple-400">
                                <p className="text-sm text-purple-800 dark:text-purple-200">
                                  {thought.parsedData.reasoning}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Needed Agents */}
                          {thought.parsedData.needed_agents && thought.parsedData.needed_agents.length > 0 && (
                            <div>
                              <h4 className="flex items-center gap-2 text-sm font-medium mb-3">
                                <Target className="h-4 w-4 text-green-500" />
                                Agents Needed ({thought.parsedData.needed_agents.length})
                              </h4>
                              <div className="space-y-2">
                                {thought.parsedData.needed_agents.map((agent, idx) => (
                                  <div 
                                    key={idx}
                                    className="bg-white dark:bg-gray-900 p-3 rounded border"
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="font-medium text-sm">{agent.role}</span>
                                      <Badge 
                                        className={cn("text-xs", getPriorityColor(agent.priority))}
                                      >
                                        {agent.priority} priority
                                      </Badge>
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-300">
                                      {agent.reason}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Next Phase */}
                          {thought.parsedData.next_phase && (
                            <div>
                              <h4 className="flex items-center gap-2 text-sm font-medium mb-2">
                                <AlertTriangle className="h-4 w-4 text-orange-500" />
                                Next Phase
                              </h4>
                              <div className="bg-orange-50 dark:bg-orange-950/30 p-3 rounded border-l-4 border-orange-400">
                                <p className="text-sm text-orange-800 dark:text-orange-200">
                                  {thought.parsedData.next_phase}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Raw JSON - Collapsible */}
                          <details className="mt-4">
                            <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 flex items-center gap-2">
                              <Settings className="h-3 w-3" />
                              View Raw JSON
                            </summary>
                            <div className="mt-2 bg-gray-900 dark:bg-gray-950 rounded p-3 overflow-x-auto">
                              <pre className="text-xs text-green-400 whitespace-pre-wrap font-mono">
                                {JSON.stringify(thought.parsedData, null, 2)}
                              </pre>
                            </div>
                          </details>
                        </div>
                      ) : (
                        /* Raw Content Display */
                        <div className="p-4">
                          <div className="bg-gray-900 dark:bg-gray-950 rounded p-3 overflow-x-auto">
                            <pre className="text-xs text-green-400 whitespace-pre-wrap font-mono">
                              {thought.rawContent}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default AgentMonitor;