import React, { useState } from 'react';
import {
  Bot, ChevronDown, ChevronUp, Edit, Save, Copy, Trash2, Plus, X, Check
} from 'lucide-react';
import { Card, CardContent } from './ui/card';
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

interface AgentConfigEditorProps {
  agents: Agent[];
  availableTools: Tool[];
  onAgentsUpdate: (agents: Agent[]) => void;
  onAddAgent: () => void;
}

export const AgentConfigEditor: React.FC<AgentConfigEditorProps> = ({
  agents,
  availableTools,
  onAgentsUpdate,
  onAddAgent
}) => {
  const [expandedAgentIds, setExpandedAgentIds] = useState<Set<string>>(new Set());
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);

  const toggleExpanded = (agentId: string) => {
    const newExpanded = new Set(expandedAgentIds);
    if (newExpanded.has(agentId)) {
      newExpanded.delete(agentId);
    } else {
      newExpanded.add(agentId);
    }
    setExpandedAgentIds(newExpanded);
  };

  const toggleEditing = (agentId: string) => {
    if (editingAgentId === agentId) {
      setEditingAgentId(null);
    } else {
      setEditingAgentId(agentId);
    }
  };

  const updateAgent = (index: number, field: keyof Agent, value: any) => {
    const updated = [...agents];
    updated[index] = { ...updated[index], [field]: value };
    onAgentsUpdate(updated);
  };

  const duplicateAgent = (index: number) => {
    const agent = agents[index];
    const newAgent = {
      ...agent,
      id: `agent_${Date.now()}`,
      name: `${agent.name}_copy`
    };
    const updated = [...agents];
    updated.splice(index + 1, 0, newAgent);
    onAgentsUpdate(updated);
  };

  const deleteAgent = (index: number) => {
    const agent = agents[index];
    const updated = agents.filter((_, i) => i !== index);
    onAgentsUpdate(updated);
    if (editingAgentId === agent.id) {
      setEditingAgentId(null);
    }
  };

  const toggleTool = (agentIndex: number, toolName: string) => {
    const updated = [...agents];
    const toolIndex = updated[agentIndex].tools.indexOf(toolName);
    if (toolIndex > -1) {
      updated[agentIndex].tools.splice(toolIndex, 1);
    } else {
      updated[agentIndex].tools.push(toolName);
    }
    onAgentsUpdate(updated);
  };

  const addInstruction = (agentIndex: number) => {
    const updated = [...agents];
    updated[agentIndex].instructions.push('New instruction');
    onAgentsUpdate(updated);
  };

  const updateInstruction = (agentIndex: number, instIndex: number, value: string) => {
    const updated = [...agents];
    updated[agentIndex].instructions[instIndex] = value;
    onAgentsUpdate(updated);
  };

  const removeInstruction = (agentIndex: number, instIndex: number) => {
    const updated = [...agents];
    updated[agentIndex].instructions.splice(instIndex, 1);
    onAgentsUpdate(updated);
  };

  return (
    <div className="space-y-3">
      {agents.map((agent, index) => {
        const isExpanded = expandedAgentIds.has(agent.id);
        const isEditing = editingAgentId === agent.id;

        return (
          <Card key={agent.id} className="overflow-hidden">
            {/* Agent Header */}
            <div className="p-3 bg-background">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 flex-1">
                  <Bot className="h-5 w-5 flex-shrink-0" style={{ color: agent.color }} />
                  <div className="flex-1">
                    {isEditing ? (
                      <div className="space-y-1">
                        <Input
                          value={agent.name}
                          onChange={(e) => updateAgent(index, 'name', e.target.value)}
                          placeholder="Agent name"
                          className="h-7 text-sm"
                        />
                        <Input
                          value={agent.role}
                          onChange={(e) => updateAgent(index, 'role', e.target.value)}
                          placeholder="Agent role"
                          className="h-7 text-sm"
                        />
                      </div>
                    ) : (
                      <div>
                        <p className="font-medium text-sm">{agent.role}</p>
                        <p className="text-xs text-muted-foreground">{agent.name}</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => toggleExpanded(agent.id)}
                  >
                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => toggleEditing(agent.id)}
                  >
                    {isEditing ? <Save className="h-3 w-3" /> : <Edit className="h-3 w-3" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => duplicateAgent(index)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => deleteAgent(index)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>

              {/* Quick Tools Preview (collapsed) */}
              {!isExpanded && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {agent.tools.slice(0, 4).map(tool => (
                    <Badge key={tool} variant="secondary" className="text-xs h-5">
                      {tool}
                    </Badge>
                  ))}
                  {agent.tools.length > 4 && (
                    <Badge variant="secondary" className="text-xs h-5">
                      +{agent.tools.length - 4} more
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Agent Details (Expanded) */}
            {isExpanded && (
              <CardContent className="pt-3 pb-4 space-y-3 bg-muted/30">
                {/* Description */}
                <div>
                  <Label className="text-xs">Description</Label>
                  {isEditing ? (
                    <Textarea
                      value={agent.description}
                      onChange={(e) => updateAgent(index, 'description', e.target.value)}
                      className="mt-1 min-h-[50px] text-sm"
                    />
                  ) : (
                    <p className="text-sm mt-1">{agent.description}</p>
                  )}
                </div>

                {/* Model & Temperature */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Model</Label>
                    {isEditing ? (
                      <Select
                        value={agent.model}
                        onValueChange={(v) => updateAgent(index, 'model', v)}
                      >
                        <SelectTrigger className="h-7 mt-1 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                          <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                          <SelectItem value="gpt-4">GPT-4</SelectItem>
                          <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm mt-1">{agent.model}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Temperature: {agent.temperature}</Label>
                    {isEditing ? (
                      <Slider
                        value={[agent.temperature]}
                        onValueChange={(v) => updateAgent(index, 'temperature', v[0])}
                        min={0}
                        max={1}
                        step={0.1}
                        className="mt-2"
                      />
                    ) : (
                      <p className="text-sm mt-1">{agent.temperature}</p>
                    )}
                  </div>
                </div>

                {/* Tools */}
                <div>
                  <Label className="text-xs">Tools ({agent.tools.length})</Label>
                  {isEditing ? (
                    <div className="space-y-2 mt-1">
                      <ScrollArea className="h-[120px] border rounded p-2 bg-background">
                        <div className="grid grid-cols-2 gap-1">
                          {availableTools.slice(0, 30).map(tool => (
                            <div
                              key={tool.name}
                              className="flex items-center space-x-1 p-1 rounded hover:bg-muted cursor-pointer text-xs"
                              onClick={() => toggleTool(index, tool.name)}
                            >
                              <div className={cn(
                                "h-3 w-3 border rounded",
                                agent.tools.includes(tool.name) ? "bg-primary border-primary" : "border-muted-foreground"
                              )}>
                                {agent.tools.includes(tool.name) && (
                                  <Check className="h-2 w-2 text-primary-foreground" />
                                )}
                              </div>
                              <span>{tool.name}</span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                      <div className="flex flex-wrap gap-1">
                        {agent.tools.map(tool => (
                          <Badge key={tool} variant="secondary" className="text-xs h-5">
                            {tool}
                            <X
                              className="h-2 w-2 ml-1 cursor-pointer"
                              onClick={() => toggleTool(index, tool)}
                            />
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {agent.tools.map(tool => (
                        <Badge key={tool} variant="secondary" className="text-xs h-5">
                          {tool}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Instructions */}
                <div>
                  <Label className="text-xs">Instructions</Label>
                  {isEditing ? (
                    <div className="space-y-1 mt-1">
                      {agent.instructions.map((inst, instIndex) => (
                        <div key={instIndex} className="flex gap-1">
                          <Input
                            value={inst}
                            onChange={(e) => updateInstruction(index, instIndex, e.target.value)}
                            className="h-7 text-sm"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => removeInstruction(index, instIndex)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => addInstruction(index)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Instruction
                      </Button>
                    </div>
                  ) : (
                    <ul className="text-sm space-y-0.5 mt-1">
                      {agent.instructions.slice(0, 3).map((inst, i) => (
                        <li key={i} className="text-xs">
                          • {inst}
                        </li>
                      ))}
                      {agent.instructions.length > 3 && (
                        <li className="text-xs text-muted-foreground">
                          ... and {agent.instructions.length - 3} more
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
};