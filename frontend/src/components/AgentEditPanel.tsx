import React, { useState, useEffect } from 'react';
import {
  X, Save, Trash2, Plus, ChevronDown, ChevronUp, Check
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Slider } from './ui/slider';
import { cn } from '../lib/utils';

interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  model: string;
  temperature: number;
  capabilities: string[];
  tools: string[];
  instructions: string[];
  knowledge: any;
  color: string;
  icon: any;
}

interface Tool {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  source: string;
}

interface AgentEditPanelProps {
  agent: Agent | null;
  availableTools: Tool[];
  onSave: (agent: Agent) => void;
  onClose: () => void;
  onDelete: (agentId: string) => void;
}

export const AgentEditPanel: React.FC<AgentEditPanelProps> = ({
  agent,
  availableTools,
  onSave,
  onClose,
  onDelete
}) => {
  const [editedAgent, setEditedAgent] = useState<Agent | null>(null);
  const [showToolSelector, setShowToolSelector] = useState(false);
  const [newInstruction, setNewInstruction] = useState('');
  const [toolSearchQuery, setToolSearchQuery] = useState('');

  useEffect(() => {
    if (agent) {
      setEditedAgent({ ...agent });
    }
  }, [agent]);

  if (!agent || !editedAgent) return null;

  const updateField = (field: keyof Agent, value: any) => {
    setEditedAgent({ ...editedAgent, [field]: value });
  };

  const toggleTool = (toolName: string) => {
    const tools = [...editedAgent.tools];
    const index = tools.indexOf(toolName);
    if (index > -1) {
      tools.splice(index, 1);
    } else {
      tools.push(toolName);
    }
    updateField('tools', tools);
  };

  const addInstruction = () => {
    if (newInstruction.trim()) {
      updateField('instructions', [...editedAgent.instructions, newInstruction]);
      setNewInstruction('');
    }
  };

  const removeInstruction = (index: number) => {
    const instructions = [...editedAgent.instructions];
    instructions.splice(index, 1);
    updateField('instructions', instructions);
  };

  const updateInstruction = (index: number, value: string) => {
    const instructions = [...editedAgent.instructions];
    instructions[index] = value;
    updateField('instructions', instructions);
  };

  const handleSave = () => {
    onSave(editedAgent);
    onClose();
  };

  const filteredTools = availableTools.filter(tool =>
    tool.name.toLowerCase().includes(toolSearchQuery.toLowerCase())
  );

  const availableCapabilities = [
    'file_operations',
    'web_search', 
    'code_execution',
    'data_analysis',
    'api_integration',
    'database_operations',
    'ui_development',
    'testing',
    'deployment'
  ];

  return (
    <div className="fixed right-0 top-0 h-full w-[500px] bg-background border-l shadow-lg z-50">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Edit Agent</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave}>
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Basic Info */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Name</Label>
                <Input
                  value={editedAgent.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Role</Label>
                <Input
                  value={editedAgent.role}
                  onChange={(e) => updateField('role', e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea
                  value={editedAgent.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  className="min-h-[60px] text-sm"
                />
              </div>
            </CardContent>
          </Card>

          {/* Model Settings */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Model Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Model</Label>
                <Select
                  value={editedAgent.model}
                  onValueChange={(v) => updateField('model', v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                    <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                    <SelectItem value="gpt-4">GPT-4</SelectItem>
                    <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Temperature: {editedAgent.temperature}</Label>
                <Slider
                  value={[editedAgent.temperature]}
                  onValueChange={(v) => updateField('temperature', v[0])}
                  min={0}
                  max={1}
                  step={0.1}
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Capabilities */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Capabilities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {availableCapabilities.map(cap => (
                  <Badge
                    key={cap}
                    variant={editedAgent.capabilities?.includes(cap) ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => {
                      const caps = editedAgent.capabilities || [];
                      const index = caps.indexOf(cap);
                      if (index > -1) {
                        caps.splice(index, 1);
                      } else {
                        caps.push(cap);
                      }
                      updateField('capabilities', [...caps]);
                    }}
                  >
                    {cap.replace('_', ' ')}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tools */}
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Tools ({editedAgent.tools.length})</CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowToolSelector(!showToolSelector)}
                >
                  {showToolSelector ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1 mb-2">
                {editedAgent.tools.map(tool => (
                  <Badge key={tool} variant="secondary" className="text-xs">
                    {tool}
                    <X
                      className="h-2 w-2 ml-1 cursor-pointer"
                      onClick={() => toggleTool(tool)}
                    />
                  </Badge>
                ))}
              </div>
              
              {showToolSelector && (
                <div className="mt-3 space-y-2">
                  <Input
                    placeholder="Search tools..."
                    value={toolSearchQuery}
                    onChange={(e) => setToolSearchQuery(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <div className="h-[150px] overflow-y-auto border rounded p-2 space-y-1">
                    {filteredTools.map(tool => (
                      <div
                        key={tool.name}
                        className="flex items-center space-x-2 p-1 rounded hover:bg-muted cursor-pointer text-xs"
                        onClick={() => toggleTool(tool.name)}
                      >
                        <div className={cn(
                          "h-3 w-3 border rounded",
                          editedAgent.tools.includes(tool.name) ? "bg-primary border-primary" : "border-muted-foreground"
                        )}>
                          {editedAgent.tools.includes(tool.name) && (
                            <Check className="h-2 w-2 text-primary-foreground" />
                          )}
                        </div>
                        <span>{tool.name}</span>
                        {tool.source === 'mcp' && (
                          <Badge variant="outline" className="text-xs h-4 px-1">MCP</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Instructions ({editedAgent.instructions.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {editedAgent.instructions.map((instruction, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="text-xs text-muted-foreground w-4">{index + 1}.</span>
                  <Textarea
                    value={instruction}
                    onChange={(e) => updateInstruction(index, e.target.value)}
                    className="flex-1 min-h-[40px] text-sm"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => removeInstruction(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              
              <div className="flex gap-2">
                <Input
                  placeholder="Add new instruction..."
                  value={newInstruction}
                  onChange={(e) => setNewInstruction(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addInstruction()}
                  className="h-8 text-sm"
                />
                <Button size="sm" onClick={addInstruction}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="p-4 border-t">
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => {
              onDelete(editedAgent.id);
              onClose();
            }}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete Agent
          </Button>
        </div>
      </div>
    </div>
  );
};