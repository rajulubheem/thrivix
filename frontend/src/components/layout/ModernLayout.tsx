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
  ChevronRight
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { useTheme } from '../../contexts/ThemeContext';

interface ModernLayoutProps {
  children: React.ReactNode;
}

const navigationItems = [
  {
    title: 'Home',
    href: '/',
    icon: Home,
    description: 'Dashboard overview'
  },
  {
    title: 'Research',
    href: '/conversation',
    icon: Brain,
    description: 'Advanced web research with analysis',
    badge: 'Popular'
  },
  {
    title: 'Event Swarm',
    href: '/event-swarm',
    icon: Activity,
    description: 'Dynamic AI agents with real-time collaboration',
    badge: 'Advanced'
  },
  {
    title: 'Pre-Defined Swarm',
    href: '/swarm',
    icon: Users,
    description: 'Structured multi-agent coordination',
    badge: 'Stable'
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
    <TooltipProvider>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <div className="w-64 border-r bg-card">
          <div className="flex h-full flex-col">
            {/* Logo */}
            <div className="flex h-14 items-center border-b px-4">
              <Bot className="h-6 w-6 text-primary" />
              <span className="ml-2 text-lg font-semibold">Thrivix</span>
            </div>

            {/* Navigation */}
            <ScrollArea className="flex-1 px-3 py-4">
              <nav className="space-y-1">
                {navigationItems.map((item) => {
                  const isActive = location.pathname === item.href;
                  const Icon = item.icon;
                  
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>
                        <Link to={item.href}>
                          <div
                            className={cn(
                              "group flex items-center rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors",
                              isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                            )}
                          >
                            <Icon className="mr-3 h-4 w-4" />
                            <span className="flex-1">{item.title}</span>
                            {item.badge && (
                              <Badge variant="secondary" className="ml-auto">
                                {item.badge}
                              </Badge>
                            )}
                            {isActive && (
                              <ChevronRight className="ml-auto h-4 w-4" />
                            )}
                          </div>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>{item.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </nav>
            </ScrollArea>

            {/* Bottom section */}
            <div className="border-t p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Theme</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleTheme}
                  className="h-8 w-8"
                >
                  {theme === 'dark' ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </TooltipProvider>
  );
};
