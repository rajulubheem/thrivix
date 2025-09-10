import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot, Brain, Zap, Plus, X, Check, AlertCircle, Loader2,
  Server, Wrench, Play, TestTube, ChevronDown, ChevronUp,
  Trash2, Edit, RefreshCw, Download, Copy, Settings,
  Grid, List, Activity, Search, Save, PlusCircle, MinusCircle
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Progress } from '../components/ui/progress';
import { ScrollArea } from '../components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Slider } from '../components/ui/slider';
import { ModernLayout } from '../components/layout/ModernLayout';
import { cn } from '../lib/utils';

interface Tool {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  requires_approval: boolean;
  source: 'builtin' | 'mcp' | 'custom';
  parameters?: any;
  examples?: any[];
  mcp_server?: string;
}

interface Agent {
  name: string;
  role: string;
  description: string;
  capabilities: string[];
  tools: string[];
  instructions: string[];
  knowledge: any;
  model?: string;
  temperature?: number;
  icon?: any;
  color?: string;
  isExpanded?: boolean;
  isEditing?: boolean;
}

export default function UnifiedOrchestratorV3() {
  const navigate = useNavigate();
  
  // State management
  const [taskInput, setTaskInput] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [executionPlan, setExecutionPlan] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Configuration states
  const [maxAgents, setMaxAgents] = useState(5);
  const [useMCPTools, setUseMCPTools] = useState(true);
  const [autoApprove, setAutoApprove] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState(0);
  
  // Tool management
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  
  // Derived tool stats for a quick overview panel
  const toolStats = useMemo(() => {
    const byCategory: Record<string, number> = {};
    const bySource: Record<string, number> = {} as any;
    for (const t of availableTools) {
      if (t.category) byCategory[t.category] = (byCategory[t.category] || 0) + 1;
      if (t.source) bySource[t.source] = (bySource[t.source] || 0) + 1;
    }
    const total = availableTools.length;
    return { total, byCategory, bySource };
  }, [availableTools]);
  
  // Agent editing
  const [editingAgentIndex, setEditingAgentIndex] = useState<number | null>(null);
  const [newInstruction, setNewInstruction] = useState('');
  
  // Capabilities list
  const availableCapabilities = [
    'file_operations', 'web_search', 'code_execution', 
    'data_analysis', 'api_integration', 'database_operations',
    'ui_development', 'testing', 'deployment', 'monitoring'
  ];

  // Fetch available tools on mount
  useEffect(() => {
    fetchAvailableTools();
  }, []);

  const fetchAvailableTools = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/v1/unified/tools/available?include_mcp=true', {
        headers: { 'Authorization': 'Bearer demo-token' }
      });
      if (response.ok) {
        const data = await response.json();
        setAvailableTools(data.tools || []);
      }
    } catch (err) {
      console.error('Failed to fetch tools:', err);
    }
  };

  // Generate agents with AI
  const generateAgentsWithAI = async () => {
    if (!taskInput) {
      setError('Please enter a task description');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('http://localhost:8000/api/v1/unified/orchestrate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer demo-token'
        },
        body: JSON.stringify({
          task: taskInput,
          max_agents: maxAgents,
          use_mcp_tools: useMCPTools,
          auto_execute: false
        }),
      });

      if (!response.ok) throw new Error('Failed to generate agents');
      
      const plan = await response.json();
      
      // Set the generated agents with editing capabilities
      const generatedAgents = plan.agents.map((agent: any) => ({
        ...agent,
        isExpanded: false,
        isEditing: false
      }));
      
      setAgents(generatedAgents);
      setExecutionPlan(plan);
      setSuccess(`Generated ${generatedAgents.length} agents for your task!`);
      
    } catch (err: any) {
      setError(err?.message || 'Failed to generate agents');
    } finally {
      setLoading(false);
    }
  };

  // Add custom agent
  const addCustomAgent = () => {
    const newAgent: Agent = {
      name: `agent_${agents.length + 1}`,
      role: 'Custom Agent',
      description: 'Custom agent for specific tasks',
      capabilities: [],
      tools: [],
      instructions: ['Perform assigned tasks efficiently'],
      knowledge: {},
      model: 'gpt-4o-mini',
      temperature: 0.7,
      isExpanded: true,
      isEditing: true
    };
    
    setAgents([...agents, newAgent]);
    setEditingAgentIndex(agents.length);
  };

  // Toggle agent expansion
  const toggleAgentExpansion = (index: number) => {
    const updatedAgents = [...agents];
    updatedAgents[index].isExpanded = !updatedAgents[index].isExpanded;
    setAgents(updatedAgents);
  };

  // Toggle agent editing
  const toggleAgentEditing = (index: number) => {
    if (editingAgentIndex === index) {
      setEditingAgentIndex(null);
    } else {
      setEditingAgentIndex(index);
    }
  };

  // Update agent property
  const updateAgent = (index: number, field: keyof Agent, value: any) => {
    const updatedAgents = [...agents];
    updatedAgents[index] = {
      ...updatedAgents[index],
      [field]: value
    };
    setAgents(updatedAgents);
  };

  // Add instruction to agent
  const addInstruction = (index: number) => {
    if (!newInstruction.trim()) return;
    
    const updatedAgents = [...agents];
    updatedAgents[index].instructions.push(newInstruction);
    setAgents(updatedAgents);
    setNewInstruction('');
  };

  // Remove instruction from agent
  const removeInstruction = (agentIndex: number, instructionIndex: number) => {
    const updatedAgents = [...agents];
    updatedAgents[agentIndex].instructions.splice(instructionIndex, 1);
    setAgents(updatedAgents);
  };

  // Toggle tool for agent
  const toggleToolForAgent = (agentIndex: number, tool: string) => {
    const updatedAgents = [...agents];
    const toolIndex = updatedAgents[agentIndex].tools.indexOf(tool);
    
    if (toolIndex > -1) {
      updatedAgents[agentIndex].tools.splice(toolIndex, 1);
    } else {
      updatedAgents[agentIndex].tools.push(tool);
    }
    
    setAgents(updatedAgents);
  };

  // Toggle capability for agent
  const toggleCapabilityForAgent = (agentIndex: number, capability: string) => {
    const updatedAgents = [...agents];
    const capIndex = updatedAgents[agentIndex].capabilities.indexOf(capability);
    
    if (capIndex > -1) {
      updatedAgents[agentIndex].capabilities.splice(capIndex, 1);
    } else {
      updatedAgents[agentIndex].capabilities.push(capability);
    }
    
    setAgents(updatedAgents);
  };

  // Delete agent
  const deleteAgent = (index: number) => {
    const updatedAgents = agents.filter((_, i) => i !== index);
    setAgents(updatedAgents);
    if (editingAgentIndex === index) {
      setEditingAgentIndex(null);
    }
  };

  // Duplicate agent
  const duplicateAgent = (index: number) => {
    const agentToDuplicate = agents[index];
    const newAgent = {
      ...agentToDuplicate,
      name: `${agentToDuplicate.name}_copy`,
      isExpanded: false,
      isEditing: false
    };
    
    const updatedAgents = [...agents];
    updatedAgents.splice(index + 1, 0, newAgent);
    setAgents(updatedAgents);
  };

  // Orchestrate task with custom agents
  const orchestrateTask = async () => {
    if (!taskInput) {
      setError('Please enter a task description');
      return;
    }
    
    if (agents.length === 0) {
      setError('Please generate or add agents first');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('http://localhost:8000/api/v1/unified/orchestrate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer demo-token'
        },
        body: JSON.stringify({
          task: taskInput,
          max_agents: maxAgents,
          use_mcp_tools: useMCPTools,
          auto_approve: autoApprove,
          custom_agents: agents.map(agent => ({
            name: agent.name,
            role: agent.role,
            description: agent.description,
            capabilities: agent.capabilities,
            tools: agent.tools,
            instructions: agent.instructions,
            knowledge: agent.knowledge,
            model: agent.model,
            temperature: agent.temperature,
          }))
        }),
      });

      if (!response.ok) throw new Error('Failed to orchestrate task');
      
      const plan = await response.json();
      setExecutionPlan(plan);
      setSuccess('Task orchestrated successfully with custom agents!');
      
    } catch (err: any) {
      setError(err?.message || 'Failed to orchestrate task');
    } finally {
      setLoading(false);
    }
  };

  // Execute plan
  const executePlan = async () => {
    if (!executionPlan) return;
    
    setIsExecuting(true);
    setExecutionProgress(0);
    
    // Simulate execution progress
    const interval = setInterval(() => {
      setExecutionProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsExecuting(false);
          return 100;
        }
        return prev + 10;
      });
    }, 500);

    // Navigate to swarm chat for execution
    setTimeout(() => {
      sessionStorage.setItem('execution_plan', JSON.stringify(executionPlan));
      navigate('/swarm');
    }, 1000);
  };

  return (
    <ModernLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="rounded-xl border bg-gradient-to-br from-primary/10 via-transparent to-background p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
                <Brain className="h-3.5 w-3.5" /> Unified AI Orchestrator
              </div>
              <h1 className="text-2xl md:text-3xl font-semibold leading-tight">Design, simulate, and run multi-agent workflows</h1>
              <p className="text-sm text-muted-foreground">Professional-grade orchestration with editable agents, tools, and execution preview.</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="px-3 py-1">Advanced Mode</Badge>
            </div>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {success && (
          <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
            <Check className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-600">{success}</AlertDescription>
          </Alert>
        )}

        {/* Task + Tools Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Task Input */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Task</CardTitle>
              <CardDescription>Describe the outcome and constraints for orchestration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="E.g., Build a satellite tracker with real-time orbit visualization, export as a minimal Next.js app. Use web APIs where possible."
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                className="min-h-[120px]"
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Max Agents</Label>
                  <div className="flex items-center space-x-2">
                    <Slider
                      value={[maxAgents]}
                      onValueChange={(v) => setMaxAgents(v[0])}
                      min={1}
                      max={10}
                      step={1}
                      className="flex-1"
                    />
                    <span className="w-8 text-center font-medium">{maxAgents}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="mcp-tools" checked={useMCPTools} onCheckedChange={setUseMCPTools} />
                  <Label htmlFor="mcp-tools">Use MCP Tools</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="auto-approve" checked={autoApprove} onCheckedChange={setAutoApprove} />
                  <Label htmlFor="auto-approve">Auto Approve</Label>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={generateAgentsWithAI} disabled={loading || !taskInput} className="flex-1">
                  {loading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Brain className="h-4 w-4 mr-2" />
                  )}
                  Generate Agents
                </Button>
                <Button onClick={addCustomAgent} variant="outline">
                  <PlusCircle className="h-4 w-4 mr-2" /> Add Custom Agent
                </Button>
              </div>
            </CardContent>
          </Card>
          {/* Tools Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Tools Overview</CardTitle>
              <CardDescription>Available integrations for orchestration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className="text-xl font-semibold">{toolStats.total}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">MCP</div>
                  <div className="text-xl font-semibold">{toolStats.bySource?.mcp || 0}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Builtin</div>
                  <div className="text-xl font-semibold">{toolStats.bySource?.builtin || 0}</div>
                </div>
              </div>
              {Object.keys(toolStats.byCategory || {}).length > 0 && (
                <div>
                  <Label>By Category</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(toolStats.byCategory).map(([cat, count]) => (
                      <Badge key={cat} variant="outline">{cat} • {count}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Tool list auto-loads from server when available.</p>
            </CardContent>
          </Card>
        </div>

        {/* Agents Configuration Section */}
        {agents.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Agent Configuration</CardTitle>
                  <CardDescription>{agents.length} agents configured</CardDescription>
                </div>
                <Button
                  onClick={orchestrateTask}
                  disabled={loading || agents.length === 0}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Orchestrate Task
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-4">
                  {agents.map((agent, index) => (
                    <Card key={index} className="overflow-hidden">
                      {/* Agent Header */}
                      <div className="flex items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Bot className="h-5 w-5 text-primary" />
                          <div className="min-w-0">
                            {editingAgentIndex === index ? (
                              <>
                                <Input
                                  value={agent.name}
                                  onChange={(e) => updateAgent(index, 'name', e.target.value)}
                                  className="w-48"
                                />
                                <Input
                                  value={agent.role}
                                  onChange={(e) => updateAgent(index, 'role', e.target.value)}
                                  className="w-56 mt-1"
                                  placeholder="Agent role"
                                />
                              </>
                            ) : (
                              <>
                                <h3 className="font-semibold leading-tight truncate">{agent.name}</h3>
                                <p className="text-xs text-muted-foreground truncate">{agent.role}</p>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="hidden md:inline-flex">{agent.capabilities.length} caps</Badge>
                          <Badge variant="outline" className="hidden md:inline-flex">{agent.tools.length} tools</Badge>
                          <Button size="sm" variant="ghost" onClick={() => toggleAgentExpansion(index)}>
                            {agent.isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => toggleAgentEditing(index)}>
                            {editingAgentIndex === index ? <Save className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => duplicateAgent(index)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteAgent(index)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>

                      {/* Agent Details (Expanded) */}
                      {agent.isExpanded && (
                        <div className="space-y-4 p-4">
                          {/* Description */}
                          <div>
                            <Label>Description</Label>
                            {editingAgentIndex === index ? (
                              <Textarea
                                value={agent.description}
                                onChange={(e) => updateAgent(index, 'description', e.target.value)}
                                className="mt-1"
                              />
                            ) : (
                              <p className="text-sm mt-1 text-muted-foreground">{agent.description}</p>
                            )}
                          </div>

                          {/* Model & Temperature */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>Model</Label>
                              {editingAgentIndex === index ? (
                                <Select
                                  value={agent.model}
                                  onValueChange={(v) => updateAgent(index, 'model', v)}
                                >
                                  <SelectTrigger className="mt-1">
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
                                <p className="text-sm mt-1 text-muted-foreground">{agent.model || 'gpt-4o-mini'}</p>
                              )}
                            </div>
                            
                            <div>
                              <Label>Temperature</Label>
                              {editingAgentIndex === index ? (
                                <div className="flex items-center space-x-2 mt-1">
                                  <Slider
                                    value={[agent.temperature || 0.7]}
                                    onValueChange={(v) => updateAgent(index, 'temperature', v[0])}
                                    min={0}
                                    max={1}
                                    step={0.1}
                                    className="flex-1"
                                  />
                                  <span className="w-10 text-sm">{agent.temperature || 0.7}</span>
                                </div>
                              ) : (
                                <p className="text-sm mt-1 text-muted-foreground">{agent.temperature || 0.7}</p>
                              )}
                            </div>
                          </div>

                          {/* Capabilities */}
                          <div>
                            <Label>Capabilities</Label>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {editingAgentIndex === index ? (
                                availableCapabilities.map(cap => (
                                  <Badge
                                    key={cap}
                                    variant={agent.capabilities.includes(cap) ? "default" : "outline"}
                                    className="cursor-pointer"
                                    onClick={() => toggleCapabilityForAgent(index, cap)}
                                  >
                                    {cap}
                                  </Badge>
                                ))
                              ) : (
                                agent.capabilities.length > 0 ? (
                                  agent.capabilities.map(cap => (
                                    <Badge key={cap} variant="secondary">{cap}</Badge>
                                  ))
                                ) : (
                                  <p className="text-sm text-muted-foreground">No capabilities selected</p>
                                )
                              )}
                            </div>
                          </div>

                          {/* Tools */}
                          <div>
                            <Label>Tools</Label>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {editingAgentIndex === index ? (
                                (availableTools?.length ? availableTools : []).slice(0, 30).map(tool => (
                                  <Badge
                                    key={tool.name}
                                    variant={agent.tools.includes(tool.name) ? "default" : "outline"}
                                    className="cursor-pointer"
                                    onClick={() => toggleToolForAgent(index, tool.name)}
                                  >
                                    {tool.name}
                                  </Badge>
                                ))
                              ) : (
                                agent.tools.length > 0 ? (
                                  agent.tools.map(tool => (
                                    <Badge key={tool} variant="secondary">{tool}</Badge>
                                  ))
                                ) : (
                                  <p className="text-sm text-muted-foreground">No tools selected</p>
                                )
                              )}
                            </div>
                          </div>

                          {/* Instructions */}
                          <div>
                            <Label>Instructions</Label>
                            <div className="space-y-2 mt-2">
                              {agent.instructions.map((instruction, instIndex) => (
                                <div key={instIndex} className="flex items-start gap-2">
                                  <span className="text-sm text-muted-foreground w-6">{instIndex + 1}.</span>
                                  {editingAgentIndex === index ? (
                                    <>
                                      <Input
                                        value={instruction}
                                        onChange={(e) => {
                                          const updatedAgents = [...agents];
                                          updatedAgents[index].instructions[instIndex] = e.target.value;
                                          setAgents(updatedAgents);
                                        }}
                                        className="flex-1"
                                      />
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => removeInstruction(index, instIndex)}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </>
                                  ) : (
                                    <p className="text-sm flex-1">{instruction}</p>
                                  )}
                                </div>
                              ))}
                              
                              {editingAgentIndex === index && (
                                <div className="flex space-x-2">
                                  <Input
                                    placeholder="Add new instruction..."
                                    value={newInstruction}
                                    onChange={(e) => setNewInstruction(e.target.value)}
                                    onKeyPress={(e) => {
                                      if (e.key === 'Enter') {
                                        addInstruction(index);
                                      }
                                    }}
                                    className="flex-1"
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => addInstruction(index)}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Execution Plan */}
        {executionPlan && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Execution Plan</CardTitle>
                  <CardDescription>Ready to execute with {executionPlan.agents?.length || 0} agents</CardDescription>
                </div>
                <Button
                  onClick={executePlan}
                  disabled={isExecuting}
                  size="lg"
                >
                  {isExecuting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Execute Plan
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isExecuting && (
                <div className="space-y-2 mb-4">
                  <Progress value={executionProgress} />
                  <p className="text-sm text-muted-foreground">
                    Executing... {executionProgress}%
                  </p>
                </div>
              )}
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Complexity</div>
                    <div className="mt-1"><Badge variant="outline">{executionPlan.complexity}</Badge></div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Agents</div>
                    <div className="text-lg font-semibold">{executionPlan.agents?.length || 0}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Stages</div>
                    <div className="text-lg font-semibold">{executionPlan.workflow?.length || 0}</div>
                  </div>
                </div>
                
                <div>
                  <Label>Success Metrics</Label>
                  <ul className="list-disc list-inside text-sm mt-1 space-y-1">
                    {executionPlan.success_metrics?.map((metric: string, i: number) => (
                      <li key={i}>{metric}</li>
                    ))}
                  </ul>
                </div>
                
                {executionPlan.workflow?.length > 0 && (
                  <div>
                    <Label>Workflow Stages</Label>
                    <div className="space-y-2 mt-2">
                      {executionPlan.workflow.map((stage: any, i: number) => (
                        <div key={i} className="flex items-center space-x-2">
                          <Badge variant="secondary">{i + 1}</Badge>
                          <span className="text-sm">{stage.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ModernLayout>
  );
}
