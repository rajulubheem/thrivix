import React, { useState } from 'react';
import {
  Bot,
  Brain,
  Zap,
  Wrench,
  Clock,
  ChevronDown,
  ChevronUp,
  Activity,
  MessageSquare,
  Target,
  TrendingUp,
  Sparkles
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

interface AgentAction {
  type: string;
  description: string;
  timestamp: string;
  details?: string;
}

interface AgentTool {
  name: string;
  timestamp: string;
  status?: 'using' | 'completed' | 'failed';
}

interface AgentProgress {
  message: string;
  timestamp: string;
  type: 'thinking' | 'working' | 'completed' | 'ai_reasoning';
}

export interface DetailedAgentState {
  name: string;
  role: string;
  status: 'idle' | 'working' | 'waiting' | 'complete' | 'error';
  lastActivity?: string;
  outputCount: number;
  
  // Enhanced tracking
  content?: string; // Full accumulated content for compatibility
  currentTask?: string;
  currentThought?: string;
  recentActions?: AgentAction[];
  toolsUsed?: AgentTool[];
  progressHistory?: AgentProgress[];
  contentPreview?: string;
  
  // AI Reasoning & Decision Making
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
  
  // Performance metrics
  totalTokens?: number;
  executionTime?: number;
  successRate?: number;
}

interface ActiveAgentsPanelProps {
  agents: Map<string, DetailedAgentState>;
  isExecuting?: boolean;
  onAgentSelect?: (agentName: string) => void;
}

const ActiveAgentsPanel: React.FC<ActiveAgentsPanelProps> = ({
  agents,
  isExecuting = false,
  onAgentSelect
}) => {
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [selectedView, setSelectedView] = useState<'overview' | 'detailed'>('overview');

  const toggleAgentExpanded = (agentName: string) => {
    setExpandedAgents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(agentName)) {
        newSet.delete(agentName);
      } else {
        newSet.add(agentName);
      }
      return newSet;
    });
  };

  const getStatusIcon = (status: DetailedAgentState['status']) => {
    switch (status) {
      case 'working':
        return <Activity className="h-4 w-4 text-green-500 animate-pulse" />;
      case 'complete':
        return <Target className="h-4 w-4 text-blue-500" />;
      case 'waiting':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <Sparkles className="h-4 w-4 text-red-500" />;
      default:
        return <Bot className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: DetailedAgentState['status']) => {
    switch (status) {
      case 'working': return 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800';
      case 'complete': return 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800';
      case 'waiting': return 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800';
      case 'error': return 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800';
      default: return 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800';
    }
  };

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const cleanContentPreview = (content?: string) => {
    if (!content) return '';
    
    // Remove debug logs and raw data
    const cleaned = content
      .replace(/DEBUG:[^\\n]*/g, '')
      .replace(/\{[^}]*\}/g, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/['"]{2,}/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    
    return cleaned.length > 80 ? cleaned.slice(-80) + '...' : cleaned;
  };

  const agentsArray = Array.from(agents.values());
  const workingAgents = agentsArray.filter(a => a.status === 'working');
  const completedAgents = agentsArray.filter(a => a.status === 'complete');

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5 text-blue-500" />
            Active Agents ({agents.size})
          </CardTitle>
          
          {/* View Toggle */}
          <div className="flex items-center gap-1">
            <Button
              variant={selectedView === 'overview' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedView('overview')}
              className="text-xs px-2 py-1"
            >
              Overview
            </Button>
            <Button
              variant={selectedView === 'detailed' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedView('detailed')}
              className="text-xs px-2 py-1"
            >
              Detailed
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        {agents.size > 0 && (
          <div className="flex gap-4 text-sm text-muted-foreground mt-2">
            <div className="flex items-center gap-1">
              <Activity className="h-3 w-3 text-green-500" />
              <span>Working: {workingAgents.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <Target className="h-3 w-3 text-blue-500" />
              <span>Complete: {completedAgents.length}</span>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-auto px-4 pb-4">
        {agents.size === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Bot className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No agents active yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Agents will appear here when execution starts
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {agentsArray.map((agent) => {
              const isExpanded = expandedAgents.has(agent.name);
              const isSelected = false; // Could be connected to onAgentSelect

              return (
                <div
                  key={agent.name}
                  className={cn(
                    'border rounded-lg transition-all duration-200 hover:shadow-sm',
                    getStatusColor(agent.status),
                    isSelected && 'ring-2 ring-blue-500'
                  )}
                >
                  {/* Agent Header - Always Visible */}
                  <div
                    className="p-3 cursor-pointer"
                    onClick={() => {
                      toggleAgentExpanded(agent.name);
                      onAgentSelect?.(agent.name);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(agent.status)}
                        <div>
                          <div className="font-medium text-sm flex items-center gap-2">
                            {agent.name}
                            <Badge variant="outline" className="text-xs">
                              {agent.role}
                            </Badge>
                          </div>
                          {agent.currentTask && (
                            <div className="text-xs text-muted-foreground mt-1 max-w-md truncate">
                              {agent.currentTask}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            agent.status === 'working' ? 'default' :
                            agent.status === 'complete' ? 'secondary' :
                            'outline'
                          }
                          className="text-xs capitalize"
                        >
                          {agent.status}
                        </Badge>
                        
                        {selectedView === 'detailed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-1 h-6 w-6"
                          >
                            {isExpanded ? 
                              <ChevronUp className="h-3 w-3" /> : 
                              <ChevronDown className="h-3 w-3" />
                            }
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Current Thought/Activity - Always show if available */}
                    {agent.currentThought && (
                      <div className="mt-2 p-2 bg-white/50 dark:bg-black/20 rounded text-xs border">
                        <div className="flex items-start gap-2">
                          <Brain className="h-3 w-3 mt-0.5 text-blue-500 flex-shrink-0" />
                          <span className="italic text-blue-700 dark:text-blue-300">
                            {agent.currentThought}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Content Preview - Only for working agents */}
                    {agent.contentPreview && agent.status === 'working' && (
                      <div className="mt-2 p-2 bg-white/50 dark:bg-black/20 rounded text-xs border">
                        <div className="flex items-start gap-2">
                          <MessageSquare className="h-3 w-3 mt-0.5 text-green-500 flex-shrink-0" />
                          <span className="font-mono text-green-700 dark:text-green-300">
                            {cleanContentPreview(agent.contentPreview)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Expanded Details - Only in detailed view */}
                  {selectedView === 'detailed' && isExpanded && (
                    <div className="border-t bg-white/30 dark:bg-black/10 px-3 pb-3">
                      <div className="pt-3 space-y-3">
                        {/* Performance Metrics */}
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="text-center p-2 bg-white/50 dark:bg-black/20 rounded">
                            <div className="font-medium">{agent.outputCount}</div>
                            <div className="text-muted-foreground">Outputs</div>
                          </div>
                          <div className="text-center p-2 bg-white/50 dark:bg-black/20 rounded">
                            <div className="font-medium">
                              {agent.totalTokens ? agent.totalTokens.toLocaleString() : '0'}
                            </div>
                            <div className="text-muted-foreground">Tokens</div>
                          </div>
                          <div className="text-center p-2 bg-white/50 dark:bg-black/20 rounded">
                            <div className="font-medium">
                              {agent.lastActivity ? formatTime(agent.lastActivity) : '--'}
                            </div>
                            <div className="text-muted-foreground">Last Active</div>
                          </div>
                        </div>

                        {/* Recent Tools */}
                        {agent.toolsUsed && agent.toolsUsed.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Wrench className="h-3 w-3 text-orange-500" />
                              <span className="text-xs font-medium">Recent Tools</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {agent.toolsUsed.slice(-4).map((tool, idx) => (
                                <Badge 
                                  key={idx} 
                                  variant="outline" 
                                  className="text-xs px-2 py-0.5"
                                >
                                  {tool.name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Recent Actions */}
                        {agent.recentActions && agent.recentActions.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Zap className="h-3 w-3 text-yellow-500" />
                              <span className="text-xs font-medium">Recent Actions</span>
                            </div>
                            <div className="space-y-1">
                              {agent.recentActions.slice(-3).map((action, idx) => (
                                <div 
                                  key={idx}
                                  className="flex items-center justify-between text-xs p-2 bg-white/30 dark:bg-black/20 rounded"
                                >
                                  <span>{action.description}</span>
                                  <span className="text-muted-foreground">
                                    {formatTime(action.timestamp)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Progress Timeline */}
                        {agent.progressHistory && agent.progressHistory.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <TrendingUp className="h-3 w-3 text-blue-500" />
                              <span className="text-xs font-medium">Progress Timeline</span>
                            </div>
                            <div className="space-y-1 max-h-24 overflow-y-auto">
                              {agent.progressHistory.slice(-5).map((progress, idx) => (
                                <div 
                                  key={idx}
                                  className="text-xs p-2 bg-white/30 dark:bg-black/20 rounded border-l-2 border-blue-400"
                                >
                                  <div>{progress.message}</div>
                                  <div className="text-muted-foreground mt-1">
                                    {formatTime(progress.timestamp)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ActiveAgentsPanel;