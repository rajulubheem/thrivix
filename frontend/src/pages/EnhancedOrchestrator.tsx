import React, { useState } from 'react';
import { getToken } from '../utils/auth';
import { 
  Brain, 
  Users, 
  Zap, 
  Settings, 
  Play, 
  Info,
  ChevronRight,
  ChevronDown,
  Loader2,
  Check,
  AlertCircle,
  Layers,
  GitBranch,
  Target,
  Wrench,
  Clock,
  TrendingUp,
  FileText
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ScrollArea } from '../components/ui/scroll-area';
import { Separator } from '../components/ui/separator';
import { ModernLayout } from '../components/layout/ModernLayout';
import { cn } from '../lib/utils';

interface TaskAnalysis {
  original_task: string;
  identified_domains: string[];
  required_capabilities: string[];
  technical_requirements: string[];
  deliverables: string[];
  constraints: string[];
  priority_aspects: string[];
}

interface AgentInfo {
  name: string;
  role: string;
  primary_goal: string;
  tools: string[];
  expected_outputs: string[];
  priority: number;
}

interface AgentGroup {
  name: string;
  agents: AgentInfo[];
  coordination_strategy: string;
  group_goal: string;
}

interface WorkflowStage {
  stage_number: number;
  name: string;
  agents: string[];
  coordination: string;
  estimated_duration: number;
  dependencies: string[];
  critical_path: boolean;
  can_parallelize: boolean;
}

interface ExecutionPlan {
  task_analysis: TaskAnalysis;
  complexity: string;
  num_groups: number;
  total_agents: number;
  estimated_duration: number;
  workflow_stages: WorkflowStage[];
  tool_allocation: Record<string, string[]>;
  success_metrics: string[];
  real_agents?: any[]; // Add real agents from orchestration
}

const ComplexityBadge: React.FC<{ complexity: string }> = ({ complexity }) => {
  const variants: Record<string, string> = {
    simple: 'bg-green-100 text-green-700',
    moderate: 'bg-yellow-100 text-yellow-700',
    complex: 'bg-orange-100 text-orange-700',
    advanced: 'bg-red-100 text-red-700'
  };
  
  return (
    <Badge className={cn('capitalize', variants[complexity] || variants.simple)}>
      {complexity}
    </Badge>
  );
};

const AgentCard: React.FC<{ agent: AgentInfo; tools: string[] }> = ({ agent, tools }) => {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <Card className="mb-3">
      <CardHeader 
        className="cursor-pointer pb-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{agent.name}</CardTitle>
              <Badge variant="outline" className="text-xs">
                {agent.role}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                Priority: {agent.priority}
              </Badge>
            </div>
            <CardDescription className="mt-1 text-sm">
              {agent.primary_goal}
            </CardDescription>
          </div>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </CardHeader>
      
      {expanded && (
        <CardContent className="pt-0">
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium mb-1">Tools:</p>
              <div className="flex flex-wrap gap-1">
                {tools.map((tool, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    <Wrench className="h-3 w-3 mr-1" />
                    {tool}
                  </Badge>
                ))}
              </div>
            </div>
            
            <div>
              <p className="text-sm font-medium mb-1">Expected Outputs:</p>
              <ul className="text-sm text-muted-foreground list-disc list-inside">
                {agent.expected_outputs.map((output, idx) => (
                  <li key={idx}>{output}</li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

const WorkflowVisualization: React.FC<{ stages: WorkflowStage[] }> = ({ stages }) => {
  return (
    <div className="space-y-4">
      {stages.map((stage, idx) => (
        <div key={idx} className="relative">
          {idx < stages.length - 1 && (
            <div className="absolute left-6 top-12 bottom-0 w-0.5 bg-gray-300" />
          )}
          
          <Card className={cn(
            "relative",
            stage.critical_path && "border-orange-400"
          )}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full border-2",
                    stage.critical_path ? "border-orange-400 bg-orange-50" : "border-gray-300 bg-white"
                  )}>
                    <span className="font-bold">{stage.stage_number}</span>
                  </div>
                  <div>
                    <CardTitle className="text-base">{stage.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {stage.agents.length} agents • {Math.round(stage.estimated_duration / 60)}min
                    </CardDescription>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {stage.can_parallelize && (
                    <Badge variant="outline" className="text-xs">
                      <GitBranch className="h-3 w-3 mr-1" />
                      Parallel
                    </Badge>
                  )}
                  {stage.critical_path && (
                    <Badge className="bg-orange-100 text-orange-700 text-xs">
                      Critical Path
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {stage.agents.map((agent, agentIdx) => (
                  <Badge key={agentIdx} variant="secondary">
                    {agent}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
};

export const EnhancedOrchestrator: React.FC = () => {
  const [task, setTask] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [plan, setPlan] = useState<ExecutionPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  
  const analyzeTask = async () => {
    if (!task.trim()) return;
    
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const response = await fetch('http://localhost:8000/api/v1/orchestrator-enhanced/analyze', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ task })
      });
      
      if (!response.ok) throw new Error('Failed to analyze task');
      
      const data = await response.json();
      console.log('Task analysis:', data);
      
      // Auto-proceed to planning after analysis
      createPlan();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  const createPlan = async () => {
    if (!task.trim()) return;
    
    setIsPlanning(true);
    setError(null);
    setPlan(null);
    
    try {
      // First get the enhanced plan
      const planResponse = await fetch('http://localhost:8000/api/v1/orchestrator-enhanced/plan', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ 
          task,
          parallel_execution: true,
          max_agents: 20
        })
      });
      
      if (!planResponse.ok) throw new Error('Failed to create plan');
      
      const planData = await planResponse.json();
      
      // Then get the real agents from orchestrate endpoint
      const orchestrateResponse = await fetch('http://localhost:8000/api/v1/orchestrator-enhanced/orchestrate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ 
          task,
          parallel_execution: true
        })
      });
      
      if (orchestrateResponse.ok) {
        const orchestrationResult = await orchestrateResponse.json();
        planData.real_agents = orchestrationResult.agents;
        console.log('Got real agents:', orchestrationResult.agents);
      }
      
      setPlan(planData);
      setActiveTab('overview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Planning failed');
    } finally {
      setIsPlanning(false);
    }
  };
  
  const executePlan = async () => {
    if (!plan || !task) return;
    
    try {
      let agents;
      
      // If we already have real agents, use them
      if (plan.real_agents && plan.real_agents.length > 0) {
        agents = plan.real_agents;
        console.log('Using existing real agents:', agents);
      } else {
        // Otherwise fetch them
        const response = await fetch('http://localhost:8000/api/v1/orchestrator-enhanced/orchestrate', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token') || 'test-token'}`
          },
          body: JSON.stringify({ 
            task,
            parallel_execution: true
          })
        });
        
        if (!response.ok) throw new Error('Failed to orchestrate task');
        
        const orchestrationResult = await response.json();
        agents = orchestrationResult.agents;
        console.log('Fetched new real agents:', agents);
      }
      
      // Store the task and agents in sessionStorage for the swarm to pick up
      sessionStorage.setItem('orchestratorTask', task);
      sessionStorage.setItem('orchestratorAgents', JSON.stringify(agents));
      sessionStorage.setItem('orchestratorAutoStart', 'true');
      
      // Navigate directly to swarm chat to execute
      window.location.href = '/swarm';
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Orchestration failed');
    }
  };
  
  return (
    <ModernLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8 text-purple-600" />
            Enhanced Orchestrator
          </h1>
          <p className="text-muted-foreground mt-2">
            Create sophisticated agent swarms with comprehensive planning and intelligent tool allocation
          </p>
        </div>
        
        {/* Task Input */}
        <Card>
          <CardHeader>
            <CardTitle>Task Description</CardTitle>
            <CardDescription>
              Describe what you want to accomplish. The orchestrator will create a detailed plan with agent groups.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Example: Create a full-stack todo application with React frontend, Node.js backend, PostgreSQL database, real-time updates, user authentication, and comprehensive testing..."
              value={task}
              onChange={(e) => setTask(e.target.value)}
              className="min-h-[120px]"
            />
            
            <div className="flex gap-3">
              <Button
                onClick={analyzeTask}
                disabled={!task.trim() || isAnalyzing || isPlanning}
                className="flex items-center gap-2"
              >
                {isAnalyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Brain className="h-4 w-4" />
                )}
                Analyze & Plan
              </Button>
              
              {plan && (
                <Button
                  onClick={executePlan}
                  variant="default"
                  className="flex items-center gap-2"
                >
                  <Play className="h-4 w-4" />
                  Execute Plan
                </Button>
              )}
            </div>
            
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
        
        {/* Planning Progress */}
        {(isAnalyzing || isPlanning) && (
          <Card>
            <CardContent className="py-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {isAnalyzing ? 'Analyzing task requirements...' : 'Creating execution plan...'}
                  </span>
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
                <Progress value={isAnalyzing ? 33 : 66} />
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Execution Plan */}
        {plan && (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>Execution Plan</CardTitle>
                  <CardDescription className="mt-2">
                    {plan.num_groups} agent groups • {plan.total_agents} total agents • ~{Math.round(plan.estimated_duration / 60)} minutes
                  </CardDescription>
                </div>
                <ComplexityBadge complexity={plan.complexity} />
              </div>
            </CardHeader>
            
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="agents">Agents</TabsTrigger>
                  <TabsTrigger value="workflow">Workflow</TabsTrigger>
                  <TabsTrigger value="tools">Tools</TabsTrigger>
                  <TabsTrigger value="metrics">Metrics</TabsTrigger>
                </TabsList>
                
                <TabsContent value="overview" className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Task Analysis */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Task Analysis</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <p className="text-sm font-medium mb-1">Identified Domains:</p>
                          <div className="flex flex-wrap gap-1">
                            {plan.task_analysis.identified_domains.map((domain, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {domain}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        
                        <div>
                          <p className="text-sm font-medium mb-1">Required Capabilities:</p>
                          <div className="flex flex-wrap gap-1">
                            {plan.task_analysis.required_capabilities.map((cap, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {cap}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        
                        <div>
                          <p className="text-sm font-medium mb-1">Deliverables:</p>
                          <ul className="text-sm text-muted-foreground list-disc list-inside">
                            {plan.task_analysis.deliverables.map((del, idx) => (
                              <li key={idx}>{del}</li>
                            ))}
                          </ul>
                        </div>
                      </CardContent>
                    </Card>
                    
                    {/* Plan Statistics */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Plan Statistics</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Complexity:</span>
                            <ComplexityBadge complexity={plan.complexity} />
                          </div>
                          <Separator />
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Agent Groups:</span>
                            <span className="font-medium">{plan.num_groups}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Total Agents:</span>
                            <span className="font-medium">{plan.total_agents}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Estimated Time:</span>
                            <span className="font-medium">{Math.round(plan.estimated_duration / 60)} min</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Parallel Stages:</span>
                            <span className="font-medium">
                              {plan.workflow_stages.filter(s => s.can_parallelize).length}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  {/* Success Metrics */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Success Metrics
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {plan.success_metrics.map((metric, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <Check className="h-4 w-4 text-green-600 mt-0.5" />
                            <span className="text-sm">{metric}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="agents" className="mt-4">
                  <Alert className="mb-4">
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      {plan.real_agents ? 
                        `${plan.real_agents.length} real agents generated with actual tools and capabilities.` :
                        'Agents are organized into specialized groups that work together to complete your task.'
                      }
                    </AlertDescription>
                  </Alert>
                  
                  <ScrollArea className="h-[600px] pr-4">
                    <div className="space-y-6">
                      {plan.real_agents && plan.real_agents.length > 0 ? (
                        <div>
                          <h3 className="font-semibold mb-3">Real Agents (Executable)</h3>
                          {plan.real_agents.map((agent, idx) => (
                            <AgentCard
                              key={idx}
                              agent={{
                                name: agent.name,
                                role: agent.role || 'specialist',
                                primary_goal: agent.description || agent.system_prompt?.substring(0, 100),
                                tools: agent.tools || [],
                                expected_outputs: [],
                                priority: agent.priority || idx + 1
                              }}
                              tools={agent.tools || []}
                            />
                          ))}
                        </div>
                      ) : (
                        <div>
                          <h3 className="font-semibold mb-3">Planned Agent Groups</h3>
                          {plan.workflow_stages.map((stage, idx) => (
                            <div key={idx} className="mb-6">
                              <h4 className="text-sm font-medium mb-2">{stage.name}</h4>
                              {stage.agents.map((agentName, agentIdx) => (
                                <AgentCard
                                  key={agentIdx}
                                  agent={{
                                    name: agentName,
                                    role: 'specialist',
                                    primary_goal: `Part of ${stage.name}`,
                                    tools: plan.tool_allocation[agentName] || [],
                                    expected_outputs: [],
                                    priority: agentIdx + 1
                                  }}
                                  tools={plan.tool_allocation[agentName] || []}
                                />
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
                
                <TabsContent value="workflow" className="mt-4">
                  <Alert className="mb-4">
                    <GitBranch className="h-4 w-4" />
                    <AlertDescription>
                      The workflow shows how agent groups execute in sequence or parallel.
                    </AlertDescription>
                  </Alert>
                  
                  <ScrollArea className="h-[600px] pr-4">
                    <WorkflowVisualization stages={plan.workflow_stages} />
                  </ScrollArea>
                </TabsContent>
                
                <TabsContent value="tools" className="mt-4">
                  <Alert className="mb-4">
                    <Wrench className="h-4 w-4" />
                    <AlertDescription>
                      Tools are intelligently allocated to agents based on their roles and requirements.
                    </AlertDescription>
                  </Alert>
                  
                  <div className="space-y-4">
                    {Object.entries(plan.tool_allocation).map(([agent, tools]) => (
                      <Card key={agent}>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">{agent}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {tools.map((tool, idx) => (
                              <Badge key={idx} variant="secondary">
                                <Wrench className="h-3 w-3 mr-1" />
                                {tool}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
                
                <TabsContent value="metrics" className="mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          Performance Metrics
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm">Response Time Target:</span>
                            <span className="text-sm font-medium">&lt; 200ms</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm">Concurrent Users:</span>
                            <span className="text-sm font-medium">1000+</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm">Memory Optimization:</span>
                            <span className="text-sm font-medium">Required</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Quality Metrics
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm">Test Coverage:</span>
                            <span className="text-sm font-medium">&gt; 80%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm">Documentation:</span>
                            <span className="text-sm font-medium">Complete</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm">Code Quality:</span>
                            <span className="text-sm font-medium">Standards Met</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    </ModernLayout>
  );
};