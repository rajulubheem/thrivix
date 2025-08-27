import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Terminal,
  CheckCircle,
  XCircle,
  Clock,
  Code,
  FileText,
  Globe,
  Database,
  Brain,
  Zap,
  ArrowRight
} from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { cn } from '../lib/utils';

interface ToolExecution {
  id: string;
  agentName: string;
  agentColor: string;
  toolName: string;
  toolCategory: string;
  status: 'executing' | 'success' | 'error' | 'pending';
  parameters: Record<string, any>;
  response?: any;
  error?: string;
  duration?: number;
  timestamp: Date;
}

interface ToolExecutionCardProps {
  execution: ToolExecution;
  isExpanded?: boolean;
  onToggle?: () => void;
}

const getToolIcon = (category: string) => {
  switch (category) {
    case 'file_operations': return <FileText className="h-4 w-4" />;
    case 'code_execution': return <Terminal className="h-4 w-4" />;
    case 'web_search': return <Globe className="h-4 w-4" />;
    case 'data_analysis': return <Database className="h-4 w-4" />;
    case 'ai_tools': return <Brain className="h-4 w-4" />;
    default: return <Zap className="h-4 w-4" />;
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
    case 'executing': return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
    default: return <Clock className="h-4 w-4 text-gray-400" />;
  }
};

const formatDuration = (ms?: number) => {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

export const ToolExecutionCard: React.FC<ToolExecutionCardProps> = ({
  execution,
  isExpanded = false,
  onToggle
}) => {
  const [localExpanded, setLocalExpanded] = useState(isExpanded);
  const expanded = onToggle ? isExpanded : localExpanded;

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setLocalExpanded(!localExpanded);
    }
  };

  return (
    <Card className={cn(
      "transition-all duration-300 hover:shadow-lg border-l-4",
      execution.status === 'executing' && "animate-pulse",
      execution.status === 'success' && "border-l-green-500",
      execution.status === 'error' && "border-l-red-500",
      execution.status === 'pending' && "border-l-gray-300",
      execution.status === 'executing' && "border-l-blue-500"
    )}>
      <div 
        className="p-4 cursor-pointer select-none"
        onClick={handleToggle}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Expand Icon */}
            <Button variant="ghost" size="sm" className="p-0 h-6 w-6">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>

            {/* Agent Badge */}
            <div className="flex items-center gap-2">
              <div 
                className="h-3 w-3 rounded-full animate-pulse"
                style={{ backgroundColor: execution.agentColor }}
              />
              <span className="text-sm font-medium">{execution.agentName}</span>
            </div>

            <ArrowRight className="h-4 w-4 text-muted-foreground" />

            {/* Tool Info */}
            <div className="flex items-center gap-2">
              {getToolIcon(execution.toolCategory)}
              <span className="text-sm font-semibold">{execution.toolName}</span>
            </div>
          </div>

          {/* Status and Duration */}
          <div className="flex items-center gap-3">
            {execution.duration && (
              <Badge variant="outline" className="text-xs">
                {formatDuration(execution.duration)}
              </Badge>
            )}
            {getStatusIcon(execution.status)}
          </div>
        </div>

        {/* Expanded Content */}
        {expanded && (
          <div className="mt-4 space-y-3 animate-in slide-in-from-top-2 duration-300">
            {/* Parameters Section */}
            <div className="bg-muted/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Code className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Parameters
                </span>
              </div>
              <ScrollArea className="max-h-[150px]">
                <pre className="text-xs font-mono text-foreground/80">
                  {JSON.stringify(execution.parameters, null, 2)}
                </pre>
              </ScrollArea>
            </div>

            {/* Response Section */}
            {(execution.response || execution.error) && (
              <div className={cn(
                "rounded-lg p-3",
                execution.status === 'success' ? "bg-green-500/10" : "bg-red-500/10"
              )}>
                <div className="flex items-center gap-2 mb-2">
                  {execution.status === 'success' ? 
                    <CheckCircle className="h-3 w-3 text-green-600" /> :
                    <XCircle className="h-3 w-3 text-red-600" />
                  }
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {execution.status === 'success' ? 'Response' : 'Error'}
                  </span>
                </div>
                <ScrollArea className="max-h-[200px]">
                  <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap">
                    {execution.error || 
                     (typeof execution.response === 'string' 
                       ? execution.response 
                       : JSON.stringify(execution.response, null, 2))}
                  </pre>
                </ScrollArea>
              </div>
            )}

            {/* Timestamp */}
            <div className="text-xs text-muted-foreground">
              {new Date(execution.timestamp).toLocaleTimeString()}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};