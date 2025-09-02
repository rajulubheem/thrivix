import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  AlertTriangle, 
  Settings, 
  Activity, 
  Users, 
  Clock,
  Target,
  TrendingUp,
  BarChart3,
  Shield,
  RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { cn } from '../../lib/utils';
import ReactMarkdown from 'react-markdown';
import AgentMonitor from './AgentMonitor';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface AutonomousSwarmConfig {
  max_concurrent_agents: number;
  max_total_agents: number;
  max_execution_time: number;
  max_iterations: number;
  quality_threshold: number;
  improvement_threshold: number;
}

interface ExecutionStatus {
  execution_id: string;
  status: string;
  agents_spawned: number;
  active_agents: number;
  completed_agents: number;
  user_satisfaction: number;
  is_paused: boolean;
  stop_requested: boolean;
  runtime: number;
}

interface SwarmMessage {
  id: string;
  type: string;
  agent: string;
  content: string;
  timestamp: string;
}

const AutonomousSwarmInterface: React.FC = () => {
  const [task, setTask] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus | null>(null);
  const [messages, setMessages] = useState<SwarmMessage[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  const [emergencyStop, setEmergencyStop] = useState(false);
  
  const [config, setConfig] = useState<AutonomousSwarmConfig>({
    max_concurrent_agents: 20,
    max_total_agents: 100,
    max_execution_time: 1800, // 30 minutes
    max_iterations: 50,
    quality_threshold: 0.85,
    improvement_threshold: 0.05
  });

  const [agents, setAgents] = useState<Map<string, any>>(new Map());
  const [events, setEvents] = useState<any[]>([]);

  // Poll for execution status
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    
    if (isExecuting && executionId) {
      pollInterval = setInterval(async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/v1/autonomous-swarm/executions/${executionId}/status`);
          if (response.ok) {
            const status = await response.json();
            setExecutionStatus(status);
            
            // Stop polling if execution is done
            if (status.status === 'completed' || status.status === 'failed' || status.status === 'stopped') {
              setIsExecuting(false);
            }
          }
        } catch (error) {
          console.error('Error polling execution status:', error);
        }
      }, 2000);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isExecuting, executionId]);

  const executeAutonomousSwarm = async () => {
    if (!task.trim()) return;

    try {
      setIsExecuting(true);
      setMessages([]);
      setExecutionStatus(null);
      setAgents(new Map());
      setEvents([]);

      const response = await fetch(`${API_BASE_URL}/api/v1/autonomous-swarm/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: task
        })
      });

      const result = await response.json();
      
      if (response.ok) {
        setExecutionId(result.execution_id);
        addMessage('system', 'Autonomous swarm execution started', result.execution_id);
      } else {
        throw new Error(result.detail || 'Execution failed');
      }
    } catch (error) {
      console.error('Error starting autonomous swarm:', error);
      setIsExecuting(false);
      addMessage('error', `Failed to start: ${error}`, 'system');
    }
  };

  const pauseExecution = async () => {
    if (!executionId) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/autonomous-swarm/executions/${executionId}/pause`, {
        method: 'POST'
      });
      
      if (response.ok) {
        addMessage('system', 'Execution paused', 'system');
      }
    } catch (error) {
      console.error('Error pausing execution:', error);
    }
  };

  const resumeExecution = async () => {
    if (!executionId) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/autonomous-swarm/executions/${executionId}/resume`, {
        method: 'POST'
      });
      
      if (response.ok) {
        addMessage('system', 'Execution resumed', 'system');
      }
    } catch (error) {
      console.error('Error resuming execution:', error);
    }
  };

  const stopExecution = async () => {
    if (!executionId) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/autonomous-swarm/executions/${executionId}/stop`, {
        method: 'POST'
      });
      
      if (response.ok) {
        addMessage('system', 'Stop requested - agents will complete current work', 'system');
      }
    } catch (error) {
      console.error('Error stopping execution:', error);
    }
  };

  const emergencyStopAll = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/autonomous-swarm/emergency-stop`, {
        method: 'POST'
      });
      
      if (response.ok) {
        setEmergencyStop(true);
        setIsExecuting(false);
        addMessage('emergency', 'EMERGENCY STOP ACTIVATED - All swarms halted', 'system');
      }
    } catch (error) {
      console.error('Error activating emergency stop:', error);
    }
  };

  const resetEmergencyStop = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/autonomous-swarm/reset-emergency`, {
        method: 'POST'
      });
      
      if (response.ok) {
        setEmergencyStop(false);
        addMessage('system', 'Emergency stop reset - system ready', 'system');
      }
    } catch (error) {
      console.error('Error resetting emergency stop:', error);
    }
  };

  const addMessage = (type: string, content: string, agent: string) => {
    const message: SwarmMessage = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      agent,
      content,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, message]);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20">
      {/* Header */}
      <div className="border-b bg-white dark:bg-gray-900 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-purple-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Autonomous Agent Swarm
            </h1>
            <Badge variant="outline" className="bg-purple-50 border-purple-200 text-purple-700">
              Dynamic • Unlimited • AI-Driven
            </Badge>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConfig(!showConfig)}
              className="flex items-center gap-2"
            >
              <Settings className="h-4 w-4" />
              Configure
            </Button>
            
            {emergencyStop && (
              <Button
                variant="destructive"
                size="sm"
                onClick={resetEmergencyStop}
                className="flex items-center gap-2"
              >
                <Shield className="h-4 w-4" />
                Reset Emergency
              </Button>
            )}
          </div>
        </div>

        {/* Status Bar */}
        {executionStatus && (
          <div className="mt-4 flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              <span>Active: {executionStatus.active_agents}</span>
              <span className="text-gray-400">•</span>
              <span>Total: {executionStatus.agents_spawned}</span>
            </div>
            
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-green-500" />
              <span>Runtime: {formatTime(executionStatus.runtime)}</span>
            </div>
            
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-purple-500" />
              <span>Satisfaction: {(executionStatus.user_satisfaction * 100).toFixed(1)}%</span>
            </div>
            
            <Badge 
              variant={executionStatus.status === 'running' ? 'default' : 'secondary'}
              className="capitalize"
            >
              {executionStatus.status}
            </Badge>
            
            {executionStatus.is_paused && (
              <Badge variant="outline" className="text-yellow-600">
                Paused
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Configuration Panel */}
          {showConfig && (
            <Card className="m-4 mb-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Autonomous Swarm Configuration</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Max Concurrent Agents</label>
                  <Input
                    type="number"
                    value={config.max_concurrent_agents}
                    onChange={(e) => setConfig({...config, max_concurrent_agents: parseInt(e.target.value)})}
                    min="1"
                    max="50"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Max Total Agents</label>
                  <Input
                    type="number"
                    value={config.max_total_agents}
                    onChange={(e) => setConfig({...config, max_total_agents: parseInt(e.target.value)})}
                    min="1"
                    max="500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Max Time (seconds)</label>
                  <Input
                    type="number"
                    value={config.max_execution_time}
                    onChange={(e) => setConfig({...config, max_execution_time: parseInt(e.target.value)})}
                    min="60"
                    max="7200"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Max Iterations</label>
                  <Input
                    type="number"
                    value={config.max_iterations}
                    onChange={(e) => setConfig({...config, max_iterations: parseInt(e.target.value)})}
                    min="5"
                    max="200"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Quality Threshold</label>
                  <Input
                    type="number"
                    step="0.05"
                    value={config.quality_threshold}
                    onChange={(e) => setConfig({...config, quality_threshold: parseFloat(e.target.value)})}
                    min="0.1"
                    max="1.0"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Improvement Threshold</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={config.improvement_threshold}
                    onChange={(e) => setConfig({...config, improvement_threshold: parseFloat(e.target.value)})}
                    min="0.01"
                    max="0.5"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Task Input */}
          <Card className="m-4 mb-0">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-purple-600" />
                Autonomous Task Execution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Textarea
                  placeholder="Describe your task... The autonomous swarm will analyze it, spawn specialist agents as needed, and continue until the task reaches your satisfaction threshold."
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  rows={3}
                  disabled={isExecuting}
                />
                
                <div className="flex items-center gap-3">
                  <Button
                    onClick={executeAutonomousSwarm}
                    disabled={isExecuting || !task.trim() || emergencyStop}
                    className="bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2"
                  >
                    <Play className="h-4 w-4" />
                    Start Autonomous Swarm
                  </Button>
                  
                  {isExecuting && (
                    <>
                      {executionStatus?.is_paused ? (
                        <Button
                          onClick={resumeExecution}
                          variant="outline"
                          className="flex items-center gap-2"
                        >
                          <Play className="h-4 w-4" />
                          Resume
                        </Button>
                      ) : (
                        <Button
                          onClick={pauseExecution}
                          variant="outline"
                          className="flex items-center gap-2"
                        >
                          <Pause className="h-4 w-4" />
                          Pause
                        </Button>
                      )}
                      
                      <Button
                        onClick={stopExecution}
                        variant="outline"
                        className="flex items-center gap-2"
                      >
                        <Square className="h-4 w-4" />
                        Stop
                      </Button>
                    </>
                  )}
                  
                  <Button
                    onClick={emergencyStopAll}
                    variant="destructive"
                    className="flex items-center gap-2"
                    disabled={emergencyStop}
                  >
                    <AlertTriangle className="h-4 w-4" />
                    Emergency Stop
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Emergency Stop Alert */}
          {emergencyStop && (
            <Alert className="m-4 mb-0 border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertTitle className="text-red-800">Emergency Stop Active</AlertTitle>
              <AlertDescription className="text-red-700">
                All autonomous swarm executions have been halted. Click "Reset Emergency" to allow new executions.
              </AlertDescription>
            </Alert>
          )}

          {/* Messages */}
          <Card className="m-4 flex-1 flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-blue-600" />
                Execution Log
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              <div className="space-y-3">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <Activity className="h-8 w-8 mx-auto mb-3 opacity-50" />
                    <p>Autonomous swarm messages will appear here</p>
                    <p className="text-sm mt-1">The system will spawn agents dynamically based on AI decisions</p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "p-3 rounded-lg border",
                        message.type === 'system' && "bg-blue-50 border-blue-200",
                        message.type === 'error' && "bg-red-50 border-red-200",
                        message.type === 'emergency' && "bg-red-100 border-red-300",
                        message.type === 'agent' && "bg-purple-50 border-purple-200"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-xs">
                          {message.agent}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {new Date(message.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-sm">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Agent Monitor */}
        <div className="w-96 border-l bg-white dark:bg-gray-900">
          <AgentMonitor
            agents={agents}
            events={events}
            isExecuting={isExecuting}
            executionId={executionId}
          />
        </div>
      </div>
    </div>
  );
};

export default AutonomousSwarmInterface;