import React, { useState } from 'react';
import {
  Bot, ChevronDown, ChevronUp, Edit, Copy, Trash2
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { AgentEditPanel } from './AgentEditPanel';

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

interface CompactAgentListProps {
  agents: Agent[];
  availableTools?: Tool[];
  onAgentsUpdate: (agents: Agent[]) => void;
  onAddAgent: () => void;
  onEditAgent?: (agent: Agent) => void;
}

export const CompactAgentList: React.FC<CompactAgentListProps> = ({
  agents,
  availableTools = [],
  onAgentsUpdate,
  onAddAgent,
  onEditAgent
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  const deleteAgent = (id: string) => {
    const updated = agents.filter(a => a.id !== id);
    onAgentsUpdate(updated);
    if (editingAgent?.id === id) {
      setEditingAgent(null);
    }
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

  const updateAgent = (updatedAgent: Agent) => {
    const updated = agents.map(a => a.id === updatedAgent.id ? updatedAgent : a);
    onAgentsUpdate(updated);
  };

  return (
    <>
      <div className="space-y-2">
      {agents.map((agent, index) => {
        const isExpanded = expandedId === agent.id;
        
        return (
          <div
            key={agent.id}
            className="border rounded-lg bg-background hover:bg-muted/50 transition-colors"
          >
            <div className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Bot className="h-4 w-4 flex-shrink-0" style={{ color: agent.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{agent.role}</p>
                    <p className="text-xs text-muted-foreground truncate">{agent.name}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 ml-2">
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {agent.tools.slice(0, 3).map(tool => (
                      <Badge key={tool} variant="secondary" className="text-xs h-5 px-1">
                        {tool}
                      </Badge>
                    ))}
                    {agent.tools.length > 3 && (
                      <Badge variant="secondary" className="text-xs h-5 px-1">
                        +{agent.tools.length - 3}
                      </Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => setExpandedId(isExpanded ? null : agent.id)}
                    >
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => setEditingAgent(agent)}
                    >
                      <Edit className="h-3 w-3" />
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
                      onClick={() => deleteAgent(agent.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
              
              {isExpanded && (
                <div className="mt-3 pt-3 border-t space-y-2">
                  <p className="text-xs text-muted-foreground">{agent.description}</p>
                  <div className="flex items-center gap-4 text-xs">
                    <span>Model: <Badge variant="outline" className="text-xs h-5">{agent.model}</Badge></span>
                    <span>Temp: {agent.temperature}</span>
                    <span>Instructions: {agent.instructions.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {agent.tools.map(tool => (
                      <Badge key={tool} variant="secondary" className="text-xs h-5">
                        {tool}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>
      
      {/* Edit Panel */}
      {editingAgent && (
        <AgentEditPanel
          agent={editingAgent}
          availableTools={availableTools}
          onSave={updateAgent}
          onClose={() => setEditingAgent(null)}
          onDelete={deleteAgent}
        />
      )}
    </>
  );
};