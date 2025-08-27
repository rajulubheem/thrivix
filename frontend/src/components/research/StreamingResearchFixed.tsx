/**
 * Fixed Streaming Research Interface with Pure Real-Time Updates
 * No accumulated results - only real-time streaming
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Brain, Zap, Search, ChevronRight, Loader2, Globe2, 
  MessageSquare, Sparkles, Activity, Code2, 
  Layers, Network, Bot, ChevronDown, Image as ImageIcon,
  Link2, TrendingUp, AlertCircle, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
// @ts-ignore
import remarkGfm from 'remark-gfm';
import './ModernResearch.css';

interface AgentThought {
  id: string;
  type: 'reasoning' | 'tool_selection' | 'synthesis' | 'search';
  content: string;
  timestamp: Date;
  status: 'thinking' | 'completed' | 'active';
  iteration?: number;
}

export default function StreamingResearchFixed() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [enableDeepMode, setEnableDeepMode] = useState(false);
  const [thoughts, setThoughts] = useState<AgentThought[]>([]);
  const [streamedContent, setStreamedContent] = useState('');
  const [sources, setSources] = useState<any[]>([]);
  const [images, setImages] = useState<any[]>([]);
  const [showThinking, setShowThinking] = useState(true);
  const [searchProgress, setSearchProgress] = useState(0);
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [totalIterations, setTotalIterations] = useState(0);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const contentEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to new content
  useEffect(() => {
    contentEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamedContent, thoughts]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleSearch = async () => {
    if (!query.trim() || isSearching) return;
    
    // Reset ALL state completely
    setIsSearching(true);
    setError(null);
    setThoughts([]);
    setStreamedContent(''); // Clear any previous content
    setSources([]);
    setImages([]);
    setSearchProgress(0);
    setCurrentIteration(0);
    setTotalIterations(enableDeepMode ? 5 : 1);
    setActiveAgents(['search', 'analyzer', 'synthesizer']);
    
    // Abort any existing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      console.log(`Starting ${enableDeepMode ? 'DEEP' : 'standard'} search:`, query);
      
      const response = await fetch(`${apiUrl}/api/v1/research/stream-realtime`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          enable_deep_research: enableDeepMode,
          stream: true
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';
      let eventCount = 0;
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('Stream complete. Total events:', eventCount);
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            
            if (data === '[DONE]') {
              console.log('Received DONE signal');
              setIsSearching(false);
              setSearchProgress(100);
              setActiveAgents([]);
              break;
            }
            
            try {
              const event = JSON.parse(data);
              eventCount++;
              
              // Process events
              switch (event.type) {
                case 'init':
                  console.log('Stream initialized');
                  break;
                  
                case 'thought':
                  const thought: AgentThought = {
                    id: event.data.id,
                    type: event.data.type,
                    content: event.data.content,
                    timestamp: new Date(),
                    status: event.data.status || 'active',
                    iteration: event.data.iteration
                  };
                  setThoughts(prev => [...prev, thought]);
                  
                  // Update current iteration
                  if (event.data.iteration) {
                    setCurrentIteration(event.data.iteration);
                  }
                  break;
                  
                case 'text':
                  // Append text character by character for streaming effect
                  setStreamedContent(prev => prev + event.data);
                  break;
                  
                case 'source':
                  // Add source to list
                  setSources(prev => {
                    // Avoid duplicates
                    const exists = prev.some(s => s.id === event.data.id);
                    if (exists) return prev;
                    return [...prev, event.data];
                  });
                  break;
                  
                case 'image':
                  setImages(prev => [...prev, event.data]);
                  break;
                  
                case 'progress':
                  setSearchProgress(event.data.percentage || 0);
                  if (event.data.iteration) {
                    setCurrentIteration(event.data.iteration);
                  }
                  if (event.data.total) {
                    setTotalIterations(event.data.total);
                  }
                  break;
                  
                case 'complete':
                  console.log('Research complete:', event.data);
                  setIsSearching(false);
                  setSearchProgress(100);
                  setActiveAgents([]);
                  break;
                  
                case 'error':
                  throw new Error(event.data);
                  
                default:
                  console.log('Unknown event type:', event.type);
              }
            } catch (e) {
              console.error('Failed to parse event:', e, 'Line:', line);
            }
          }
        }
      }
      
      console.log('Streaming completed successfully');
      
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Search error:', err);
        setError(err.message || 'Search failed. Please try again.');
        setStreamedContent('');
        setThoughts([]);
        setSources([]);
      }
    } finally {
      setIsSearching(false);
      setActiveAgents([]);
      if (searchProgress < 100) {
        setSearchProgress(100);
      }
    }
  };

  const stopSearch = () => {
    console.log('Stopping search...');
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsSearching(false);
    setActiveAgents([]);
    setSearchProgress(100);
  };

  const exampleQueries = [
    { icon: <TrendingUp className="w-4 h-4" />, text: "Latest TSLA stock analysis", color: "from-green-500 to-emerald-500" },
    { icon: <Brain className="w-4 h-4" />, text: "AI breakthroughs 2024", color: "from-purple-500 to-pink-500" },
    { icon: <Globe2 className="w-4 h-4" />, text: "Climate technology innovations", color: "from-blue-500 to-cyan-500" },
    { icon: <Zap className="w-4 h-4" />, text: "Quantum computing advances", color: "from-orange-500 to-red-500" }
  ];

  return (
    <div className="modern-research-container">
      {/* Animated Background */}
      <div className="animated-bg">
        <div className="gradient-orb orb-1" />
        <div className="gradient-orb orb-2" />
        <div className="gradient-orb orb-3" />
      </div>

      {/* Header */}
      <header className="research-header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-icon">
              <Network className="w-6 h-6" />
            </div>
            <span className="brand-name">Strands AI</span>
            <span className="brand-tag">Research Lab</span>
          </div>
          
          <div className="header-controls">
            <button className="glass-button">
              <Code2 className="w-4 h-4" />
              <span>API</span>
            </button>
            <button className="primary-button">
              <Sparkles className="w-4 h-4" />
              <span>Upgrade</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="research-main">
        <div className="search-section">
          {!streamedContent && !isSearching && thoughts.length === 0 && (
            <motion.div 
              className="hero-content"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h1 className="hero-title">
                <span className="gradient-text">Intelligent Research</span>
                <br />
                with Multi-Agent Reasoning
              </h1>
              <p className="hero-subtitle">
                Watch AI agents think, reason, and collaborate in real-time
              </p>
            </motion.div>
          )}

          {/* Search Bar */}
          <motion.div 
            className="search-container"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <div className={`search-box ${isSearching ? 'searching' : ''}`}>
              <Search className="search-icon" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Ask anything... I'll show you how I think"
                className="search-input"
                disabled={isSearching}
              />
              <div className="search-options">
                <button 
                  className={`deep-mode-toggle ${enableDeepMode ? 'active' : ''}`}
                  onClick={() => setEnableDeepMode(!enableDeepMode)}
                  disabled={isSearching}
                  title="Enable multi-iteration deep research"
                >
                  <Layers className="w-4 h-4" />
                  <span>Deep</span>
                </button>
                {isSearching ? (
                  <button onClick={stopSearch} className="search-submit stop-button" title="Stop search">
                    <X className="w-5 h-5" />
                  </button>
                ) : (
                  <button 
                    onClick={handleSearch}
                    disabled={!query}
                    className="search-submit"
                    title="Start search"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Progress Bar with Iteration Info */}
            {isSearching && (
              <>
                <div className="search-progress">
                  <div 
                    className="progress-bar"
                    style={{ width: `${searchProgress}%` }}
                  />
                </div>
                {enableDeepMode && currentIteration > 0 && (
                  <div className="iteration-info">
                    Iteration {currentIteration} of {totalIterations}
                  </div>
                )}
              </>
            )}

            {/* Active Agents */}
            {activeAgents.length > 0 && (
              <div className="active-agents">
                {activeAgents.map(agent => (
                  <motion.div
                    key={agent}
                    className="agent-badge"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                  >
                    <Bot className="w-3 h-3" />
                    <span>{agent}</span>
                    <span className="agent-status" />
                  </motion.div>
                ))}
              </div>
            )}

            {/* Error Display */}
            {error && (
              <motion.div 
                className="error-message"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
                <button onClick={() => setError(null)} className="ml-2">
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </motion.div>

          {/* Example Queries - Only show when no results */}
          {!streamedContent && !isSearching && thoughts.length === 0 && (
            <motion.div 
              className="example-queries"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {exampleQueries.map((example, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setQuery(example.text);
                    setTimeout(handleSearch, 100);
                  }}
                  className="example-card"
                >
                  <div className={`example-icon bg-gradient-to-br ${example.color}`}>
                    {example.icon}
                  </div>
                  <span>{example.text}</span>
                </button>
              ))}
            </motion.div>
          )}
        </div>

        {/* Results Section */}
        {(isSearching || streamedContent || thoughts.length > 0) && (
          <motion.div 
            className="results-section"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="results-layout">
              {/* Agent Thinking Panel */}
              {thoughts.length > 0 && (
                <div className={`thinking-panel ${!showThinking ? 'collapsed' : ''}`}>
                  <div className="panel-header">
                    <div className="panel-title">
                      <Brain className="w-4 h-4" />
                      <span>Agent Reasoning</span>
                      <span className="thought-count">({thoughts.length})</span>
                    </div>
                    <button 
                      onClick={() => setShowThinking(!showThinking)}
                      className="toggle-button"
                    >
                      <ChevronDown className={`w-4 h-4 ${!showThinking ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  
                  {showThinking && (
                    <div className="thoughts-stream">
                      <AnimatePresence>
                        {thoughts.map((thought, idx) => (
                          <motion.div
                            key={thought.id}
                            className={`thought-item ${thought.type}`}
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: idx * 0.05 }}
                          >
                            <div className="thought-header">
                              <Activity className="w-3 h-3" />
                              {thought.iteration && (
                                <span className="thought-iteration">
                                  Iteration {thought.iteration}
                                </span>
                              )}
                              <span className={`thought-status ${thought.status}`} />
                            </div>
                            <div className="thought-content">{thought.content}</div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              )}

              {/* Main Results */}
              <div className="main-results">
                {/* Only show content if we have streamed text */}
                {streamedContent && (
                  <motion.div 
                    className="answer-section"
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                  >
                    <div className="answer-header">
                      <MessageSquare className="w-5 h-5" />
                      <h2>Answer</h2>
                    </div>
                    <div className="answer-content markdown-content">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({children}) => <h1 className="text-2xl font-bold mb-4 text-white">{children}</h1>,
                          h2: ({children}) => <h2 className="text-xl font-bold mb-3 text-white">{children}</h2>,
                          h3: ({children}) => <h3 className="text-lg font-semibold mb-2 text-white">{children}</h3>,
                          p: ({children}) => <p className="mb-3 text-gray-200 leading-relaxed">{children}</p>,
                          ul: ({children}) => <ul className="list-disc pl-6 mb-3 text-gray-200">{children}</ul>,
                          ol: ({children}) => <ol className="list-decimal pl-6 mb-3 text-gray-200">{children}</ol>,
                          li: ({children}) => <li className="mb-1">{children}</li>,
                          strong: ({children}) => <strong className="font-bold text-cyan-400">{children}</strong>,
                          em: ({children}) => <em className="italic text-purple-400">{children}</em>,
                          code: ({children, ...props}: any) => {
                            const inline = props.inline || !String(children).includes('\n');
                            return inline ? 
                              <code className="px-1 py-0.5 bg-gray-800 text-green-400 rounded text-sm">{children}</code> :
                              <pre className="bg-gray-900 p-3 rounded-lg overflow-x-auto mb-3">
                                <code className="text-green-400 text-sm">{children}</code>
                              </pre>
                          },
                          blockquote: ({children}) => 
                            <blockquote className="border-l-4 border-cyan-500 pl-4 italic text-gray-300 my-3">{children}</blockquote>,
                        }}
                      >
                        {streamedContent}
                      </ReactMarkdown>
                      {isSearching && <span className="cursor-blink">|</span>}
                    </div>
                  </motion.div>
                )}

                {/* Image Results */}
                {images.length > 0 && (
                  <motion.div 
                    className="images-section"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <div className="section-header">
                      <ImageIcon className="w-5 h-5" />
                      <h3>Visual Results</h3>
                    </div>
                    <div className="images-grid">
                      {images.slice(0, 6).map((img, idx) => (
                        <motion.div 
                          key={idx}
                          className="image-card"
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: idx * 0.05 }}
                        >
                          <img 
                            src={img.url || img} 
                            alt={`Result ${idx + 1}`}
                            onError={(e: any) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Sources */}
                {sources.length > 0 && (
                  <motion.div 
                    className="sources-section"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <div className="section-header">
                      <Link2 className="w-5 h-5" />
                      <h3>Sources ({sources.length})</h3>
                    </div>
                    <div className="sources-grid">
                      {sources.map((source, idx) => (
                        <motion.a
                          key={source.id || idx}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="source-card"
                          initial={{ x: -20, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ delay: idx * 0.02 }}
                        >
                          <div className="source-number">{idx + 1}</div>
                          <div className="source-info">
                            <div className="source-title">{source.title}</div>
                            <div className="source-domain">{source.domain}</div>
                          </div>
                        </motion.a>
                      ))}
                    </div>
                  </motion.div>
                )}

                <div ref={contentEndRef} />
              </div>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}