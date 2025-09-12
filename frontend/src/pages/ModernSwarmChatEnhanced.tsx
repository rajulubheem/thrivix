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
  tools?: any[];
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
          agent: msg.agent_name || msg.message_metadata?.agent,
          tools: msg.message_metadata?.tools || []
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
        let accumulatedTools: any[] = [];
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
                  if ((chunk.type === 'text' || chunk.type === 'delta' || chunk.type === 'text_generation') && (chunk.content || chunk.data?.chunk)) {
                    // Get the chunk content
                    const chunkContent = chunk.content || chunk.data?.chunk || '';
                    
                    // Accumulate content
                    accumulatedContent += chunkContent;
                    
                    // Update message in UI
                    setMessages(prev => {
                      const newMessages = [...prev];
                      const lastMessage = newMessages[newMessages.length - 1];
                      if (lastMessage && lastMessage.id === assistantMessageId) {
                        lastMessage.content = accumulatedContent;
                        lastMessage.status = 'sent';
                        lastMessage.tools = accumulatedTools;
                      }
                      return newMessages;
                    });
                  } else if (chunk.type === 'tool_call') {
                    // Accumulate tool calls - streaming parameters come in chunks
                    const toolName = chunk.data?.tool || 'unknown';
                    const toolParams = chunk.data?.parameters || '';
                    
                    // Find or create tool entry
                    let toolEntry = accumulatedTools.find(t => 
                      t.name === toolName && !t.complete
                    );
                    
                    if (!toolEntry) {
                      // Create new tool entry only if we don't have an incomplete one
                      toolEntry = {
                        id: `tool_${toolName}_${accumulatedTools.length}`,
                        name: toolName,
                        parameters: '',
                        status: 'running',
                        complete: false,
                        startTime: Date.now()
                      };
                      accumulatedTools.push(toolEntry);
                    }
                    
                    // Append parameters
                    toolEntry.parameters += toolParams;
                    
                    // Check if parameters are complete (valid JSON)
                    if (toolEntry.parameters.trim().startsWith('{') && 
                        toolEntry.parameters.trim().endsWith('}')) {
                      try {
                        const parsed = JSON.parse(toolEntry.parameters);
                        toolEntry.parameters = parsed;
                        toolEntry.complete = true;
                      } catch {
                        // Not yet valid JSON, keep accumulating
                      }
                    }
                    
                    // Update message with deduplicated tools (only show complete or last running)
                    const displayTools = accumulatedTools.filter((tool, index) => {
                      // Show completed tools
                      if (tool.complete || tool.status === 'completed') return true;
                      // Show only the last running tool for each name
                      const sameName = accumulatedTools.filter(t => t.name === tool.name);
                      return sameName[sameName.length - 1] === tool;
                    });
                    
                    setMessages(prev => {
                      const newMessages = [...prev];
                      const lastMessage = newMessages[newMessages.length - 1];
                      if (lastMessage && lastMessage.id === assistantMessageId) {
                        lastMessage.tools = displayTools;
                      }
                      return newMessages;
                    });
                  } else if (chunk.type === 'tool_result') {
                    // Update tool status
                    const toolName = chunk.data?.tool || chunk.agent;
                    const tool = accumulatedTools.find(t => 
                      t.name === toolName && (t.status === 'running' || !t.output)
                    );
                    if (tool) {
                      tool.status = 'completed';
                      tool.output = chunk.data?.result || chunk.data?.output;
                      tool.endTime = Date.now();
                    }
                    
                    // Update message with deduplicated tools
                    const displayTools = accumulatedTools.filter((tool, index) => {
                      if (tool.complete || tool.status === 'completed') return true;
                      const sameName = accumulatedTools.filter(t => t.name === tool.name);
                      return sameName[sameName.length - 1] === tool;
                    });
                    
                    setMessages(prev => {
                      const newMessages = [...prev];
                      const lastMessage = newMessages[newMessages.length - 1];
                      if (lastMessage && lastMessage.id === assistantMessageId) {
                        lastMessage.tools = displayTools;
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
                        // Deduplicate tools before saving
                        const finalTools = accumulatedTools.filter((tool, index) => {
                          if (tool.complete || tool.status === 'completed') return true;
                          const sameName = accumulatedTools.filter(t => t.name === tool.name);
                          return sameName[sameName.length - 1] === tool;
                        });
                        
                        const savedMessage = await chatApi.addMessage(activeSessionId, {
                          role: 'assistant',
                          content: accumulatedContent,
                          message_metadata: { 
                            agent: 'coordinator',
                            tools: finalTools.length > 0 ? finalTools : undefined
                          }
                        });
                        
                        // Update the streaming message with the saved message ID
                        setMessages(prev => {
                          const newMessages = [...prev];
                          const lastMessage = newMessages[newMessages.length - 1];
                          if (lastMessage && lastMessage.id === assistantMessageId) {
                            lastMessage.id = savedMessage.message_id || savedMessage.id?.toString() || assistantMessageId;
                            lastMessage.status = 'sent';
                            lastMessage.timestamp = new Date(savedMessage.created_at || Date.now());
                            lastMessage.tools = finalTools;
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
                    // Deduplicate tools before saving
                    const finalTools = accumulatedTools.filter((tool, index) => {
                      if (tool.complete || tool.status === 'completed') return true;
                      const sameName = accumulatedTools.filter(t => t.name === tool.name);
                      return sameName[sameName.length - 1] === tool;
                    });
                    
                    const savedMessage = await chatApi.addMessage(activeSessionId, {
                      role: 'assistant',
                      content: accumulatedContent,
                      message_metadata: { 
                        agent: 'coordinator',
                        tools: finalTools.length > 0 ? finalTools : undefined
                      }
                    });
                    
                    // Update the streaming message with the saved message ID
                    setMessages(prev => {
                      const newMessages = [...prev];
                      const lastMessage = newMessages[newMessages.length - 1];
                      if (lastMessage && lastMessage.id === assistantMessageId) {
                        lastMessage.id = savedMessage.message_id || savedMessage.id?.toString() || assistantMessageId;
                        lastMessage.status = 'sent';
                        lastMessage.timestamp = new Date(savedMessage.created_at || Date.now());
                        lastMessage.tools = finalTools;
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
      <div className="flex h-full bg-background">
        {/* Sidebar - Cleaner Style */}
        <div className="w-64 border-r border-border/40 bg-sidebar flex flex-col">
          <div className="p-3 border-b border-border/40">
            <Button 
              onClick={() => createSession()} 
              className="w-full justify-start gap-3 h-10 font-normal"
              variant="outline"
            >
              <Plus className="h-4 w-4" />
              New chat
            </Button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2">
            <div className="space-y-1">
              {sessions.map((session) => (
                <div
                  key={session.session_id}
                  className={cn(
                    "group flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-all duration-200",
                    sessionId === session.session_id 
                      ? "bg-muted/50" 
                      : "hover:bg-muted/30"
                  )}
                  onClick={() => navigate(`/swarm/${session.session_id}`)}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">
                        {session.title || 'New chat'}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(session.session_id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Agent Status - Minimal Style */}
          {activeAgents.length > 0 && (
            <div className="border-t border-border/40 p-3">
              <div className="space-y-2">
                {activeAgents.map((agent) => (
                  <div key={agent.id} className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-xs text-muted-foreground">
                          {agent.name}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main Chat Area - Clean Background */}
        <div className="flex-1 flex flex-col bg-background">
          {currentSession ? (
            <>
              {/* Header - Minimal Style */}
              <div className="border-b border-border/40 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">
                      Swarm Intelligence
                    </span>
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
              <div className="text-center max-w-md">
                <Bot className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-xl font-normal mb-2">How can I help you today?</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Start a conversation with the swarm intelligence
                </p>
                <Button 
                  onClick={() => createSession()}
                  variant="outline"
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Start new chat
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModernLayout>
  );
}
