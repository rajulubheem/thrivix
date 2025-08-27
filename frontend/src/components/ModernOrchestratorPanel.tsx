import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Plus, 
  Trash2, 
  Play, 
  Settings,
  Code,
  Globe,
  Database,
  Mail,
  Image,
  Terminal,
  FileText,
  Search,
  Brain,
  Save,
  RefreshCw,
  Sparkles,
  Zap,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './ui/accordion';
import { Switch } from './ui/switch';
import { Slider } from './ui/slider';
import { cn } from '../lib/utils';

interface Tool {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  enabled?: boolean;
  requiresApproval?: boolean;
  parameters?: Record<string, any>;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  tools: string[];
  model: string;
  temperature: number;
  system_prompt: string;
  color: string;
  status?: 'idle' | 'working' | 'completed';
  currentTask?: string;
}

// Persistent state interface
interface PersistentOrchestratorState {
  taskInput: string;
  agents: Agent[];
  selectedCategory: string;
  executionLogs: string[];
  mcpServers: MCPServer[];
}

interface MCPServer {
  id: string;
  name: string;
  url: string;
  transport: 'websocket' | 'http' | 'stdio';
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  availableTools: string[];
  lastConnected?: Date;
}

interface ModernOrchestratorPanelProps {
  onWorkflowStart: (workflow: any) => void;
  onClose?: () => void;
  persistentState?: PersistentOrchestratorState;
  onStateUpdate?: (updates: Partial<PersistentOrchestratorState>) => void;
  initialTask?: string;
  initialAgents?: any[];
  autostart?: boolean;
}

// Tool icons based on category
const getCategoryIcon = (category: string) => {
  switch(category) {
    case 'file_operations': return <FileText className="h-3 w-3" />;
    case 'code_execution': return <Terminal className="h-3 w-3" />;
    case 'web_search': return <Globe className="h-3 w-3" />;
    case 'data_analysis': return <Database className="h-3 w-3" />;
    case 'utilities': return <Settings className="h-3 w-3" />;
    case 'communication': return <Mail className="h-3 w-3" />;
    case 'ai_tools': return <Brain className="h-3 w-3" />;
    default: return <Zap className="h-3 w-3" />;
  }
};

const getCategoryColor = (category: string) => {
  switch(category) {
    case 'file_operations': return '#10b981';
    case 'code_execution': return '#3b82f6';
    case 'web_search': return '#f59e0b';
    case 'data_analysis': return '#8b5cf6';
    case 'utilities': return '#6b7280';
    case 'communication': return '#06b6d4';
    case 'ai_tools': return '#ec4899';
    default: return '#6366f1';
  }
};

const MODELS = [
  { id: 'gpt-4o', name: 'GPT-4 Optimized', description: 'Most capable' },
  { id: 'gpt-4o-mini', name: 'GPT-4 Mini', description: 'Fast & efficient' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fastest' },
];

const AGENT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1'
];

export const ModernOrchestratorPanel: React.FC<ModernOrchestratorPanelProps> = ({
  onWorkflowStart,
  onClose,
  persistentState,
  onStateUpdate,
  initialTask,
  initialAgents,
  autostart
}) => {
  // Initialize state from persistent state or initial props
  const [taskInput, setTaskInput] = useState(initialTask || persistentState?.taskInput || '');
  const [agents, setAgents] = useState<Agent[]>(initialAgents || persistentState?.agents || []);
  const [selectedCategory, setSelectedCategory] = useState<string>(persistentState?.selectedCategory || 'all');
  const [isGenerating, setIsGenerating] = useState(false);
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [executionLogs, setExecutionLogs] = useState<string[]>(persistentState?.executionLogs || []);
  const [showToolDetails, setShowToolDetails] = useState<string | null>(null);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>(persistentState?.mcpServers || []);
  const [showMCPConfig, setShowMCPConfig] = useState(false);

  // Fetch tools from backend on mount
  useEffect(() => {
    fetchTools();
    // Load saved state from localStorage if no persistent state provided
    if (!persistentState) {
      const savedState = localStorage.getItem('orchestrator_state');
      if (savedState) {
        try {
          const parsed = JSON.parse(savedState);
          setTaskInput(parsed.taskInput || '');
          setAgents(parsed.agents || []);
          setSelectedCategory(parsed.selectedCategory || 'all');
          setExecutionLogs(parsed.executionLogs || []);
          setMcpServers(parsed.mcpServers || []);
        } catch (error) {
          console.error('Failed to load saved state:', error);
        }
      }
    }
  }, []);

  // Sync with persistent state when it changes
  useEffect(() => {
    if (persistentState) {
      setTaskInput(persistentState.taskInput);
      setAgents(persistentState.agents);
      setSelectedCategory(persistentState.selectedCategory);
      setExecutionLogs(persistentState.executionLogs);
      setMcpServers(persistentState.mcpServers || []);
    }
  }, [persistentState]);

  // Update persistent state and localStorage when local state changes
  const updatePersistentState = (updates: Partial<PersistentOrchestratorState>) => {
    const newState = {
      taskInput,
      agents,
      selectedCategory,
      executionLogs,
      mcpServers,
      ...updates
    };
    
    // Update parent component if callback provided
    if (onStateUpdate) {
      onStateUpdate(updates);
    }
    
    // Save to localStorage
    localStorage.setItem('orchestrator_state', JSON.stringify(newState));
  };

  // Auto-save state changes
  useEffect(() => {
    updatePersistentState({ taskInput });
  }, [taskInput]);

  useEffect(() => {
    updatePersistentState({ agents });
  }, [agents]);

  useEffect(() => {
    updatePersistentState({ selectedCategory });
  }, [selectedCategory]);

  useEffect(() => {
    updatePersistentState({ executionLogs });
  }, [executionLogs]);

  useEffect(() => {
    updatePersistentState({ mcpServers });
  }, [mcpServers]);

  const fetchTools = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/v1/tool-config/configuration');
      const tools = response.data.tools || [];
      
      // Transform backend tools to our Tool interface
      const transformedTools = tools.map((tool: any) => ({
        id: tool.id,
        name: tool.name,
        category: tool.category,
        description: tool.description,
        icon: getCategoryIcon(tool.category),
        color: getCategoryColor(tool.category),
        enabled: tool.enabled,
        requiresApproval: tool.requires_approval,
        parameters: tool.parameters || {}
      })).filter((tool: any) => tool.enabled); // Only show enabled tools
      
      console.log(`✅ Loaded ${transformedTools.length} tools from backend`);
      transformedTools.forEach((tool: Tool) => {
        console.log(`  - ${tool.name} (${tool.category}): ${tool.description}`);
      });
      
      setAvailableTools(transformedTools);
    } catch (error) {
      console.error('Failed to fetch tools:', error);
      // Fallback to some default tools if backend fails
      setAvailableTools([
        { id: 'tavily_search', name: 'Web Search', category: 'web_search', description: 'Search the web', icon: getCategoryIcon('web_search'), color: getCategoryColor('web_search') },
        { id: 'file_write', name: 'File Write', category: 'file_operations', description: 'Write files', icon: getCategoryIcon('file_operations'), color: getCategoryColor('file_operations') },
        { id: 'file_read', name: 'File Read', category: 'file_operations', description: 'Read files', icon: getCategoryIcon('file_operations'), color: getCategoryColor('file_operations') }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const categories = ['all', ...Array.from(new Set(availableTools.map(t => t.category)))];

  // MCP Server Management
  const connectMCPServer = async (server: MCPServer) => {
    setMcpServers(prev => prev.map(s => 
      s.id === server.id ? { ...s, status: 'connecting' } : s
    ));
    
    try {
      // Call backend to add and connect to MCP server
      const response = await axios.post('http://localhost:8000/api/v1/mcp/servers/add', {
        name: server.name,
        url: server.url,
        transport: server.transport === 'websocket' ? 'sse' : server.transport,
        enabled: true
      });
      
      if (response.data.success) {
        const updatedServer = {
          ...server,
          status: 'connected' as const,
          availableTools: response.data.tools || [],
          lastConnected: new Date()
        };
        
        setMcpServers(prev => prev.map(s => 
          s.id === server.id ? updatedServer : s
        ));
        
        // Add MCP tools to available tools
        const mcpTools = response.data.tools.map((toolName: string) => ({
          id: `mcp_${server.id}_${toolName}`,
          name: toolName,
          category: 'mcp_tools',
          description: `MCP tool from ${server.name}`,
          icon: getCategoryIcon('mcp_tools'),
          color: getCategoryColor('mcp_tools'),
          enabled: true,
          requiresApproval: true
        }));
        
        setAvailableTools(prev => [...prev, ...mcpTools]);
        
        setExecutionLogs(prev => [
          ...prev,
          `✅ Connected to MCP server: ${server.name}`,
          `  • ${response.data.tools.length} tools available`
        ]);
      }
    } catch (error: any) {
      setMcpServers(prev => prev.map(s => 
        s.id === server.id ? { ...s, status: 'error' } : s
      ));
      
      setExecutionLogs(prev => [
        ...prev,
        `❌ Failed to connect to MCP server: ${server.name}`,
        `  • ${error.message}`
      ]);
    }
  };

  const addMCPServer = () => {
    const newServer: MCPServer = {
      id: `mcp_${Date.now()}`,
      name: 'New MCP Server',
      url: 'ws://localhost:8765',
      transport: 'websocket',
      status: 'disconnected',
      availableTools: []
    };
    setMcpServers(prev => [...prev, newServer]);
  };

  const removeMCPServer = (serverId: string) => {
    setMcpServers(prev => prev.filter(s => s.id !== serverId));
    // Remove MCP tools from available tools
    setAvailableTools(prev => prev.filter(t => !t.id.startsWith(`mcp_${serverId}_`)));
  };

  const generateAgents = async () => {
    setIsGenerating(true);
    setExecutionLogs([`🎯 Sending task to backend orchestrator: "${taskInput}"`]);
    
    try {
      // Call backend orchestrator API to generate agents dynamically
      const response = await axios.post('http://localhost:8000/api/v1/orchestrator/orchestrate', {
        task: taskInput,
        preferences: {
          max_agents: 8,
          use_enabled_tools_only: true
        }
      });

      const { task, analysis, agents: backendAgents, workflow, estimated_complexity } = response.data;
      
      setExecutionLogs(prev => [
        ...prev,
        `📊 Task Analysis Complete:`,
        `  • Type: ${analysis.task_type}`,
        `  • Complexity: ${analysis.complexity}`,
        `  • Workflow: ${workflow}`,
        `  • Domains: ${analysis.domains.join(', ')}`,
        `  • Required Capabilities: ${analysis.required_capabilities.join(', ')}`,
        `🤖 Generated ${backendAgents.length} specialized agents:`
      ]);

      // Transform backend agents to our frontend format
      const generatedAgents: Agent[] = backendAgents.map((agent: any, index: number) => {
        const agentLog = `  ${index + 1}. ${agent.name}:`;
        const toolsList = agent.tools ? `${agent.tools.length} tools (${agent.tools.slice(0, 3).join(', ')}${agent.tools.length > 3 ? '...' : ''})` : 'No tools';
        
        setExecutionLogs(prev => [
          ...prev,
          `${agentLog} ${toolsList}`
        ]);

        return {
          id: agent.name || `agent-${Date.now()}-${index}`,
          name: agent.name || `Agent ${index + 1}`,
          role: agent.role || 'Specialized agent',
          tools: agent.tools || [],
          model: agent.model || 'gpt-4o-mini',
          temperature: agent.temperature || 0.7,
          system_prompt: agent.system_prompt || `You are ${agent.name}. ${agent.role}`,
          color: AGENT_COLORS[index % AGENT_COLORS.length],
          status: 'idle'
        };
      });

      setAgents(generatedAgents);
      
      // Add summary log
      setExecutionLogs(prev => [
        ...prev,
        ``,
        `✅ Agent Configuration Complete!`,
        `Total tools assigned: ${generatedAgents.reduce((sum, a) => sum + a.tools.length, 0)}`,
        `Ready to execute ${workflow} workflow with ${estimated_complexity} complexity`
      ]);
      
    } catch (error: any) {
      console.error('Failed to generate agents:', error);
      setExecutionLogs(prev => [
        ...prev,
        `❌ Error: ${error.response?.data?.detail || error.message}`,
        `⚠️ Falling back to basic agent configuration...`
      ]);
      
      // Fallback to a simple agent if backend fails
      const fallbackAgent: Agent = {
        id: 'fallback-assistant',
        name: 'AI Assistant',
        role: 'General purpose assistant',
        tools: availableTools.slice(0, 5).map(t => t.id),
        model: 'gpt-4o-mini',
        temperature: 0.7,
        system_prompt: `You are a helpful AI assistant working on: ${taskInput}`,
        color: '#6366f1',
        status: 'idle'
      };
      
      setAgents([fallbackAgent]);
    } finally {
      setIsGenerating(false);
    }
  };

  const addAgent = () => {
    const newAgent: Agent = {
      id: `agent-${Date.now()}`,
      name: `Agent ${agents.length + 1}`,
      role: 'Describe agent role',
      tools: [],
      model: 'gpt-4o-mini',
      temperature: 0.7,
      system_prompt: '',
      color: AGENT_COLORS[agents.length % AGENT_COLORS.length]
    };
    setAgents([...agents, newAgent]);
  };

  const updateAgent = (id: string, updates: Partial<Agent>) => {
    setAgents(agents.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  const removeAgent = (id: string) => {
    setAgents(agents.filter(a => a.id !== id));
  };

  const toggleTool = (agentId: string, toolId: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;

    const tools = agent.tools.includes(toolId)
      ? agent.tools.filter(t => t !== toolId)
      : [...agent.tools, toolId];
    
    updateAgent(agentId, { tools });
  };

  const startWorkflow = () => {
    if (taskInput && agents.length > 0) {
      onWorkflowStart({
        task: taskInput,
        agents: agents.map(a => ({
          name: a.name,
          system_prompt: a.system_prompt || `You are ${a.name}. ${a.role}`,
          tools: a.tools,
          model: a.model,
          temperature: a.temperature
        }))
      });
    }
  };

  const filteredTools = selectedCategory === 'all' 
    ? availableTools 
    : availableTools.filter(t => t.category === selectedCategory);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Loading tools configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Agent Orchestrator</h2>
          <Badge variant="outline" className="ml-2">
            {availableTools.length} tools
          </Badge>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Task Input */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Task Description</CardTitle>
              <CardDescription>Describe what you want to accomplish</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="e.g., Create a todo app with HTML, CSS, and JavaScript..."
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                className="min-h-[100px]"
              />
              <Button 
                onClick={() => generateAgents()}
                disabled={!taskInput || isGenerating}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Generating Agents...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Agents
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Agents */}
          {agents.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Agents</CardTitle>
                  <CardDescription>{agents.length} agent{agents.length !== 1 ? 's' : ''} configured</CardDescription>
                </div>
                <Button onClick={addAgent} size="sm" variant="outline">
                  <Plus className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {agents.map((agent, index) => (
                    <AccordionItem key={agent.id} value={agent.id}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3 w-full">
                          <div 
                            className="h-3 w-3 rounded-full" 
                            style={{ backgroundColor: agent.color }}
                          />
                          <span className="font-medium">{agent.name}</span>
                          <Badge variant="outline" className="ml-auto mr-2">
                            {agent.tools.length} tools
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4 pt-4">
                          {/* Agent Name & Role */}
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Name</Label>
                              <Input
                                value={agent.name}
                                onChange={(e) => updateAgent(agent.id, { name: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Role</Label>
                              <Input
                                value={agent.role}
                                onChange={(e) => updateAgent(agent.id, { role: e.target.value })}
                              />
                            </div>
                          </div>

                          {/* Model Selection */}
                          <div className="space-y-2">
                            <Label>Model</Label>
                            <Select
                              value={agent.model}
                              onValueChange={(value) => updateAgent(agent.id, { model: value })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {MODELS.map(model => (
                                  <SelectItem key={model.id} value={model.id}>
                                    <div>
                                      <div className="font-medium">{model.name}</div>
                                      <div className="text-xs text-muted-foreground">{model.description}</div>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Temperature */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label>Temperature</Label>
                              <span className="text-sm text-muted-foreground">{agent.temperature}</span>
                            </div>
                            <Slider
                              value={[agent.temperature]}
                              onValueChange={([value]) => updateAgent(agent.id, { temperature: value })}
                              max={1}
                              step={0.1}
                            />
                          </div>

                          {/* System Prompt */}
                          <div className="space-y-2">
                            <Label>System Prompt</Label>
                            <Textarea
                              value={agent.system_prompt}
                              onChange={(e) => updateAgent(agent.id, { system_prompt: e.target.value })}
                              placeholder="Describe the agent's expertise and behavior..."
                              className="min-h-[80px]"
                            />
                          </div>

                          {/* Tools */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label>Tools ({agent.tools.length} selected)</Label>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => updateAgent(agent.id, { tools: [] })}
                              >
                                Clear All
                              </Button>
                            </div>
                            <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto">
                              {filteredTools.map(tool => {
                                const isSelected = agent.tools.includes(tool.id);
                                return (
                                  <div
                                    key={tool.id}
                                    className={cn(
                                      "flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all",
                                      isSelected ? "bg-primary/10 border-primary shadow-sm" : "hover:bg-muted"
                                    )}
                                    onClick={() => toggleTool(agent.id, tool.id)}
                                  >
                                    <div style={{ color: tool.color }}>{tool.icon}</div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">{tool.name}</span>
                                        {tool.requiresApproval && (
                                          <Badge variant="outline" className="text-xs">
                                            Requires Approval
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="text-xs text-muted-foreground">{tool.description}</div>
                                      {tool.parameters && Object.keys(tool.parameters).length > 0 && (
                                        <div className="text-xs text-muted-foreground mt-1">
                                          Parameters: {Object.keys(tool.parameters).join(', ')}
                                        </div>
                                      )}
                                    </div>
                                    <Switch
                                      checked={isSelected}
                                      onCheckedChange={() => toggleTool(agent.id, tool.id)}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Remove Agent */}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => removeAgent(agent.id)}
                            className="w-full"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove Agent
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          )}

          {/* Tool Categories Filter */}
          {agents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tool Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {categories.map(cat => {
                    const count = cat === 'all' 
                      ? availableTools.length 
                      : availableTools.filter(t => t.category === cat).length;
                    return (
                      <Badge
                        key={cat}
                        variant={selectedCategory === cat ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => setSelectedCategory(cat)}
                      >
                        {cat === 'all' ? 'All Tools' : cat.replace('_', ' ')}
                        <span className="ml-1 opacity-60">({count})</span>
                      </Badge>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* MCP Server Configuration */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">MCP Servers</CardTitle>
                <CardDescription>{mcpServers.length} server{mcpServers.length !== 1 ? 's' : ''} configured</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button onClick={addMCPServer} size="sm" variant="outline">
                  <Plus className="h-4 w-4" />
                </Button>
                <Button 
                  onClick={() => setShowMCPConfig(!showMCPConfig)} 
                  size="sm" 
                  variant="ghost"
                >
                  {showMCPConfig ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>
            {showMCPConfig && (
              <CardContent className="space-y-3">
                {mcpServers.map(server => (
                  <div key={server.id} className="flex items-center gap-2 p-3 border rounded-lg">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={server.name}
                          onChange={(e) => setMcpServers(prev => prev.map(s => 
                            s.id === server.id ? { ...s, name: e.target.value } : s
                          ))}
                          placeholder="Server name"
                          className="h-8"
                        />
                        <Badge variant={server.status === 'connected' ? 'default' : 'outline'}>
                          {server.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          value={server.url}
                          onChange={(e) => setMcpServers(prev => prev.map(s => 
                            s.id === server.id ? { ...s, url: e.target.value } : s
                          ))}
                          placeholder="Server URL"
                          className="h-8 flex-1"
                        />
                        <Select
                          value={server.transport}
                          onValueChange={(value: 'websocket' | 'http' | 'stdio') => 
                            setMcpServers(prev => prev.map(s => 
                              s.id === server.id ? { ...s, transport: value } : s
                            ))
                          }
                        >
                          <SelectTrigger className="h-8 w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="websocket">WebSocket</SelectItem>
                            <SelectItem value="http">HTTP/SSE</SelectItem>
                            <SelectItem value="stdio">Stdio</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {server.availableTools.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Tools: {server.availableTools.join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {server.status !== 'connected' ? (
                        <Button
                          onClick={() => connectMCPServer(server)}
                          size="sm"
                          variant="outline"
                          disabled={server.status === 'connecting'}
                        >
                          {server.status === 'connecting' ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <Zap className="h-3 w-3" />
                          )}
                        </Button>
                      ) : (
                        <Badge variant="default" className="text-xs">
                          ✓ Connected
                        </Badge>
                      )}
                      <Button
                        onClick={() => removeMCPServer(server.id)}
                        size="sm"
                        variant="ghost"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                {mcpServers.length === 0 && (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    No MCP servers configured. Click + to add one.
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* Execution Logs */}
          {executionLogs.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Generation Logs</CardTitle>
                <Button
                  onClick={() => setExecutionLogs([])}
                  size="sm"
                  variant="ghost"
                >
                  Clear
                </Button>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[150px] w-full rounded-md border p-3">
                  <div className="space-y-1">
                    {executionLogs.map((log, index) => (
                      <div key={index} className="text-xs font-mono text-muted-foreground">
                        {log}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t">
        <Button
          onClick={startWorkflow}
          disabled={!taskInput || agents.length === 0}
          className="w-full"
          size="lg"
        >
          <Play className="h-4 w-4 mr-2" />
          Start Workflow
        </Button>
      </div>
    </div>
  );
};