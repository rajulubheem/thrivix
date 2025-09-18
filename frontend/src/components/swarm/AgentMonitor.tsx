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
  Maximize2,
  Users
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
    <div className={cn(
      "flex flex-col h-full bg-white dark:bg-gray-800",
      isMaximized && "fixed inset-4 z-50 shadow-2xl",
      className
    )}>
      {/* Header Section */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
              <Brain className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Agent Intelligence Monitor
              </h3>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                Real-time agent reasoning & decisions
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAutoScroll(!autoScroll)}
              className={cn(
                "h-6 px-2 text-xs",
                autoScroll && "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
              )}
            >
              <RotateCcw className={cn(
                "h-3 w-3 mr-1",
                autoScroll && "animate-spin"
              )} />
              Auto
            </Button>
            
            {isMaximized && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMaximized(false)}
                className="h-6 px-2"
              >
                <Maximize2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Agent Filter Pills */}
        {agentStatuses.size > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedAgent(null)}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all",
                selectedAgent === null
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
              )}
            >
              All
              <span className={cn(
                "ml-1 px-1 rounded-full",
                selectedAgent === null
                  ? "bg-blue-200 dark:bg-blue-800"
                  : "bg-gray-200 dark:bg-gray-600"
              )}>
                {agentStatuses.size}
              </span>
            </button>
            {Array.from(agentStatuses.values()).map(agent => {
              const extractRole = (name: string) => {
                const parts = name.split('_');
                if (parts.length > 1 && /^[a-f0-9]{8}$/.test(parts[parts.length - 1])) {
                  return parts.slice(0, -1).join(' ');
                }
                return name;
              };
              
              return (
                <button
                  key={agent.name}
                  onClick={() => setSelectedAgent(agent.name)}
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all",
                    selectedAgent === agent.name
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                  )}
                >
                  {getStatusIcon(agent.status)}
                  <span className="truncate max-w-[100px]">{extractRole(agent.name)}</span>
                  {agent.thoughtCount > 0 && (
                    <span className={cn(
                      "ml-1 px-1 rounded-full text-[10px]",
                      selectedAgent === agent.name
                        ? "bg-blue-200 dark:bg-blue-800"
                        : "bg-gray-200 dark:bg-gray-600"
                    )}>
                      {agent.thoughtCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        <div 
          ref={scrollRef}
          className="h-full overflow-y-auto p-4 space-y-3"
        >
          {filteredThoughts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-purple-600 rounded-full blur-3xl opacity-20 animate-pulse" />
                <div className="relative bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-8">
                  <div className="flex justify-center mb-4">
                    <div className="p-3 bg-gradient-to-br from-blue-500/10 to-purple-600/10 rounded-xl">
                      <Brain className="h-8 w-8 text-gray-400" />
                    </div>
                  </div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    No Agent Activity Yet
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[200px]">
                    Agent thoughts and reasoning will appear here as they process tasks
                  </p>
                </div>
              </div>
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
      </div>
    </div>
  );
};

export default AgentMonitor;