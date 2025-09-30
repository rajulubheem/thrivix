import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Bot, Save, Play, Plus, Trash2, Search, Brain, Loader2,
  Sparkles, Code, Database, Shield, Zap, ChevronDown, ChevronUp,
  Settings, CheckCircle, XCircle, Moon, Sun, Copy, TestTube,
  HelpCircle, BookOpen, Lightbulb, RotateCcw, Download, Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../contexts/ThemeContext';
import AgentCard from '../components/orchestrator/AgentCard';
import EnhancedToolCatalog from '../components/orchestrator/EnhancedToolCatalog';
import WorkflowPreview from '../components/orchestrator/WorkflowPreview';

type AgentConfig = {
  id: string;
  name: string;
  role: string;
  description: string;
  system_prompt: string;
  instructions: string[];
  tools: string[];
  capabilities: string[];
  model: string;
  temperature: number;
  max_tokens?: number;
  auto_approve?: boolean;
  dirty?: boolean;
};

const defaultAgent = (i: number): AgentConfig => ({
  id: `agent_${i}_${Date.now()}`,
  name: `agent_${i}`,
  role: 'Specialist',
  description: 'Describe this agent\'s responsibilities and scope.',
  system_prompt: 'You are a helpful agent. Be concise and accurate.',
  instructions: ['Follow the task and collaborate with others.'],
  tools: [],
  capabilities: [],
  model: 'gpt-4o-mini',
  temperature: 0.7,
  max_tokens: 4000,
  auto_approve: false,
  dirty: false,
});

const availableCapabilities = [
  'file_operations', 'web_search', 'code_execution', 'data_analysis',
  'api_integration', 'database_operations', 'ui_development', 'testing'
];

const modelOptions = [
  { value: 'gpt-4o', label: 'GPT-4o', icon: '🚀' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', icon: '⚡' },
  { value: 'gpt-4', label: 'GPT-4', icon: '🧠' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', icon: '💨' }
];

const toolCategories = {
  'File Operations': ['file_read', 'file_write', 'editor'],
  'Web & Search': ['tavily_search', 'http_request', 'web_search'],
  'Code & Execution': ['python_repl', 'shell', 'calculator'],
  'System & Data': ['current_time', 'environment', 'system_info', 'database'],
  'Utilities': ['think', 'batch', 'sleep']
};

export default function OrchestratorConfig() {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [availableTools, setAvailableTools] = useState<string[]>([]);
  const [availableToolInfo, setAvailableToolInfo] = useState<any[]>([]);
  const [enabledTools, setEnabledTools] = useState<Set<string>>(new Set());
  const [toolsSearch, setToolsSearch] = useState('');
  const [taskDraft, setTaskDraft] = useState('');
  const [generating, setGenerating] = useState(false);
  const [maxAgents, setMaxAgents] = useState(5);
  const [useMCPTools, setUseMCPTools] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']));
  const selectedAgent = useMemo(() => agents.find(a => a.id === selectedId) || null, [agents, selectedId]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('orchestratorAgents');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          const mapped: AgentConfig[] = parsed.map((a: any, idx: number) => ({
            id: a.id || `agent_${idx}_${Date.now()}`,
            name: a.name || `agent_${idx+1}`,
            role: a.role || a.description?.split(' ')[0] || 'Specialist',
            description: a.description || 'Agent description',
            system_prompt: a.system_prompt || (Array.isArray(a.instructions) ? a.instructions.join('\n') : 'You are a helpful agent.'),
            instructions: Array.isArray(a.instructions) ? a.instructions : [],
            tools: Array.isArray(a.tools) ? a.tools : [],
            capabilities: Array.isArray(a.capabilities) ? a.capabilities : [],
            model: a.model || 'gpt-4o-mini',
            temperature: typeof a.temperature === 'number' ? a.temperature : 0.7,
            max_tokens: typeof a.max_tokens === 'number' ? a.max_tokens : 4000,
            auto_approve: !!a.auto_approve,
            dirty: false,
          }));
          setAgents(mapped);
          if (mapped[0]) setSelectedId(mapped[0].id);
        } else {
          const seed = [defaultAgent(1), defaultAgent(2)];
          setAgents(seed);
          setSelectedId(seed[0].id);
        }
      } else {
        const seed = [defaultAgent(1), defaultAgent(2)];
        setAgents(seed);
        setSelectedId(seed[0].id);
      }
    } catch {
      const seed = [defaultAgent(1), defaultAgent(2)];
      setAgents(seed);
      setSelectedId(seed[0].id);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // Align with Swarm Tools Hub: use settings-backed tool list
        const res = await fetch('/api/v1/tools/tools/available');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const tools = Array.isArray(data?.tools) ? data.tools : [];
        const enabled = tools.filter((t: any) => t?.enabled);
        const names = enabled.map((t: any) => t?.name).filter(Boolean);
        setAvailableTools(names);
        setAvailableToolInfo(enabled.map((t: any) => ({
          name: t.name,
          description: t.description,
          category: t.category,
          requires_approval: t.requires_approval
        })));
        setEnabledTools(new Set(names));
      } catch (e) {
        console.error('Failed to load available tools', e);
        setAvailableTools([]);
        setEnabledTools(new Set());
      }
    })();
  }, []);

  const setAgent = (id: string, patch: Partial<AgentConfig>) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, ...patch, dirty: true } : a));
  };

  const addAgent = () => {
    const next = defaultAgent(agents.length + 1);
    setAgents(prev => [...prev, next]);
    setSelectedId(next.id);
  };

  const removeAgent = (id: string) => {
    const idx = agents.findIndex(a => a.id === id);
    const next = agents.filter(a => a.id !== id);
    setAgents(next);
    if (next.length) {
      const newIdx = Math.max(0, idx - 1);
      setSelectedId(next[newIdx].id);
    } else {
      const seed = defaultAgent(1);
      setAgents([seed]);
      setSelectedId(seed.id);
    }
  };

  const resetToDefault = () => {
    const defaultAgents = [
      { ...defaultAgent(1), name: 'coordinator', role: 'Coordinator', description: 'Main coordinator agent that manages the workflow' },
      { ...defaultAgent(2), name: 'researcher', role: 'Researcher', description: 'Gathers information and conducts research' },
    ];
    setAgents(defaultAgents);
    setSelectedId(defaultAgents[0].id);
    sessionStorage.setItem('orchestratorAgents', JSON.stringify(defaultAgents));
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const saveAll = () => {
    const clean = agents.map(a => ({ ...a, dirty: false }));
    setAgents(clean);
    sessionStorage.setItem('orchestratorAgents', JSON.stringify(clean.map(({dirty, id, ...rest}) => rest)));
  };

  const startInSwarm = () => {
    if (!agents.length) return;
    saveAll();
    try {
      const existingTask = (taskDraft || '').trim() || sessionStorage.getItem('orchestratorTask') || '';
      if (existingTask) {
        sessionStorage.setItem('orchestratorTask', existingTask);
        sessionStorage.setItem('orchestratorAutoStart', 'true');
      }
    } catch {}
    navigate('/swarm');
  };

  const generateAgents = async (autoRun: boolean = false) => {
    if (!taskDraft.trim()) return;
    try {
      setGenerating(true);
      const res = await fetch('/api/v1/unified-orchestrator/orchestrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || 'demo-token'}`
        },
        body: JSON.stringify({ 
          task: taskDraft.trim(), 
          max_agents: maxAgents, 
          use_mcp_tools: useMCPTools, 
          auto_execute: false, 
          context: { 
            allowed_tools: Array.from(enabledTools),
            tools_catalog: availableToolInfo
          } 
        })
      });
      if (!res.ok) throw new Error('Failed to orchestrate');
      const data = await res.json();
      const aiAgents = Array.isArray(data?.agents) ? data.agents : [];
      const mapped: AgentConfig[] = aiAgents.map((a: any, idx: number) => {
        const allTools = Array.isArray(a.tools) && a.tools.length ? a.tools : [
          ...(Array.isArray(a.primary_tools) ? a.primary_tools : []),
          ...(Array.isArray(a.secondary_tools) ? a.secondary_tools : []),
          ...(Array.isArray(a.mcp_tools) ? a.mcp_tools : []),
        ];
        return {
          id: `gen_${Date.now()}_${idx}`,
          name: a.name || `agent_${idx+1}`,
          role: a.role || 'Specialist',
          description: a.description || 'Agent description',
          system_prompt: (Array.isArray(a.instructions) ? a.instructions.join('\n') : (a.system_prompt || 'You are a helpful agent.')),
          instructions: Array.isArray(a.instructions) ? a.instructions : [],
          tools: allTools,
          capabilities: Array.isArray(a.capabilities) ? a.capabilities : [],
          model: a.model || 'gpt-4o-mini',
          temperature: typeof a.temperature === 'number' ? a.temperature : 0.7,
          max_tokens: 4000,
          auto_approve: false,
          dirty: true,
        } as AgentConfig;
      });
      if (mapped.length) {
        setAgents(mapped);
        setSelectedId(mapped[0].id);
        sessionStorage.setItem('orchestratorAgents', JSON.stringify(mapped.map(({dirty, id, ...rest}) => rest)));
        sessionStorage.setItem('orchestratorTask', taskDraft.trim());
        if (autoRun) {
          sessionStorage.setItem('orchestratorAutoStart', 'true');
          navigate('/swarm');
        }
      }
    } catch (e) {
      console.error(e);
      alert('Failed to generate agents. Check server logs.');
    } finally {
      setGenerating(false);
    }
  };

  const applyTemplate = (template: 'research' | 'data' | 'code') => {
    const templates = {
      research: [
        { ...defaultAgent(1), name: 'researcher', role: 'Researcher', description: 'Gather information', tools: ['tavily_search'] },
        { ...defaultAgent(2), name: 'developer', role: 'Developer', description: 'Implement solution', tools: ['python_repl', 'file_write'] },
        { ...defaultAgent(3), name: 'reviewer', role: 'Reviewer', description: 'Validate outputs', tools: [] }
      ],
      data: [
        { ...defaultAgent(1), name: 'ingestor', role: 'Data Ingestor', description: 'Fetch data', tools: ['web_search', 'file_read'] },
        { ...defaultAgent(2), name: 'analyst', role: 'Analyst', description: 'Analyze data', tools: ['python_repl'] },
        { ...defaultAgent(3), name: 'reporter', role: 'Reporter', description: 'Generate report', tools: ['file_write'] }
      ],
      code: [
        { ...defaultAgent(1), name: 'planner', role: 'Planner', description: 'Plan solution', tools: [] },
        { ...defaultAgent(2), name: 'coder', role: 'Coder', description: 'Write code', tools: ['python_repl', 'file_write'] },
        { ...defaultAgent(3), name: 'qa', role: 'QA', description: 'Test and verify', tools: [] }
      ]
    };
    setAgents(templates[template]);
    setSelectedId(templates[template][0].id);
  };

  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.role.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q)
    );
  }, [agents, search]);

  return (
    <div className={`min-h-screen ${isDark ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100' : 'bg-gradient-to-br from-blue-50 via-white to-purple-50 text-gray-900'}`}>
      <div className="flex h-screen">
        {/* Left Sidebar */}
        <div className={`w-80 backdrop-blur-lg border-r flex flex-col ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white/70 border-gray-300 shadow-lg'}`}>
          <div className={`h-16 border-b flex items-center justify-between px-4 ${isDark ? 'border-slate-800' : 'border-gray-200'}`}>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/swarm')}
                className={`p-2 rounded-lg transition-all ${isDark ? 'hover:bg-slate-800' : 'hover:bg-blue-50 hover:text-blue-600'}`}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h2 className="font-semibold">Agent Configuration</h2>
                <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-blue-600'}`}>Design your swarm</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {agents.length > 0 && (
                <button
                  onClick={() => {
                    if (window.confirm('Are you sure you want to clear all agents?')) {
                      setAgents([]);
                      setSelectedId(null);
                      sessionStorage.removeItem('orchestratorAgents');
                    }
                  }}
                  className="p-2 hover:bg-red-600/20 rounded-lg transition-colors text-red-400"
                  title="Clear all agents"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
              <button
                onClick={addAgent}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-blue-400"
                title="Add new agent"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search agents..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`w-full pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border border-gray-300 hover:border-blue-400 shadow-sm'}`}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="space-y-3">
              {filteredAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  isSelected={selectedId === agent.id}
                  onClick={() => setSelectedId(agent.id)}
                  onRemove={() => removeAgent(agent.id)}
                  onClone={() => {
                    const cloned = { 
                      ...agent, 
                      id: `clone_${Date.now()}`, 
                      name: `${agent.name}_copy`,
                      dirty: true 
                    };
                    setAgents(prev => [...prev, cloned]);
                    setSelectedId(cloned.id);
                  }}
                  onTest={() => {
                    alert(`Testing agent: ${agent.name}\nThis would validate the agent configuration and run a test prompt.`);
                  }}
                />
              ))}
            </div>
          </div>

          <div className="border-t border-slate-800 p-4 space-y-2">
            <div className="flex gap-2">
              <button
                onClick={saveAll}
                className={`flex-1 px-4 py-2 rounded-lg transition-all flex items-center justify-center gap-2 font-medium ${isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md hover:shadow-lg'}`}
              >
                <Save className="h-4 w-4" />
                Save All
              </button>
              <button
                onClick={startInSwarm}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Play className="h-4 w-4" />
                Run in Swarm
              </button>
            </div>
            {agents.length > 1 && (
              <button
                onClick={() => {
                  if (window.confirm(`Clear all ${agents.length} agents? This action cannot be undone.`)) {
                    setAgents([]);
                    setSelectedId(null);
                    sessionStorage.removeItem('orchestratorAgents');
                    sessionStorage.removeItem('orchestratorTask');
                  }
                }}
                className="w-full px-4 py-2 bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 rounded-lg transition-colors flex items-center justify-center gap-2 text-red-400"
              >
                <Trash2 className="h-4 w-4" />
                Clear All Agents ({agents.length})
              </button>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto p-8">
            {/* Help Banner */}
            <div className="mb-6 p-4 bg-gradient-to-r from-blue-600/10 to-purple-600/10 rounded-xl border border-blue-500/30">
              <div className="flex items-start gap-3">
                <Lightbulb className="h-5 w-5 text-blue-400 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-medium text-blue-300 mb-1">Getting Started</h3>
                  <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                    Configure your AI agents by defining their roles, tools, and behaviors. 
                    Use the AI generator to automatically create agents based on your task, 
                    or choose from templates for common workflows.
                  </p>
                  <div className="flex gap-3 mt-3">
                    <button className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300">
                      <BookOpen className="h-4 w-4" />
                      View Documentation
                    </button>
                    <button className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300">
                      <HelpCircle className="h-4 w-4" />
                      Interactive Tutorial
                    </button>
                  </div>
                </div>
              </div>
            </div>
            {/* AI Generation Panel */}
            <div className={`mb-8 p-6 backdrop-blur-lg rounded-xl border-2 ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200 shadow-lg'}`}>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-purple-600/20 rounded-lg">
                  <Brain className="h-5 w-5 text-purple-400" />
                </div>
                <h2 className="text-lg font-semibold">Generate Agents with AI</h2>
              </div>

              <textarea
                placeholder="Describe your task, constraints, and deliverables..."
                value={taskDraft}
                onChange={(e) => setTaskDraft(e.target.value)}
                className={`w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none transition-all ${isDark ? 'bg-slate-800/50 border border-slate-700' : 'bg-white border-2 border-purple-200 hover:border-purple-300 shadow-inner placeholder-gray-500'}`}
                rows={3}
              />

              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3">
                    <label className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-purple-700'}`}>Max Agents</label>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={maxAgents}
                      onChange={(e) => setMaxAgents(parseInt(e.target.value))}
                      className="w-24"
                    />
                    <span className="text-sm font-medium w-8">{maxAgents}</span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useMCPTools}
                      onChange={(e) => setUseMCPTools(e.target.checked)}
                      className="rounded border-slate-600"
                    />
                    <span className="text-sm">Use MCP Tools</span>
                  </label>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => generateAgents(false)}
                    disabled={generating || !taskDraft.trim()}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg transition-colors flex items-center gap-2"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Generate Agents
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => generateAgents(true)}
                    disabled={generating || !taskDraft.trim()}
                    className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <Zap className="h-4 w-4" />
                    Generate & Run
                  </button>
                </div>
              </div>

              {/* Quick Actions Bar */}
              <div className={`mt-4 pt-4 border-t flex items-center justify-between ${isDark ? 'border-slate-700/50' : 'border-gray-200'}`}>
                <div className="flex gap-2">
                  <button
                    onClick={resetToDefault}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2 ${isDark ? 'bg-slate-800/50 hover:bg-slate-800' : 'bg-gray-100 hover:bg-gray-200'}`}
                    title="Reset to default agents"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset to Default
                  </button>
                  {agents.length > 0 && (
                    <button
                      onClick={() => {
                        const config = agents.map(({dirty, id, ...rest}) => rest);
                        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `agent-config-${Date.now()}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2 ${isDark ? 'bg-slate-800/50 hover:bg-slate-800' : 'bg-gray-100 hover:bg-gray-200'}`}
                      title="Export configuration"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export
                    </button>
                  )}
                  <label className={`px-3 py-1.5 rounded-lg text-sm transition-all flex items-center gap-2 cursor-pointer font-medium ${isDark ? 'bg-slate-800/50 hover:bg-slate-800' : 'bg-gradient-to-r from-indigo-100 to-purple-100 hover:from-indigo-200 hover:to-purple-200 border border-indigo-300 shadow-sm hover:shadow-md'}`}
                    title="Import configuration"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Import
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (e) => {
                            try {
                              const config = JSON.parse(e.target?.result as string);
                              if (Array.isArray(config)) {
                                const mapped = config.map((a, idx) => ({
                                  ...defaultAgent(idx + 1),
                                  ...a,
                                  id: `imported_${Date.now()}_${idx}`,
                                  dirty: true
                                }));
                                setAgents(mapped);
                                if (mapped[0]) setSelectedId(mapped[0].id);
                              }
                            } catch (error) {
                              alert('Invalid configuration file');
                            }
                          };
                          reader.readAsText(file);
                        }
                      }}
                    />
                  </label>
                </div>
                
                {agents.length > 2 && (
                  <span className="text-xs text-slate-500">
                    {agents.length} agents configured
                  </span>
                )}
              </div>

              {/* Template Cards */}
              <div className="mt-6 grid grid-cols-3 gap-4">
                <button
                  onClick={() => applyTemplate('research')}
                  className={`p-4 rounded-lg border-2 hover:border-blue-500 transition-all text-left transform hover:scale-[1.02] ${isDark ? 'bg-slate-800/50 hover:bg-slate-800 border-slate-700' : 'bg-gradient-to-br from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border-blue-200 shadow-md hover:shadow-xl'}`}
                >
                  <h3 className="font-medium text-sm mb-1">Research → Dev → Review</h3>
                  <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-blue-600'}`}>For research and development tasks</p>
                </button>
                <button
                  onClick={() => applyTemplate('data')}
                  className={`p-4 rounded-lg border-2 hover:border-blue-500 transition-all text-left transform hover:scale-[1.02] ${isDark ? 'bg-slate-800/50 hover:bg-slate-800 border-slate-700' : 'bg-gradient-to-br from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border-blue-200 shadow-md hover:shadow-xl'}`}
                >
                  <h3 className="font-medium text-sm mb-1">Data → Analyze → Report</h3>
                  <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-green-600'}`}>For data processing workflows</p>
                </button>
                <button
                  onClick={() => applyTemplate('code')}
                  className={`p-4 rounded-lg border-2 hover:border-blue-500 transition-all text-left transform hover:scale-[1.02] ${isDark ? 'bg-slate-800/50 hover:bg-slate-800 border-slate-700' : 'bg-gradient-to-br from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border-blue-200 shadow-md hover:shadow-xl'}`}
                >
                  <h3 className="font-medium text-sm mb-1">Plan → Code → QA</h3>
                  <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-purple-600'}`}>For software development</p>
                </button>
              </div>
            </div>

            {/* Workflow Preview */}
            {agents.length > 0 && (
              <div className="mb-8">
                <WorkflowPreview 
                  agents={agents}
                  executionMode={agents.length <= 2 ? 'sequential' : 'smart'}
                />
              </div>
            )}

            {/* Agent Editor */}
            {selectedAgent && (
              <div className={`p-6 backdrop-blur-lg rounded-xl border-2 ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-blue-200 shadow-xl'}`}>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold">{selectedAgent.name}</h2>
                    <p className={`text-sm font-semibold ${isDark ? 'text-slate-400' : 'text-blue-600'}`}>{selectedAgent.role}</p>
                  </div>
                  {selectedAgent.dirty && (
                    <span className="px-3 py-1 bg-amber-600/20 rounded-lg text-sm text-amber-400">
                      Unsaved changes
                    </span>
                  )}
                </div>

                {/* Collapsible Sections */}
                <div className="space-y-4">
                  {/* Overview Section */}
                  <div className={`border-2 rounded-lg overflow-hidden ${isDark ? 'border-slate-700' : 'border-blue-200 shadow-md'}`}>
                    <button
                      onClick={() => toggleSection('overview')}
                      className={`w-full px-4 py-3 transition-all flex items-center justify-between ${isDark ? 'bg-slate-800/50 hover:bg-slate-800' : 'bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border-l-4 border-blue-400'}`}
                    >
                      <span className="font-medium">Overview</span>
                      {expandedSections.has('overview') ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {expandedSections.has('overview') && (
                      <div className="p-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className={`block text-sm mb-1 font-semibold ${isDark ? 'text-slate-400' : 'text-blue-700'}`}>Name</label>
                            <input
                              type="text"
                              value={selectedAgent.name}
                              onChange={(e) => setAgent(selectedAgent.id, { name: e.target.value })}
                              className={`w-full px-3 py-2 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-blue-200 hover:border-blue-300 shadow-sm'}`}
                            />
                          </div>
                          <div>
                            <label className={`block text-sm mb-1 font-semibold ${isDark ? 'text-slate-400' : 'text-blue-700'}`}>Role</label>
                            <input
                              type="text"
                              value={selectedAgent.role}
                              onChange={(e) => setAgent(selectedAgent.id, { role: e.target.value })}
                              className={`w-full px-3 py-2 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-blue-200 hover:border-blue-300 shadow-sm'}`}
                            />
                          </div>
                        </div>
                        <div>
                          <label className={`block text-sm mb-1 font-semibold ${isDark ? 'text-slate-400' : 'text-blue-700'}`}>Description</label>
                          <textarea
                            value={selectedAgent.description}
                            onChange={(e) => setAgent(selectedAgent.id, { description: e.target.value })}
                            className={`w-full px-3 py-2 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-blue-200 hover:border-blue-300 shadow-sm'}`}
                            rows={2}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Prompt Section */}
                  <div className={`border-2 rounded-lg overflow-hidden ${isDark ? 'border-slate-700' : 'border-blue-200 shadow-md'}`}>
                    <button
                      onClick={() => toggleSection('prompt')}
                      className={`w-full px-4 py-3 transition-all flex items-center justify-between ${isDark ? 'bg-slate-800/50 hover:bg-slate-800' : 'bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border-l-4 border-blue-400'}`}
                    >
                      <span className="font-medium">System Prompt</span>
                      {expandedSections.has('prompt') ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {expandedSections.has('prompt') && (
                      <div className="p-4">
                        <textarea
                          value={selectedAgent.system_prompt}
                          onChange={(e) => setAgent(selectedAgent.id, { system_prompt: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-sm"
                          rows={6}
                        />
                      </div>
                    )}
                  </div>

                  {/* Tools Section with Enhanced Catalog */}
                  <div className={`border-2 rounded-lg overflow-hidden ${isDark ? 'border-slate-700' : 'border-blue-200 shadow-md'}`}>
                    <button
                      onClick={() => toggleSection('tools')}
                      className={`w-full px-4 py-3 transition-all flex items-center justify-between ${isDark ? 'bg-slate-800/50 hover:bg-slate-800' : 'bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border-l-4 border-blue-400'}`}
                    >
                      <span className="font-medium">Tools ({selectedAgent.tools.length})</span>
                      {expandedSections.has('tools') ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {expandedSections.has('tools') && (
                      <div className="p-4">
                        <EnhancedToolCatalog
                          selectedTools={selectedAgent.tools}
                          onToggleTool={(toolName) => {
                            const tools = selectedAgent.tools.includes(toolName)
                              ? selectedAgent.tools.filter(t => t !== toolName)
                              : [...selectedAgent.tools, toolName];
                            setAgent(selectedAgent.id, { tools });
                          }}
                          enabledTools={enabledTools}
                        />
                      </div>
                    )}
                  </div>

                  {/* Model Settings */}
                  <div className={`border-2 rounded-lg overflow-hidden ${isDark ? 'border-slate-700' : 'border-blue-200 shadow-md'}`}>
                    <button
                      onClick={() => toggleSection('model')}
                      className={`w-full px-4 py-3 transition-all flex items-center justify-between ${isDark ? 'bg-slate-800/50 hover:bg-slate-800' : 'bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border-l-4 border-blue-400'}`}
                    >
                      <span className="font-medium">Model Settings</span>
                      {expandedSections.has('model') ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {expandedSections.has('model') && (
                      <div className="p-4 space-y-4">
                        <div>
                          <label className="block text-sm text-slate-400 mb-2">Model</label>
                          <div className="grid grid-cols-2 gap-2">
                            {modelOptions.map(model => (
                              <button
                                key={model.value}
                                onClick={() => setAgent(selectedAgent.id, { model: model.value })}
                                className={`px-3 py-2 rounded-lg transition-all flex items-center gap-2 ${
                                  selectedAgent.model === model.value
                                    ? 'bg-blue-600/20 border border-blue-500/50 text-blue-400'
                                    : 'bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/50'
                                }`}
                              >
                                <span>{model.icon}</span>
                                <span className="text-sm">{model.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm text-slate-400 mb-2">
                            Temperature: {selectedAgent.temperature.toFixed(1)}
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={selectedAgent.temperature}
                            onChange={(e) => setAgent(selectedAgent.id, { temperature: parseFloat(e.target.value) })}
                            className="w-full"
                          />
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedAgent.auto_approve || false}
                            onChange={(e) => setAgent(selectedAgent.id, { auto_approve: e.target.checked })}
                            className="rounded border-slate-600"
                          />
                          <span className="text-sm">Auto-approve tool calls</span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
