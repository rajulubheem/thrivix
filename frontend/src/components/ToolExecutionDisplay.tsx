import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Terminal, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { cn } from '../lib/utils';

interface ToolExecution {
  id: string;
  agent: string;
  tool: string;
  parameters?: any;
  result?: any;
  status: 'executing' | 'success' | 'error';
  timestamp: Date;
}

interface ToolExecutionDisplayProps {
  execution: ToolExecution;
  compact?: boolean;
}

export const ToolExecutionDisplay: React.FC<ToolExecutionDisplayProps> = ({ 
  execution, 
  compact = false 
}) => {
  const [expanded, setExpanded] = useState(false);

  const getStatusIcon = () => {
    switch (execution.status) {
      case 'success':
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'error':
        return <XCircle className="h-3 w-3 text-red-500" />;
      default:
        return <Clock className="h-3 w-3 text-blue-500 animate-pulse" />;
    }
  };

  if (compact) {
    return (
      <div 
        className={cn(
          "flex items-center gap-2 p-2 rounded-lg bg-muted/50 cursor-pointer transition-all hover:bg-muted hover:shadow-md",
          execution.status === 'executing' && "animate-pulse bg-gradient-to-r from-primary/10 via-purple-500/10 to-pink-500/10",
          execution.status === 'success' && "bg-green-500/5 hover:bg-green-500/10",
          execution.status === 'error' && "bg-red-500/5 hover:bg-red-500/10"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <button className="p-0">
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        <Terminal className={cn(
          "h-3 w-3",
          execution.status === 'executing' ? "text-primary animate-spin" : "text-muted-foreground"
        )} />
        <span className="text-xs font-medium">{execution.tool}</span>
        <Badge variant="outline" className="text-xs py-0 px-1">
          {execution.agent}
        </Badge>
        {getStatusIcon()}
        
        {expanded && (
          <div className="w-full mt-2 p-2 bg-background rounded border">
            {execution.parameters && (
              <div className="mb-2">
                <div className="text-xs font-semibold text-muted-foreground mb-1">Parameters:</div>
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                  {JSON.stringify(execution.parameters, null, 2)}
                </pre>
              </div>
            )}
            {execution.result && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">Result:</div>
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                  {typeof execution.result === 'string' 
                    ? execution.result 
                    : JSON.stringify(execution.result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className={cn(
      "p-3 transition-all relative overflow-hidden",
      execution.status === 'executing' && "ring-2 ring-primary/50 animate-pulse shadow-lg shadow-primary/20",
      execution.status === 'success' && "ring-1 ring-green-500/30",
      execution.status === 'error' && "ring-1 ring-red-500/30"
    )}>
      {/* Background gradient for executing status */}
      {execution.status === 'executing' && (
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-purple-500/5 to-transparent animate-pulse" />
      )}
      <div className="flex items-center justify-between mb-2 relative z-10">
        <div className="flex items-center gap-2">
          <Terminal className={cn(
            "h-4 w-4",
            execution.status === 'executing' ? "text-primary animate-pulse" : "text-muted-foreground"
          )} />
          <span className="font-medium text-sm">{execution.tool}</span>
          <Badge variant="outline" className="text-xs">
            {execution.agent}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="text-xs text-muted-foreground">
            {new Date(execution.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>
      
      {execution.parameters && (
        <div className="mb-2 relative z-10">
          <div className="text-xs font-semibold text-muted-foreground mb-1">Parameters:</div>
          <pre className={cn(
            "text-xs p-2 rounded overflow-x-auto max-h-32",
            execution.status === 'executing' ? "bg-gradient-to-r from-muted/80 via-primary/5 to-muted/80" : "bg-muted"
          )}>
            {JSON.stringify(execution.parameters, null, 2)}
          </pre>
        </div>
      )}
      
      {execution.result && (
        <div className="relative z-10">
          <div className="text-xs font-semibold text-muted-foreground mb-1">
            {execution.status === 'error' ? 'Error:' : 'Result:'}
          </div>
          <pre className={cn(
            "text-xs p-2 rounded overflow-x-auto max-h-32 relative",
            execution.status === 'error' ? "bg-red-500/10 border border-red-500/20" : "bg-green-500/10 border border-green-500/20"
          )}>
            {typeof execution.result === 'string' 
              ? execution.result 
              : JSON.stringify(execution.result, null, 2)}
          </pre>
        </div>
      )}
    </Card>
  );
};