import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgentConfigEditor } from '../components/AgentConfigEditor';
import { CompactAgentList } from '../components/CompactAgentList';
import {
  Bot, Brain, Zap, Plus, X, Check, AlertCircle, Loader2,
  Server, Wrench, Play, TestTube,
  Trash2, Edit, RefreshCw, Download,
  Grid, List, Activity, Search, ArrowRight, ArrowLeft
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

interface MCPServer {
  name: string;
  url: string;
  status: 'connected' | 'disconnected' | 'error';
  tools: string[];
  description?: string;
}

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

interface AgentTemplate {
  name: string;
  display_name: string;
  capabilities: string[];
  primary_tools: string[];
  knowledge: any;
}

// Helper function to generate random colors
const getRandomColor = () => {
  const colors = [
    'hsl(200, 70%, 50%)',
    'hsl(150, 70%, 50%)',
    'hsl(100, 70%, 50%)',
    'hsl(250, 70%, 50%)',
    'hsl(300, 70%, 50%)',
    'hsl(50, 70%, 50%)',
    'hsl(20, 70%, 50%)',
    'hsl(180, 70%, 50%)'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

// Navigation helper functions
const steps = ['orchestrate', 'agents', 'execution'];
const stepTitles = {
  'orchestrate': 'Task Setup',
  'agents': 'Configure Agents', 
  'execution': 'Review & Execute'
};

const canProceedToNextStep = (step: string, taskInput: string, agents: Agent[]) => {
  switch (step) {
    case 'orchestrate':
      return taskInput.trim().length > 0;
    case 'agents':
      return agents.length > 0;
    case 'execution':
      return true;
    default:
      return false;
  }
};

const navigateToStep = (step: string, setCurrentStep: (step: string) => void) => {
  setCurrentStep(step);
  const tabsTrigger = document.querySelector(`[value="${step}"]`) as HTMLButtonElement;
  if (tabsTrigger) tabsTrigger.click();
};

const getNextStep = (currentStep: string) => {
  const currentIndex = steps.indexOf(currentStep);
  return currentIndex < steps.length - 1 ? steps[currentIndex + 1] : null;
};

const getPrevStep = (currentStep: string) => {
  const currentIndex = steps.indexOf(currentStep);
  return currentIndex > 0 ? steps[currentIndex - 1] : null;
};

export const UnifiedOrchestratorV2: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState('orchestrate');

  // Tool Management State
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [toolSearchQuery, setToolSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [toolView, setToolView] = useState<'grid' | 'list'>('grid');

  // Agent Management State
  const [agents, setAgents] = useState<Agent[]>([]);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [agentBuilder, setAgentBuilder] = useState({
    name: '',
    role: '',
    description: '',
    model: 'gpt-4',
    temperature: 0.7,
    capabilities: [] as string[],
    selectedTools: [] as string[],
    instructions: [''] as string[],
    knowledge: {},
  });

  // Task Configuration State
  const [taskInput, setTaskInput] = useState('');
  const [taskComplexity, setTaskComplexity] = useState<'simple' | 'moderate' | 'complex'>('moderate');
  const [maxAgents, setMaxAgents] = useState(3);
  const [useMCPTools, setUseMCPTools] = useState(true);
  const [autoApprove, setAutoApprove] = useState(false);

  // Execution State
  const [executionPlan, setExecutionPlan] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState(0);

  // Load all resources on mount
  useEffect(() => {
    loadAllResources();
  }, []);

  const loadAllResources = async () => {
    setLoading(true);
    try {
      // Load available tools
      const toolsResponse = await fetch('http://localhost:8000/api/v1/tool-registry/available-tools');
      const toolsData = await toolsResponse.json();
      
      // Load MCP servers and their tools
      const mcpResponse = await fetch('http://localhost:8000/api/v1/mcp/servers');
      const mcpData = await mcpResponse.json();
      
      // Load MCP tools
      const mcpToolsResponse = await fetch('http://localhost:8000/api/v1/mcp/tools');
      const mcpTools = await mcpToolsResponse.json();
      
      // Load agent templates
      const templatesResponse = await fetch('http://localhost:8000/api/v1/unified/agents/templates');
      const templatesData = await templatesResponse.json();

      // Process and combine all tools
      const allTools: Tool[] = [];
      
      // Add builtin tools
      if (toolsData.tools) {
        Object.entries(toolsData.tools).forEach(([name, tool]: [string, any]) => {
          allTools.push({
            name,
            description: tool.description || '',
            category: tool.category || 'general',
            enabled: tool.enabled !== false,
            requires_approval: tool.requires_approval || false,
            source: 'builtin',
            parameters: tool.parameters,
            examples: tool.examples,
          });
        });
      }

      // Add MCP tools
      if (Array.isArray(mcpTools)) {
        mcpTools.forEach((tool: any) => {
          allTools.push({
            name: `mcp_${tool.name}`,
            description: tool.description || '',
            category: tool.category || 'mcp',
            enabled: true,
            requires_approval: true,
            source: 'mcp',
            mcp_server: tool.server,
            parameters: tool.inputSchema,
          });
        });
      }

      setAvailableTools(allTools);
      setMcpServers(Object.entries(mcpData.servers || {}).map(([name, server]: [string, any]) => ({
        name,
        url: server.url || '',
        status: server.connected ? 'connected' : 'disconnected',
        tools: server.tools || [],
        description: server.description,
      })));
      setTemplates(templatesData.templates || []);
      
    } catch (err: any) {
      setError(err?.message || 'Failed to load resources');
    } finally {
      setLoading(false);
    }
  };

  // Tool filtering
  const filteredTools = availableTools.filter(tool => {
    const matchesSearch = tool.name.toLowerCase().includes(toolSearchQuery.toLowerCase()) ||
                         tool.description.toLowerCase().includes(toolSearchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ['all', ...Array.from(new Set(availableTools.map(t => t.category)))];

  // Add MCP Server
  const addMCPServer = async () => {
    const serverUrl = prompt('Enter MCP Server URL (e.g., http://localhost:8001):');
    if (!serverUrl) return;

    try {
      const response = await fetch('http://localhost:8000/api/v1/mcp/servers/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: serverUrl }),
      });
      
      if (response.ok) {
        setSuccess('MCP server added successfully');
        await loadAllResources();
      } else {
        throw new Error('Failed to add MCP server');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to add MCP server');
    }
  };

  // Test Tool
  const testTool = async (toolName: string) => {
    try {
      const response = await fetch('http://localhost:8000/api/v1/tools/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: toolName,
          parameters: {},
        }),
      });
      
      const result = await response.json();
      alert(`Tool Test Result:\n${JSON.stringify(result, null, 2)}`);
    } catch (err: any) {
      setError(`Failed to test tool: ${err?.message}`);
    }
  };

  // Toggle tool in agent builder
  const toggleToolSelection = (toolName: string) => {
    setAgentBuilder(prev => ({
      ...prev,
      selectedTools: prev.selectedTools.includes(toolName)
        ? prev.selectedTools.filter(t => t !== toolName)
        : [...prev.selectedTools, toolName]
    }));
  };

  // Add instruction to agent
  const addInstruction = () => {
    setAgentBuilder(prev => ({
      ...prev,
      instructions: [...prev.instructions, '']
    }));
  };

  // Update instruction
  const updateInstruction = (index: number, value: string) => {
    const newInstructions = [...agentBuilder.instructions];
    newInstructions[index] = value;
    setAgentBuilder(prev => ({ ...prev, instructions: newInstructions }));
  };

  // Remove instruction
  const removeInstruction = (index: number) => {
    if (agentBuilder.instructions.length <= 1) return;
    setAgentBuilder(prev => ({
      ...prev,
      instructions: prev.instructions.filter((_, i) => i !== index)
    }));
  };

  // Helper function to get random color
  const getRandomColor = () => {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
      '#6A0572', '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  // Create agent from builder
  const createAgent = () => {
    if (!agentBuilder.name || !agentBuilder.role || agentBuilder.selectedTools.length === 0) {
      
      let errorMessage = 'Please check the following requirements:\n';
      if (!agentBuilder.name) errorMessage += '• Agent name is required\n';
      if (!agentBuilder.role) errorMessage += '• Agent role is required\n';
      if (agentBuilder.selectedTools.length === 0) {
        if (availableTools.length === 0) {
          errorMessage += '• No tools available (click Refresh to load tools)\n';
        } else {
          errorMessage += '• At least one tool must be selected\n';
        }
      }
      
      setError(errorMessage);
      return;
    }

    const newAgent: Agent = {
      id: `agent_${Date.now()}`,
      name: agentBuilder.name,
      role: agentBuilder.role,
      description: agentBuilder.description,
      model: agentBuilder.model,
      temperature: agentBuilder.temperature,
      capabilities: agentBuilder.capabilities,
      tools: agentBuilder.selectedTools,
      instructions: agentBuilder.instructions.filter(i => i.trim()),
      knowledge: agentBuilder.knowledge,
      color: `hsl(${Math.random() * 360}, 70%, 50%)`,
      icon: Bot,
    };

    setAgents(prev => [...prev, newAgent]);
    setSuccess('Agent created successfully');
    
    // Reset builder
    setAgentBuilder({
      name: '',
      role: '',
      description: '',
      model: 'gpt-4',
      temperature: 0.7,
      capabilities: [],
      selectedTools: [],
      instructions: [''],
      knowledge: {},
    });
  };

  // Load template into builder
  const loadTemplate = (template: AgentTemplate) => {
    setAgentBuilder({
      name: template.name,
      role: template.display_name,
      description: `Specialized ${template.display_name}`,
      model: 'gpt-4',
      temperature: 0.7,
      capabilities: template.capabilities,
      selectedTools: template.primary_tools,
      instructions: [
        `You are a specialized ${template.display_name}`,
        'Follow best practices for your domain',
        'Document your work clearly',
        'Test your work before marking complete',
        'Use tools efficiently',
        'Report progress regularly',
        'Collaborate with other agents when needed',
        'Ask for clarification if requirements are unclear',
      ],
      knowledge: template.knowledge,
    });
  };

  // Delete agent
  const deleteAgent = (agentId: string) => {
    setAgents(prev => prev.filter(a => a.id !== agentId));
  };

  // Edit agent
  const editAgent = (agent: Agent) => {
    setAgentBuilder({
      name: agent.name,
      role: agent.role,
      description: agent.description,
      model: agent.model,
      temperature: agent.temperature,
      capabilities: agent.capabilities,
      selectedTools: agent.tools,
      instructions: agent.instructions,
      knowledge: agent.knowledge,
    });
    deleteAgent(agent.id);
  };

  // Create quick-start agents
  const createQuickStartAgents = () => {
    const quickAgents: Agent[] = [
      {
        id: `agent_${Date.now()}_1`,
        name: 'research_agent',
        role: 'Research Specialist',
        description: 'Specialized in web research and information gathering',
        model: 'gpt-4',
        temperature: 0.7,
        capabilities: ['web_search', 'file_operations'],
        tools: ['tavily_search', 'file_read', 'file_write'],
        instructions: [
          'Search for relevant information',
          'Analyze and summarize findings',
          'Document research results',
          'Verify information accuracy',
          'Provide citations when possible',
          'Structure information clearly',
          'Identify key insights',
          'Report findings comprehensively'
        ],
        knowledge: {},
        color: 'hsl(200, 70%, 50%)',
        icon: Bot,
      },
      {
        id: `agent_${Date.now()}_2`,
        name: 'code_agent',
        role: 'Code Developer',
        description: 'Specialized in code development and analysis',
        model: 'gpt-4',
        temperature: 0.5,
        capabilities: ['code_execution', 'file_operations'],
        tools: ['python_repl', 'file_read', 'file_write', 'calculator'],
        instructions: [
          'Write clean, efficient code',
          'Follow best practices',
          'Add proper documentation',
          'Test code before delivery',
          'Handle errors gracefully',
          'Optimize for performance',
          'Ensure code security',
          'Create reusable components'
        ],
        knowledge: {},
        color: 'hsl(120, 70%, 50%)',
        icon: Bot,
      }
    ];
    
    setAgents(quickAgents);
    setSuccess('Quick-start agents created! You can now orchestrate tasks.');
  };

  // Orchestrate task with AI generation or custom agents
  const orchestrateTask = async (useAIGeneration: boolean = false) => {
    if (!taskInput) {
      setError('Please enter a task description');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    // Build request body
    const requestBody: any = {
      task: taskInput,
      max_agents: maxAgents,
      use_mcp_tools: useMCPTools,
      auto_approve: autoApprove,
    };
    
    // Only send custom agents if we have them AND not using AI generation
    if (!useAIGeneration && agents.length > 0) {
      console.log('Using custom agents:', agents);
      requestBody.custom_agents = agents.map(agent => ({
            name: agent.name,
            role: agent.role,
            description: agent.description,
            capabilities: agent.capabilities,
            tools: agent.tools,
            instructions: agent.instructions,
            knowledge: agent.knowledge,
            model: agent.model,
            temperature: agent.temperature,
          }));
    } else if (useAIGeneration || agents.length === 0) {
      console.log('Using AI to generate agents for task:', taskInput);
      // Don't send custom_agents - let the backend generate them
    }
    
    console.log('Request body:', requestBody);
    
    try {
      const response = await fetch('/api/v1/unified-orchestrator/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) throw new Error('Failed to orchestrate task');
      
      const plan = await response.json();
      setExecutionPlan(plan);
      
      // If AI generated agents, update the agents state
      if (useAIGeneration || agents.length === 0) {
        if (plan.agents && plan.agents.length > 0) {
          const generatedAgents = plan.agents.map((agent: any, index: number) => ({
            id: `agent_${Date.now()}_${index}`,
            name: agent.name,
            role: agent.role,
            description: agent.description,
            model: agent.model || 'gpt-4o-mini',
            temperature: agent.temperature || 0.7,
            capabilities: agent.capabilities || [],
            tools: agent.tools || agent.primary_tools || [],
            instructions: agent.instructions || [],
            knowledge: agent.knowledge || {},
            color: getRandomColor(),
            icon: Bot
          }));
          setAgents(generatedAgents);
          setSuccess(`Task orchestrated successfully! Generated ${generatedAgents.length} agents.`);
        }
      } else {
        setSuccess('Task orchestrated successfully!');
      }
      
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

    // Convert agents to swarm format for execution
    const swarmAgents = executionPlan.agents.map((agent: any) => ({
      name: agent.name,
      system_prompt: `You are ${agent.role}. ${agent.description}

Your instructions:
${agent.instructions.map((inst: string, i: number) => `${i + 1}. ${inst}`).join('\n')}

You have access to the following tools: ${agent.tools.join(', ')}

Use these tools effectively to complete your tasks. Collaborate with other agents as needed.`,
      tools: agent.tools,
      description: agent.description,
      model: agent.model || 'gpt-4o-mini',
      temperature: agent.temperature || 0.7
    }));

    // Navigate to swarm chat for execution with proper sessionStorage keys
    setTimeout(() => {
      sessionStorage.setItem('orchestratorTask', executionPlan.task);
      sessionStorage.setItem('orchestratorAgents', JSON.stringify(swarmAgents));
      sessionStorage.setItem('orchestratorAutoStart', 'true');
      navigate('/swarm');
    }, 1000);
  };

  return (
    <ModernLayout>
      <ScrollArea className="h-full">
        <div className="container mx-auto p-6 max-w-7xl space-y-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Brain className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Unified AI Orchestrator</h1>
              <p className="text-muted-foreground">Build and configure intelligent agent swarms with real tools</p>
            </div>
          </div>
          <Button onClick={loadAllResources} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-4 border-green-500 bg-green-50 dark:bg-green-950">
            <Check className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-700 dark:text-green-300">{success}</AlertDescription>
          </Alert>
        )}

        {/* Step Navigation */}
        <div className="mb-8">
          <div className="flex items-center justify-center space-x-8">
            {steps.map((step, index) => {
              const isActive = step === currentStep;
              const isCompleted = steps.indexOf(currentStep) > index;
              const canAccess = index === 0 || canProceedToNextStep(steps[index - 1], taskInput, agents);
              
              return (
                <div key={step} className="flex items-center">
                  {index > 0 && (
                    <div className={cn(
                      "w-16 h-px mr-8",
                      isCompleted || (isActive && index > 0) ? "bg-primary" : "bg-border"
                    )} />
                  )}
                  <button
                    className={cn(
                      "flex flex-col items-center gap-2 px-4 py-3 rounded-lg transition-all duration-200 min-w-[120px]",
                      isActive && "bg-primary/5 text-primary",
                      isCompleted && !isActive && "text-green-600",
                      !isActive && !isCompleted && canAccess && "text-muted-foreground hover:text-foreground hover:bg-muted/30",
                      !isActive && !isCompleted && !canAccess && "text-muted cursor-not-allowed opacity-50"
                    )}
                    onClick={() => canAccess && navigateToStep(step, setCurrentStep)}
                    disabled={!canAccess}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-all",
                      isActive && "bg-primary text-primary-foreground border-primary shadow-md scale-110",
                      isCompleted && !isActive && "bg-green-500 text-white border-green-500",
                      !isActive && !isCompleted && canAccess && "border-muted-foreground/30 hover:border-primary/50",
                      !isActive && !isCompleted && !canAccess && "border-muted"
                    )}>
                      {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-medium">
                        {stepTitles[step as keyof typeof stepTitles]}
                      </div>
                      {isActive && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {currentStep === 'orchestrate' && "Enter task description"}
                          {currentStep === 'agents' && "Configure AI agents"}
                          {currentStep === 'execution' && "Review and execute"}
                        </div>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <Tabs value={currentStep} onValueChange={setCurrentStep} className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="orchestrate" className={cn("data-[state=active]:bg-primary data-[state=active]:text-primary-foreground")}>
              1. Task Setup
            </TabsTrigger>
            <TabsTrigger value="agents" disabled={!canProceedToNextStep('orchestrate', taskInput, agents)}>
              2. Configure Agents
            </TabsTrigger>
            <TabsTrigger value="execution" disabled={!canProceedToNextStep('agents', taskInput, agents)}>
              3. Review & Execute
            </TabsTrigger>
            <TabsTrigger value="tools" className="opacity-60">
              🔧 Tools & MCP
            </TabsTrigger>
            <TabsTrigger value="templates" className="opacity-60">
              📋 Templates
            </TabsTrigger>
          </TabsList>

          {/* Tools & MCP Tab */}
          <TabsContent value="tools" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Available Tools</CardTitle>
                    <CardDescription>
                      {availableTools.length} tools available from {mcpServers.filter(s => s.status === 'connected').length} MCP servers
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={addMCPServer} variant="outline" size="sm">
                      <Server className="h-4 w-4 mr-2" />
                      Add MCP Server
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setToolView(toolView === 'grid' ? 'list' : 'grid')}
                    >
                      {toolView === 'grid' ? <List className="h-4 w-4" /> : <Grid className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Tool Filters */}
                <div className="flex gap-4 mb-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        placeholder="Search tools..."
                        value={toolSearchQuery}
                        onChange={(e) => setToolSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat} value={cat}>
                          {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* MCP Servers */}
                {mcpServers.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium mb-2">MCP Servers</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {mcpServers.map(server => (
                        <div
                          key={server.name}
                          className={cn(
                            "p-3 rounded-lg border",
                            server.status === 'connected' ? "border-green-500 bg-green-50 dark:bg-green-950" : "border-red-500 bg-red-50 dark:bg-red-950"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Server className="h-4 w-4" />
                              <span className="font-medium">{server.name}</span>
                            </div>
                            <Badge variant={server.status === 'connected' ? 'default' : 'destructive'}>
                              {server.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{server.url}</p>
                          <p className="text-xs mt-1">{server.tools.length} tools</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tools Grid/List */}
                <ScrollArea className="h-[400px] pr-2">
                  <div>
                  {toolView === 'grid' ? (
                    <div className="grid grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
                      {filteredTools.map(tool => (
                        <Card key={tool.name} className="relative">
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2">
                                <Wrench className="h-4 w-4 text-muted-foreground" />
                                <CardTitle className="text-sm">{tool.name}</CardTitle>
                              </div>
                              <div className="flex gap-1">
                                {tool.source === 'mcp' && (
                                  <Badge variant="secondary" className="text-xs">MCP</Badge>
                                )}
                                {tool.requires_approval && (
                                  <Badge variant="outline" className="text-xs">Approval</Badge>
                                )}
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <p className="text-xs text-muted-foreground line-clamp-2">{tool.description}</p>
                            <div className="flex items-center justify-between mt-3">
                              <Badge variant="outline" className="text-xs">
                                {tool.category}
                              </Badge>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => testTool(tool.name)}
                                  className="h-7 w-7 p-0"
                                >
                                  <TestTube className="h-3 w-3" />
                                </Button>
                                <Switch
                                  checked={tool.enabled}
                                  className="scale-75"
                                />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredTools.map(tool => (
                        <div key={tool.name} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <Wrench className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{tool.name}</span>
                                {tool.source === 'mcp' && <Badge variant="secondary" className="text-xs">MCP</Badge>}
                                {tool.requires_approval && <Badge variant="outline" className="text-xs">Approval</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground">{tool.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{tool.category}</Badge>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => testTool(tool.name)}
                            >
                              <TestTube className="h-4 w-4" />
                            </Button>
                            <Switch checked={tool.enabled} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Agent Builder Tab */}
          <TabsContent value="agents" className="space-y-4">
            <div className="flex gap-4 min-h-[600px]">
              {/* Agent Builder Form */}
              <Card className="flex-1 flex flex-col">
                <CardHeader className="flex-shrink-0">
                  <CardTitle>Build Agent</CardTitle>
                  <CardDescription>Configure a custom AI agent with specific tools and capabilities</CardDescription>
                  {availableTools.length === 0 && (
                    <Alert className="mt-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Tools are loading... If they don't appear, click the Refresh button above.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Agent Name</Label>
                      <Input
                        placeholder="e.g., research_agent"
                        value={agentBuilder.name}
                        onChange={(e) => setAgentBuilder({...agentBuilder, name: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Role</Label>
                      <Input
                        placeholder="e.g., Research Specialist"
                        value={agentBuilder.role}
                        onChange={(e) => setAgentBuilder({...agentBuilder, role: e.target.value})}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Description</Label>
                    <Textarea
                      placeholder="Describe the agent's purpose and expertise..."
                      value={agentBuilder.description}
                      onChange={(e) => setAgentBuilder({...agentBuilder, description: e.target.value})}
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Model</Label>
                      <Select
                        value={agentBuilder.model}
                        onValueChange={(value) => setAgentBuilder({...agentBuilder, model: value})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gpt-4">GPT-4</SelectItem>
                          <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                          <SelectItem value="claude-3">Claude 3</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Temperature: {agentBuilder.temperature}</Label>
                      <Slider
                        value={[agentBuilder.temperature]}
                        onValueChange={([value]) => setAgentBuilder({...agentBuilder, temperature: value})}
                        min={0}
                        max={2}
                        step={0.1}
                        className="mt-2"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Select Tools ({availableTools.length} available)</Label>
                    <div className="h-[120px] overflow-y-auto border rounded-lg p-2 mt-2 bg-background">
                      <div className="space-y-1">
                        {availableTools.length === 0 ? (
                          <div className="text-center py-4 text-muted-foreground">
                            <p className="text-sm">Loading tools...</p>
                            <p className="text-xs">Click Refresh if tools don't load</p>
                          </div>
                        ) : (
                          availableTools.slice(0, 30).map(tool => (
                          <div
                            key={tool.name}
                            className={cn(
                              "flex items-center justify-between p-2 rounded cursor-pointer transition-colors text-sm",
                              agentBuilder.selectedTools.includes(tool.name)
                                ? "bg-primary/10 border border-primary"
                                : "hover:bg-muted"
                            )}
                            onClick={() => toggleToolSelection(tool.name)}
                          >
                            <div className="flex items-center gap-2">
                              <div className={cn(
                                "h-3 w-3 rounded border flex items-center justify-center",
                                agentBuilder.selectedTools.includes(tool.name)
                                  ? "bg-primary border-primary"
                                  : "border-muted-foreground"
                              )}>
                                {agentBuilder.selectedTools.includes(tool.name) && (
                                  <Check className="h-2 w-2 text-primary-foreground" />
                                )}
                              </div>
                              <span className="text-sm">{tool.name}</span>
                              {tool.source === 'mcp' && (
                                <Badge variant="outline" className="text-xs h-4 px-1">MCP</Badge>
                              )}
                            </div>
                            <Badge variant="secondary" className="text-xs">{tool.category}</Badge>
                          </div>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="text-xs text-muted-foreground mb-1">
                        Selected: {agentBuilder.selectedTools.length} tools
                      </div>
                      <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                        {agentBuilder.selectedTools.map(tool => (
                          <Badge key={tool} variant="secondary" className="text-xs">
                            {tool}
                            <X
                              className="h-2 w-2 ml-1 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleToolSelection(tool);
                              }}
                            />
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label>Instructions (Min 8)</Label>
                    <div className="max-h-[200px] overflow-y-auto space-y-2 mt-2 pr-2">
                      {agentBuilder.instructions.map((instruction, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            value={instruction}
                            onChange={(e) => updateInstruction(index, e.target.value)}
                            placeholder={`Instruction ${index + 1}...`}
                            className="text-sm"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeInstruction(index)}
                            disabled={agentBuilder.instructions.length <= 1}
                            className="h-8 w-8 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={addInstruction}
                      className="mt-2"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Instruction
                    </Button>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setAgentBuilder({
                      name: '',
                      role: '',
                      description: '',
                      model: 'gpt-4',
                      temperature: 0.7,
                      capabilities: [],
                      selectedTools: [],
                      instructions: [''],
                      knowledge: {},
                    })}>
                      Clear
                    </Button>
                    <Button 
                      onClick={createAgent}
                      disabled={loading || availableTools.length === 0}
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4 mr-2" />
                      )}
                      {availableTools.length === 0 ? 'Loading Tools...' : 'Create Agent'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Created Agents */}
              <Card className="flex-1 flex flex-col">
                <CardHeader className="flex-shrink-0">
                  <CardTitle>Created Agents ({agents.length})</CardTitle>
                  <CardDescription>Your custom agent configurations</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 p-0">
                  <ScrollArea className="h-[400px] p-4">
                    <CompactAgentList
                      agents={agents}
                      availableTools={availableTools}
                      onAgentsUpdate={setAgents}
                      onAddAgent={() => {}}
                    />
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
            
            {/* Navigation Buttons */}
            <div className="flex justify-between items-center pt-4">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => navigateToStep('orchestrate', setCurrentStep)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back: Task Setup
                </Button>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-sm text-muted-foreground">
                  {agents.length > 0 ? `${agents.length} agents configured` : 'Add agents to continue'}
                </div>
                <Button
                  onClick={() => navigateToStep('execution', setCurrentStep)}
                  disabled={!canProceedToNextStep('agents', taskInput, agents)}
                  className="min-w-[120px]"
                >
                  Next: Review & Execute
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Agent Templates</CardTitle>
                <CardDescription>Pre-configured agent templates for common roles</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  {templates.map(template => (
                    <Card
                      key={template.name}
                      className="cursor-pointer hover:shadow-lg transition-shadow"
                      onClick={() => loadTemplate(template)}
                    >
                      <CardHeader>
                        <CardTitle className="text-base">{template.display_name}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div>
                            <p className="text-xs text-muted-foreground">Capabilities</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {template.capabilities.slice(0, 3).map(cap => (
                                <Badge key={cap} variant="outline" className="text-xs">
                                  {cap}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Primary Tools</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {template.primary_tools.slice(0, 3).map(tool => (
                                <Badge key={tool} variant="secondary" className="text-xs">
                                  {tool}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                        <Button className="w-full mt-3" size="sm">
                          Use Template
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Orchestrate Tab */}
          <TabsContent value="orchestrate" className="space-y-6">
            {/* Getting Started Guide */}
            <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950">
              <Brain className="h-4 w-4 text-blue-500" />
              <AlertDescription>
                <div className="space-y-3">
                  <div className="font-semibold text-blue-700 dark:text-blue-300">
                    🚀 How to Use the Unified AI Orchestrator
                  </div>
                  <div className="text-sm space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center font-bold">1</div>
                      <span>Describe your task in detail below</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center font-bold">2</div>
                      <span>Click "AI Generate Agents" to create your team automatically</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center font-bold">3</div>
                      <span>Review and customize agents in the next step</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center font-bold">4</div>
                      <span>Execute your task and watch the agents collaborate!</span>
                    </div>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">📝 Step 1: Describe Your Task</CardTitle>
                <CardDescription>Be specific about what you want to accomplish - the AI will analyze your needs and create the perfect team</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-base font-semibold">What do you want to accomplish?</Label>
                  <Textarea
                    placeholder="Example: 'Research the latest AI trends and create a comprehensive report' or 'Analyze my website's performance and suggest improvements' or 'Help me plan a marketing campaign for my new product'..."
                    value={taskInput}
                    onChange={(e) => setTaskInput(e.target.value)}
                    rows={4}
                    className="min-h-[100px]"
                  />
                  <div className="text-sm text-muted-foreground">
                    💡 <strong>Tip:</strong> Be specific about your goal, data sources, and expected outcome for better results
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Complexity</Label>
                    <Select value={taskComplexity} onValueChange={(v: any) => setTaskComplexity(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simple">Simple</SelectItem>
                        <SelectItem value="moderate">Moderate</SelectItem>
                        <SelectItem value="complex">Complex</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Max Agents</Label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={maxAgents}
                      onChange={(e) => setMaxAgents(parseInt(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Use MCP Tools</Label>
                      <Switch checked={useMCPTools} onCheckedChange={setUseMCPTools} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Auto-Approve</Label>
                      <Switch checked={autoApprove} onCheckedChange={setAutoApprove} />
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <Button
                      onClick={() => orchestrateTask(true)}
                      disabled={loading || !taskInput.trim()}
                      size="lg"
                      className="w-full max-w-md bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          🤖 AI is analyzing your task...
                        </>
                      ) : (
                        <>
                          <Brain className="h-5 w-5 mr-2" />
                          🚀 AI Generate My Team
                        </>
                      )}
                    </Button>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground mb-2">
                      {agents.length > 0 
                        ? `✅ ${agents.length} agents ready | Or regenerate a new team above`
                        : taskInput.trim() 
                        ? "✨ Ready to create your AI team!" 
                        : "👆 Enter your task description above to get started"
                      }
                    </div>
                    
                    <div className="flex justify-center gap-2">
                      {agents.length > 0 && (
                        <Button
                          onClick={() => orchestrateTask(false)}
                          disabled={loading || !taskInput.trim()}
                          variant="outline"
                          size="sm"
                        >
                          <Zap className="h-4 w-4 mr-2" />
                          Use Current Team
                        </Button>
                      )}
                      
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          setTaskInput("Research the latest AI developments in 2024 and create a comprehensive report with market analysis and future predictions");
                          createQuickStartAgents();
                        }}
                      >
                        <Zap className="h-4 w-4 mr-2" />
                        Try Demo Task
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Compact Active Agents Summary */}
            <Card className="mt-4">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Active Agents ({agents.length})</CardTitle>
                    <CardDescription className="text-xs">
                      {agents.length === 0 
                        ? "AI will generate agents based on your task" 
                        : `${agents.length} agents configured - click to expand`}
                    </CardDescription>
                  </div>
                  {agents.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => {
                        const newAgent = {
                          id: `agent_${Date.now()}`,
                          name: `custom_agent_${agents.length + 1}`,
                          role: 'Custom Agent',
                          description: 'New custom agent',
                          model: 'gpt-4o-mini',
                          temperature: 0.7,
                          capabilities: [],
                          tools: [],
                          instructions: ['Perform assigned tasks'],
                          knowledge: {},
                          color: getRandomColor(),
                          icon: Bot
                        };
                        setAgents([...agents, newAgent]);
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Agent
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {agents.length > 0 ? (
                  <ScrollArea className="max-h-[400px] pr-2">
                    <CompactAgentList
                      agents={agents}
                      availableTools={availableTools}
                      onAgentsUpdate={setAgents}
                      onAddAgent={() => {
                        const newAgent = {
                          id: `agent_${Date.now()}`,
                          name: `custom_agent_${agents.length + 1}`,
                          role: 'Custom Agent',
                          description: 'New custom agent',
                          model: 'gpt-4o-mini',
                          temperature: 0.7,
                          capabilities: [],
                          tools: [],
                          instructions: ['Perform assigned tasks'],
                          knowledge: {},
                          color: getRandomColor(),
                          icon: Bot
                        };
                        setAgents([...agents, newAgent]);
                      }}
                      onEditAgent={(agent) => {
                        // Open agent builder tab with this agent
                        setAgentBuilder({
                          name: agent.name,
                          role: agent.role,
                          description: agent.description,
                          model: agent.model,
                          temperature: agent.temperature,
                          capabilities: agent.capabilities,
                          selectedTools: agent.tools,
                          instructions: agent.instructions,
                          knowledge: agent.knowledge,
                        });
                        // Switch to Agent Builder tab
                        const tabsTrigger = document.querySelector('[value="agents"]') as HTMLButtonElement;
                        if (tabsTrigger) tabsTrigger.click();
                      }}
                    />
                  </ScrollArea>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-medium mb-1">No Agents Configured</p>
                    <p className="text-xs mb-3">Enter a task and click "AI Generate Agents"</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={createQuickStartAgents}
                    >
                      <Zap className="h-3 w-3 mr-1" />
                      Quick-Start Agents
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Navigation Buttons */}
            <Card className="border-2 border-dashed border-primary/50 bg-primary/5">
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <div className="text-sm text-muted-foreground">
                    {!canProceedToNextStep('orchestrate', taskInput, agents) ? (
                      <>
                        📝 <strong>Step 1:</strong> Enter your task description above, then generate agents to continue
                      </>
                    ) : (
                      <>
                        ✅ <strong>Ready for Step 2!</strong> You can now configure your agents or proceed to execution
                      </>
                    )}
                  </div>
                  
                  <div className="flex justify-center gap-3">
                    {canProceedToNextStep('orchestrate', taskInput, agents) ? (
                      <>
                        <Button
                          onClick={() => navigateToStep('agents', setCurrentStep)}
                          size="lg"
                          className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white"
                        >
                          Next: Review & Customize Agents
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => navigateToStep('execution', setCurrentStep)}
                          variant="outline"
                          size="lg"
                        >
                          Skip to Execution
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        disabled
                        size="lg"
                        variant="outline"
                        className="opacity-50"
                      >
                        Next: Configure Agents
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Review & Execute Tab */}
          <TabsContent value="execution" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left Column - Agent Summary */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Agent Team</CardTitle>
                        <CardDescription>{agents.length} agents ready</CardDescription>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          // Switch to Configure Agents tab
                          const tabsTrigger = document.querySelector('[value="agents"]') as HTMLButtonElement;
                          if (tabsTrigger) tabsTrigger.click();
                        }}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit Agents
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {agents.length > 0 ? (
                      <ScrollArea className="max-h-[400px] pr-2">
                        <div className="space-y-2">
                        {agents.map((agent, index) => (
                          <div key={agent.id} className="p-3 border rounded-lg bg-muted/30">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Bot className="h-4 w-4" style={{ color: agent.color }} />
                                <div>
                                  <p className="font-medium text-sm">{agent.role}</p>
                                  <p className="text-xs text-muted-foreground">{agent.name}</p>
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {agent.model || 'gpt-4o-mini'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">{agent.description}</p>
                            <div className="flex flex-wrap gap-1">
                              {agent.tools.slice(0, 5).map(tool => (
                                <Badge key={tool} variant="secondary" className="text-xs h-4 px-1">
                                  {tool}
                                </Badge>
                              ))}
                              {agent.tools.length > 5 && (
                                <Badge variant="secondary" className="text-xs h-4 px-1">
                                  +{agent.tools.length - 5}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                        </div>
                      </ScrollArea>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Bot className="h-10 w-10 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No agents configured</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-3"
                          onClick={() => {
                            const tabsTrigger = document.querySelector('[value="orchestrate"]') as HTMLButtonElement;
                            if (tabsTrigger) tabsTrigger.click();
                          }}
                        >
                          Go to Task Setup
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Task Summary */}
                {executionPlan && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Task Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <Label className="text-xs">Task</Label>
                        <p className="text-sm mt-1">{executionPlan.task}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Complexity</Label>
                          <Badge variant="outline" className="mt-1">{executionPlan.complexity}</Badge>
                        </div>
                        <div>
                          <Label className="text-xs">Duration</Label>
                          <p className="text-sm mt-1">{executionPlan.estimated_duration || '5'} min</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Right Column - Execution Controls */}
              <div className="space-y-4">
                {executionPlan ? (
                  <>
                    {/* Workflow Stages */}
                    {executionPlan.workflow && executionPlan.workflow.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Workflow Stages</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {executionPlan.workflow.map((stage: any, index: number) => (
                              <div key={index} className="flex items-center gap-3 p-2 border rounded-lg">
                                <div className={cn(
                                  "h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium",
                                  executionProgress > (index / executionPlan.workflow.length) * 100
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted"
                                )}>
                                  {index + 1}
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{stage.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {stage.agents?.join(', ')}
                                  </p>
                                </div>
                                {stage.parallel && <Badge variant="outline" className="text-xs">Parallel</Badge>}
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Success Metrics */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Success Metrics</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-1">
                          {executionPlan.success_metrics?.slice(0, 5).map((metric: string, i: number) => (
                            <li key={i} className="flex items-start gap-2">
                              <Check className="h-3 w-3 text-green-500 mt-0.5" />
                              <span className="text-xs">{metric}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>

                    {/* Execution Controls */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Execution</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {isExecuting && (
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Progress</span>
                              <span>{executionProgress}%</span>
                            </div>
                            <Progress value={executionProgress} />
                          </div>
                        )}
                        
                        <div className="flex gap-2">
                          <Button
                            className="flex-1"
                            onClick={executePlan}
                            disabled={isExecuting || agents.length === 0}
                          >
                            {isExecuting ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Executing...
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4 mr-2" />
                                Execute Plan
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              const dataStr = JSON.stringify(executionPlan, null, 2);
                              const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
                              const exportFileDefaultName = 'execution_plan.json';
                              const linkElement = document.createElement('a');
                              linkElement.setAttribute('href', dataUri);
                              linkElement.setAttribute('download', exportFileDefaultName);
                              linkElement.click();
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <Card>
                    <CardContent className="text-center py-12">
                      <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="font-medium mb-2">No Execution Plan</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Create agents and orchestrate a task first
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const tabsTrigger = document.querySelector('[value="orchestrate"]') as HTMLButtonElement;
                          if (tabsTrigger) tabsTrigger.click();
                        }}
                      >
                        Go to Task Setup
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
            
            {/* Navigation Buttons */}
            <div className="flex justify-between items-center pt-4">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => navigateToStep('agents', setCurrentStep)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back: Configure Agents
                </Button>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-sm text-muted-foreground">
                  Ready to execute with {agents.length} agents
                </div>
                <Button
                  onClick={() => {
                    const executeButton = document.querySelector('button[data-execute="true"]') as HTMLButtonElement;
                    if (executeButton) executeButton.click();
                  }}
                  disabled={agents.length === 0 || !taskInput.trim()}
                  className="min-w-[120px] bg-green-600 hover:bg-green-700"
                >
                  <Play className="mr-2 h-4 w-4" />
                  Execute Task
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        </div>
      </ScrollArea>
    </ModernLayout>
  );
};