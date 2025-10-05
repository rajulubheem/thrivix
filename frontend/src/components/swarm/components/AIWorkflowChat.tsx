import React, { useState, useRef, useEffect } from 'react';
import './AIWorkflowChat.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface AIWorkflowChatProps {
  isOpen: boolean;
  onToggle: () => void;
  onOperations: (operations: any[], nodes: any[], edges: any[]) => void;
  isDarkMode: boolean;
  wsRef?: React.MutableRefObject<WebSocket | null>;
  currentNodes?: any[];
  currentEdges?: any[];
}

export const AIWorkflowChat: React.FC<AIWorkflowChatProps> = ({
  isOpen,
  onToggle,
  onOperations,
  isDarkMode,
  wsRef,
  currentNodes = [],
  currentEdges = []
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamingMessageRef = useRef<string>("");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Only auto-scroll when messages change if user is near bottom
  useEffect(() => {
    const messagesContainer = messagesEndRef.current?.parentElement;
    if (!messagesContainer) return;

    const isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;

    if (isNearBottom) {
      scrollToBottom();
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isMinimized]);

  // Listen to WebSocket for streaming tokens
  useEffect(() => {
    if (!wsRef?.current || !sessionId) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        console.log('WebSocket message received:', data);

        // Handle AI assistant streaming tokens
        if (data.type === 'ai_assistant_token') {
          const token = data.payload?.token;
          if (token) {
            streamingMessageRef.current += token;

            // Update the last message (streaming message)
            setMessages(prev => {
              const newMessages = [...prev];
              const lastMsg = newMessages[newMessages.length - 1];

              if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
                // Update existing streaming message
                newMessages[newMessages.length - 1] = {
                  role: 'assistant',
                  content: streamingMessageRef.current,
                  isStreaming: true
                };
              } else {
                // Create new streaming message
                newMessages.push({
                  role: 'assistant',
                  content: streamingMessageRef.current,
                  isStreaming: true
                });
              }
              return newMessages;
            });
          }
        }
      } catch (e) {
        console.error('Error parsing WebSocket message:', e);
      }
    };

    wsRef.current.addEventListener('message', handleMessage);

    return () => {
      wsRef.current?.removeEventListener('message', handleMessage);
    };
  }, [wsRef, sessionId]);

  const startSession = async (taskInput: string) => {
    if (!taskInput.trim()) return;

    setIsLoading(true);
    streamingMessageRef.current = ""; // Reset streaming buffer
    setMessages([{ role: 'user', content: taskInput }]);

    // Generate a session ID first
    const newSessionId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    setSessionId(newSessionId);

    try {
      // Connect WebSocket FIRST, before making the API call
      if (wsRef?.current) {
        wsRef.current.close();
      }

      const ws = new WebSocket(`ws://localhost:8000/api/v1/ws/${newSessionId}`);

      ws.onopen = async () => {
        console.log('AI Assistant WebSocket connected for session:', newSessionId);

        // NOW make the API call after WebSocket is connected
        try {
          const response = await fetch('http://localhost:8000/api/v1/streaming/ai-assistant/start', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            },
            body: JSON.stringify({
              task: taskInput,
              session_id: newSessionId  // Pass our session ID
            })
          });

          const data = await response.json();

          if (data.success) {
            console.log('AI Assistant response received:', data);

            // Backend already parsed the message, use it directly
            // Update the streaming message with the final parsed message
            setMessages(prev => {
              const newMessages = [...prev];
              if (newMessages.length > 0 && newMessages[newMessages.length - 1].isStreaming) {
                newMessages[newMessages.length - 1] = {
                  role: 'assistant',
                  content: data.message || 'Workflow created.',
                  isStreaming: false
                };
              } else {
                // If no streaming message exists, add it
                newMessages.push({
                  role: 'assistant',
                  content: data.message || 'Workflow created.'
                });
              }
              return newMessages;
            });

            // Apply operations to canvas
            if (data.operations && data.operations.length > 0) {
              onOperations(data.operations, data.nodes || [], data.edges || []);
            }

            setIsLoading(false);
          }
        } catch (error) {
          console.error('Error starting AI assistant:', error);
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'Sorry, I encountered an error. Please try again.'
          }]);
          setIsLoading(false);
        }
      };

      ws.onerror = (error) => {
        console.error('AI Assistant WebSocket error:', error);
        setIsLoading(false);
      };

      if (wsRef) {
        wsRef.current = ws;
      }
    } catch (error) {
      console.error('Error connecting WebSocket:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error connecting. Please try again.'
      }]);
      setIsLoading(false);
    } finally {
      streamingMessageRef.current = ""; // Reset buffer
    }
  };

  const sendMessage = async (message: string) => {
    if (!message.trim()) {
      console.warn('Empty message, ignoring');
      return;
    }

    if (!sessionId) {
      console.error('No session ID, cannot send message');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Session expired. Please start a new conversation.'
      }]);
      return;
    }

    setMessages(prev => [...prev, { role: 'user', content: message }]);
    setIsLoading(true);
    streamingMessageRef.current = ""; // Reset streaming buffer

    try {
      const response = await fetch('http://localhost:8000/api/v1/streaming/ai-assistant/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({
          session_id: sessionId,
          message,
          current_canvas_state: {
            nodes: currentNodes.map(n => ({
              id: n.id,
              name: n.data?.name || '',
              type: n.data?.type || 'analysis',
              description: n.data?.description || '',
              agent_role: n.data?.agent_role || '',
              tools: n.data?.tools || [],
              position: n.position
            })),
            edges: currentEdges.map(e => ({
              source: e.source,
              target: e.target,
              event: e.label || 'success'
            }))
          }
        })
      });

      const data = await response.json();

      if (data.success) {
        console.log('AI Assistant response received:', data);

        // Backend already parsed the message, use it directly
        setMessages(prev => {
          const newMessages = [...prev];
          if (newMessages.length > 0 && newMessages[newMessages.length - 1].isStreaming) {
            newMessages[newMessages.length - 1] = {
              role: 'assistant',
              content: data.message || 'Workflow updated.',
              isStreaming: false
            };
          } else {
            // If no streaming message exists, add it
            newMessages.push({
              role: 'assistant',
              content: data.message || 'Workflow updated.'
            });
          }
          return newMessages;
        });

        // Apply operations to canvas
        if (data.operations && data.operations.length > 0) {
          onOperations(data.operations, data.nodes || [], data.edges || []);
        }

        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      }]);
    } finally {
      setIsLoading(false);
      streamingMessageRef.current = ""; // Reset buffer
    }
  };

  const handleSend = () => {
    if (sessionId) {
      sendMessage(inputValue);
    } else {
      startSession(inputValue);
    }
    setInputValue('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearSession = () => {
    setMessages([]);
    setSessionId(null);
    setInputValue('');
  };

  if (!isOpen) return null;

  return (
    <div className={`ai-workflow-chat ${isDarkMode ? 'dark' : 'light'} ${isMinimized ? 'minimized' : ''}`}>
      {/* Header */}
      <div className="chat-header">
        <div className="header-left">
          <div className="ai-icon">🤖</div>
          <div className="header-text">
            <div className="header-title">AI Workflow Assistant</div>
            <div className="header-subtitle">
              {sessionId ? `${messages.length} messages` : 'Describe your task to get started'}
            </div>
          </div>
        </div>
        <div className="header-actions">
          {sessionId && (
            <button className="action-btn" onClick={handleClearSession} title="New conversation">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          )}
          <button className="action-btn" onClick={() => setIsMinimized(!isMinimized)} title={isMinimized ? "Expand" : "Minimize"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {isMinimized ? (
                <path d="M19 9l-7 7-7-7"/>
              ) : (
                <path d="M5 15l7-7 7 7"/>
              )}
            </svg>
          </button>
          <button className="action-btn close-btn" onClick={onToggle} title="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      {!isMinimized && (
        <>
          <div className="chat-messages">
            {messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">💬</div>
                <div className="empty-title">Start building your workflow</div>
                <div className="empty-text">
                  Describe what you want to accomplish and I'll help you design the perfect workflow
                </div>
                <div className="example-prompts">
                  <button
                    className="example-prompt"
                    onClick={() => setInputValue("Create a workflow to analyze customer feedback and generate insights")}
                  >
                    Analyze customer feedback
                  </button>
                  <button
                    className="example-prompt"
                    onClick={() => setInputValue("Build a data pipeline to process and validate user submissions")}
                  >
                    Build data pipeline
                  </button>
                  <button
                    className="example-prompt"
                    onClick={() => setInputValue("Design a workflow for automated code review and testing")}
                  >
                    Automated code review
                  </button>
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} className={`message ${msg.role}`}>
                  <div className="message-avatar">
                    {msg.role === 'user' ? '👤' : '🤖'}
                  </div>
                  <div className="message-content">
                    <div className={`message-text ${msg.isStreaming ? 'streaming' : ''}`}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="message assistant">
                <div className="message-avatar">🤖</div>
                <div className="message-content">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="chat-input-area">
            <input
              ref={inputRef}
              type="text"
              className="chat-input"
              placeholder={sessionId ? "Ask me to modify the workflow..." : "Describe your task..."}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
            />
            <button
              className="send-button"
              onClick={handleSend}
              disabled={isLoading || !inputValue.trim()}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
