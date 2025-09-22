import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Home, 
  Bot, 
  MessageSquare, 
  Settings, 
  Moon, 
  Sun,
  Brain,
  Users,
  Activity,
  ChevronRight,
  Workflow,
  Zap,
  Network,
  Wrench,
  Sparkles
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../contexts/ThemeContext';
import './ModernLayout.css';

interface ModernLayoutProps {
  children: React.ReactNode;
}

const navigationItems = [
  {
    title: '🏠 Home',
    href: '/',
    icon: Home,
    description: 'Return to dashboard',
    isHome: true
  },
  {
    title: 'Flow Pro',
    href: '/flow-pro',
    icon: Workflow,
    description: 'Visual AI state machine designer',
    badge: 'Featured'
  },
  {
    title: 'Research',
    href: '/conversation',
    icon: Brain,
    description: 'Advanced web research with Tavily',
    badge: 'Popular'
  },
  {
    title: 'Agent Swarm',
    href: '/swarm',
    icon: Users,
    description: 'Multi-agent collaboration system',
    badge: 'Production'
  },
  {
    title: 'Efficient Swarm',
    href: '/efficient-swarm',
    icon: Zap,
    description: 'High-performance WebSocket agents'
  },
  {
    title: 'Flow Interface',
    href: '/flow',
    icon: Network,
    description: 'Modern flow-based orchestration'
  },
  {
    title: 'Event Swarm',
    href: '/event-swarm',
    icon: Activity,
    description: 'Dynamic agent spawning',
    badge: 'Beta'
  },
  {
    title: 'Tools Hub',
    href: '/swarm/tools',
    icon: Wrench,
    description: 'Manage available tools'
  },
  {
    title: 'Settings',
    href: '/settings',
    icon: Settings,
    description: 'Configure your workspace'
  }
];

export const ModernLayout: React.FC<ModernLayoutProps> = ({ children }) => {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className={`modern-layout-container ${theme}`}>
      {/* Sidebar */}
      <aside className="modern-sidebar">
        {/* Logo Section */}
        <div className="modern-sidebar-header">
          <Link to="/" className="modern-logo" title="Return to Home">
            <div className="modern-logo-icon">
              <Sparkles size={20} />
            </div>
            <span className="modern-logo-text">Thrivix AI</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="modern-nav-container">
          {navigationItems.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            
            return (
              <Link key={item.href} to={item.href} className="modern-nav-item">
                <div className={`modern-nav-link ${isActive ? 'active' : ''}`}>
                  <Icon className="modern-nav-icon" size={20} />
                  <span className="modern-nav-text">{item.title}</span>
                  {item.badge && (
                    <span className={`modern-nav-badge ${item.badge.toLowerCase().replace(' ', '-')}`}>
                      {item.badge}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Theme Toggle */}
        <div className="modern-sidebar-footer">
          <div className="theme-toggle-container">
            <span className="theme-toggle-label">Theme</span>
            <button
              onClick={toggleTheme}
              className="theme-toggle-btn"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="modern-main-content">
        {children}
      </main>
    </div>
  );
};
