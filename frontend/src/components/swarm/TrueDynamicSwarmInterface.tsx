import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Users,
  Sparkles,
  Activity,
  CheckCircle,
  AlertCircle,
  Clock,
  BarChart3,
  Settings,
  Play,
  Square,
  Share2,
  Database,
  Network,
  Zap
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { cn } from '../../lib/utils';
import ReactMarkdown from 'react-markdown';

interface SessionAgent {
  name: string;
  role: string;
  status: 'registered' | 'spawned' | 'executing' | 'completed' | 'failed';
  priority: string;
  is_main_agent: boolean;
  registered_at: string;
  session_id: string;
}

interface SwarmSession {
  session_id: string;
  project_context: any;
  agent_registry: Record<string, SessionAgent>;
  communication_log: Array<{
    timestamp: string;
    from: string;
    to: string;
    message: string;
    type: string;
  }>;
  shared_results: Record<string, any>;
  spawn_queue: Array<any>;
  main_agents: string[];
  sub_agents: string[];
  coordination_stats: {
    total_agents: number;
    active_agents: number;
    completed_agents: number;
    failed_agents: number;
  };
}

interface SwarmEvent {
  id: string;
  type: string;
  data: any;
  source: string;
  timestamp: string;
  session_enhanced?: boolean;
  coordination_type?: string;
  session_id?: string;
}

export const TrueDynamicSwarmInterface: React.FC = () => {
  const [task, setTask] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [events, setEvents] = useState<SwarmEvent[]>([]);
  const [sessionDetails, setSessionDetails] = useState<SwarmSession | null>(null);
  const [messages, setMessages] = useState<Array<{ agent: string; content: string; timestamp: Date }>>([]);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Setup event stream
  useEffect(() => {
    if (isExecuting && !eventSourceRef.current) {
      console.log('🔌 Setting up EventSource connection to /api/v1/true-dynamic-swarm/events');
      const eventSource = new EventSource('/api/v1/true-dynamic-swarm/events');
      
      eventSource.onopen = () => {
        console.log('🟢 EventSource connection opened');
      };
      
      eventSource.onmessage = (event) => {
        console.log('📥 Raw EventSource message:', event.data);
        try {
          const data = JSON.parse(event.data);
          handleSwarmEvent(data);
        } catch (error) {
          console.error('Failed to parse event:', error, 'Raw data:', event.data);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('❌ EventSource error:', error, 'ReadyState:', eventSource.readyState);
      };
      
      eventSourceRef.current = eventSource;
    }
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [isExecuting]);

  const handleSwarmEvent = (event: SwarmEvent) => {
    console.log('🔄 Frontend received event:', event.type, event.data);
    setEvents(prev => [...prev.slice(-49), event]); // Keep last 50 events
    
    // Handle different event types for True Dynamic Swarm
    switch (event.type) {
      case 'connected':
        console.log('🔗 Connected to True Dynamic Swarm');
        break;
        
      case 'agent_start':
        if (event.data?.agent) {
          setMessages(prev => [...prev, {
            agent: event.data.agent,
            content: `🚀 Started: ${event.data.role || 'Unknown role'}`,
            timestamp: new Date()
          }]);
        }
        break;
        
      case 'agent.spawned':
        if (event.data?.agent_name) {
          setMessages(prev => [...prev, {
            agent: event.data.agent_name,
            content: `✨ Spawned by ${event.data.requesting_agent}: ${event.data.role}`,
            timestamp: new Date()
          }]);
          
          // Refresh session details to show new agent
          if (executionId) {
            fetchSessionDetails(executionId);
          }
        }
        break;
        
      case 'agent.started':
        if (event.data?.agent) {
          setMessages(prev => [...prev, {
            agent: event.data.agent,
            content: `🚀 Starting ${event.data.role || 'agent'}: ${event.data.task || 'Processing task...'}`,
            timestamp: new Date()
          }]);
        }
        break;
        
      case 'agent.completed':
        console.log('✅ Processing agent.completed event:', event.data);
        if (event.data?.agent_name) {
          const message = {
            agent: event.data.agent_name,
            content: event.data.response || `✅ Completed task: ${event.data.result || 'Task finished'}`,
            timestamp: new Date()
          };
          console.log('📝 Adding message to UI:', message);
          setMessages(prev => [...prev, message]);
        } else {
          console.warn('⚠️ agent.completed event missing agent_name:', event.data);
        }
        break;
        
      case 'ai.decision':
        if (event.data?.content && event.data.content.includes('Agents Needed')) {
          setMessages(prev => [...prev, {
            agent: event.source || 'AI Decision',
            content: `🧠 AI Decision: Planning to spawn new specialists`,
            timestamp: new Date()
          }]);
        }
        break;
        
      case 'swarm.stopped':
        setIsExecuting(false);
        setMessages(prev => [...prev, {
          agent: 'System',
          content: '🛑 Swarm execution stopped',
          timestamp: new Date()
        }]);
        break;
    }
  };

  const executeSwarm = async () => {
    if (!task.trim()) return;
    
    setIsExecuting(true);
    setEvents([]);
    setMessages([]);
    setSessionDetails(null);
    
    try {
      const response = await fetch('/api/v1/true-dynamic-swarm/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task,
          execution_mode: 'true_dynamic'
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setExecutionId(data.execution_id);
      
      setMessages([{
        agent: 'System',
        content: `🎯 True Dynamic Swarm started with session: ${data.execution_id}`,
        timestamp: new Date()
      }]);
      
      // Start fetching session details periodically
      let pollCount = 0;
      const maxPolls = 30; // Max 30 seconds
      const interval = setInterval(async () => {
        pollCount++;
        
        try {
          const response = await fetch(`/api/v1/true-dynamic-swarm/session/${data.execution_id}`);
          if (response.ok) {
            const details = await response.json();
            
            // Check if task is completed
            if (details.project_context?.status === 'completed' || pollCount >= maxPolls) {
              console.log('🏁 Task completed or max polls reached, stopping interval');
              clearInterval(interval);
              setIsExecuting(false);
            }
            
            // Process the session details
            await fetchSessionDetails(data.execution_id);
          }
        } catch (error) {
          console.error('Poll error:', error);
          if (pollCount >= maxPolls) {
            clearInterval(interval);
            setIsExecuting(false);
          }
        }
      }, 1000); // Poll every second for updates
      
    } catch (error) {
      console.error('Failed to execute swarm:', error);
      setIsExecuting(false);
      setMessages([{
        agent: 'System',
        content: `❌ Failed to start swarm: ${error}`,
        timestamp: new Date()
      }]);
    }
  };

  const fetchSessionDetails = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/v1/true-dynamic-swarm/session/${sessionId}`);
      if (response.ok) {
        const details = await response.json();
        setSessionDetails(details);
        
        // Check if we have new communication logs to display
        if (details.communication_log && details.communication_log.length > 0) {
          console.log('📋 Processing communication log:', details.communication_log);
          
          // Extract agent responses from communication log
          details.communication_log.forEach((log: any) => {
            if (log.type === 'task_completion' && log.from !== 'user') {
              // Check if we already have this message by comparing both agent and timestamp
              setMessages(prev => {
                const existingMessage = prev.find(m => 
                  m.agent === log.from && 
                  m.content === log.message &&
                  Math.abs(m.timestamp.getTime() - new Date(log.timestamp).getTime()) < 1000 // Within 1 second
                );
                
                if (!existingMessage) {
                  console.log('📝 Adding unique communication log message to UI:', {
                    agent: log.from,
                    content: log.message,
                    timestamp: new Date(log.timestamp)
                  });
                  
                  return [...prev, {
                    agent: log.from,
                    content: log.message,
                    timestamp: new Date(log.timestamp)
                  }];
                }
                
                return prev; // No change if duplicate
              });
            }
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch session details:', error);
    }
  };

  const stopSwarm = async () => {
    if (!executionId) return;
    
    try {
      await fetch(`/api/v1/true-dynamic-swarm/stop/${executionId}`, {
        method: 'POST'
      });
    } catch (error) {
      console.error('Failed to stop swarm:', error);
    }
  };

  const manualSpawnAgent = async () => {
    if (!executionId) return;
    
    const role = prompt('Enter agent role:');
    if (!role) return;
    
    try {
      await fetch('/api/v1/true-dynamic-swarm/spawn-agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: executionId,
          role,
          priority: 'high',
          requesting_agent: 'user'
        }),
      });
      
      setTimeout(() => fetchSessionDetails(executionId), 1000);
    } catch (error) {
      console.error('Failed to spawn agent:', error);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2">
          <Network className="h-8 w-8 text-blue-500 dark:text-blue-400" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">True Dynamic Swarm</h1>
          <Badge variant="outline" className="ml-2 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600">Session-Based</Badge>
        </div>
        <p className="text-muted-foreground max-w-2xl mx-auto text-gray-600 dark:text-gray-300">
          Advanced multi-agent system with session-based coordination, automatic sub-agent spawning, 
          and shared memory across the entire swarm ecosystem.
        </p>
        
        <div className="flex flex-wrap justify-center gap-2">
          <Badge variant="secondary" className="flex items-center gap-1">
            <Share2 className="h-3 w-3" />
            Shared Sessions
          </Badge>
          <Badge variant="secondary" className="flex items-center gap-1">
            <Bot className="h-3 w-3" />
            Auto Sub-Agent Spawning
          </Badge>
          <Badge variant="secondary" className="flex items-center gap-1">
            <Database className="h-3 w-3" />
            Cross-Agent Memory
          </Badge>
          <Badge variant="secondary" className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            AI-Driven Coordination
          </Badge>
        </div>
      </div>

      {/* Task Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Swarm Task Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Describe your complex task that requires multiple AI specialists working together with shared context..."
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={3}
            disabled={isExecuting}
          />
          
          <div className="flex gap-2">
            <Button 
              onClick={executeSwarm} 
              disabled={isExecuting || !task.trim()}
              className="flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              {isExecuting ? 'Swarm Running...' : 'Launch True Dynamic Swarm'}
            </Button>
            
            {isExecuting && (
              <Button 
                variant="destructive"
                onClick={stopSwarm}
                className="flex items-center gap-2"
              >
                <Square className="h-4 w-4" />
                Stop Swarm
              </Button>
            )}
            
            {executionId && (
              <Button 
                variant="outline"
                onClick={manualSpawnAgent}
                className="flex items-center gap-2"
              >
                <Bot className="h-4 w-4" />
                Spawn Agent
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Content Grid */}
      {isExecuting && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Session Overview */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                <Database className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                Session Overview
                {executionId && (
                  <Badge variant="outline" className="ml-auto text-xs text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600">
                    {executionId.slice(0, 8)}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sessionDetails ? (
                <div className="space-y-4">
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {sessionDetails.main_agents.length}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-300">Main Agents</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {sessionDetails.sub_agents.length}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-300">Sub Agents</div>
                    </div>
                  </div>
                  
                  {/* Agent Registry */}
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-gray-900 dark:text-white">
                      <Users className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                      Active Agents
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(sessionDetails.agent_registry).map(([name, agent]) => (
                        <div key={name} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "h-2 w-2 rounded-full",
                              agent.status === 'completed' ? 'bg-green-500 dark:bg-green-400' :
                              agent.status === 'executing' ? 'bg-blue-500 dark:bg-blue-400' :
                              agent.status === 'failed' ? 'bg-red-500 dark:bg-red-400' :
                              'bg-gray-400 dark:bg-gray-500'
                            )} />
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{name}</span>
                            {agent.is_main_agent && (
                              <Badge variant="outline" className="text-xs text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800">Main</Badge>
                            )}
                          </div>
                          <Badge variant={
                            agent.priority === 'high' ? 'default' :
                            agent.priority === 'medium' ? 'secondary' : 'outline'
                          } className="text-xs">
                            {agent.priority}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Spawn Queue */}
                  {sessionDetails.spawn_queue.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2 text-gray-900 dark:text-white">
                        <Clock className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                        Spawn Queue ({sessionDetails.spawn_queue.length})
                      </h4>
                      <div className="space-y-1">
                        {sessionDetails.spawn_queue.slice(0, 3).map((spawn, idx) => (
                          <div key={idx} className="text-sm p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800 text-gray-900 dark:text-gray-100">
                            {spawn.spec.role} - {spawn.spec.priority} priority
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <Activity className="h-8 w-8 mx-auto mb-2 animate-spin text-gray-400 dark:text-gray-500" />
                  <span className="text-gray-600 dark:text-gray-300">Initializing session...</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Real-time Messages */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                <Activity className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                Swarm Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-96 overflow-y-auto space-y-3 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                {messages.map((message, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                        {message.agent}
                      </Badge>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {message.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
                {messages.length === 0 && (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <span className="text-sm">No activity yet. Start a swarm to see real-time updates.</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Architecture Info */}
      {!isExecuting && (
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
              <Settings className="h-5 w-5 text-gray-600 dark:text-gray-300" />
              True Dynamic Swarm Architecture
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-3 text-gray-900 dark:text-white">Key Features</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />
                    Session-based agent coordination
                  </li>
                  <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />
                    Automatic sub-agent spawning from AI decisions
                  </li>
                  <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />
                    Shared memory across all agents
                  </li>
                  <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />
                    Hierarchical main/sub-agent management
                  </li>
                  <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />
                    Cross-agent communication logging
                  </li>
                  <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />
                    Context-aware agent execution
                  </li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-semibold mb-3 text-gray-900 dark:text-white">How It Works</h4>
                <ol className="space-y-2 text-sm">
                  <li className="flex gap-2 text-gray-700 dark:text-gray-300">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 text-xs flex items-center justify-center">1</span>
                    <span>Main analyzer agent starts with shared session context</span>
                  </li>
                  <li className="flex gap-2 text-gray-700 dark:text-gray-300">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 text-xs flex items-center justify-center">2</span>
                    <span>AI decisions automatically queue specialist agents</span>
                  </li>
                  <li className="flex gap-2 text-gray-700 dark:text-gray-300">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 text-xs flex items-center justify-center">3</span>
                    <span>Sub-agents spawn with full project context</span>
                  </li>
                  <li className="flex gap-2 text-gray-700 dark:text-gray-300">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 text-xs flex items-center justify-center">4</span>
                    <span>All agents share results through session memory</span>
                  </li>
                  <li className="flex gap-2 text-gray-700 dark:text-gray-300">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs flex items-center justify-center">5</span>
                    <span>Coordination continues until task completion</span>
                  </li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};