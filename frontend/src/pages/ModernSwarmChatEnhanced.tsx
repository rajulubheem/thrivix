import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Users, 
  Bot, 
  Activity, 
  Zap, 
  Brain,
  Settings,
  Loader2,
  Send,
  Plus,
  MessageSquare,
  Trash2
} from 'lucide-react';
import { ModernLayout } from '../components/layout/ModernLayout';
import { ModernChatInterface } from '../components/chat/ModernChatInterface';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Separator } from '../components/ui/separator';
import { cn } from '../lib/utils';
import { chatApi, ChatSessionWithMessages, ChatMessage } from '../services/chatApi';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'error';
  agent?: string;
}

interface Agent {
  id: string;
  name: string;
  status: 'idle' | 'thinking' | 'executing' | 'completed';
  progress: number;
}

export function ModernSwarmChatEnhanced() {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  
  // Core state
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSessionWithMessages | null>(null);
  const [sessions, setSessions] = useState<ChatSessionWithMessages[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeAgents, setActiveAgents] = useState<Agent[]>([]);
  
  // Refs for maintaining state
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentSessionRef = useRef<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const stoppingRef = useRef<boolean>(false);
  const lastPollTimeRef = useRef<number>(0);
  const isPollingRef = useRef<boolean>(false);
  const pollAbortRef = useRef<AbortController | null>(null);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
    // Inactivity watchdog: if polling stalls beyond threshold, auto-stop backend
    const watchdog = setInterval(() => {
      const THRESHOLD_MS = 45000; // 45s without polling progress triggers stop
      const now = Date.now();
      if (
        isLoading &&
        currentSessionRef.current &&
        lastPollTimeRef.current > 0 &&
        now - lastPollTimeRef.current > THRESHOLD_MS &&
        !stoppingRef.current
      ) {
        console.warn(
          `⏱️ Polling inactivity detected (> ${THRESHOLD_MS}ms). Stopping execution for`,
          currentSessionRef.current
        );
        stopCurrentExecution();
      }
    }, 10000);
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      clearInterval(watchdog);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      // Proactively stop backend execution if user navigates away during processing
      if (currentSessionRef.current) {
        try {
          fetch(`/api/v1/streaming/stop/${currentSessionRef.current}`, { method: 'POST' });
        } catch {}
      }
    };
  }, []);

  // Load specific session when sessionId changes
  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
      currentSessionRef.current = sessionId;
    } else {
      setCurrentSession(null);
      setMessages([]);
      currentSessionRef.current = null;
    }
  }, [sessionId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadSessions = async () => {
    try {
      const sessionsData = await chatApi.getSessions();
      setSessions(sessionsData || []);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const loadSession = async (sessionId: string) => {
    try {
      console.log(`📥 Loading session: ${sessionId}`);
      const session = await chatApi.getSessionWithMessages(sessionId);
      
      if (session) {
        console.log(`✅ Session loaded:`, {
          sessionId: session.session_id,
          messageCount: session.messages?.length || 0,
          messages: session.messages
        });
        
        setCurrentSession(session);
        
        // Convert session messages to our format
        const formattedMessages: Message[] = session.messages.map(msg => ({
          id: msg.message_id || msg.id?.toString() || Date.now().toString() + Math.random(),
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          timestamp: new Date(msg.created_at || Date.now()),
          status: 'sent' as const,
          agent: msg.agent_name || msg.message_metadata?.agent
        }));
        
        console.log(`📝 Formatted messages:`, formattedMessages);
        setMessages(formattedMessages);
      } else {
        console.warn(`⚠️ No session found for ID: ${sessionId}`);
      }
    } catch (error) {
      console.error('❌ Failed to load session:', error);
    }
  };

  const stopCurrentExecution = async () => {
    try {
      const sid = currentSessionRef.current || currentSession?.session_id;
      if (!sid) return;
      stoppingRef.current = true;
      // Abort any inflight poll request immediately
      if (pollAbortRef.current) {
        try { pollAbortRef.current.abort(); } catch {}
      }
      await fetch(`/api/v1/streaming/stop/${sid}`, { method: 'POST' });
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to stop execution:', err);
    }
  };

  const createSession = async () => {
    try {
      const newSession = await chatApi.createSession({
        title: `Chat ${new Date().toLocaleString()}`,
        description: 'Swarm chat session'
      });
      
      if (newSession) {
        await loadSessions();
        navigate(`/swarm/${newSession.session_id}`);
        return newSession.session_id;
      }
    } catch (error) {
      console.error('Failed to create session:', error);
    }
    return null;
  };

  const deleteSession = async (sessionId: string) => {
    try {
      await chatApi.deleteSession(sessionId);
      await loadSessions();
      
      if (currentSession?.session_id === sessionId) {
        navigate('/swarm');
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    // Ensure we have a session
    let activeSessionId = currentSessionRef.current;
    
    if (!activeSessionId) {
      activeSessionId = await createSession();
      if (!activeSessionId) {
        console.error('Failed to create session');
        return;
      }
    }

    setIsLoading(true);
    
    // Save user message to backend first
    try {
      // First ensure session exists in database
      try {
        await chatApi.getSession(activeSessionId);
      } catch (sessionError) {
        // Session doesn't exist, create it
        console.log('📋 Creating database session for:', activeSessionId);
        await chatApi.createSession({
          session_id: activeSessionId,
          title: `Chat ${new Date().toLocaleString()}`,
          description: 'Swarm chat session'
        });
      }
      
      const savedMessage = await chatApi.addMessage(activeSessionId, {
        role: 'user',
        content,
        message_metadata: {}
      });
      
      // Add user message to UI with the actual ID from backend
      const userMessage: Message = {
        id: savedMessage.message_id || savedMessage.id?.toString() || Date.now().toString(),
        role: 'user',
        content,
        timestamp: new Date(savedMessage.created_at || Date.now()),
        status: 'sent'
      };
      
      setMessages(prev => [...prev, userMessage]);
    } catch (error) {
      console.error('Failed to save user message:', error);
      setIsLoading(false);
      return;
    }

    // Add placeholder for assistant response for streaming
    const assistantMessageId = 'streaming_' + Date.now().toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      status: 'sending',
      agent: 'coordinator'
    };
    
    setMessages(prev => [...prev, assistantMessage]);

    // Set up streaming
    try {
      // Close existing event source if any
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      // Get full conversation history for context (including the user message we just added)
      const conversationHistory = messages.filter(msg => msg.status === 'sent').map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Use continue endpoint if we have conversation history, start endpoint for new conversations
      const endpoint = conversationHistory.length > 0 
        ? '/api/v1/streaming/continue'
        : '/api/v1/streaming/start';
      
      console.log(`🚀 Using ${endpoint} with ${conversationHistory.length} messages in history`);

      // Send request with session ID and full conversation history
      const requestBody = conversationHistory.length > 0 
        ? {
            // Continue endpoint format
            session_id: activeSessionId,
            task: content,  // Current user's message
            previous_messages: conversationHistory,  // Continue endpoint expects previous_messages
            agents: [],  // Let the backend handle agent selection
          }
        : {
            // Start endpoint format
            session_id: activeSessionId,
            task: content,
            conversation_history: conversationHistory,
            agent_configs: [
              {
                name: 'coordinator',
                description: 'Main coordinator agent',
                system_prompt: 'You are a helpful AI assistant. You have access to the full conversation history and maintain context across all messages.'
              }
            ]
          };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.execution_id || data.session_id) {
        // Use polling instead of EventSource
        const pollSessionId = data.execution_id || data.session_id;
        let accumulatedContent = '';
        let offset = 0;
        let polling = true;
        
        const pollForUpdates = async () => {
          isPollingRef.current = true;
          lastPollTimeRef.current = Date.now();
          while (polling) {
            try {
              // Create/refresh abort controller per iteration
              pollAbortRef.current = new AbortController();
              const pollResponse = await fetch(
                `/api/v1/streaming/poll/${pollSessionId}?offset=${offset}&timeout=25`,
                { signal: pollAbortRef.current.signal }
              );
              
              if (!pollResponse.ok) {
                throw new Error('Polling failed');
              }
              
              const pollData = await pollResponse.json();
              lastPollTimeRef.current = Date.now();
              
              if (pollData.chunks && pollData.chunks.length > 0) {
                for (const chunk of pollData.chunks) {
                  if ((chunk.type === 'text' || chunk.type === 'delta') && chunk.content) {
                    // Accumulate content
                    accumulatedContent += chunk.content;
                    
                    // Update message in UI
                    setMessages(prev => {
                      const newMessages = [...prev];
                      const lastMessage = newMessages[newMessages.length - 1];
                      if (lastMessage && lastMessage.id === assistantMessageId) {
                        lastMessage.content = accumulatedContent;
                        lastMessage.status = 'sent';
                      }
                      return newMessages;
                    });
                  } else if (chunk.type === 'agent_started') {
                    // Update agent status
                    const agentName = chunk.agent || 'coordinator';
                    setActiveAgents(prev => {
                      const existing = prev.find(a => a.id === agentName);
                      if (existing) {
                        return prev.map(a => 
                          a.id === agentName 
                            ? { ...a, status: 'thinking', progress: 25 }
                            : a
                        );
                      }
                      return [...prev, {
                        id: agentName,
                        name: agentName,
                        status: 'thinking',
                        progress: 25
                      }];
                    });
                  } else if (chunk.type === 'agent_completed') {
                    // Update agent status
                    const agentName = chunk.agent || 'coordinator';
                    setActiveAgents(prev => 
                      prev.map(a => 
                        a.id === agentName 
                          ? { ...a, status: 'completed', progress: 100 }
                          : a
                      )
                    );
                  } else if (chunk.type === 'done' || chunk.type === 'error' || chunk.type === 'execution_stopped') {
                    polling = false;
                    setIsLoading(false);
                    
                    // Save final assistant message to backend
                    if (accumulatedContent && activeSessionId) {
                      try {
                        const savedMessage = await chatApi.addMessage(activeSessionId, {
                          role: 'assistant',
                          content: accumulatedContent,
                          message_metadata: { agent: 'coordinator' }
                        });
                        
                        // Update the streaming message with the saved message ID
                        setMessages(prev => {
                          const newMessages = [...prev];
                          const lastMessage = newMessages[newMessages.length - 1];
                          if (lastMessage && lastMessage.id === assistantMessageId) {
                            lastMessage.id = savedMessage.message_id || savedMessage.id?.toString() || assistantMessageId;
                            lastMessage.status = 'sent';
                            lastMessage.timestamp = new Date(savedMessage.created_at || Date.now());
                          }
                          return newMessages;
                        });
                        
                        console.log('✅ Assistant message saved with ID:', savedMessage.message_id);
                      } catch (error) {
                        console.error('Failed to save assistant message:', error);
                      }
                    }
                    
                    // Clear agents after completion
                    setTimeout(() => {
                      setActiveAgents([]);
                    }, 2000);
                    break;
                  }
                }
                
                // Update offset
                offset = pollData.offset || offset + pollData.chunks.length;
              }
              
              // Check if done
              if (!pollData.has_more) {
                polling = false;
                setIsLoading(false);
                
                // Save final message if we have content
                if (accumulatedContent && activeSessionId) {
                  try {
                    const savedMessage = await chatApi.addMessage(activeSessionId, {
                      role: 'assistant',
                      content: accumulatedContent,
                      message_metadata: { agent: 'coordinator' }
                    });
                    
                    // Update the streaming message with the saved message ID
                    setMessages(prev => {
                      const newMessages = [...prev];
                      const lastMessage = newMessages[newMessages.length - 1];
                      if (lastMessage && lastMessage.id === assistantMessageId) {
                        lastMessage.id = savedMessage.message_id || savedMessage.id?.toString() || assistantMessageId;
                        lastMessage.status = 'sent';
                        lastMessage.timestamp = new Date(savedMessage.created_at || Date.now());
                      }
                      return newMessages;
                    });
                    
                    console.log('✅ Assistant message saved with ID (has_more=false):', savedMessage.message_id);
                  } catch (error) {
                    console.error('Failed to save assistant message:', error);
                  }
                }
                
                break;
              }
              
              // Small delay before next poll
              await new Promise(resolve => setTimeout(resolve, 100));
              
            } catch (error) {
              if ((error as any)?.name === 'AbortError') {
                // Aborted due to stop — exit loop quietly
                break;
              }
              console.error('Polling error:', error);
              polling = false;
              setIsLoading(false);
              
              // Update message status to error
              setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage && lastMessage.id === assistantMessageId) {
                  if (!lastMessage.content) {
                    lastMessage.content = 'Sorry, I encountered an error processing your request.';
                  }
                  lastMessage.status = 'error';
                }
                return newMessages;
              });
              break;
            }
          }
          isPollingRef.current = false;
        };
        
        // Start polling
        pollForUpdates();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setIsLoading(false);
      
      // Update message with error
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage && lastMessage.id === assistantMessageId) {
          lastMessage.content = 'Sorry, I encountered an error processing your request.';
          lastMessage.status = 'error';
        }
        return newMessages;
      });
    }
  };

  return (
    <ModernLayout>
      <div className="flex h-full">
        {/* Sidebar */}
        <div className="w-80 border-r bg-muted/10 flex flex-col">
          <div className="p-4 border-b">
            <Button 
              onClick={() => createSession()} 
              className="w-full"
              variant="default"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Chat
            </Button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Recent Chats</h3>
            <div className="space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.session_id}
                  className={cn(
                    "group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors",
                    sessionId === session.session_id 
                      ? "bg-primary/10 border border-primary/20" 
                      : "hover:bg-muted/50"
                  )}
                  onClick={() => navigate(`/swarm/${session.session_id}`)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {session.title || 'Untitled Chat'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {session.messages.length} messages
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(session.session_id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Agent Status */}
          {activeAgents.length > 0 && (
            <div className="border-t p-4">
              <h3 className="text-sm font-medium mb-3">Active Agents</h3>
              <div className="space-y-2">
                {activeAgents.map((agent) => (
                  <div key={agent.id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{agent.name}</span>
                      <Badge variant={
                        agent.status === 'completed' ? 'default' :
                        agent.status === 'thinking' ? 'secondary' : 'outline'
                      }>
                        {agent.status}
                      </Badge>
                    </div>
                    <Progress value={agent.progress} className="h-1" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {currentSession ? (
            <>
              {/* Header */}
              <div className="border-b px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {currentSession.title || 'Swarm Chat'}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Session: {currentSession.session_id.slice(0, 8)}...
                    </p>
                  </div>
              <div className="flex items-center gap-2">
                {isLoading && (
                  <Badge variant="secondary" className="gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Processing
                  </Badge>
                )}
                {isLoading && (
                  <Button size="sm" variant="outline" onClick={stopCurrentExecution}>
                    Stop
                  </Button>
                )}
              </div>
            </div>
          </div>

              {/* Chat Interface */}
              <div className="flex-1 overflow-hidden">
                <ModernChatInterface
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  isLoading={isLoading}
                  placeholder="Type your message..."
                />
                <div ref={messagesEndRef} />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Start a new conversation</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create a new chat or select an existing one
                </p>
                <Button onClick={() => createSession()}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Chat
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModernLayout>
  );
}
