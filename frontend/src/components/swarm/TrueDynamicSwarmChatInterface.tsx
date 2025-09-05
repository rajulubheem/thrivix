import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot,
  Send,
  Activity,
  Clock,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  Info,
  Square
} from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import ReactMarkdown from 'react-markdown';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  agent?: string;
  thinking?: string;
}

interface ActivityEvent {
  id: string;
  type: 'system' | 'agent_start' | 'agent_complete' | 'error';
  message: string;
  timestamp: Date;
  details?: any;
}

interface SwarmState {
  isExecuting: boolean;
  executionId: string | null;
  sessionId: string | null;
  activeAgents: number;
  completedAgents: number;
}

export const TrueDynamicSwarmChatInterface: React.FC = () => {
  // EventSource-based streaming interface
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [swarmState, setSwarmState] = useState<SwarmState>({
    isExecuting: false,
    executionId: null,
    sessionId: null,
    activeAgents: 0,
    completedAgents: 0
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activityEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activityEvents]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  // Setup streaming connection immediately when component mounts
  useEffect(() => {
    console.log('🚀 Component mounted, setting up streaming connection...');
    setupStreamConnection();
    return () => {
      if (eventSourceRef.current) {
        console.log('🔌 Closing EventSource on unmount');
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Add an activity event
  const addActivityEvent = useCallback((type: ActivityEvent['type'], message: string, details?: any) => {
    setActivityEvents(prev => [...prev, {
      id: Date.now().toString(),
      type,
      message,
      timestamp: new Date(),
      details
    }]);
  }, []);

  // Add an agent message
  const addAgentMessage = useCallback((agent: string, content: string, thinking?: string) => {
    console.log('💬💬💬 ADD_AGENT_MESSAGE CALLED!');
    console.log('💬 Agent:', agent);
    console.log('💬 Content:', content);
    console.log('💬 Current messages before add:', messages.length);
    
    const newMessage = {
      id: Date.now().toString(),
      role: 'assistant' as const,
      content,
      timestamp: new Date(),
      agent,
      thinking
    };
    
    console.log('💬 New message object:', newMessage);
    
    setMessages(prev => {
      console.log('💬 Previous messages:', prev.length);
      const updated = [...prev, newMessage];
      console.log('💬 Updated messages:', updated.length);
      console.log('💬 All messages:', updated);
      return updated;
    });
  }, [messages]);

  // Process event data from streaming
  const processEventData = useCallback((data: any) => {
    console.log('🔥🔥🔥 PROCESSING EVENT DATA:', data);
    console.log('📥 Event type:', data.type);
    console.log('📥 Current messages count:', messages.length);
    console.log('📥 Current swarm state:', swarmState);
    console.log('📥 Timestamp:', new Date().toISOString());
    
    switch (data.type) {
      case 'connected':
        console.log('🔥 CONNECTED event received - streaming is working!');
        break;
        
      case 'agent.started':
        console.log('🚀 Processing agent.started event:', data);
        if (data.data?.agent) {
          addActivityEvent('agent_start', `Agent "${data.data.agent}" started working`, data.data);
          setSwarmState(prev => ({ ...prev, activeAgents: prev.activeAgents + 1 }));
        }
        break;
        
      case 'agent.completed':
        console.log('🔥🔥🔥 AGENT COMPLETED EVENT RECEIVED!!!');
        console.log('✅ Processing agent.completed event:', data);
        console.log('✅ Agent name:', data.data?.agent);
        console.log('✅ Agent output:', data.data?.output);
        console.log('✅ Execution ID:', data.data?.execution_id);
        if (data.data?.agent && data.data?.output) {
          console.log('🔥 CALLING addAgentMessage with:', data.data.agent, data.data.output);
          addAgentMessage(data.data.agent, data.data.output);
          console.log('🔥 AGENT MESSAGE ADDED - should appear in chat now!');
          addActivityEvent('agent_complete', `Agent "${data.data.agent}" completed task`, data.data);
          setSwarmState(prev => ({ 
            ...prev, 
            activeAgents: Math.max(0, prev.activeAgents - 1),
            completedAgents: prev.completedAgents + 1,
            isExecuting: false
          }));
          
          // Stop any running polling fallback
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
            console.log('🛑 Stopped polling fallback after agent completion');
          }
        } else {
          console.log('❌ agent.completed event missing required fields:', data);
        }
        break;
        
      case 'swarm.completed':
        addActivityEvent('system', 'Swarm task completed successfully');
        setSwarmState(prev => ({ ...prev, isExecuting: false }));
        break;
    }
  }, [addActivityEvent, addAgentMessage, messages.length, swarmState]);

  // Setup EventSource connection
  const setupStreamConnection = useCallback(() => {
    console.log('🔌 Setting up EventSource connection...');
    
    try {
      // Close existing connection first
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      const eventSource = new EventSource('http://localhost:8000/api/v1/true-dynamic-swarm/events?token=demo-token');
      eventSourceRef.current = eventSource;
      
      eventSource.onopen = () => {
        console.log('🟢 EventSource connected');
        console.log('🟢 EventSource URL:', eventSource.url);
        console.log('🟢 EventSource readyState:', eventSource.readyState);
        addActivityEvent('system', 'Connected to True Dynamic Swarm event stream');
      };
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('🔥🔥🔥 EventSource MESSAGE RECEIVED!!!');
          console.log('📥 EventSource RAW:', event.data);
          console.log('📥 EventSource PARSED:', data);
          processEventData(data);
        } catch (error) {
          console.error('Failed to parse event:', error);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('❌❌❌ EventSource ERROR detected!');
        console.error('❌ EventSource error:', error);
        console.error('❌ EventSource readyState:', eventSource.readyState);
        console.error('❌ EventSource URL:', eventSource.url);
        addActivityEvent('error', 'EventSource connection failed');
      };
      
    } catch (error) {
      console.error('❌❌❌ EventSource setup error:', error);
      addActivityEvent('error', 'Failed to setup EventSource');
    }
  }, [addActivityEvent, processEventData]);


  // Execute swarm
  const executeSwarm = async () => {
    console.log('🚀🚀🚀 EXECUTE SWARM CALLED!');
    console.log('🚀 Input:', input);
    console.log('🚀 SwarmState:', swarmState);
    if (!input.trim() || swarmState.isExecuting) {
      console.log('🚀 Early return - empty input or already executing');
      return;
    }
    
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSwarmState(prev => ({ ...prev, isExecuting: true, activeAgents: 0, completedAgents: 0 }));
    
    try {
      let response;
      let data: any;
      
      // Check if we have an existing session to continue
      if (swarmState.sessionId) {
        console.log('🔄 Continuing existing session:', swarmState.sessionId);
        response = await fetch('http://localhost:8000/api/v1/true-dynamic-swarm/continue-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            session_id: swarmState.sessionId,
            task: input 
          })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        data = await response.json();
        addActivityEvent('system', `Continuing session with new task: "${input}"`);
        
        // Use existing session ID
        setSwarmState(prev => ({ 
          ...prev, 
          executionId: swarmState.sessionId
        }));
        
      } else {
        console.log('🆕 Starting new session');
        response = await fetch('http://localhost:8000/api/v1/true-dynamic-swarm/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: input, execution_mode: 'true_dynamic' })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        data = await response.json();
        addActivityEvent('system', 'Starting new True Dynamic Swarm session...');
        
        // Set both session ID and execution ID for new sessions
        setSwarmState(prev => ({ 
          ...prev, 
          executionId: data.execution_id,
          sessionId: data.execution_id
        }));
      }
      
      // Streaming connection is already setup from component mount
      console.log('✅ Execution started, streaming should already be connected');
      
    } catch (error) {
      console.error('Failed to execute swarm:', error);
      addActivityEvent('error', `Failed to start swarm: ${error}`);
      setSwarmState(prev => ({ ...prev, isExecuting: false }));
    }
  };

  // Stop swarm
  const stopSwarm = async () => {
    if (!swarmState.executionId) return;
    
    try {
      await fetch(`http://localhost:8000/api/v1/true-dynamic-swarm/stop/${swarmState.executionId}`, {
        method: 'POST'
      });
      
      addActivityEvent('system', 'Swarm stopped by user');
      setSwarmState(prev => ({ ...prev, isExecuting: false }));
      
      
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    } catch (error) {
      console.error('Failed to stop swarm:', error);
    }
  };

  // Handle Enter key
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeSwarm();
    }
  };

  const getActivityIcon = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'system': return <Info className="h-4 w-4 text-blue-500" />;
      case 'agent_start': return <Activity className="h-4 w-4 text-green-500" />;
      case 'agent_complete': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return <Info className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="flex h-screen max-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Main Chat Area */}
      <div className="flex flex-col flex-1">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <Sparkles className="h-6 w-6 text-blue-500" />
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                  True Dynamic Swarm
                </h1>
              </div>
              <Badge variant="outline" className="text-xs">
                Session-Based AI
              </Badge>
            </div>
            
            <div className="flex items-center space-x-4">
              {swarmState.isExecuting && (
                <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                  <Activity className="h-4 w-4 animate-pulse" />
                  <span>Active: {swarmState.activeAgents}</span>
                  <span>•</span>
                  <span>Done: {swarmState.completedAgents}</span>
                </div>
              )}
              
              <div className="flex items-center space-x-2">
                {/* Session info and controls */}
                {swarmState.sessionId && (
                  <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>Session: {swarmState.sessionId.slice(0, 8)}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSwarmState(prev => ({ ...prev, sessionId: null, executionId: null }));
                        setMessages([]);
                        setActivityEvents([]);
                        addActivityEvent('system', 'Started new session');
                      }}
                      className="h-6 px-2 text-xs"
                    >
                      New Session
                    </Button>
                  </div>
                )}
                
                {/* Activity button */}
                {(activityEvents.length > 0 || swarmState.isExecuting) && (
                  <Button 
                    variant="outline"
                    size="sm" 
                    onClick={() => setShowActivity(!showActivity)}
                    className="flex items-center space-x-1"
                  >
                    <Activity className="h-3 w-3" />
                    <span>Activity</span>
                    {activityEvents.length > 0 && (
                      <Badge variant="secondary" className="ml-1 text-xs">
                        {activityEvents.length}
                      </Badge>
                    )}
                    {showActivity ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
                  </Button>
                )}
                
                {/* Stop button */}
                {swarmState.isExecuting && (
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={stopSwarm}
                    className="flex items-center space-x-1"
                  >
                    <Square className="h-3 w-3" />
                    <span>Stop</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <Bot className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Ready for True Dynamic AI Collaboration
              </h3>
              <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                Ask me anything and I'll coordinate multiple AI specialists to give you the best response.
              </p>
            </div>
          )}
          
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] ${
                message.role === 'user' 
                  ? 'bg-blue-500 text-white rounded-l-lg rounded-tr-lg'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-r-lg rounded-tl-lg shadow-sm'
              } px-4 py-3`}>
                
                {message.role === 'assistant' && message.agent && (
                  <div className="flex items-center space-x-2 mb-2">
                    <Bot className="h-4 w-4 text-blue-500" />
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      {message.agent}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      AI Specialist
                    </Badge>
                  </div>
                )}
                
                {message.thinking && (
                  <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm text-blue-700 dark:text-blue-300">
                    <div className="flex items-center space-x-1 mb-1">
                      <Clock className="h-3 w-3" />
                      <span className="text-xs font-medium">Thinking</span>
                    </div>
                    <div className="text-xs opacity-75">{message.thinking}</div>
                  </div>
                )}
                
                <div className={`prose prose-sm max-w-none ${
                  message.role === 'user' 
                    ? 'prose-invert' 
                    : 'dark:prose-invert'
                }`}>
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
                
                <div className={`text-xs mt-2 ${
                  message.role === 'user' 
                    ? 'text-blue-100' 
                    : 'text-gray-500 dark:text-gray-400'
                }`}>
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4">
          <div className="flex space-x-3">
            <div className="flex-1">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask me anything... I'll coordinate multiple AI specialists to help you."
                className="min-h-[60px] max-h-32 resize-none"
                disabled={swarmState.isExecuting}
              />
            </div>
            <Button
              onClick={executeSwarm}
              disabled={swarmState.isExecuting || !input.trim()}
              size="lg"
              className="px-6 flex items-center space-x-2"
            >
              {swarmState.isExecuting ? (
                <>
                  <Activity className="h-4 w-4 animate-pulse" />
                  <span>Working...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>Send</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Activity Panel */}
      {showActivity && (
        <div className="w-80 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center space-x-2">
              <Activity className="h-4 w-4" />
              <span>Activity History</span>
            </h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {activityEvents.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No activity yet</p>
              </div>
            ) : (
              activityEvents.map((event) => (
                <div key={event.id} className="flex space-x-3 text-sm">
                  <div className="flex-shrink-0 mt-0.5">
                    {getActivityIcon(event.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 dark:text-white">{event.message}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {event.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={activityEndRef} />
          </div>
        </div>
      )}
    </div>
  );
};