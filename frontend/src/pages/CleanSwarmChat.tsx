import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import { Loader2, Send, StopCircle, RefreshCw, User, Bot, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// API Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  agent?: string;
  timestamp: string;
  isStreaming?: boolean;
}

interface AgentActivity {
  agent: string;
  status: 'idle' | 'thinking' | 'typing' | 'done';
  content?: string;
}

export function CleanSwarmChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeAgents, setActiveAgents] = useState<Map<string, AgentActivity>>(new Map());
  const [streamingContent, setStreamingContent] = useState<Map<string, string>>(new Map());
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages, streamingContent]);

  // Initialize session ONCE on mount and persist it
  useEffect(() => {
    // Check if we already have a session in localStorage
    const storedSessionId = localStorage.getItem('swarm_session_id');
    
    if (storedSessionId) {
      setSessionId(storedSessionId);
      console.log('♻️ Restored session:', storedSessionId);
    } else {
      const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setSessionId(newSessionId);
      localStorage.setItem('swarm_session_id', newSessionId);
      console.log('🆕 New session created:', newSessionId);
    }
    
    return () => {
      // Cleanup on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const startSSEStream = useCallback(async (task: string, isFirstMessage: boolean) => {
    if (!sessionId) return;

    setIsLoading(true);
    setActiveAgents(new Map());
    setStreamingContent(new Map());

    try {
      // CRITICAL: Use the correct SSE endpoints
      const endpoint = isFirstMessage 
        ? '/api/v1/streaming/start/sse' 
        : '/api/v1/streaming/continue/sse';

      // For continuation, Strands automatically loads conversation history
      // We don't need to send previous_messages - the coordinator persists across requests
      const requestBody = { 
        task, 
        session_id: sessionId 
      };

      console.log(`📤 Sending to ${endpoint}:`, requestBody);

      // Create abort controller for request
      abortControllerRef.current = new AbortController();

      // Make POST request to get SSE stream
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Check if response is SSE
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('text/event-stream')) {
        console.error('Response is not SSE, got:', contentType);
        throw new Error('Response is not SSE');
      }

      // Create a reader for the stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      // Process the stream
      let buffer = '';
      let currentAgentContent = new Map<string, string>();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr.trim()) {
              try {
                const event = JSON.parse(jsonStr);
                console.log('📨 SSE Event:', event.type, event);

                switch (event.type) {
                  case 'session_start':
                    console.log('🚀 Session started:', event.session_id);
                    break;

                  case 'agent_start':
                    const startAgent = event.agent || 'Unknown';
                    setActiveAgents(prev => new Map(prev).set(startAgent, {
                      agent: startAgent,
                      status: 'thinking'
                    }));
                    currentAgentContent.set(startAgent, '');
                    break;

                  case 'delta':
                  case 'text_generation':
                    const deltaAgent = event.agent || 'coordinator';
                    const content = event.content || event.data?.chunk || event.data?.text || '';
                    
                    if (content) {
                      // Update agent status to typing
                      setActiveAgents(prev => {
                        const updated = new Map(prev);
                        const current = updated.get(deltaAgent) || { agent: deltaAgent, status: 'idle' };
                        updated.set(deltaAgent, { ...current, status: 'typing' });
                        return updated;
                      });

                      // Accumulate content
                      const existingContent = currentAgentContent.get(deltaAgent) || '';
                      currentAgentContent.set(deltaAgent, existingContent + content);
                      
                      // Update streaming content for display
                      setStreamingContent(new Map(currentAgentContent));
                    }
                    break;

                  case 'agent_done':
                  case 'agent_completed':
                    const doneAgent = event.agent || 'coordinator';
                    const finalContent = event.content || event.data?.output || currentAgentContent.get(doneAgent) || '';
                    
                    if (finalContent.trim()) {
                      // Add final message
                      const newMessage: Message = {
                        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        role: 'assistant',
                        content: finalContent,
                        agent: doneAgent,
                        timestamp: new Date().toISOString(),
                        isStreaming: false
                      };
                      
                      setMessages(prev => [...prev, newMessage]);
                    }

                    // Clear streaming content for this agent
                    currentAgentContent.delete(doneAgent);
                    setStreamingContent(new Map(currentAgentContent));
                    
                    // Update agent status
                    setActiveAgents(prev => {
                      const updated = new Map(prev);
                      updated.set(doneAgent, { agent: doneAgent, status: 'done' });
                      return updated;
                    });
                    break;

                  case 'session_complete':
                  case 'done':
                    console.log('✅ Session complete');
                    setIsLoading(false);
                    setActiveAgents(new Map());
                    break;

                  case 'error':
                    console.error('❌ Error:', event.error);
                    setIsLoading(false);
                    setActiveAgents(new Map());
                    break;

                  case 'keepalive':
                    // Ignore keepalive events
                    break;

                  default:
                    console.log('Unknown event type:', event.type);
                }
              } catch (e) {
                console.error('Failed to parse SSE data:', e, jsonStr);
              }
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('❌ SSE Stream error:', error);
        setMessages(prev => [...prev, {
          id: `error_${Date.now()}`,
          role: 'system',
          content: `Error: ${error.message}`,
          timestamp: new Date().toISOString()
        }]);
      }
    } finally {
      setIsLoading(false);
      setActiveAgents(new Map());
      setStreamingContent(new Map());
    }
  }, [sessionId, messages]);

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || isLoading || !sessionId) return;

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    const task = inputValue.trim();
    setInputValue('');

    // CRITICAL: Determine if this is the first message correctly
    // Only the VERY FIRST user message should use /start/sse
    const isFirstMessage = messages.filter(m => m.role === 'user').length === 0;
    
    console.log(`📝 Sending message. First message? ${isFirstMessage}. Total messages: ${messages.length}`);
    
    // Start SSE stream
    await startSSEStream(task, isFirstMessage);
  }, [inputValue, isLoading, sessionId, messages, startSSEStream]);

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setActiveAgents(new Map());
    setStreamingContent(new Map());
  }, []);

  const handleReset = useCallback(() => {
    handleStop();
    setMessages([]);
    setStreamingContent(new Map());
    setActiveAgents(new Map());
    
    // Clear the old session from localStorage and create a new one
    localStorage.removeItem('swarm_session_id');
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setSessionId(newSessionId);
    localStorage.setItem('swarm_session_id', newSessionId);
    console.log('🔄 Session reset:', newSessionId);
  }, [handleStop]);

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="border-b bg-white dark:bg-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-blue-500" />
            <h1 className="text-xl font-semibold">Swarm Intelligence Chat</h1>
            {sessionId && (
              <span className="text-xs text-gray-500 font-mono">
                Session: {sessionId.substring(0, 8)}...
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isLoading && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStop}
              >
                <StopCircle className="h-4 w-4 mr-1" />
                Stop
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              New Chat
            </Button>
          </div>
        </div>

        {/* Active Agents Display */}
        {activeAgents.size > 0 && (
          <div className="mt-3 flex items-center gap-4">
            {Array.from(activeAgents.values()).map(agent => (
              <div
                key={agent.agent}
                className="flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-full text-sm"
              >
                <div className={`h-2 w-2 rounded-full ${
                  agent.status === 'thinking' ? 'bg-yellow-500 animate-pulse' :
                  agent.status === 'typing' ? 'bg-blue-500 animate-pulse' :
                  agent.status === 'done' ? 'bg-green-500' :
                  'bg-gray-400'
                }`} />
                <span className="font-medium">{agent.agent}</span>
                <span className="text-xs text-gray-500">
                  {agent.status === 'thinking' ? 'thinking...' :
                   agent.status === 'typing' ? 'typing...' :
                   agent.status === 'done' ? 'done' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-6" ref={scrollAreaRef}>
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <Sparkles className="h-12 w-12 text-blue-500 mx-auto mb-4" />
              <h2 className="text-2xl font-semibold mb-2">Welcome to Swarm Chat</h2>
              <p className="text-gray-500">Start a conversation with multiple AI agents working together</p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map(message => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <Card className={`p-4 ${
                  message.role === 'user' 
                    ? 'ml-auto max-w-[80%] bg-blue-50 dark:bg-blue-900/20' 
                    : message.role === 'system'
                    ? 'bg-red-50 dark:bg-red-900/20'
                    : 'mr-auto max-w-[80%] bg-white dark:bg-gray-800'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-full ${
                      message.role === 'user' 
                        ? 'bg-blue-500' 
                        : message.role === 'system'
                        ? 'bg-red-500'
                        : 'bg-green-500'
                    }`}>
                      {message.role === 'user' ? (
                        <User className="h-4 w-4 text-white" />
                      ) : (
                        <Bot className="h-4 w-4 text-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      {message.agent && (
                        <div className="text-xs font-medium text-gray-500 mb-1">
                          {message.agent}
                        </div>
                      )}
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown
                          components={{
                            code({ node, className, children, ...props }: any) {
                              const match = /language-(\w+)/.exec(className || '');
                              const inline = !match;
                              return !inline && match ? (
                                <SyntaxHighlighter
                                  style={vscDarkPlus as any}
                                  language={match[1]}
                                  PreTag="div"
                                  {...props}
                                >
                                  {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                              ) : (
                                <code className={className} {...props}>
                                  {children}
                                </code>
                              );
                            }
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
                      <div className="text-xs text-gray-400 mt-2">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}

            {/* Streaming Content */}
            {streamingContent.size > 0 && Array.from(streamingContent.entries()).map(([agent, content]) => (
              content.trim() && (
                <motion.div
                  key={`streaming_${agent}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className="mr-auto max-w-[80%] bg-white dark:bg-gray-800 border-blue-300 dark:border-blue-600">
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-full bg-blue-500 animate-pulse">
                          <Bot className="h-4 w-4 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="text-xs font-medium text-blue-500 mb-1">
                            {agent} (streaming...)
                          </div>
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown>{content}</ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              )
            ))}
          </AnimatePresence>

          {/* Loading Indicator */}
          {isLoading && streamingContent.size === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center py-4"
            >
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <span className="ml-2 text-sm text-gray-500">Initializing agents...</span>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t bg-white dark:bg-gray-800 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
              onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              placeholder="Type your message..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CleanSwarmChat;