import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Brain, Search, Zap, Shuffle, Target, Lightbulb } from 'lucide-react';
import './ThoughtsPanel.css';

interface Thought {
  type: string;
  content: string;
  timestamp: string;
}

interface ThoughtsPanelProps {
  thoughts: Thought[];
  isSearching: boolean;
}

export default function ThoughtsPanel({ thoughts, isSearching }: ThoughtsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [autoHide, setAutoHide] = useState(true);
  const thoughtsEndRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to latest thought
  useEffect(() => {
    if (thoughtsEndRef.current && isExpanded) {
      thoughtsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [thoughts, isExpanded]);

  // Auto-hide when not active
  useEffect(() => {
    if (autoHide && thoughts.length > 0) {
      // Clear existing timeout
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }

      // Set new timeout to auto-hide after 5 seconds of inactivity
      if (isExpanded && !isSearching) {
        hideTimeoutRef.current = setTimeout(() => {
          setIsExpanded(false);
        }, 5000);
      }
    }

    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [thoughts, autoHide, isExpanded, isSearching]);

  // Auto-expand when new thoughts arrive
  useEffect(() => {
    if (thoughts.length > 0 && isSearching) {
      setIsExpanded(true);
    }
  }, [thoughts.length, isSearching]);

  const getThoughtIcon = (type: string) => {
    switch (type) {
      case 'planning':
        return <Target className="thought-icon planning" size={14} />;
      case 'analyzing':
        return <Brain className="thought-icon analyzing" size={14} />;
      case 'searching':
        return <Search className="thought-icon searching" size={14} />;
      case 'evaluating':
        return <Zap className="thought-icon evaluating" size={14} />;
      case 'synthesizing':
        return <Shuffle className="thought-icon synthesizing" size={14} />;
      case 'deciding':
        return <Lightbulb className="thought-icon deciding" size={14} />;
      default:
        return <Brain className="thought-icon general" size={14} />;
    }
  };

  const formatThought = (thought: Thought) => {
    // Highlight special patterns in thoughts
    let content = thought.content;
    
    // Highlight tool calls
    content = content.replace(
      /use_llm_fixed\([^)]+\)/g,
      '<span class="tool-call">$&</span>'
    );
    
    // Highlight searches
    content = content.replace(
      /tavily_search\([^)]+\)/g,
      '<span class="search-call">$&</span>'
    );
    
    // Highlight step markers
    content = content.replace(
      /(Step \d+:|STEP \d+:)/gi,
      '<span class="step-marker">$1</span>'
    );
    
    // Highlight analysis markers
    content = content.replace(
      /(Analysis:|Synthesis:|Pattern:|Finding:|Conclusion:)/gi,
      '<span class="analysis-marker">$1</span>'
    );
    
    return content;
  };

  if (thoughts.length === 0 && !isSearching) {
    return null;
  }

  return (
    <div className={`thoughts-panel ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="thoughts-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="thoughts-title">
          <Brain className="header-icon" size={16} />
          <span>Agent Thoughts</span>
          <span className="thought-count">{thoughts.length}</span>
          {isSearching && <span className="live-indicator">LIVE</span>}
        </div>
        <div className="thoughts-controls">
          <label className="auto-hide-toggle">
            <input
              type="checkbox"
              checked={autoHide}
              onChange={(e) => setAutoHide(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
            />
            <span>Auto-hide</span>
          </label>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>
      
      {isExpanded && (
        <div className="thoughts-content">
          <div className="thoughts-list">
            {thoughts.map((thought, index) => (
              <div
                key={`${thought.timestamp}-${index}`}
                className={`thought-item ${thought.type}`}
                style={{
                  animationDelay: `${index * 0.05}s`
                }}
              >
                <div className="thought-header">
                  {getThoughtIcon(thought.type)}
                  <span className="thought-type">{thought.type.toUpperCase()}</span>
                  <span className="thought-time">
                    {new Date(thought.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div 
                  className="thought-content"
                  dangerouslySetInnerHTML={{ __html: formatThought(thought) }}
                />
              </div>
            ))}
            <div ref={thoughtsEndRef} />
          </div>
          
          {isSearching && (
            <div className="thinking-indicator">
              <div className="thinking-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span>Agent is thinking...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}