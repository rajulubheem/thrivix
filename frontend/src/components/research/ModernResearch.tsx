/**
 * Modern Research Interface with Real-Time Agent Thinking
 * Shows agent reasoning, streaming results, and visual progress
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Brain, Zap, Search, ChevronRight, Loader2, Globe2, 
  MessageSquare, Sparkles, Activity, Eye, Code2, 
  Layers, Network, Bot, ChevronDown, Image as ImageIcon,
  FileText, Link2, TrendingUp, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStreamingResearch } from '../../hooks/useStreamingResearch';
import './ModernResearch.css';

interface AgentThought {
  id: string;
  type: 'reasoning' | 'tool_selection' | 'synthesis' | 'search';
  content: string;
  timestamp: Date;
  status: 'thinking' | 'completed' | 'active';
  iteration?: number;
}

interface StreamEvent {
  type: 'text' | 'thought' | 'tool' | 'source' | 'image' | 'complete';
  data: any;
}

interface SearchResult {
  sources: any[];
  images: any[];
  summary: string;
  thoughts: AgentThought[];
  iterations: number;
  confidence: number;
}

export default function ModernResearch() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [enableDeepMode, setEnableDeepMode] = useState(false);
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const [thoughts, setThoughts] = useState<AgentThought[]>([]);
  const [streamedContent, setStreamedContent] = useState('');
  const [sources, setSources] = useState<any[]>([]);
  const [images, setImages] = useState<any[]>([]);
  const [showThinking, setShowThinking] = useState(true);
  const [searchProgress, setSearchProgress] = useState(0);
  const contentEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to new content
  useEffect(() => {
    contentEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamedContent, thoughts]);

  // Use streaming research hook
  const { startStreaming, stopStreaming, isStreaming: isStreamingData } = useStreamingResearch({
    onThought: (thought) => {
      setThoughts(prev => [...prev, {
        ...thought,
        timestamp: new Date(),
        status: thought.status || 'active'
      }]);
    },
    onText: (text) => {
      setStreamedContent(prev => prev + text);
    },
    onSource: (source) => {
      setSources(prev => [...prev, source]);
    },
    onImage: (image) => {
      setImages(prev => [...prev, image]);
    },
    onProgress: (percentage) => {
      setSearchProgress(percentage);
    },
    onComplete: (data) => {
      setSearchProgress(100);
      setActiveAgents([]);
      setIsSearching(false);
    },
    onError: (error) => {
      console.error('Streaming error:', error);
      setStreamedContent(`Error: ${error}`);
      setIsSearching(false);
    }
  });

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    setThoughts([]);
    setStreamedContent('');
    setSources([]);
    setImages([]);
    setSearchProgress(0);
    setActiveAgents(['search', 'analyzer', 'synthesizer']);
    
    // Start real streaming
    await startStreaming(query, enableDeepMode);
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
          {!streamedContent && !isSearching && (
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
              />
              <div className="search-options">
                <button 
                  className={`deep-mode-toggle ${enableDeepMode ? 'active' : ''}`}
                  onClick={() => setEnableDeepMode(!enableDeepMode)}
                >
                  <Layers className="w-4 h-4" />
                  <span>Deep</span>
                </button>
                <button 
                  onClick={handleSearch}
                  disabled={isSearching || !query}
                  className="search-submit"
                >
                  {isSearching ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ChevronRight className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            {isSearching && (
              <div className="search-progress">
                <div 
                  className="progress-bar"
                  style={{ width: `${searchProgress}%` }}
                />
              </div>
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
          </motion.div>

          {/* Example Queries */}
          {!streamedContent && !isSearching && (
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
                    handleSearch();
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
        {(isSearching || streamedContent) && (
          <motion.div 
            className="results-section"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="results-layout">
              {/* Agent Thinking Panel */}
              <div className={`thinking-panel ${!showThinking ? 'collapsed' : ''}`}>
                <div className="panel-header">
                  <div className="panel-title">
                    <Brain className="w-4 h-4" />
                    <span>Agent Reasoning</span>
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
                          transition={{ delay: idx * 0.1 }}
                        >
                          <div className="thought-header">
                            <Activity className="w-3 h-3" />
                            <span className="thought-iteration">
                              Iteration {thought.iteration || 1}
                            </span>
                            <span className={`thought-status ${thought.status}`} />
                          </div>
                          <div className="thought-content">{thought.content}</div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* Main Results */}
              <div className="main-results">
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
                    <div className="answer-content">
                      {streamedContent}
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
                          <img src={img.url || img} alt={`Result ${idx + 1}`} />
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
                      <h3>Sources</h3>
                    </div>
                    <div className="sources-grid">
                      {sources.map((source, idx) => (
                        <motion.a
                          key={idx}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="source-card"
                          initial={{ x: -20, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ delay: idx * 0.05 }}
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