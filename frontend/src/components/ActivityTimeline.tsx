import React, { useState } from 'react';
import { 
  Brain, 
  Zap, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Clock,
  Activity,
  Code2,
  Database,
  Terminal,
  Search,
  MessageSquare,
  ArrowRight,
  Loader2,
  FileCode,
  Settings
} from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

export interface TimelineEvent {
  id: string;
  type: 'start' | 'thought' | 'action' | 'tool' | 'handoff' | 'complete' | 'error' | 'agent';
  agent?: string;
  title: string;
  description?: string;
  details?: any;
  timestamp: Date;
  duration?: number;
  status?: 'pending' | 'running' | 'success' | 'error';
  icon?: React.ElementType;
  color?: string;
  expanded?: boolean;
  children?: TimelineEvent[];
}

interface ActivityTimelineProps {
  events: TimelineEvent[];
  className?: string;
  compact?: boolean;
  onEventClick?: (event: TimelineEvent) => void;
}

const getEventIcon = (event: TimelineEvent) => {
  if (event.icon) return event.icon;
  
  switch (event.type) {
    case 'start':
      return Activity;
    case 'thought':
      return Brain;
    case 'action':
      return Zap;
    case 'tool':
      return Terminal;
    case 'handoff':
      return ArrowRight;
    case 'complete':
      return CheckCircle2;
    case 'error':
      return XCircle;
    case 'agent':
      return Settings;
    default:
      return AlertCircle;
  }
};

const getEventColor = (event: TimelineEvent) => {
  if (event.color) return event.color;
  
  switch (event.type) {
    case 'start':
      return 'text-blue-500';
    case 'thought':
      return 'text-purple-500';
    case 'action':
      return 'text-green-500';
    case 'tool':
      return 'text-orange-500';
    case 'handoff':
      return 'text-cyan-500';
    case 'complete':
      return 'text-emerald-500';
    case 'error':
      return 'text-red-500';
    case 'agent':
      return 'text-indigo-500';
    default:
      return 'text-gray-500';
  }
};

const getStatusBadge = (status?: string) => {
  if (!status) return null;
  
  const variants: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-700',
    running: 'bg-blue-100 text-blue-700',
    success: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700'
  };
  
  return (
    <Badge className={cn('text-xs', variants[status] || variants.pending)}>
      {status === 'running' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
      {status}
    </Badge>
  );
};

const TimelineEventItem: React.FC<{
  event: TimelineEvent;
  isLast: boolean;
  depth?: number;
  compact?: boolean;
  onEventClick?: (event: TimelineEvent) => void;
}> = ({ event, isLast, depth = 0, compact, onEventClick }) => {
  const [expanded, setExpanded] = useState(event.expanded ?? false);
  const Icon = getEventIcon(event);
  const hasDetails = event.details || event.description || event.children?.length;
  
  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };
  
  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };
  
  return (
    <div className={cn('relative', depth > 0 && 'ml-6')}>
      {/* Connection line */}
      {!isLast && (
        <div 
          className={cn(
            'absolute left-4 top-10 bottom-0 w-0.5',
            depth > 0 ? 'bg-gray-200' : 'bg-gradient-to-b from-gray-300 to-gray-100'
          )}
        />
      )}
      
      <div className="relative flex items-start gap-3 pb-4">
        {/* Icon with pulse animation for running status */}
        <div className={cn(
          'relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 bg-background transition-all',
          getEventColor(event).replace('text-', 'border-'),
          event.status === 'running' && 'animate-pulse'
        )}>
          <Icon className={cn('h-4 w-4', getEventColor(event))} />
          {event.status === 'running' && (
            <div className="absolute inset-0 rounded-full bg-current opacity-20 animate-ping" />
          )}
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => {
                    if (hasDetails) setExpanded(!expanded);
                    onEventClick?.(event);
                  }}
                  className={cn(
                    'font-medium text-sm hover:underline text-left',
                    hasDetails && 'cursor-pointer flex items-center gap-1'
                  )}
                >
                  {hasDetails && (
                    expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
                  )}
                  {event.title}
                </button>
                {event.agent && (
                  <Badge variant="outline" className="text-xs">
                    {event.agent}
                  </Badge>
                )}
                {getStatusBadge(event.status)}
              </div>
              
              {!compact && (
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(event.timestamp)}
                  </span>
                  {event.duration && (
                    <span className="flex items-center gap-1">
                      <Activity className="h-3 w-3" />
                      {formatDuration(event.duration)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Expanded details */}
          {expanded && hasDetails && (
            <div className="mt-3 space-y-2">
              {event.description && (
                <p className="text-sm text-muted-foreground">
                  {event.description}
                </p>
              )}
              
              {event.details && (
                <Card className="bg-muted/30">
                  <div className="p-3">
                    {typeof event.details === 'object' ? (
                      event.details.code ? (
                        <pre className="bg-muted p-2 rounded-md overflow-x-auto">
                          <code className="text-xs">
                            {event.details.code}
                          </code>
                        </pre>
                      ) : (
                        <pre className="text-xs overflow-auto">
                          {JSON.stringify(event.details, null, 2)}
                        </pre>
                      )
                    ) : (
                      <p className="text-sm">{event.details}</p>
                    )}
                  </div>
                </Card>
              )}
              
              {event.children && event.children.length > 0 && (
                <div className="border-l-2 border-gray-200 pl-2">
                  {event.children.map((child, index) => (
                    <TimelineEventItem
                      key={child.id}
                      event={child}
                      isLast={index === (event.children?.length || 0) - 1}
                      depth={depth + 1}
                      compact={compact}
                      onEventClick={onEventClick}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  events,
  className,
  compact = false,
  onEventClick
}) => {
  const [filter, setFilter] = useState<string>('all');
  
  const filteredEvents = events.filter(event => {
    if (filter === 'all') return true;
    if (filter === 'errors') return event.type === 'error' || event.status === 'error';
    if (filter === 'tools') return event.type === 'tool';
    if (filter === 'thoughts') return event.type === 'thought';
    if (filter === 'handoffs') return event.type === 'handoff';
    if (filter === 'agents') return event.type === 'agent';
    return true;
  });
  
  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Filter buttons */}
      <div className="flex items-center gap-2 p-3 border-b flex-wrap">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          All ({events.length})
        </Button>
        <Button
          variant={filter === 'thoughts' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('thoughts')}
        >
          <Brain className="h-3 w-3 mr-1" />
          Thoughts
        </Button>
        <Button
          variant={filter === 'tools' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('tools')}
        >
          <Terminal className="h-3 w-3 mr-1" />
          Tools
        </Button>
        <Button
          variant={filter === 'handoffs' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('handoffs')}
        >
          <ArrowRight className="h-3 w-3 mr-1" />
          Handoffs
        </Button>
        <Button
          variant={filter === 'agents' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('agents')}
        >
          <Settings className="h-3 w-3 mr-1" />
          Agents
        </Button>
        <Button
          variant={filter === 'errors' ? 'destructive' : 'outline'}
          size="sm"
          onClick={() => setFilter('errors')}
        >
          <XCircle className="h-3 w-3 mr-1" />
          Errors
        </Button>
      </div>
      
      {/* Timeline */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="p-4">
          {filteredEvents.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No events to display</p>
            </div>
          ) : (
            <div className="space-y-0">
              {filteredEvents.map((event, index) => (
                <TimelineEventItem
                  key={event.id}
                  event={event}
                  isLast={index === filteredEvents.length - 1}
                  compact={compact}
                  onEventClick={onEventClick}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};