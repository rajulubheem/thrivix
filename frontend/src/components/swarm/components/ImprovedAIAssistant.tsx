import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import './ImprovedAIAssistant.css';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  operations?: any[];
}

interface DebugInfo {
  prompt?: string;
  currentNodes?: any[];
  selectedNode?: any;
  availableTools?: string[];
  sessionId?: string | null;
}

interface ImprovedAIAssistantProps {
  sessionId: string | null;
  nodes: any[];
  edges: any[];
  selectedNode: any;
  availableTools: string[];
  onOperations: (operations: any[]) => void;
  onStartSession: (task: string) => Promise<{ success: boolean; message?: string; operations?: any[]; error?: string }>;
  isDarkMode: boolean;
  wsRef?: React.RefObject<WebSocket | null>;
}

// Helper function to describe operations in user-friendly way
const getOperationDescription = (operation: any): string | null => {
  switch (operation.type) {
    case 'add_node':
      return `✨ Adding "${operation.node?.name}" node...`;
    case 'connect_nodes':
      return `🔗 Connecting nodes...`;
    case 'modify_node':
      return `✏️ Updating node...`;
    case 'remove_node':
      return `🗑️ Removing node...`;
    case 'auto_layout':
      return `📐 Organizing layout...`;
    default:
      return null;
  }
};

export const ImprovedAIAssistant: React.FC<ImprovedAIAssistantProps> = ({
  sessionId,
  nodes,
  edges,
  selectedNode,
  availableTools,
  onOperations,
  onStartSession,
  isDarkMode,
  wsRef
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({});
  const [streamingContent, setStreamingContent] = useState('');
  const [operationStatus, setOperationStatus] = useState<string | null>(null);
  const [isStreamingOperations, setIsStreamingOperations] = useState(false);
  const [operationQueue, setOperationQueue] = useState<any[]>([]);
  const streamingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Debug logging for streaming state
  useEffect(() => {
    console.log('🎬 isStreaming changed:', isStreaming);
    console.log('📝 streamingContent length:', streamingContent.length);
  }, [isStreaming, streamingContent]);

  // Process operation queue with delays
  useEffect(() => {
    if (operationQueue.length === 0) return;

    const timer = setTimeout(() => {
      const [nextOp, ...rest] = operationQueue;
      setOperationQueue(rest);

      // Apply the operation
      onOperations([nextOp.operation]);

      // Show status
      const desc = getOperationDescription(nextOp.operation);
      if (desc) {
        setOperationStatus(`${desc} (${nextOp.index + 1}/${nextOp.total})`);
        setTimeout(() => setOperationStatus(null), 800);
      }

      // If last operation, mark streaming complete
      if (nextOp.index === nextOp.total - 1) {
        setTimeout(() => {
          setIsStreamingOperations(false);
        }, 100);
      }
    }, 150); // 150ms delay between operations for visibility

    return () => clearTimeout(timer);
  }, [operationQueue, onOperations]);

  // Listen for WebSocket streaming tokens
  useEffect(() => {
    if (!wsRef?.current || !sessionId) return;

    const ws = wsRef.current;

    const handleMessage = (event: MessageEvent) => {
      try {
        const frame = JSON.parse(event.data);

        // Listen for message tokens (character-by-character streaming)
        if (frame.frame_type === 'control' && frame.type === 'ai_assistant_token' && frame.exec_id === sessionId) {
          const token = frame.payload?.token;
          if (token) {
            console.log('📝 Received token:', token);
            setStreamingContent(prev => {
              const newContent = prev + token;
              console.log('📝 StreamingContent length:', newContent.length);
              return newContent;
            });
          }
        }

        // Listen for SINGLE operation from AI (real-time streaming)
        if (frame.frame_type === 'control' && frame.type === 'ai_assistant_operation' && frame.exec_id === sessionId) {
          const operation = frame.payload?.operation;
          const index = frame.payload?.index ?? 0;
          const total = frame.payload?.total ?? 1;

          if (operation) {
            console.log(`📦 Received operation ${index + 1}/${total}:`, operation.type);

            // Mark that we're streaming operations (disable auto-layout)
            if (index === 0) {
              setIsStreamingOperations(true);
            }

            // Add operation to queue with metadata
            // Pass a flag to indicate we're streaming
            setOperationQueue(prev => [...prev, {
              operation: { ...operation, _isStreaming: true },
              index,
              total
            }]);
          }
        }

        // Listen for AI assistant completion signal from backend
        if (frame.frame_type === 'control' && frame.type === 'ai_assistant_complete' && frame.exec_id === sessionId) {
          console.log('✅ Streaming complete');

          // Clear any pending timeout
          if (streamingTimeoutRef.current) {
            clearTimeout(streamingTimeoutRef.current);
          }

          // Always use the completion message from payload (clean message without operations JSON)
          const finalMessage = frame.payload?.message;

          if (finalMessage && finalMessage.trim()) {
            // Add the completed message to history
            const assistantMessage: Message = {
              role: 'assistant',
              content: finalMessage,
              timestamp: Date.now()
            };
            setMessages(prev => [...prev, assistantMessage]);
          }

          // Clear streaming content and stop streaming state
          setStreamingContent('');
          setIsStreaming(false);
        }
      } catch (err) {
        // Ignore non-JSON messages (don't log to avoid spam)
        // Only log if it's actually an error with our frames
        if (event.data && event.data.includes('ai_assistant')) {
          console.error('❌ Error parsing WebSocket message:', err, event.data);
        }
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [wsRef, sessionId, streamingContent]);

  // Update debug info when context changes
  useEffect(() => {
    setDebugInfo({
      sessionId,
      currentNodes: nodes,
      selectedNode,
      availableTools,
    });
  }, [sessionId, nodes, selectedNode, availableTools]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: Date.now()
    };

    const messageText = input;
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);

    try {
      // If no session, start one
      if (!sessionId) {
        await onStartSession(messageText);
        // Keep streaming state - WebSocket will handle message and operations
        return;
      }

      // Build context-aware message
      let contextualMessage = input;

      if (selectedNode) {
        contextualMessage = `[SELECTED NODE: "${selectedNode.data.name}" (id: ${selectedNode.id}, type: ${selectedNode.data.type})]\n${input}`;
      }

      // Prepare canvas state
      const canvasState = {
        nodes: nodes.map(n => ({
          id: n.id,
          name: n.data.name || n.id,
          type: n.data.type || 'analysis',
          tools: n.data.tools || [],
          description: n.data.description || ''
        })),
        edges: edges.map(e => ({
          source: e.source,
          target: e.target,
          event: e.data?.event || 'success'
        })),
        node_count: nodes.length
      };

      // Update debug info with prompt being sent
      setDebugInfo(prev => ({
        ...prev,
        prompt: `Message: ${contextualMessage}\n\nCanvas State: ${JSON.stringify(canvasState, null, 2)}\n\nAvailable Tools: ${availableTools.join(', ')}`
      }));

      const response = await fetch('/api/v1/streaming/ai-assistant/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          message: contextualMessage,
          current_canvas_state: canvasState
        })
      });

      const result = await response.json();

      if (result.success) {
        // Don't add message or apply operations here
        // They will come via WebSocket streaming
        console.log('✅ Message sent, waiting for WebSocket streaming...');
        // Don't set isStreaming to false here - let the WebSocket completion handler do it
      } else {
        throw new Error(result.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        role: 'system',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMessage]);
      setIsStreaming(false); // Only stop streaming on error
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearSession = () => {
    setMessages([]);
    if (sessionId) {
      fetch(`/api/v1/streaming/ai-assistant/${sessionId}`, { method: 'DELETE' });
    }
  };

  return (
    <div className={`improved-ai-assistant ${isDarkMode ? 'dark' : 'light'}`}>
      {/* Header */}
      <div className="ai-header">
        <div className="ai-title">
          <span className="ai-icon">🤖</span>
          <span>AI Workflow Assistant</span>
        </div>
        <div className="ai-controls">
          <button
            className={`debug-toggle ${showDebug ? 'active' : ''}`}
            onClick={() => setShowDebug(!showDebug)}
            title="Show debug info"
          >
            {showDebug ? '🔍 Hide Debug' : '🔍 Debug'}
          </button>
          <button className="clear-btn" onClick={clearSession} title="Clear session">
            🗑️
          </button>
        </div>
      </div>

      {/* Context Info */}
      <div className="ai-context-bar">
        <span className="context-item">📊 {nodes.length} nodes</span>
        <span className="context-item">🔗 {edges.length} edges</span>
        {selectedNode && (
          <span className="context-item selected">
            ✓ Selected: {selectedNode.data.name}
          </span>
        )}
        <span className="context-item">🔧 {availableTools.length} tools</span>
      </div>

      {/* Debug Panel */}
      {showDebug && (
        <div className="ai-debug-panel">
          <div className="debug-section">
            <h4>Session ID</h4>
            <code>{sessionId || 'No session'}</code>
          </div>

          <div className="debug-section">
            <h4>Selected Node</h4>
            <pre>{selectedNode ? JSON.stringify(selectedNode.data, null, 2) : 'None'}</pre>
          </div>

          <div className="debug-section">
            <h4>Available Tools ({availableTools.length})</h4>
            <div className="tools-list">
              {availableTools.map(tool => (
                <span key={tool} className="tool-tag">{tool}</span>
              ))}
            </div>
          </div>

          <div className="debug-section">
            <h4>Current Nodes ({nodes.length})</h4>
            <pre className="scrollable">{JSON.stringify(nodes.map(n => ({
              id: n.id,
              name: n.data.name,
              type: n.data.type,
              tools: n.data.tools
            })), null, 2)}</pre>
          </div>

          {debugInfo.prompt && (
            <div className="debug-section">
              <h4>Last Prompt Sent to AI</h4>
              <pre className="scrollable">{debugInfo.prompt}</pre>
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="ai-messages">
        {messages.length === 0 && (
          <div className="welcome-message">
            <h3>👋 Welcome to AI Workflow Assistant</h3>
            <p>I can help you build and modify workflows using natural language.</p>
            <div className="suggestions">
              <button onClick={() => setInput('Build a data processing pipeline')}>
                Build a data processing pipeline
              </button>
              <button onClick={() => setInput('Add error handling to the workflow')}>
                Add error handling
              </button>
              {selectedNode && (
                <button onClick={() => setInput(`Explain what the ${selectedNode.data.name} node does`)}>
                  Explain selected node
                </button>
              )}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <div className="message-header">
              <span className="message-role">
                {msg.role === 'user' ? '👤 You' : msg.role === 'assistant' ? '🤖 AI' : '⚙️ System'}
              </span>
              {msg.timestamp && (
                <span className="message-time">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              )}
            </div>
            <div className="message-content">
              {msg.role === 'assistant' ? (
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              ) : (
                msg.content
              )}
            </div>
            {msg.operations && msg.operations.length > 0 && (
              <div className="message-operations">
                <strong>Operations:</strong>
                {msg.operations.map((op, opIdx) => (
                  <div key={opIdx} className="operation">
                    <span className="op-type">{op.type}</span>
                    {op.node && <span className="op-detail">→ {op.node.name}</span>}
                    {op.node_id && <span className="op-detail">→ {op.node_id}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {isStreaming && (
          <div className="message assistant streaming">
            <div className="message-header">
              <span className="message-role">🤖 AI</span>
            </div>
            <div className="message-content">
              {streamingContent ? (
                <>
                  <pre style={{
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    margin: 0,
                    padding: 0,
                    background: 'transparent'
                  }}>
                    {streamingContent}
                  </pre>
                  <span className="typing-cursor">▊</span>
                </>
              ) : (
                <span className="typing-indicator">Thinking...</span>
              )}
            </div>
            {operationStatus && (
              <div className="operation-status">
                {operationStatus}
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="ai-input-container">
        <input
          ref={inputRef}
          type="text"
          className="ai-input"
          placeholder={selectedNode
            ? `Ask about "${selectedNode.data.name}" or modify it...`
            : "Describe what you want to build or modify..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={isStreaming}
        />
        <button
          className="ai-send-btn"
          onClick={sendMessage}
          disabled={isStreaming || !input.trim()}
        >
          {isStreaming ? '⏳' : '📤 Send'}
        </button>
      </div>
    </div>
  );
};
