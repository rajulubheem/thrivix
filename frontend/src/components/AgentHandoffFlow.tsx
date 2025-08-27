import React, { useEffect, useState } from 'react';
import {
  Users,
  ArrowRight,
  CheckCircle,
  Clock,
  Play,
  Pause,
  RotateCw,
  Sparkles,
  Zap,
  Brain,
  MessageSquare,
  Activity
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'working' | 'completed' | 'waiting' | 'handoff';
  color: string;
  progress?: number;
  currentTask?: string;
  message?: string;
}

interface Handoff {
  fromAgent: string;
  toAgent: string;
  reason: string;
  data?: any;
  timestamp: Date;
}

interface AgentHandoffFlowProps {
  agents: Agent[];
  handoffs: Handoff[];
  currentAgentId?: string;
  onAgentClick?: (agentId: string) => void;
  workflowStatus?: 'idle' | 'running' | 'paused' | 'completed';
}

export const AgentHandoffFlow: React.FC<AgentHandoffFlowProps> = ({
  agents,
  handoffs,
  currentAgentId,
  onAgentClick,
  workflowStatus = 'idle'
}) => {
  const [animatingHandoff, setAnimatingHandoff] = useState<string | null>(null);
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  // Animate handoffs
  useEffect(() => {
    if (handoffs.length > 0) {
      const latestHandoff = handoffs[handoffs.length - 1];
      const handoffKey = `${latestHandoff.fromAgent}-${latestHandoff.toAgent}`;
      setAnimatingHandoff(handoffKey);
      setTimeout(() => setAnimatingHandoff(null), 1500);
    }
  }, [handoffs]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'working': return <Activity className="h-4 w-4 animate-pulse" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'waiting': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'handoff': return <ArrowRight className="h-4 w-4 text-blue-500" />;
      default: return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getWorkflowIcon = () => {
    switch (workflowStatus) {
      case 'running': return <Play className="h-4 w-4 text-green-500" />;
      case 'paused': return <Pause className="h-4 w-4 text-yellow-500" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      default: return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle>Agent Collaboration Flow</CardTitle>
            <Badge variant="outline" className="ml-2">
              {agents.length} Agents
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {getWorkflowIcon()}
            <span className="text-sm font-medium capitalize">{workflowStatus}</span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-6">
        {/* Agent Flow Visualization */}
        <div className="relative">
          <div className="flex items-center justify-between gap-4 overflow-x-auto pb-4">
            {agents.map((agent, index) => {
              const isActive = agent.id === currentAgentId;
              const hasHandoffFrom = handoffs.some(h => h.fromAgent === agent.id);
              const hasHandoffTo = handoffs.some(h => h.toAgent === agent.id);
              const handoffKey = index > 0 ? `${agents[index - 1].id}-${agent.id}` : null;
              const isAnimating = handoffKey === animatingHandoff;

              return (
                <React.Fragment key={agent.id}>
                  {/* Connection Line */}
                  {index > 0 && (
                    <div className="relative flex-shrink-0">
                      <div className={cn(
                        "h-[2px] w-16 bg-gradient-to-r transition-all duration-500",
                        isAnimating 
                          ? "from-blue-500 via-purple-500 to-pink-500 animate-pulse" 
                          : "from-gray-200 to-gray-200"
                      )}>
                        {isAnimating && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Sparkles className="h-4 w-4 text-purple-500 animate-bounce" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Agent Card */}
                  <div
                    className={cn(
                      "relative flex-shrink-0 transition-all duration-300",
                      isActive && "scale-110",
                      hoveredAgent === agent.id && "scale-105"
                    )}
                    onMouseEnter={() => setHoveredAgent(agent.id)}
                    onMouseLeave={() => setHoveredAgent(null)}
                    onClick={() => onAgentClick?.(agent.id)}
                  >
                    <div className={cn(
                      "relative p-4 rounded-xl border-2 bg-card cursor-pointer",
                      "transition-all duration-300 min-w-[200px]",
                      isActive && "border-primary shadow-xl ring-4 ring-primary/20",
                      !isActive && "border-border hover:border-primary/50 hover:shadow-lg",
                      agent.status === 'working' && "animate-pulse"
                    )}>
                      {/* Glowing Effect for Active Agent */}
                      {isActive && (
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 animate-pulse" />
                      )}

                      {/* Agent Content */}
                      <div className="relative space-y-3">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div 
                              className={cn(
                                "h-3 w-3 rounded-full",
                                agent.status === 'working' && "animate-pulse"
                              )}
                              style={{ backgroundColor: agent.color }}
                            />
                            <span className="font-semibold text-sm">{agent.name}</span>
                          </div>
                          {getStatusIcon(agent.status)}
                        </div>

                        {/* Role */}
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {agent.role}
                        </p>

                        {/* Current Task */}
                        {agent.currentTask && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium">Current Task:</p>
                            <p className="text-xs text-muted-foreground italic">
                              "{agent.currentTask}"
                            </p>
                          </div>
                        )}

                        {/* Progress */}
                        {agent.progress !== undefined && agent.status === 'working' && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span>Progress</span>
                              <span>{agent.progress}%</span>
                            </div>
                            <Progress value={agent.progress} className="h-1" />
                          </div>
                        )}

                        {/* Message */}
                        {agent.message && (
                          <div className="flex items-start gap-1 p-2 bg-muted rounded-lg">
                            <MessageSquare className="h-3 w-3 mt-0.5 text-muted-foreground" />
                            <p className="text-xs italic">{agent.message}</p>
                          </div>
                        )}

                        {/* Status Badge */}
                        <Badge 
                          variant={agent.status === 'completed' ? 'default' : 'outline'}
                          className="text-xs"
                        >
                          {agent.status}
                        </Badge>
                      </div>
                    </div>

                    {/* Handoff Indicator */}
                    {(hasHandoffFrom || hasHandoffTo) && (
                      <div className="absolute -top-2 -right-2 z-10">
                        <div className="relative">
                          <Zap className="h-5 w-5 text-yellow-500 animate-pulse" />
                          <div className="absolute inset-0 bg-yellow-500 rounded-full animate-ping opacity-75" />
                        </div>
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          {/* Handoff History */}
          {handoffs.length > 0 && (
            <div className="mt-6 space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <RotateCw className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Handoff History</span>
                <Badge variant="outline" className="text-xs">
                  {handoffs.length} handoffs
                </Badge>
              </div>
              
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {handoffs.slice(-5).reverse().map((handoff, index) => (
                  <div 
                    key={index}
                    className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 text-xs"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <Badge variant="outline" className="text-xs">
                        {handoff.fromAgent}
                      </Badge>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <Badge variant="outline" className="text-xs">
                        {handoff.toAgent}
                      </Badge>
                    </div>
                    <span className="text-muted-foreground italic">
                      {handoff.reason}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(handoff.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};