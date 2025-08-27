import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Brain, MessageSquare, Settings, Moon, Sun, 
  Github, Network, Home
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import './Navigation.css';

interface NavigationProps {
  showBackButton?: boolean;
}

const Navigation: React.FC<NavigationProps> = ({ showBackButton = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="unified-nav">
      <div className="nav-container">
        <div className="nav-brand" onClick={() => navigate('/')}>
          <Brain className="brand-icon" />
          <span className="brand-name">Thrivix</span>
        </div>
        
        <div className="nav-links">
          {showBackButton ? (
            <button 
              onClick={() => navigate('/')}
              className="nav-link nav-back"
            >
              <Home size={18} />
              <span>Home</span>
            </button>
          ) : (
            <>
              <button 
                onClick={() => navigate('/conversation')} 
                className={`nav-link ${isActive('/conversation') ? 'active' : ''}`}
              >
                <MessageSquare size={18} />
                <span>Research</span>
              </button>
              <button 
                onClick={() => navigate('/swarm')} 
                className={`nav-link ${isActive('/swarm') ? 'active' : ''}`}
              >
                <Network size={18} />
                <span>Swarm</span>
              </button>
            </>
          )}
          
          <div className="nav-divider" />
          
          <button 
            onClick={() => navigate('/settings')} 
            className={`nav-link icon-only ${isActive('/settings') ? 'active' : ''}`}
            title="Settings"
          >
            <Settings size={18} />
          </button>
          
          <button 
            onClick={toggleTheme} 
            className="nav-link icon-only theme-btn"
            title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          
          <a 
            href="https://github.com" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="nav-link icon-only"
            title="GitHub"
          >
            <Github size={18} />
          </a>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;