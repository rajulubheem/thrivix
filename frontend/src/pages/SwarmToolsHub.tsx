import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Search, FlaskConical, Plus, Code, Database, Globe, 
  Terminal, Calculator, FileText, Clock, Shield, Cpu, GitBranch,
  ChevronRight, Sparkles, Zap, Check, X, Copy, Play, Save,
  Moon, Sun, Filter, Grid3x3, List, Info, Book, Settings,
  Package, Layers, Activity, CheckCircle, AlertCircle, Loader2
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

type ToolInfo = { 
  name: string; 
  description: string; 
  category?: string; 
  source?: string; 
  capabilities?: string[];
  parameters?: any;
  examples?: any[];
};

const categoryIcons: Record<string, any> = {
  'file': FileText,
  'web': Globe,
  'code': Code,
  'system': Cpu,
  'data': Database,
  'utility': Package,
  'planning': GitBranch,
  'security': Shield,
  'time': Clock,
  'calculation': Calculator,
  'shell': Terminal,
  'strands_agents': GitBranch,
  'unknown': Layers
};

const categoryColors: Record<string, { dark: string; light: string }> = {
  'file': { dark: 'from-blue-600/20 to-blue-500/10', light: 'from-blue-100 to-blue-50' },
  'web': { dark: 'from-green-600/20 to-green-500/10', light: 'from-green-100 to-green-50' },
  'code': { dark: 'from-purple-600/20 to-purple-500/10', light: 'from-purple-100 to-purple-50' },
  'system': { dark: 'from-orange-600/20 to-orange-500/10', light: 'from-orange-100 to-orange-50' },
  'data': { dark: 'from-cyan-600/20 to-cyan-500/10', light: 'from-cyan-100 to-cyan-50' },
  'utility': { dark: 'from-pink-600/20 to-pink-500/10', light: 'from-pink-100 to-pink-50' },
  'planning': { dark: 'from-indigo-600/20 to-indigo-500/10', light: 'from-indigo-100 to-indigo-50' },
  'security': { dark: 'from-red-600/20 to-red-500/10', light: 'from-red-100 to-red-50' },
  'strands_agents': { dark: 'from-emerald-600/20 to-emerald-500/10', light: 'from-emerald-100 to-emerald-50' },
  'unknown': { dark: 'from-gray-600/20 to-gray-500/10', light: 'from-gray-100 to-gray-50' }
};

// Helper function to safely get category color
const getCategoryColor = (category: string | undefined, isDark: boolean): string => {
  const cat = category || 'unknown';
  const colors = categoryColors[cat] || categoryColors['unknown'];
  return colors[isDark ? 'dark' : 'light'];
};

const exampleTemplates: Record<string, any> = {
  'tavily_search': { 
    query: 'latest AI developments 2024', 
    max_results: 5,
    _description: 'Search for the latest AI news and developments'
  },
  'web_search': { 
    query: 'OpenAI GPT-4 capabilities', 
    max_results: 3,
    _description: 'Search the web for information'
  },
  'wikipedia_search': {
    query: 'Large language model',
    lang: 'en',
    _description: 'Search Wikipedia and get a summary'
  },
  'file_write': { 
    path: '/tmp/example.txt', 
    content: 'Hello from Swarm Tools Hub!\nThis is a test file.',
    _description: 'Write content to a file'
  },
  'file_read': { 
    path: '/tmp/example.txt',
    _description: 'Read contents from a file'
  },
  'python_repl': { 
    code: "import math\n\n# Calculate fibonacci sequence\ndef fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)\n\nresult = [fibonacci(i) for i in range(10)]\nprint('Fibonacci sequence:', result)",
    _description: 'Execute Python code in a REPL environment'
  },
  'http_request': { 
    method: 'GET', 
    url: 'https://api.github.com/repos/openai/gpt-4',
    headers: { 'Accept': 'application/json' },
    _description: 'Make an HTTP request'
  },
  'fetch_webpage': {
    url: 'https://example.com',
    _description: 'Fetch a webpage and extract readable text'
  },
  'extract_links': {
    url: 'https://example.com',
    _description: 'Extract hyperlinks from a webpage'
  },
  'rss_fetch': {
    url: 'https://hnrss.org/frontpage',
    limit: 5,
    _description: 'Fetch and parse an RSS feed'
  },
  'sitemap_fetch': {
    url: 'https://example.com/sitemap.xml',
    limit: 50,
    _description: 'Fetch and parse a sitemap.xml'
  },
  'json_parse': {
    text: '{"name":"Ada","age":28}',
    _description: 'Parse JSON text and return basic info'
  },
  'csv_preview': {
    text: 'name,age\nAda,28\nAlan,41',
    limit: 5,
    _description: 'Preview first rows of CSV text'
  },
  'list_files': {
    prefix: '/tmp',
    _description: 'List virtual files by prefix'
  },
  'delete_file': {
    path: '/tmp/example.txt',
    _description: 'Delete a virtual file'
  },
  'use_llm': {
    prompt: 'Summarize the benefits of serverless on AWS.',
    system_prompt: 'You are a helpful assistant.',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    _description: 'Call an LLM with a prompt (simulated)'
  },
  'agent_as_tool': {
    agent_name: 'researcher',
    input: { task: 'Investigate GPU pricing trends' },
    _description: 'Use an agent as a callable tool (stub)'
  },
  'agent': {
    name: 'planner',
    role: 'Project Planner',
    goal: 'Design rollout plan',
    tools: ['task_planner','journal'],
    _description: 'Create a simple agent plan (stub)'
  },
  'swarm': {
    agents: [{ name: 'analyst' }, { name: 'developer' }],
    task: 'Build a research summary',
    _description: 'Coordinate multiple agents (stub)'
  },
  'think': {
    thought: 'Outline steps to compare frameworks',
    cycle_count: 2,
    approach: 'systematic',
    _description: 'Internal reasoning helper that structures thoughts'
  },
  'load_tool': {
    name: 'file_read',
    _description: 'Load tool metadata from registry'
  },
  'agent_graph': {
    description: 'Plan -> Execute -> Review -> Handoff',
    _description: 'Generate a simple agent graph diagram'
  },
  'handoff_to_user': {
    message: 'Please approve deployment to staging.',
    breakout_of_loop: false,
    _description: 'Request user input or hand off control'
  },
  'agent_core_memory': {
    action: 'set',
    key: 'project_stage',
    value: 'design',
    _description: 'Core memory store for agents (in-memory)'
  },
  'code_interpreter': {
    code: 'print("Hello from code_interpreter")',
    _description: 'Execute code using the Python interpreter'
  },
  'tavily_map': {
    query: 'serverless architectures best practices',
    max_results: 3,
    _description: 'Tavily quick search (basic depth)'
  },
  'tavily_extract': {
    url: 'https://example.com',
    _description: 'Extract readable text from a URL'
  },
  'tavily_crawl': {
    start_url: 'https://example.com',
    max_pages: 2,
    _description: 'Crawl a site starting at a URL (limited)'
  },
  'current_time': {
    timezone: 'UTC',
    _description: 'Get current time in UTC or local'
  },
  'sleep': {
    seconds: 1,
    _description: 'Pause execution for a few seconds'
  },
  'environment': {
    key: 'PATH',
    default: '',
    _description: 'Read environment variables'
  },
  'system_info': {
    _description: 'Get basic system information'
  },
  'journal': {
    entry: 'Investigated issue and recorded steps',
    tags: ['notes'],
    _description: 'Write a journal entry to in-memory log'
  },
  'memory': {
    op: 'set',
    key: 'greeting',
    value: 'hello',
    _description: 'In-memory key-value store'
  },
  'task_planner': {
    goal: 'Add feature X with tests',
    _description: 'Create a simple task plan'
  },
  'agent_todo': {
    action: 'add',
    item: 'Write unit tests',
    _description: 'Manage an in-memory TODO list'
  },
  'diagram': {
    description: 'Process user input and return result',
    _description: 'Generate a simple Mermaid diagram string'
  },
  'use_aws': {
    service: 's3',
    action: 'list_buckets',
    parameters: {},
    region: 'us-east-1',
    _description: 'Interact with AWS services (S3, Lambda, DynamoDB, etc.)'
  },
  'retrieve': {
    source: 'vector_db',
    query: 'best practices for serverless',
    limit: 5,
    _description: 'Advanced retrieval from multiple sources (RAG helper)'
  },
  'shell': { 
    command: "ls -la | head -5",
    _description: 'Execute shell commands'
  },
  'calculator': { 
    expression: '(2 + 3) * 4 / 2 - 1',
    _description: 'Evaluate mathematical expressions'
  },
  'code_generator': {
    language: 'python',
    description: 'Simple CLI that prints greeting',
    filename: 'cli.py',
    _description: 'Generate code templates and boilerplate'
  },
  'editor': { 
    path: '/tmp/code.py', 
    operation: 'create', 
    content: 'def main():\n    print("Hello, World!")\n\nif __name__ == "__main__":\n    main()',
    _description: 'Edit files with various operations'
  },
  'database': {
    query: 'SELECT * FROM users LIMIT 10',
    connection: 'sqlite:///example.db',
    _description: 'Execute database queries'
  }
};

export default function SwarmToolsHub() {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<ToolInfo | null>(null);
  const [params, setParams] = useState<Record<string, any>>({});
  const [result, setResult] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(true);
  const [copiedTool, setCopiedTool] = useState<string | null>(null);
  const [addedTools, setAddedTools] = useState<Set<string>>(new Set());
  const [selectedExample, setSelectedExample] = useState<number>(0);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [recentlyUsed, setRecentlyUsed] = useState<string[]>([]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K for search focus
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('tool-search')?.focus();
      }
      // Cmd/Ctrl + T for test
      if ((e.metaKey || e.ctrlKey) && e.key === 't' && selected) {
        e.preventDefault();
        runTest();
      }
      // Escape to clear selection
      if (e.key === 'Escape') {
        setSelected(null);
        setResult(null);
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selected]);

  // Map backend categories to UI categories
  const mapCategory = (backendCategory?: string): string => {
    const cat = (backendCategory || '').toLowerCase();
    const mapping: Record<string, string> = {
      'file_operations': 'file',
      'web_search': 'web',
      'aws': 'system',
      'cloud': 'system',
      'strands_agents': 'strands_agents',
      'code_execution': 'code',
      'code_generation': 'code',
      'system': 'system',
      'data': 'data',
      'utility': 'utility',
      'utilities': 'utility',
      'documentation': 'utility',
      'planning': 'planning',
      'memory': 'data',
      'security': 'security',
      'time': 'time',
      'calculation': 'calculation',
      'shell': 'shell'
    };
    return mapping[cat] || 'unknown';
  };

  useEffect(() => {
    (async () => {
      try {
        // Use unified tools endpoint that reflects enabled, testable tools
        // Note: router prefix '/tools' + endpoint '/tools/available'
        const res = await fetch('/api/v1/tools/tools/available');
        const data = await res.json();
        const enabledOnly = (data?.tools || []).filter((t: any) => t?.enabled);
        const normalized: ToolInfo[] = enabledOnly.map((t: any) => ({
          name: t.name,
          description: t.description || 'No description available',
          category: mapCategory(t.category),
          source: 'builtin',
          capabilities: [],
          parameters: {},
          examples: []
        }));
        setTools(normalized);
      } catch (e) {
        console.error('Failed to load tools', e);
      }
    })();
  }, []);

  const categories = useMemo(() => {
    const cats = new Map<string, number>();
    tools.forEach(t => {
      const cat = t.category || 'unknown';
      cats.set(cat, (cats.get(cat) || 0) + 1);
    });
    return Array.from(cats.entries()).sort((a, b) => b[1] - a[1]);
  }, [tools]);

  const filtered = useMemo(() => {
    let result = tools;
    
    if (selectedCategory) {
      result = result.filter(t => t.category === selectedCategory);
    }
    
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(t => 
        `${t.name} ${t.description} ${t.category} ${t.source}`.toLowerCase().includes(q)
      );
    }
    
    return result;
  }, [tools, search, selectedCategory]);

  const getDefaultParams = (toolName: string): any => {
    const template = exampleTemplates[toolName.toLowerCase()] || exampleTemplates[toolName];
    if (template) {
      const { _description, ...params } = template;
      return params;
    }
    return {};
  };

  const handleToolSelect = useCallback((tool: ToolInfo) => {
    setSelected(tool);
    setParams(getDefaultParams(tool.name));
    setResult(null);
    setSelectedExample(0);
    // Add to recently used
    setRecentlyUsed(prev => {
      const updated = [tool.name, ...prev.filter(t => t !== tool.name)].slice(0, 5);
      localStorage.setItem('recentTools', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Load recently used tools from localStorage
  useEffect(() => {
    const recent = localStorage.getItem('recentTools');
    if (recent) {
      try {
        setRecentlyUsed(JSON.parse(recent));
      } catch {}
    }
  }, []);

  const copyToClipboard = (text: string, toolName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTool(toolName);
    setTimeout(() => setCopiedTool(null), 2000);
  };

  const addToAgent = async () => {
    if (!selected) return;
    try {
      const raw = sessionStorage.getItem('orchestratorAgents');
      if (!raw) {
        alert('No agents found. Please create agents in the Orchestrator Config first.');
        return;
      }
      const agents = JSON.parse(raw);
      if (!Array.isArray(agents) || agents.length === 0) {
        alert('No agents found. Please create agents in the Orchestrator Config first.');
        return;
      }
      
      // Show agent selection modal
      const agentNames = agents.map((a: any) => a.name).join('\n');
      const agentName = prompt(`Select an agent to add "${selected.name}" to:\n\nAvailable agents:\n${agentNames}\n\nEnter agent name:`);
      
      if (!agentName) return;
      
      const idx = agents.findIndex((a: any) => (a.name || '').toLowerCase() === agentName.toLowerCase());
      if (idx === -1) { 
        alert('Agent not found. Please enter an exact agent name.'); 
        return; 
      }
      
      const list = Array.isArray(agents[idx].tools) ? agents[idx].tools : [];
      if (!list.includes(selected.name)) {
        list.push(selected.name);
        agents[idx].tools = list;
        sessionStorage.setItem('orchestratorAgents', JSON.stringify(agents));
        setAddedTools(prev => new Set(Array.from(prev).concat(selected.name)));
        alert(`✅ Successfully added "${selected.name}" to agent "${agents[idx].name}"`);
      } else {
        alert(`Tool "${selected.name}" is already added to agent "${agents[idx].name}"`);
      }
    } catch (e) {
      console.error('Error adding tool:', e);
      alert('Failed to add tool to agent');
    }
  };

  const runTest = async () => {
    if (!selected) return;
    setIsRunning(true);
    setResult(null);
    try {
      // Test through the unified tool test endpoint
      const res = await fetch('/api/v1/tools/tools/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_name: selected.name, parameters: params })
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setIsRunning(false);
    }
  };

  const CategoryIcon = ({ category }: { category: string }) => {
    const Icon = categoryIcons[category] || categoryIcons.unknown;
    return <Icon className="h-4 w-4" />;
  };

  return (
    <div className={`h-screen flex flex-col overflow-hidden ${isDark ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950' : 'bg-gradient-to-br from-gray-50 via-white to-gray-50'}`}>
      {/* Header - Fixed */}
      <div className={`flex-shrink-0 ${isDark ? 'bg-slate-900/80' : 'bg-white/80'} backdrop-blur-xl border-b ${isDark ? 'border-slate-800' : 'border-gray-200'} z-50`}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/swarm')}
                className={`p-2 ${isDark ? 'hover:bg-slate-800' : 'hover:bg-gray-100'} rounded-lg transition-colors`}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Swarm Tools Hub
                </h1>
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                  Discover, test, and integrate powerful tools for your AI agents
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`p-2 ${isDark ? 'hover:bg-slate-800' : 'hover:bg-gray-100'} rounded-lg transition-colors`}
              >
                <Filter className="h-5 w-5" />
              </button>
              <button
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                className={`p-2 ${isDark ? 'hover:bg-slate-800' : 'hover:bg-gray-100'} rounded-lg transition-colors`}
              >
                {viewMode === 'grid' ? <List className="h-5 w-5" /> : <Grid3x3 className="h-5 w-5" />}
              </button>
              <button
                onClick={toggleTheme}
                className={`p-2 ${isDark ? 'hover:bg-slate-800' : 'hover:bg-gray-100'} rounded-lg transition-colors`}
              >
                {isDark ? <Sun className="h-5 w-5 text-yellow-400" /> : <Moon className="h-5 w-5" />}
              </button>
              <button
                onClick={() => navigate('/orchestrator/config')}
                className={`px-4 py-2 ${isDark ? 'bg-blue-600 hover:bg-blue-500' : 'bg-blue-500 hover:bg-blue-600'} text-white rounded-lg transition-colors flex items-center gap-2`}
              >
                <Settings className="h-4 w-4" />
                Configure Agents
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mt-4 relative">
            <Search className={`absolute left-4 top-3.5 h-5 w-5 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
            <input
              id="tool-search"
              type="text"
              placeholder="Search tools by name, description, or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`w-full pl-12 pr-4 py-3 ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-gray-50 border-gray-300'} border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className={`absolute right-4 top-3.5 p-1 ${isDark ? 'hover:bg-slate-700' : 'hover:bg-gray-200'} rounded`}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content - Scrollable */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full max-w-7xl mx-auto px-6 py-6">
          <div className="h-full flex gap-6">
            {/* Categories Sidebar */}
            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 280, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  className="flex-shrink-0 overflow-y-auto"
                >
                  <div className={`h-full ${isDark ? 'bg-slate-900/50' : 'bg-white/80'} backdrop-blur-lg rounded-xl border ${isDark ? 'border-slate-800' : 'border-gray-200'} p-4`}>
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                      <Layers className="h-4 w-4" />
                      Categories
                    </h3>
                    <div className="space-y-1">
                      <button
                        onClick={() => setSelectedCategory(null)}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                          !selectedCategory 
                            ? isDark ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600' 
                            : isDark ? 'hover:bg-slate-800' : 'hover:bg-gray-100'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          All Tools
                        </span>
                        <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                          {tools.length}
                        </span>
                      </button>
                      {categories.map(([cat, count]) => (
                        <button
                          key={cat}
                          onClick={() => setSelectedCategory(cat)}
                          className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                            selectedCategory === cat 
                              ? isDark ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                              : isDark ? 'hover:bg-slate-800' : 'hover:bg-gray-100'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <CategoryIcon category={cat} />
                            <span className="capitalize">{cat}</span>
                          </span>
                          <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                            {count}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* Recently Used */}
                    {recentlyUsed.length > 0 && (
                      <div className={`mt-6 pt-6 border-t ${isDark ? 'border-slate-800' : 'border-gray-200'}`}>
                        <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                          <Clock className="h-3.5 w-3.5" />
                          Recently Used
                        </h3>
                        <div className="space-y-1">
                          {recentlyUsed.slice(0, 3).map(toolName => {
                            const tool = tools.find(t => t.name === toolName);
                            if (!tool) return null;
                            return (
                              <button
                                key={toolName}
                                onClick={() => handleToolSelect(tool)}
                                className={`w-full text-left px-2 py-1.5 rounded-lg transition-all text-sm flex items-center gap-2 ${
                                  selected?.name === toolName
                                    ? isDark ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                                    : isDark ? 'hover:bg-slate-800' : 'hover:bg-gray-100'
                                }`}
                              >
                                <CategoryIcon category={tool.category || 'unknown'} />
                                <span className="truncate">{toolName}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Stats */}
                    <div className={`mt-6 pt-6 border-t ${isDark ? 'border-slate-800' : 'border-gray-200'}`}>
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        Statistics
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-slate-400' : 'text-gray-600'}>Total Tools</span>
                          <span className="font-medium">{tools.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-slate-400' : 'text-gray-600'}>Categories</span>
                          <span className="font-medium">{categories.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-slate-400' : 'text-gray-600'}>Added Today</span>
                          <span className="font-medium text-green-500">{addedTools.size}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main Content Area */}
            <div className="flex-1 flex gap-6 overflow-hidden">
              {/* Tools Grid/List - Scrollable */}
              <div className="flex-1 overflow-y-auto pr-2">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    {selectedCategory ? (
                      <span className="flex items-center gap-2">
                        <CategoryIcon category={selectedCategory} />
                        <span className="capitalize">{selectedCategory} Tools</span>
                      </span>
                    ) : (
                      'All Tools'
                    )}
                    <span className={`ml-2 text-sm ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                      ({filtered.length})
                    </span>
                  </h2>
                </div>

                <div className={`${viewMode === 'grid' ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : 'space-y-3'} pb-6`}>
                  <AnimatePresence mode="popLayout">
                    {filtered.map((tool, index) => (
                      <motion.div
                        key={tool.name}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: index * 0.02 }}
                        onClick={() => handleToolSelect(tool)}
                        className={`group cursor-pointer ${
                          selected?.name === tool.name
                            ? isDark ? 'ring-2 ring-blue-500' : 'ring-2 ring-blue-400'
                            : ''
                        }`}
                      >
                        <div className={`h-full ${isDark ? 'bg-slate-900/50' : 'bg-white/80'} backdrop-blur-lg rounded-xl border ${isDark ? 'border-slate-800' : 'border-gray-200'} p-5 hover:shadow-lg transition-all`}>
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-start gap-3">
                              <div className={`p-2.5 rounded-lg bg-gradient-to-br ${
                                getCategoryColor(tool.category, isDark)
                              }`}>
                                <CategoryIcon category={tool.category || 'unknown'} />
                              </div>
                              <div className="flex-1">
                                <h3 className="font-semibold text-base">{tool.name}</h3>
                                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'} mt-1`}>
                                  {tool.description}
                                </p>
                              </div>
                            </div>
                            {addedTools.has(tool.name) && (
                              <CheckCircle className="h-5 w-5 text-green-500" />
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-3">
                            <span className={`px-2 py-1 text-xs rounded-lg ${isDark ? 'bg-slate-800' : 'bg-gray-100'}`}>
                              {tool.source || 'local'}
                            </span>
                            {tool.capabilities?.slice(0, 2).map(cap => (
                              <span key={cap} className={`px-2 py-1 text-xs rounded-lg ${isDark ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
                                {cap}
                              </span>
                            ))}
                          </div>

                          <div className={`mt-3 pt-3 border-t ${isDark ? 'border-slate-800' : 'border-gray-200'} flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity`}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(tool.name, tool.name);
                              }}
                              className={`text-xs ${isDark ? 'text-slate-400 hover:text-slate-300' : 'text-gray-600 hover:text-gray-800'} flex items-center gap-1`}
                            >
                              {copiedTool === tool.name ? (
                                <>
                                  <Check className="h-3 w-3" />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  Copy name
                                </>
                              )}
                            </button>
                            <ChevronRight className={`h-4 w-4 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {filtered.length === 0 && (
                  <div className={`text-center py-12 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                    <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No tools found matching your criteria</p>
                    <button
                      onClick={() => {
                        setSearch('');
                        setSelectedCategory(null);
                      }}
                      className={`mt-3 text-sm ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>

              {/* Tool Details Panel - Scrollable */}
              <div className="w-96 flex-shrink-0 hidden lg:block overflow-y-auto">
                <div className={`${isDark ? 'bg-slate-900/50' : 'bg-white/80'} backdrop-blur-lg rounded-xl border ${isDark ? 'border-slate-800' : 'border-gray-200'} overflow-hidden`}>
                  {!selected ? (
                    <div className="p-8 text-center">
                      <div className={`p-4 ${isDark ? 'bg-slate-800/50' : 'bg-gray-100'} rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center`}>
                        <Info className={`h-8 w-8 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
                      </div>
                      <h3 className="font-semibold mb-2">Select a Tool</h3>
                      <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                        Choose a tool from the list to view details, test it, and add it to your agents
                      </p>
                    </div>
                  ) : (
                    <div>
                      {/* Header */}
                      <div className={`p-5 border-b ${isDark ? 'border-slate-800 bg-slate-800/30' : 'border-gray-200 bg-gray-50'}`}>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-start gap-3">
                            <div className={`p-2.5 rounded-lg bg-gradient-to-br ${
                              getCategoryColor(selected.category, isDark)
                            }`}>
                              <CategoryIcon category={selected.category || 'unknown'} />
                            </div>
                            <div>
                              <h3 className="font-semibold text-lg">{selected.name}</h3>
                              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'} mt-1`}>
                                {selected.description}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex gap-2 mt-4">
                          <button
                            onClick={addToAgent}
                            className={`flex-1 px-3 py-2 ${
                              addedTools.has(selected.name)
                                ? isDark ? 'bg-green-600/20 text-green-400' : 'bg-green-100 text-green-600'
                                : isDark ? 'bg-blue-600 hover:bg-blue-500' : 'bg-blue-500 hover:bg-blue-600'
                            } ${addedTools.has(selected.name) ? '' : 'text-white'} rounded-lg transition-colors flex items-center justify-center gap-2`}
                          >
                            {addedTools.has(selected.name) ? (
                              <>
                                <CheckCircle className="h-4 w-4" />
                                Added
                              </>
                            ) : (
                              <>
                                <Plus className="h-4 w-4" />
                                Add to Agent
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Parameters */}
                      <div className="p-5">
                        <div className="mb-4">
                          <h4 className="font-medium mb-2 flex items-center gap-2">
                            <Code className="h-4 w-4" />
                            Parameters
                          </h4>
                          
                          {/* Example selector if available */}
                          {Object.keys(exampleTemplates).includes(selected.name.toLowerCase()) && (
                            <div className="mb-3">
                              <select
                                value={selectedExample}
                                onChange={(e) => {
                                  const idx = parseInt(e.target.value);
                                  setSelectedExample(idx);
                                  if (idx === 0) {
                                    setParams(getDefaultParams(selected.name));
                                  } else {
                                    setParams({});
                                  }
                                }}
                                className={`w-full px-3 py-2 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-300'} border rounded-lg text-sm`}
                              >
                                <option value={0}>Example Template</option>
                                <option value={1}>Custom Parameters</option>
                              </select>
                            </div>
                          )}

                          <div className="relative">
                            <textarea
                              value={JSON.stringify(params, null, 2)}
                              onChange={(e) => {
                                try {
                                  setParams(JSON.parse(e.target.value || '{}'));
                                } catch {
                                  // Invalid JSON, don't update
                                }
                              }}
                              className={`w-full px-3 py-2 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-300'} border rounded-lg font-mono text-sm resize-none`}
                              rows={8}
                              placeholder="{}"
                            />
                            <button
                              onClick={() => copyToClipboard(JSON.stringify(params, null, 2), 'params')}
                              className={`absolute top-2 right-2 p-1 ${isDark ? 'hover:bg-slate-700' : 'hover:bg-gray-200'} rounded`}
                            >
                              {copiedTool === 'params' ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </button>
                          </div>

                          {selectedExample === 0 && exampleTemplates[selected.name.toLowerCase()]?._description && (
                            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-500'} mt-2`}>
                              {exampleTemplates[selected.name.toLowerCase()]._description}
                            </p>
                          )}
                        </div>

                        <button
                          onClick={runTest}
                          disabled={isRunning}
                          className={`w-full px-4 py-2.5 ${isDark ? 'bg-green-600 hover:bg-green-500' : 'bg-green-500 hover:bg-green-600'} text-white rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50`}
                        >
                          {isRunning ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Testing...
                            </>
                          ) : (
                            <>
                              <FlaskConical className="h-4 w-4" />
                              Test Tool
                            </>
                          )}
                        </button>

                        {/* Result */}
                        {result && (
                          <div className="mt-4">
                            <h4 className="font-medium mb-2 flex items-center gap-2">
                              {result.error ? (
                                <>
                                  <AlertCircle className="h-4 w-4 text-red-500" />
                                  Error
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                  Result
                                </>
                              )}
                            </h4>
                            <div className={`relative ${isDark ? 'bg-slate-800' : 'bg-gray-50'} rounded-lg p-3 overflow-auto max-h-64`}>
                              <pre className="text-xs font-mono">
                                {JSON.stringify(result, null, 2)}
                              </pre>
                              <button
                                onClick={() => copyToClipboard(JSON.stringify(result, null, 2), 'result')}
                                className={`absolute top-2 right-2 p-1 ${isDark ? 'hover:bg-slate-700' : 'hover:bg-gray-200'} rounded`}
                              >
                                {copiedTool === 'result' ? (
                                  <Check className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
