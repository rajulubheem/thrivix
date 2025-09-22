import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { ModernLayout } from '../components/layout/ModernLayout';
import './ProfessionalHomePage.css';

interface Feature {
  id: string;
  title: string;
  description: string;
  path: string;
  icon: string;
  category: 'research' | 'swarm' | 'workflow';
  status: 'production' | 'beta' | 'experimental';
  highlight?: boolean;
}

const features: Feature[] = [
  // Production-Ready Features
  {
    id: 'flow-pro',
    title: 'Flow Pro',
    description: 'Visual AI state machine designer with dynamic agent orchestration. Create complex workflows with drag-and-drop nodes and real-time execution monitoring.',
    path: '/flow-pro',
    icon: '🔄',
    category: 'workflow',
    status: 'production',
    highlight: true
  },
  {
    id: 'conversation',
    title: 'Research Assistant',
    description: 'Advanced conversational AI with web search, document analysis, and comprehensive research capabilities. Get detailed answers with source citations.',
    path: '/conversation',
    icon: '🔬',
    category: 'research',
    status: 'production',
    highlight: true
  },
  {
    id: 'swarm',
    title: 'Agent Swarm',
    description: 'Multi-agent collaboration system with specialized roles. Agents work together to solve complex problems, share context, and produce comprehensive results.',
    path: '/swarm',
    icon: '🐝',
    category: 'swarm',
    status: 'production',
    highlight: true
  },
  
  // Advanced Features
  {
    id: 'efficient-swarm',
    title: 'Efficient Swarm',
    description: 'High-performance WebSocket-based agent system with real-time streaming and minimal latency. Optimized for speed and resource efficiency.',
    path: '/efficient-swarm',
    icon: '⚡',
    category: 'swarm',
    status: 'production'
  },
  {
    id: 'flow',
    title: 'Flow Interface',
    description: 'Modern flow-based UI for agent orchestration. Visual task planning with intuitive controls and real-time status updates.',
    path: '/flow',
    icon: '🌊',
    category: 'workflow',
    status: 'production'
  },
  
  // Experimental Features
  {
    id: 'event-swarm',
    title: 'Event-Driven Swarm',
    description: 'Dynamic agent spawning based on task complexity. Agents automatically create specialists as needed with human-in-the-loop decisions.',
    path: '/event-swarm',
    icon: '📡',
    category: 'swarm',
    status: 'beta'
  },
  {
    id: 'true-dynamic-swarm',
    title: 'True Dynamic Swarm',
    description: 'Session-based architecture with persistent agent memory. Advanced context management and dynamic tool allocation.',
    path: '/true-dynamic-swarm',
    icon: '🧬',
    category: 'swarm',
    status: 'experimental'
  },
  {
    id: 'state-machine',
    title: 'State Machine',
    description: 'Design and execute complex state-based workflows. Visual state machine editor with transition management.',
    path: '/state-machine',
    icon: '🎯',
    category: 'workflow',
    status: 'beta'
  }
];

const stats = [
  { label: 'Strands Tools', value: 'Tavily Search', icon: '🔍', description: 'Web search & extraction' },
  { label: 'Agent System', value: 'Dynamic Swarm', icon: '🤖', description: 'Multi-agent orchestration' },
  { label: 'Architecture', value: 'Event-Driven', icon: '📡', description: 'Real-time streaming' },
  { label: 'Visualization', value: 'React Flow', icon: '🔄', description: 'Interactive workflows' }
];

export default function ProfessionalHomePage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'research' | 'swarm' | 'workflow'>('all');
  const [hoveredFeature, setHoveredFeature] = useState<string | null>(null);
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());

  // Smooth fade-in animation on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleSections(prev => new Set(prev).add(entry.target.id));
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
      }
    );

    // Observe all sections
    const sections = document.querySelectorAll('section[id]');
    sections.forEach(section => observer.observe(section));

    return () => {
      sections.forEach(section => observer.unobserve(section));
    };
  }, []);

  const filteredFeatures = selectedCategory === 'all' 
    ? features 
    : features.filter(f => f.category === selectedCategory);

  const highlightedFeatures = filteredFeatures.filter(f => f.highlight);
  const otherFeatures = filteredFeatures.filter(f => !f.highlight);

  return (
    <ModernLayout>
      <div className={`home-container ${theme}`}>
        <div className="home-scroll-wrapper">

      {/* Hero Section */}
      <section id="hero" className={`hero-section ${visibleSections.has('hero') ? 'section-fade-in' : ''}`}>
        <div className="hero-content">
          <div className="hero-badge">Powered by Strands Agents SDK</div>
          <h1 className="hero-title">
            Visual AI Workflow
            <span className="hero-gradient"> Orchestration Platform</span>
          </h1>
          <p className="hero-description">
            Build AI workflows visually. Orchestrate intelligent agents that search, analyze, and execute complex tasks.
            Powered by Strands Agents SDK with real-time collaboration.
          </p>
          <div className="hero-actions">
            <button 
              className="btn btn-primary btn-large"
              onClick={() => navigate('/flow-pro')}
            >
              <span>Launch Flow Pro</span>
              <span className="btn-icon">→</span>
            </button>
            <button 
              className="btn btn-secondary btn-large"
              onClick={() => navigate('/conversation')}
            >
              <span>Start Research</span>
              <span className="btn-icon">🔍</span>
            </button>
          </div>
        </div>

        {/* Animated Background */}
        <div className="hero-background">
          <div className="grid-pattern"></div>
          <div className="floating-orbs">
            <div className="orb orb-1"></div>
            <div className="orb orb-2"></div>
            <div className="orb orb-3"></div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section id="stats" className={`stats-section ${visibleSections.has('stats') ? 'section-fade-in' : ''}`}>
        <h2 className="section-title">Core Technologies</h2>
        <div className="stats-grid">
          {stats.map(stat => (
            <div key={stat.label} className="stat-card">
              <div className="stat-icon">{stat.icon}</div>
              <div className="stat-label">{stat.label}</div>
              <div className="stat-value">{stat.value}</div>
              {stat.description && (
                <div className="stat-description">{stat.description}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Category Filter */}
      <section className="filter-section">
        <div className="filter-container">
          <h2 className="section-title">Explore Our Features</h2>
          <div className="filter-buttons">
            <button 
              className={`filter-btn ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              All Features
            </button>
            <button 
              className={`filter-btn ${selectedCategory === 'research' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('research')}
            >
              🔬 Research
            </button>
            <button 
              className={`filter-btn ${selectedCategory === 'swarm' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('swarm')}
            >
              🐝 Swarm Systems
            </button>
            <button 
              className={`filter-btn ${selectedCategory === 'workflow' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('workflow')}
            >
              🔄 Workflows
            </button>
          </div>
        </div>
      </section>

      {/* Featured Tools */}
      {highlightedFeatures.length > 0 && (
        <section className="featured-section">
          <h2 className="section-title">Featured Tools</h2>
          <div className="featured-grid">
            {highlightedFeatures.map(feature => (
              <div
                key={feature.id}
                className={`feature-card featured ${hoveredFeature === feature.id ? 'hovered' : ''}`}
                onMouseEnter={() => setHoveredFeature(feature.id)}
                onMouseLeave={() => setHoveredFeature(null)}
                onClick={() => navigate(feature.path)}
              >
                <div className="feature-header">
                  <span className="feature-icon">{feature.icon}</span>
                  <span className={`status-badge status-${feature.status}`}>
                    {feature.status}
                  </span>
                </div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-description">{feature.description}</p>
                <div className="feature-footer">
                  <span className="feature-action">
                    Launch {feature.title}
                    <span className="action-arrow">→</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Other Tools */}
      {otherFeatures.length > 0 && (
        <section className="tools-section">
          <h2 className="section-title">
            {highlightedFeatures.length > 0 ? 'More Tools' : 'Available Tools'}
          </h2>
          <div className="tools-grid">
            {otherFeatures.map(feature => (
              <div
                key={feature.id}
                className={`feature-card ${hoveredFeature === feature.id ? 'hovered' : ''}`}
                onMouseEnter={() => setHoveredFeature(feature.id)}
                onMouseLeave={() => setHoveredFeature(null)}
                onClick={() => navigate(feature.path)}
              >
                <div className="feature-header">
                  <span className="feature-icon">{feature.icon}</span>
                  <span className={`status-badge status-${feature.status}`}>
                    {feature.status}
                  </span>
                </div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-description">{feature.description}</p>
                <div className="feature-footer">
                  <span className="feature-action">
                    Open
                    <span className="action-arrow">→</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Capabilities Section */}
      <section className="capabilities-section">
        <h2 className="section-title">Strands Agents Features</h2>
        <div className="capabilities-grid">
          <div className="capability-card">
            <div className="capability-icon">🔧</div>
            <h3>Strands Tools</h3>
            <ul className="capability-list">
              <li>Tavily web search & extraction</li>
              <li>Dynamic tool loading</li>
              <li>Tool preferences management</li>
              <li>Custom tool integration</li>
            </ul>
          </div>
          <div className="capability-card">
            <div className="capability-icon">🎯</div>
            <h3>State Machines</h3>
            <ul className="capability-list">
              <li>AI-generated workflows</li>
              <li>Visual state transitions</li>
              <li>Event-driven execution</li>
              <li>Human-in-the-loop decisions</li>
            </ul>
          </div>
          <div className="capability-card">
            <div className="capability-icon">🌊</div>
            <h3>Streaming & Events</h3>
            <ul className="capability-list">
              <li>WebSocket real-time updates</li>
              <li>Server-sent events (SSE)</li>
              <li>Token streaming</li>
              <li>Control frame handling</li>
            </ul>
          </div>
          <div className="capability-card">
            <div className="capability-icon">📊</div>
            <h3>Visualization</h3>
            <ul className="capability-list">
              <li>React Flow diagrams</li>
              <li>Dagre auto-layout</li>
              <li>Live execution tracking</li>
              <li>Tool usage indicators</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Technology Stack */}
      <section className="tech-section">
        <h2 className="section-title">Architecture & Implementation</h2>
        <div className="tech-grid">
          <div className="tech-item">
            <span className="tech-label">AI Framework</span>
            <span className="tech-value">Strands Agents SDK</span>
          </div>
          <div className="tech-item">
            <span className="tech-label">Search Tool</span>
            <span className="tech-value">Tavily API</span>
          </div>
          <div className="tech-item">
            <span className="tech-label">Backend</span>
            <span className="tech-value">FastAPI + Asyncio</span>
          </div>
          <div className="tech-item">
            <span className="tech-label">Frontend</span>
            <span className="tech-value">React + TypeScript</span>
          </div>
          <div className="tech-item">
            <span className="tech-label">Streaming</span>
            <span className="tech-value">WebSocket + SSE</span>
          </div>
          <div className="tech-item">
            <span className="tech-label">Flow Visualization</span>
            <span className="tech-value">React Flow + Dagre</span>
          </div>
          <div className="tech-item">
            <span className="tech-label">Event System</span>
            <span className="tech-value">Redis Pub/Sub</span>
          </div>
          <div className="tech-item">
            <span className="tech-label">Tool Registry</span>
            <span className="tech-value">Dynamic Loading</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="home-footer">
        <div className="footer-content">
          <div className="footer-section">
            <h4>Thrivix AI Platform</h4>
            <p>Advanced multi-agent intelligence system for research, automation, and workflow orchestration.</p>
          </div>
          <div className="footer-section">
            <h4>Quick Links</h4>
            <div className="footer-links">
              <button onClick={() => navigate('/flow-pro')}>Flow Pro</button>
              <button onClick={() => navigate('/conversation')}>Research</button>
              <button onClick={() => navigate('/swarm')}>Agent Swarm</button>
              <button onClick={() => navigate('/settings')}>Settings</button>
            </div>
          </div>
          <div className="footer-section">
            <h4>Technology</h4>
            <p>Powered by Strands Agents framework with advanced tool integration and real-time streaming capabilities.</p>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2024 Thrivix AI Platform - Building the future of intelligent automation</p>
        </div>
      </footer>
        </div>
      </div>
    </ModernLayout>
  );
}