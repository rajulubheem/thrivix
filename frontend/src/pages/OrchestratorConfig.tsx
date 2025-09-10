import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Bot, Save, Play, Plus, Trash2, Search, Brain, Loader2,
  Sparkles, Code, Database, Shield, Zap, ChevronDown, ChevronUp,
  Settings, CheckCircle, XCircle, Moon, Sun
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../contexts/ThemeContext';

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
      const res = await fetch('/api/v1/unified/orchestrate', {
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="flex h-screen">
        {/* Left Sidebar */}
        <div className="w-80 bg-slate-900/50 backdrop-blur-lg border-r border-slate-800 flex flex-col">
          <div className="h-16 border-b border-slate-800 flex items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/swarm')}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h2 className="font-semibold">Agent Configuration</h2>
                <p className="text-xs text-slate-400">Design your swarm</p>
              </div>
            </div>
            <button
              onClick={addAgent}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-blue-400"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>

          <div className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search agents..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <AnimatePresence>
              {filteredAgents.map((agent, index) => (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => setSelectedId(agent.id)}
                  className={`mb-2 p-3 rounded-lg cursor-pointer transition-all ${
                    selectedId === agent.id
                      ? 'bg-blue-600/20 border border-blue-500/50'
                      : 'bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-blue-600/20 rounded-lg mt-0.5">
                        <Bot className="h-4 w-4 text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-sm">{agent.name}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">{agent.role}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          <span className="px-2 py-0.5 bg-slate-700/50 rounded text-xs">
                            {agent.model}
                          </span>
                          {agent.tools.length > 0 && (
                            <span className="px-2 py-0.5 bg-blue-600/20 rounded text-xs text-blue-400">
                              {agent.tools.length} tools
                            </span>
                          )}
                          {agent.dirty && (
                            <span className="px-2 py-0.5 bg-amber-600/20 rounded text-xs text-amber-400">
                              unsaved
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAgent(agent.id);
                      }}
                      className={`p-1 ${isDark ? 'hover:bg-red-600/20' : 'hover:bg-red-100'} rounded transition-colors`}
                    >
                      <Trash2 className={`h-3.5 w-3.5 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="border-t border-slate-800 p-4 flex gap-2">
            <button
              onClick={saveAll}
              className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors flex items-center justify-center gap-2"
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
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto p-8">
            {/* AI Generation Panel */}
            <div className="mb-8 p-6 bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800">
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
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                rows={3}
              />

              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-slate-400">Max Agents</label>
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

              {/* Template Cards */}
              <div className="mt-6 grid grid-cols-3 gap-4">
                <button
                  onClick={() => applyTemplate('research')}
                  className="p-4 bg-slate-800/50 hover:bg-slate-800 rounded-lg border border-slate-700 hover:border-blue-500 transition-all text-left"
                >
                  <h3 className="font-medium text-sm mb-1">Research → Dev → Review</h3>
                  <p className="text-xs text-slate-400">For research and development tasks</p>
                </button>
                <button
                  onClick={() => applyTemplate('data')}
                  className="p-4 bg-slate-800/50 hover:bg-slate-800 rounded-lg border border-slate-700 hover:border-blue-500 transition-all text-left"
                >
                  <h3 className="font-medium text-sm mb-1">Data → Analyze → Report</h3>
                  <p className="text-xs text-slate-400">For data processing workflows</p>
                </button>
                <button
                  onClick={() => applyTemplate('code')}
                  className="p-4 bg-slate-800/50 hover:bg-slate-800 rounded-lg border border-slate-700 hover:border-blue-500 transition-all text-left"
                >
                  <h3 className="font-medium text-sm mb-1">Plan → Code → QA</h3>
                  <p className="text-xs text-slate-400">For software development</p>
                </button>
              </div>
            </div>

            {/* Tools Selection */}
            <div className="mb-8 p-6 bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Available Tools</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEnabledTools(new Set(availableTools))}
                    className="px-3 py-1 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => setEnabledTools(new Set())}
                    className="px-3 py-1 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search tools..."
                  value={toolsSearch}
                  onChange={(e) => setToolsSearch(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 max-h-64 overflow-y-auto">
                {(() => {
                  // Group enabled tools by category using availableToolInfo
                  const groups: Record<string, string[]> = {};
                  availableToolInfo
                    .filter(t => availableTools.includes(t.name))
                    .filter(t => t.name.toLowerCase().includes(toolsSearch.toLowerCase()))
                    .forEach(t => {
                      const cat = (t.category || 'other').toString();
                      if (!groups[cat]) groups[cat] = [];
                      groups[cat].push(t.name);
                    });
                  const ordered = Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
                  if (!ordered.length) return (
                    <div className="col-span-2 text-sm text-slate-400">No matching tools</div>
                  );
                  return ordered.map(([cat, names]) => (
                    <div key={cat} className="mb-2">
                      <h3 className="text-xs font-medium text-slate-400 uppercase mb-2">{cat} ({names.length})</h3>
                      {names.sort((a, b) => a.localeCompare(b)).map(tool => (
                        <button
                          key={tool}
                          onClick={() => {
                            const next = new Set(enabledTools);
                            if (next.has(tool)) next.delete(tool); else next.add(tool);
                            setEnabledTools(next);
                          }}
                          className={`w-full text-left px-3 py-1.5 mb-1 rounded-lg transition-all flex items-center justify-between ${
                            enabledTools.has(tool)
                              ? 'bg-blue-600/20 border border-blue-500/50 text-blue-400'
                              : 'bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/50'
                          }`}
                        >
                          <span className="text-sm">{tool}</span>
                          {enabledTools.has(tool) && <CheckCircle className="h-3.5 w-3.5" />}
                        </button>
                      ))}
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Agent Editor */}
            {selectedAgent && (
              <div className="p-6 bg-slate-900/50 backdrop-blur-lg rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold">{selectedAgent.name}</h2>
                    <p className="text-sm text-slate-400">{selectedAgent.role}</p>
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
                  <div className="border border-slate-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleSection('overview')}
                      className="w-full px-4 py-3 bg-slate-800/50 hover:bg-slate-800 transition-colors flex items-center justify-between"
                    >
                      <span className="font-medium">Overview</span>
                      {expandedSections.has('overview') ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {expandedSections.has('overview') && (
                      <div className="p-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm text-slate-400 mb-1">Name</label>
                            <input
                              type="text"
                              value={selectedAgent.name}
                              onChange={(e) => setAgent(selectedAgent.id, { name: e.target.value })}
                              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-slate-400 mb-1">Role</label>
                            <input
                              type="text"
                              value={selectedAgent.role}
                              onChange={(e) => setAgent(selectedAgent.id, { role: e.target.value })}
                              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm text-slate-400 mb-1">Description</label>
                          <textarea
                            value={selectedAgent.description}
                            onChange={(e) => setAgent(selectedAgent.id, { description: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            rows={2}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Prompt Section */}
                  <div className="border border-slate-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleSection('prompt')}
                      className="w-full px-4 py-3 bg-slate-800/50 hover:bg-slate-800 transition-colors flex items-center justify-between"
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

                  {/* Tools Section */}
                  <div className="border border-slate-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleSection('tools')}
                      className="w-full px-4 py-3 bg-slate-800/50 hover:bg-slate-800 transition-colors flex items-center justify-between"
                    >
                      <span className="font-medium">Tools ({selectedAgent.tools.length})</span>
                      {expandedSections.has('tools') ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {expandedSections.has('tools') && (
                      <div className="p-4">
                        {(() => {
                          const selected = selectedAgent.tools || [];
                          const others = Array.from(new Set(availableTools.filter(t => !selected.includes(t))));
                          return (
                            <div className="space-y-4">
                              {/* Selected first */}
                              <div>
                                <div className="text-xs font-medium text-slate-400 uppercase mb-2">Selected ({selected.length})</div>
                                <div className="flex flex-wrap gap-2">
                                  {selected.length === 0 && (
                                    <span className="text-xs text-slate-500">No tools selected</span>
                                  )}
                                  {selected.map(tool => (
                                    <button
                                      key={tool}
                                      onClick={() => {
                                        const tools = selected.filter(t => t !== tool);
                                        setAgent(selectedAgent.id, { tools });
                                      }}
                                      className={`px-3 py-1 rounded-lg transition-all bg-blue-600/20 border border-blue-500/50 text-blue-400 flex items-center gap-1`}
                                    >
                                      <CheckCircle className="h-3.5 w-3.5" />
                                      <span>{tool}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {/* Available next */}
                              <div>
                                <div className="text-xs font-medium text-slate-400 uppercase mb-2">Available</div>
                                <div className="flex flex-wrap gap-2">
                                  {others.map(tool => (
                                    <button
                                      key={tool}
                                      onClick={() => {
                                        const tools = [...selected, tool];
                                        setAgent(selectedAgent.id, { tools });
                                      }}
                                      className={`px-3 py-1 rounded-lg transition-all bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/50`}
                                    >
                                      {tool}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Model Settings */}
                  <div className="border border-slate-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleSection('model')}
                      className="w-full px-4 py-3 bg-slate-800/50 hover:bg-slate-800 transition-colors flex items-center justify-between"
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
