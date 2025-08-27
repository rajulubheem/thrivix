import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  MessageSquare, ArrowRight, Sparkles, Network,
  Search, Bot, Zap, Shield
} from 'lucide-react';
import PageLayout from '../components/layout/PageLayout';
import './HomePage.css';

const HomePage: React.FC = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: <MessageSquare size={32} />,
      title: 'AI Research Assistant',
      description: 'Advanced conversational AI with real-time web search, source tracking, and citation management',
      path: '/conversation',
      color: 'purple',
      badge: 'Enhanced'
    },
    {
      icon: <Network size={32} />,
      title: 'Agent Swarm',
      description: 'Orchestrate multiple specialized AI agents working together to solve complex problems',
      path: '/swarm',
      color: 'blue',
      badge: 'Advanced'
    },
    {
      icon: <Bot size={32} />,
      title: 'True Swarm Intelligence',
      description: 'Autonomous agent collaboration with emergent behavior using native Swarm pattern',
      path: '/true-swarm',
      color: 'green',
      badge: 'True AI'
    }
  ];

  const capabilities = [
    { icon: <Search />, text: 'Real-time Web Search' },
    { icon: <Bot />, text: 'Multi-Agent Orchestration' },
    { icon: <Zap />, text: 'Lightning Fast Responses' },
    { icon: <Shield />, text: 'Source Verification' }
  ];

  return (
    <PageLayout>
      <div className="homepage">

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-badge">
            <Sparkles size={16} />
            <span>Powered by Strands AI</span>
          </div>
          
          <h1 className="hero-title">
            Thrivix Research & 
            <span className="gradient-text"> Intelligence Platform</span>
          </h1>
          
          <p className="hero-description">
            Professional intelligence platform for real-time research, 
            multi-agent collaboration, and data-driven decision making.
          </p>

          <div className="capability-grid">
            {capabilities.map((cap, idx) => (
              <div key={idx} className="capability-item">
                {cap.icon}
                <span>{cap.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="features-section">
        <div className="features-container">
          <h2 className="section-title">Choose Your Experience</h2>
          
          <div className="features-grid">
            {features.map((feature, idx) => (
              <div 
                key={idx}
                className={`feature-card feature-${feature.color}`}
                onClick={() => navigate(feature.path)}
              >
                {feature.badge && (
                  <span className="feature-badge">{feature.badge}</span>
                )}
                
                <div className="feature-icon">
                  {feature.icon}
                </div>
                
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-description">{feature.description}</p>
                
                <button className="feature-button">
                  Launch <ArrowRight size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="homepage-footer">
        <div className="footer-content">
          <p>© 2025 Thrivix. Professional intelligence platform powered by Strands AI.</p>
          <div className="footer-links">
            <button onClick={() => navigate('/settings')}>Settings</button>
            <span>•</span>
            <button onClick={() => navigate('/about')}>About</button>
            <span>•</span>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
        </div>
      </footer>
      </div>
    </PageLayout>
  );
};

export default HomePage;
