/**
 * Perplexity-style Research Interface Component
 * Clean, professional design with real-time search
 */
import React, { useState, useRef, useEffect } from 'react';
import { Search, Sparkles, Globe, TrendingUp, Clock, Image as ImageIcon, BookOpen, Newspaper, ChevronRight, X, ExternalLink, Share2, Copy, Bookmark } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useResearch } from '../../hooks/useResearch';
import './Research.css';

interface SearchSuggestion {
  id: string;
  text: string;
  type: 'recent' | 'trending' | 'suggested';
  icon?: React.ReactNode;
}

interface Source {
  id: string;
  title: string;
  url: string;
  snippet: string;
  favicon: string;
  domain: string;
  publishedDate?: string;
  thumbnail?: string;
  relevanceScore: number;
}

export default function ResearchInterface() {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [enableDeepResearch, setEnableDeepResearch] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [focusMode, setFocusMode] = useState<'all' | 'academic' | 'news' | 'reddit'>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { performResearch } = useResearch();

  // Realistic search suggestions
  const suggestions: SearchSuggestion[] = [
    { id: '1', text: 'TSLA stock news August 2025', type: 'trending', icon: <TrendingUp className="w-4 h-4" /> },
    { id: '2', text: 'Tesla Q2 2025 earnings report', type: 'trending', icon: <TrendingUp className="w-4 h-4" /> },
    { id: '3', text: 'Tesla latest product announcements', type: 'suggested', icon: <Sparkles className="w-4 h-4" /> },
    { id: '4', text: 'SpaceX Starship launch schedule', type: 'recent', icon: <Clock className="w-4 h-4" /> },
    { id: '5', text: 'AI breakthrough news today', type: 'trending', icon: <TrendingUp className="w-4 h-4" /> },
  ];

  const filteredSuggestions = suggestions.filter(s => 
    query.length > 0 ? s.text.toLowerCase().includes(query.toLowerCase()) : true
  );

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    setShowSuggestions(false);
    
    try {
      const result = await performResearch({
        query,
        mode: focusMode === 'all' ? 'comprehensive' : focusMode,
        depth: enableDeepResearch ? 'deep' : 'basic',
        maxAgents: enableDeepResearch ? 100 : 50,
        includeImages: true,
        includeCitations: true,
        verifyFacts: true,
        enableDeepResearch
      });
      
      setResults(result);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setShowSuggestions(false);
    setTimeout(() => handleSearch(), 100);
  };

  return (
    <div className="perplexity-container">
      {/* Clean Header */}
      <header className="perplexity-header">
        <div className="header-content">
          <div className="logo-section">
            <div className="logo">
              <Sparkles className="w-6 h-6" />
              <span className="logo-text">Thrivix</span>
            </div>
          </div>
          
          <div className="header-actions">
            <button className="pro-button">
              <Sparkles className="w-4 h-4" />
              Pro
            </button>
            <button className="signin-button">Sign In</button>
          </div>
        </div>
      </header>

      {/* Main Search Area */}
      <div className={`search-area ${results ? 'with-results' : 'centered'}`}>
        <div className="search-wrapper">
          {!results && (
            <div className="search-title">
              <h1>Where knowledge begins</h1>
              <p>Ask anything. Discover everything.</p>
            </div>
          )}

          {/* Search Box */}
          <div className="search-box-container">
            <div className={`search-box ${showSuggestions ? 'focused' : ''}`}>
              <Search className="search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch();
                  }
                }}
                placeholder="Ask anything..."
                className="search-input"
              />
              
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="clear-button"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              
              <button
                onClick={handleSearch}
                disabled={isSearching || !query}
                className="submit-button"
              >
                {isSearching ? (
                  <div className="loading-spinner" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
              </button>
            </div>

            {/* Focus Options */}
            <div className="focus-options">
              <span className="focus-label">Focus</span>
              <div className="focus-buttons">
                {[
                  { value: 'all', icon: <Globe className="w-4 h-4" />, label: 'All' },
                  { value: 'academic', icon: <BookOpen className="w-4 h-4" />, label: 'Academic' },
                  { value: 'news', icon: <Newspaper className="w-4 h-4" />, label: 'News' },
                  { value: 'reddit', icon: <span className="reddit-icon">R</span>, label: 'Reddit' }
                ].map(option => (
                  <button
                    key={option.value}
                    onClick={() => setFocusMode(option.value as any)}
                    className={`focus-button ${focusMode === option.value ? 'active' : ''}`}
                  >
                    {option.icon}
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Pro Search Toggle */}
            <div className="pro-search-toggle">
              <label className="toggle-container">
                <input
                  type="checkbox"
                  checked={enableDeepResearch}
                  onChange={(e) => setEnableDeepResearch(e.target.checked)}
                />
                <span className="toggle-slider"></span>
                <span className="toggle-label">
                  <Sparkles className="w-4 h-4" />
                  Pro Search
                </span>
              </label>
              {enableDeepResearch && (
                <span className="pro-badge">Enhanced with multi-step analysis</span>
              )}
            </div>

            {/* Search Suggestions Dropdown */}
            <AnimatePresence>
              {showSuggestions && !results && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="suggestions-dropdown"
                >
                  {filteredSuggestions.map(suggestion => (
                    <button
                      key={suggestion.id}
                      onClick={() => handleSuggestionClick(suggestion.text)}
                      className="suggestion-item"
                    >
                      <span className="suggestion-icon">
                        {suggestion.icon || <Search className="w-4 h-4" />}
                      </span>
                      <span className="suggestion-text">{suggestion.text}</span>
                      <span className="suggestion-type">
                        {suggestion.type === 'trending' && 'Trending'}
                        {suggestion.type === 'recent' && 'Recent'}
                        {suggestion.type === 'suggested' && 'Suggested'}
                      </span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <AnimatePresence>
        {results && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="results-section"
          >
            <div className="results-container">
              {/* Answer Section */}
              <div className="answer-section">
                <div className="answer-header">
                  <h2 className="answer-title">Answer</h2>
                  <div className="answer-actions">
                    <button className="action-button">
                      <Copy className="w-4 h-4" />
                    </button>
                    <button className="action-button">
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button className="action-button">
                      <Bookmark className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="answer-content">
                  <p>{results.summary}</p>
                </div>

                {/* Images Grid */}
                {results.images && results.images.length > 0 && (
                  <div className="images-section">
                    <h3 className="section-title">
                      <ImageIcon className="w-4 h-4" />
                      Images
                    </h3>
                    <div className="images-grid">
                      {results.images.slice(0, 4).map((img: any, idx: number) => (
                        <div key={idx} className="image-item">
                          <img 
                            src={img.url || img} 
                            alt={`Result ${idx + 1}`}
                            onError={(e: any) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sources Cards */}
                <div className="sources-section">
                  <h3 className="section-title">Sources</h3>
                  <div className="sources-list">
                    {results.sources?.slice(0, 8).map((source: Source, idx: number) => (
                      <a
                        key={source.id}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="source-card"
                      >
                        <div className="source-number">{idx + 1}</div>
                        <div className="source-content">
                          <div className="source-header">
                            <img 
                              src={`https://www.google.com/s2/favicons?domain=${source.domain}&sz=32`}
                              alt=""
                              className="source-favicon"
                              onError={(e: any) => {
                                e.target.style.display = 'none';
                              }}
                            />
                            <span className="source-domain">{source.domain}</span>
                            <ExternalLink className="w-3 h-3 external-icon" />
                          </div>
                          <h4 className="source-title">{source.title}</h4>
                          <p className="source-snippet">{source.snippet}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>

                {/* Related Searches */}
                {results.followUpQuestions && results.followUpQuestions.length > 0 && (
                  <div className="related-section">
                    <h3 className="section-title">Related</h3>
                    <div className="related-list">
                      {results.followUpQuestions.map((question: string, idx: number) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setQuery(question);
                            handleSearch();
                          }}
                          className="related-item"
                        >
                          <Search className="w-4 h-4" />
                          <span>{question}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar */}
              <div className="results-sidebar">
                <div className="sidebar-card">
                  <h3>Ask follow-up</h3>
                  <p>Get more specific information about your search</p>
                  <div className="follow-up-input">
                    <input
                      type="text"
                      placeholder="Ask a follow-up question..."
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value) {
                          setQuery(e.currentTarget.value);
                          handleSearch();
                        }
                      }}
                    />
                  </div>
                </div>

                {enableDeepResearch && (
                  <div className="sidebar-card pro-card">
                    <Sparkles className="w-5 h-5" />
                    <h3>Pro Search Active</h3>
                    <p>Using advanced multi-step analysis</p>
                    <ul className="pro-features">
                      <li>✓ Deep research mode</li>
                      <li>✓ Multiple perspectives</li>
                      <li>✓ Enhanced accuracy</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Example Queries (when no search) */}
      {!results && !isSearching && (
        <div className="examples-section">
          <h2>Try asking about</h2>
          <div className="examples-grid">
            <button
              onClick={() => handleSuggestionClick('Latest TSLA stock news and analysis')}
              className="example-card"
            >
              <TrendingUp className="w-5 h-5" />
              <span>Latest TSLA stock news and analysis</span>
            </button>
            <button
              onClick={() => handleSuggestionClick('AI breakthroughs in 2024')}
              className="example-card"
            >
              <Sparkles className="w-5 h-5" />
              <span>AI breakthroughs in 2024</span>
            </button>
            <button
              onClick={() => handleSuggestionClick('SpaceX Starship latest updates')}
              className="example-card"
            >
              <Globe className="w-5 h-5" />
              <span>SpaceX Starship latest updates</span>
            </button>
            <button
              onClick={() => handleSuggestionClick('Climate change solutions 2025')}
              className="example-card"
            >
              <BookOpen className="w-5 h-5" />
              <span>Climate change solutions 2025</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}