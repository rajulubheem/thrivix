import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { Code, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface ToolDetailsDialogProps {
  tool: {
    id: string;
    name: string;
    category: string;
    description: string;
    enabled?: boolean;
    requiresApproval?: boolean;
    parameters?: Record<string, any>;
    examples?: string[];
    color?: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ToolDetailsDialog: React.FC<ToolDetailsDialogProps> = ({
  tool,
  isOpen,
  onClose
}) => {
  if (!tool) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div 
              className="h-2 w-2 rounded-full" 
              style={{ backgroundColor: tool.color || '#6366f1' }}
            />
            {tool.name}
          </DialogTitle>
          <DialogDescription>{tool.description}</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Tool Status */}
          <div className="flex items-center gap-2">
            <Badge variant={tool.enabled ? "default" : "secondary"}>
              {tool.enabled ? (
                <>
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Enabled
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3 mr-1" />
                  Disabled
                </>
              )}
            </Badge>
            {tool.requiresApproval && (
              <Badge variant="outline">
                <AlertCircle className="h-3 w-3 mr-1" />
                Requires Approval
              </Badge>
            )}
            <Badge variant="outline">{tool.category.replace('_', ' ')}</Badge>
          </div>

          <Separator />

          {/* Parameters */}
          {tool.parameters && Object.keys(tool.parameters).length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Code className="h-4 w-4" />
                Parameters
              </h4>
              <ScrollArea className="h-[200px] w-full rounded-md border p-3">
                <pre className="text-xs font-mono">
                  {JSON.stringify(tool.parameters, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          )}

          {/* Examples */}
          {tool.examples && tool.examples.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Usage Examples</h4>
              <div className="space-y-2">
                {tool.examples.map((example, index) => (
                  <div key={index} className="p-2 bg-muted rounded-md">
                    <code className="text-xs">{example}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tool ID */}
          <div className="pt-2">
            <p className="text-xs text-muted-foreground">
              Tool ID: <code className="font-mono">{tool.id}</code>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};