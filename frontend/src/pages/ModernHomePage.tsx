import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowRight, 
  Bot, 
  Brain, 
  Sparkles, 
  Users, 
  Zap,
  MessageSquare,
  TrendingUp,
  Shield,
  Code,
  Layers,
  Globe,
  Activity,
  Network
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Progress } from '../components/ui/progress';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../components/ui/hover-card';
import { ModernLayout } from '../components/layout/ModernLayout';

const features = [
  {
    icon: Brain,
    title: 'Research Intelligence',
    description: 'Advanced web search with comprehensive analysis and source citations. Perfect for research tasks and in-depth queries.',
    link: '/conversation',
    color: 'text-purple-500',
    badge: 'Most Popular',
    gradient: 'from-purple-500/20 to-pink-500/20'
  },
  {
    icon: Activity,
    title: 'Event-Driven Swarm',
    description: 'Dynamic AI agents that automatically spawn specialists based on task complexity with real-time collaboration.',
    link: '/event-swarm',
    color: 'text-blue-500',
    badge: 'Advanced',
    gradient: 'from-blue-500/20 to-cyan-500/20'
  },
  {
    icon: Users,
    title: 'Pre-Defined Swarm',
    description: 'Structured multi-agent coordination with specialized roles for complex problem-solving workflows.',
    link: '/swarm',
    color: 'text-green-500',
    badge: 'Stable',
    gradient: 'from-green-500/20 to-emerald-500/20'
  }
];

const stats = [
  { label: 'Active Agents', value: '5+', trend: 'Available' },
  { label: 'Research Modes', value: '3', trend: 'Fast/Deep/Scholar' },
  { label: 'Avg Response', value: '~2s', trend: 'Real-time' },
  { label: 'Open Source', value: '100%', trend: 'MIT License' }
];

export const ModernHomePage: React.FC = () => {
  const navigate = useNavigate();
  const [progress] = React.useState(75);

  return (
    <ModernLayout>
      <div className="overflow-y-auto h-full">
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        {/* Hero Section */}
        <div className="px-8 py-12">
          <div className="mx-auto max-w-7xl">
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="relative">
                  <Bot className="h-16 w-16 text-primary" />
                  <Sparkles className="absolute -top-2 -right-2 h-6 w-6 text-yellow-500 animate-pulse" />
                </div>
              </div>
              <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Thrivix Intelligence Platform
              </h1>
              <p className="mt-4 text-xl text-muted-foreground max-w-2xl mx-auto">
                Open-source platform for AI research and multi-agent collaboration. 
                Run locally or deploy your own instance.
              </p>
              <div className="mt-8 flex gap-4 justify-center">
                <Button size="lg" onClick={() => navigate('/conversation')}>
                  Start Research
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" onClick={() => navigate('/event-swarm')}>
                  Event Swarm
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="px-8 py-6 border-y bg-card/50">
          <div className="mx-auto max-w-7xl">
            <div className="grid grid-cols-4 gap-8">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                  <Badge variant="secondary" className="mt-1 text-foreground bg-muted">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    {stat.trend}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="px-8 py-12">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-3xl font-bold text-center mb-12">Choose Your AI Experience</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <HoverCard key={feature.title}>
                    <HoverCardTrigger asChild>
                      <Card 
                        className={cn(
                          "cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-[1.05] border-2 hover:border-primary/50 relative overflow-hidden group",
                          `bg-gradient-to-br ${feature.gradient}`
                        )}
                        onClick={() => navigate(feature.link)}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-background/5 to-background/20 group-hover:opacity-0 transition-opacity" />
                        <CardHeader className="relative z-10">
                          <div className="flex items-start justify-between mb-4">
                            <div className={cn("p-3 rounded-xl bg-card border shadow-sm")}>
                              <Icon className={cn("h-8 w-8", feature.color)} />
                            </div>
                            {feature.badge && (
                              <Badge variant="secondary" className="text-foreground bg-muted">
                                {feature.badge}
                              </Badge>
                            )}
                          </div>
                          <CardTitle className="text-xl mb-2 text-foreground">{feature.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="relative z-10">
                          <CardDescription className="text-sm leading-relaxed mb-4 text-muted-foreground">
                            {feature.description}
                          </CardDescription>
                          <div className="flex items-center text-primary font-medium text-sm group-hover:text-primary/80 transition-colors">
                            Get Started
                            <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                          </div>
                        </CardContent>
                      </Card>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80">
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold">Quick Start</h4>
                        <p className="text-sm text-muted-foreground">
                          Click to launch {feature.title}. Experience the power of AI-driven intelligence.
                        </p>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                );
              })}
            </div>
          </div>
        </div>

        {/* Activity Dashboard */}
        <div className="px-8 py-12">
          <div className="mx-auto max-w-7xl">
            <Card>
              <CardHeader>
                <CardTitle>System Overview</CardTitle>
                <CardDescription>Real-time monitoring and analytics</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="performance" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="performance">Performance</TabsTrigger>
                    <TabsTrigger value="agents">Active Agents</TabsTrigger>
                    <TabsTrigger value="tasks">Recent Tasks</TabsTrigger>
                  </TabsList>
                  <TabsContent value="performance" className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>System Status</span>
                        <span className="text-green-500">● Running</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 pt-4">
                      <div className="text-center p-4 bg-muted rounded-lg">
                        <Code className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                        <div className="text-sm font-medium text-foreground">Backend</div>
                        <div className="text-lg font-bold text-foreground">FastAPI</div>
                      </div>
                      <div className="text-center p-4 bg-muted rounded-lg">
                        <Layers className="h-8 w-8 mx-auto mb-2 text-green-500" />
                        <div className="text-sm font-medium text-foreground">Frontend</div>
                        <div className="text-lg font-bold text-foreground">React + TS</div>
                      </div>
                      <div className="text-center p-4 bg-muted rounded-lg">
                        <Globe className="h-8 w-8 mx-auto mb-2 text-purple-500" />
                        <div className="text-sm font-medium text-foreground">AI SDK</div>
                        <div className="text-lg font-bold text-foreground">Strands AI</div>
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="agents">
                    <div className="space-y-4">
                      {['Research Agent', 'Code Assistant', 'Data Analyst', 'Creative Writer'].map((agent, idx) => (
                        <div key={agent} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                            <span className="font-medium text-foreground">{agent}</span>
                          </div>
                          <Badge variant="outline" className="text-foreground border-muted-foreground">Active</Badge>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                  <TabsContent value="tasks">
                    <div className="space-y-4">
                      {[
                        { task: 'Web research query', status: 'completed', time: 'Ready' },
                        { task: 'Multi-agent swarm', status: 'in-progress', time: 'Available' },
                        { task: 'Document analysis', status: 'completed', time: 'Ready' },
                        { task: 'Code assistant', status: 'pending', time: 'Beta' }
                      ].map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <div className="font-medium text-foreground">{item.task}</div>
                            <div className="text-sm text-muted-foreground">{item.time}</div>
                          </div>
                          <Badge 
                            variant={item.status === 'completed' ? 'default' : item.status === 'in-progress' ? 'secondary' : 'outline'}
                            className="text-foreground"
                          >
                            {item.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Key Capabilities Section */}
        <div className="px-8 py-12 border-t bg-muted/30">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-3xl font-bold text-center mb-12">Why Choose Thrivix?</h2>
            <div className="grid grid-cols-3 gap-8">
              <div className="text-center">
                <div className="mx-auto w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-4">
                  <Brain className="h-8 w-8 text-blue-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">Web Research</h3>
                <p className="text-sm text-muted-foreground">
                  Search the web, analyze results, and get comprehensive answers with source citations.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mb-4">
                  <Users className="h-8 w-8 text-purple-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">Multi-Agent System</h3>
                <p className="text-sm text-muted-foreground">
                  Run multiple AI agents that work together to solve complex problems.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-4">
                  <Shield className="h-8 w-8 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">Open Source</h3>
                <p className="text-sm text-muted-foreground">
                  Run locally on your machine. Full control over your data and deployment.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Use Cases Section */}
        <div className="px-8 py-12">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-3xl font-bold text-center mb-8">What You Can Do</h2>
            <div className="grid grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Research & Analysis</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Search the web, gather information from multiple sources, and get comprehensive summaries.
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Question Answering</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Get detailed answers to complex questions with supporting evidence and citations.
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Document Analysis</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Upload and analyze documents, extract key information, and generate summaries.
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">AI Agents</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Deploy specialized agents for specific tasks and watch them collaborate.
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Footer Section */}
        <div className="px-8 py-12 border-t">
          <div className="mx-auto max-w-7xl text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Thrivix - Intelligent Platform for Research and Collaboration
            </p>
            <p className="text-xs text-muted-foreground">
              Powered by Strands AI SDK • Open source research and collaboration platform
            </p>
          </div>
        </div>
        </div>
      </div>
    </ModernLayout>
  );
};

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}