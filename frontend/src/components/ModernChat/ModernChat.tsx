import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, 
  Sparkles, 
  Bot, 
  User, 
  FileCode, 
  Copy, 
  Check,
  Zap,
  Brain,
  Code,
  ArrowRight,
  Loader2,
  Moon,
  Sun,
  Settings,
  Maximize2,
  MessageSquare,
  Activity
} from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './ModernChat.css';

interface Message {
  id: string;
  type: 'user' | 'agent' | 'system';
  content: string;
  agent?: string;
  timestamp: Date;
  status?: 'thinking' | 'typing' | 'complete';
  artifacts?: Artifact[];
}

interface Artifact {
  id: string;
  name: string;
  type: 'code' | 'file' | 'image';
  content: string;
  language?: string;
}

interface Agent {
  id: string;
  name: string;
  avatar: string;
  status: 'idle' | 'thinking' | 'working' | 'complete';
  color: string;
}

interface ModernChatProps {
  messages: Message[];
  agents: Agent[];
  onSendMessage: (message: string) => void;
  isStreaming?: boolean;
  theme?: 'light' | 'dark';
}

export const ModernChat: React.FC<ModernChatProps> = ({
  messages,
  agents,
  onSendMessage,
  isStreaming = false,
  theme = 'light'
}) => {
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(theme === 'dark');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (input.trim() && !isStreaming) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.setAttribute('data-theme', !isDarkMode ? 'dark' : 'light');
  };

  const getAgentColor = (agentName?: string) => {
    const agent = agents.find(a => a.name === agentName);
    return agent?.color || '#6366f1';
  };

  const getAgentAvatar = (agentName?: string) => {
    const agent = agents.find(a => a.name === agentName);
    return agent?.avatar || '🤖';
  };

  return (
    <div className={`modern-chat ${isDarkMode ? 'dark' : ''}`}>
      {/* Header */}
      <div className="modern-chat-header">
        <div className="header-left">
          <motion.div 
            className="logo-container"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Sparkles className="logo-icon" />
            <span className="logo-text">AI Swarm</span>
          </motion.div>

          {/* Active Agents */}
          <div className="active-agents">
            {agents.filter(a => a.status !== 'idle').map(agent => (
              <motion.div
                key={agent.id}
                className="agent-indicator"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                whileHover={{ scale: 1.1 }}
                style={{ background: agent.color }}
              >
                <span className="agent-avatar">{agent.avatar}</span>
                {agent.status === 'working' && (
                  <motion.div 
                    className="agent-pulse"
                    animate={{ scale: [1, 1.5, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  />
                )}
              </motion.div>
            ))}
          </div>
        </div>

        <div className="header-right">
          {/* Status Indicators */}
          <div className="status-indicators">
            {isStreaming && (
              <motion.div 
                className="status-badge streaming"
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                <Activity size={14} />
                <span>Streaming</span>
              </motion.div>
            )}
            <div className="status-badge connected">
              <Zap size={14} />
              <span>Connected</span>
            </div>
          </div>

          {/* Theme Toggle */}
          <motion.button
            className="theme-toggle"
            onClick={toggleTheme}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </motion.button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="modern-chat-messages custom-scrollbar">
        <AnimatePresence>
          {messages.map((message, index) => (
            <motion.div
              key={message.id}
              className={`message-container ${message.type}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              {message.type === 'user' ? (
                <div className="user-message">
                  <div className="message-content">
                    <p>{message.content}</p>
                  </div>
                  <div className="message-avatar">
                    <User size={20} />
                  </div>
                </div>
              ) : message.type === 'agent' ? (
                <div className="agent-message">
                  <motion.div 
                    className="agent-avatar-container"
                    style={{ background: getAgentColor(message.agent) }}
                    whileHover={{ scale: 1.1 }}
                  >
                    <span>{getAgentAvatar(message.agent)}</span>
                  </motion.div>
                  <div className="message-wrapper">
                    <div className="message-header">
                      <span className="agent-name">{message.agent}</span>
                      {message.status === 'thinking' && (
                        <motion.div 
                          className="thinking-indicator"
                          animate={{ opacity: [1, 0.5, 1] }}
                          transition={{ repeat: Infinity, duration: 1 }}
                        >
                          <Brain size={14} />
                          <span>Thinking...</span>
                        </motion.div>
                      )}
                    </div>
                    <div className="message-content">
                      {message.status === 'typing' ? (
                        <div className="typing-indicator">
                          <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }}>.</motion.span>
                          <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}>.</motion.span>
                          <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}>.</motion.span>
                        </div>
                      ) : (
                        <div className="message-text">
                          <p>{message.content}</p>
                          {message.artifacts && message.artifacts.length > 0 && (
                            <div className="artifacts-container">
                              {message.artifacts.map(artifact => (
                                <motion.div 
                                  key={artifact.id}
                                  className="artifact-card"
                                  whileHover={{ scale: 1.02 }}
                                  layout
                                >
                                  <div className="artifact-header">
                                    <div className="artifact-info">
                                      <FileCode size={16} />
                                      <span className="artifact-name">{artifact.name}</span>
                                    </div>
                                    <motion.button
                                      className="copy-button"
                                      onClick={() => copyToClipboard(artifact.content, artifact.id)}
                                      whileHover={{ scale: 1.1 }}
                                      whileTap={{ scale: 0.9 }}
                                    >
                                      {copiedId === artifact.id ? (
                                        <Check size={14} className="success" />
                                      ) : (
                                        <Copy size={14} />
                                      )}
                                    </motion.button>
                                  </div>
                                  {artifact.type === 'code' && (
                                    <div className="artifact-content">
                                      <SyntaxHighlighter
                                        language={artifact.language || 'javascript'}
                                        style={isDarkMode ? vscDarkPlus : vs}
                                        customStyle={{
                                          margin: 0,
                                          borderRadius: '8px',
                                          fontSize: '13px'
                                        }}
                                      >
                                        {artifact.content}
                                      </SyntaxHighlighter>
                                    </div>
                                  )}
                                </motion.div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="system-message">
                  <motion.div 
                    className="system-badge"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 500 }}
                  >
                    <Sparkles size={14} />
                    <span>{message.content}</span>
                  </motion.div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="modern-chat-input">
        <div className="input-container">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask your AI agents anything..."
            className="chat-input"
            disabled={isStreaming}
            rows={1}
          />
          <motion.button
            className="send-button"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {isStreaming ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <Send size={20} />
            )}
          </motion.button>
        </div>
        <div className="input-hints">
          <span className="hint">
            <Code size={12} />
            Press Enter to send
          </span>
          <span className="hint">
            <MessageSquare size={12} />
            Shift + Enter for new line
          </span>
        </div>
      </div>
    </div>
  );
};