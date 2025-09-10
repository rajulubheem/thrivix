import React, { useState, useEffect } from 'react';
import { 
  ChevronDown, 
  ChevronUp, 
  Plus, 
  Trash2, 
  Play, 
  Settings,
  Code,
  Globe,
  Database,
  Mail,
  Image,
  Terminal,
  FileText,
  Search,
  Brain,
  Shuffle,
  Save,
  RefreshCw,
  Sparkles,
  Zap,
  ChevronRight
} from 'lucide-react';
import './OrchestratorPanel.css';

interface Tool {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  tools: string[];
  model: string;
  temperature: number;
  system_prompt: string;
  color: string;
}

// Persistent state interface
interface PersistentState {
  taskInput: string;
  agents: Agent[];
  selectedTools: { [agentId: string]: string[] };
  expandedAgent: string | null;
  showToolLibrary: boolean;
  selectedCategory: string;
}

interface OrchestratorPanelProps {
  onWorkflowStart: (workflow: any) => void;
  currentWorkflow: any;
  persistentState?: PersistentState;
  onStateUpdate?: (updates: Partial<PersistentState>) => void;
}

const AVAILABLE_TOOLS: Tool[] = [
  // File Operations
  { id: 'file_read', name: 'File Read', category: 'File Operations', description: 'Read file contents', icon: <FileText size={12} />, color: '#10b981' },
  { id: 'file_write', name: 'File Write', category: 'File Operations', description: 'Write to files', icon: <FileText size={12} />, color: '#10b981' },
  { id: 'file_delete', name: 'File Delete', category: 'File Operations', description: 'Delete files', icon: <Trash2 size={12} />, color: '#10b981' },
  { id: 'directory_list', name: 'List Directory', category: 'File Operations', description: 'List directory contents', icon: <FileText size={12} />, color: '#10b981' },
  
  // Code Tools
  { id: 'code_execute', name: 'Execute Code', category: 'Code Tools', description: 'Execute code snippets', icon: <Code size={12} />, color: '#3b82f6' },
  { id: 'python_repl', name: 'Python REPL', category: 'Code Tools', description: 'Python interpreter', icon: <Terminal size={12} />, color: '#3b82f6' },
  { id: 'shell_command', name: 'Shell Command', category: 'Code Tools', description: 'Execute shell commands', icon: <Terminal size={12} />, color: '#3b82f6' },
  
  // Web Tools
  { id: 'web_search', name: 'Web Search', category: 'Web Tools', description: 'Search the web', icon: <Search size={12} />, color: '#f59e0b' },
  { id: 'web_scrape', name: 'Web Scrape', category: 'Web Tools', description: 'Scrape web pages', icon: <Globe size={12} />, color: '#f59e0b' },
  { id: 'http_request', name: 'HTTP Request', category: 'Web Tools', description: 'Make HTTP requests', icon: <Globe size={12} />, color: '#f59e0b' },
  
  // Data Tools
  { id: 'data_query', name: 'Data Query', category: 'Data Tools', description: 'Query databases', icon: <Database size={12} />, color: '#8b5cf6' },
  { id: 'csv_analyze', name: 'CSV Analyze', category: 'Data Tools', description: 'Analyze CSV files', icon: <Database size={12} />, color: '#8b5cf6' },
  { id: 'json_parse', name: 'JSON Parse', category: 'Data Tools', description: 'Parse JSON data', icon: <Database size={12} />, color: '#8b5cf6' },
  
  // AI Tools
  { id: 'generate_image', name: 'Generate Image', category: 'AI Tools', description: 'Generate images with AI', icon: <Image size={12} />, color: '#ec4899' },
  { id: 'text_summary', name: 'Text Summary', category: 'AI Tools', description: 'Summarize text', icon: <Brain size={12} />, color: '#ec4899' },
  { id: 'sentiment_analysis', name: 'Sentiment Analysis', category: 'AI Tools', description: 'Analyze sentiment', icon: <Brain size={12} />, color: '#ec4899' },
  
  // Communication
  { id: 'send_email', name: 'Send Email', category: 'Communication', description: 'Send emails', icon: <Mail size={12} />, color: '#06b6d4' },
  { id: 'slack_message', name: 'Slack Message', category: 'Communication', description: 'Send Slack messages', icon: <Mail size={12} />, color: '#06b6d4' },
];

const MODELS = [
  { id: 'gpt-4o', name: 'GPT-4 Optimized', description: 'Most capable, best for complex tasks', badge: 'Recommended' },
  { id: 'gpt-4o-mini', name: 'GPT-4 Mini', description: 'Fast and efficient for simple tasks', badge: 'Fast' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fastest, good for basic tasks', badge: 'Economy' },
];

const AGENT_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#10b981' },
  { name: 'Orange', value: '#f59e0b' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Indigo', value: '#6366f1' },
];

export const OrchestratorPanel: React.FC<OrchestratorPanelProps> = ({
  onWorkflowStart,
  currentWorkflow,
  persistentState,
  onStateUpdate
}) => {
  // Initialize state from persistent state or defaults
  const [taskInput, setTaskInput] = useState(persistentState?.taskInput || '');
  const [agents, setAgents] = useState<Agent[]>(persistentState?.agents || []);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(persistentState?.expandedAgent || null);
  const [selectedTools, setSelectedTools] = useState<{ [agentId: string]: string[] }>(persistentState?.selectedTools || {});
  const [isGenerating, setIsGenerating] = useState(false);
  const [showToolLibrary, setShowToolLibrary] = useState(persistentState?.showToolLibrary || false);
  const [selectedCategory, setSelectedCategory] = useState<string>(persistentState?.selectedCategory || 'all');
  const [realEnabledTools, setRealEnabledTools] = useState<string[]>([]);

  // FIXED: Sync with persistent state when it changes
  useEffect(() => {
    if (persistentState) {
      setTaskInput(persistentState.taskInput);
      setAgents(persistentState.agents);
      setExpandedAgent(persistentState.expandedAgent);
      setSelectedTools(persistentState.selectedTools);
      setShowToolLibrary(persistentState.showToolLibrary);
      setSelectedCategory(persistentState.selectedCategory);
    }
  }, [persistentState]);

  // Load real enabled tools from backend to inform orchestration and highlighting
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('http://localhost:8000/api/v1/tools/tools/available');
        if (!res.ok) return;
        const data = await res.json();
        const tools = Array.isArray(data?.tools) ? data.tools : [];
        const names = tools.filter((t: any) => t?.enabled).map((t: any) => t?.name).filter(Boolean);
        setRealEnabledTools(names as string[]);
      } catch {}
    })();
  }, []);

  // FIXED: Update persistent state when local state changes
  const updatePersistentState = (updates: Partial<PersistentState>) => {
    if (onStateUpdate) {
      onStateUpdate(updates);
    }
  };

  const generateLocalAgents = () => {
    const task = taskInput.toLowerCase();
    
    let generatedAgents: Agent[] = [];
    
    if (task.includes('website') || task.includes('web')) {
      generatedAgents = [
        {
          id: `agent-${Date.now()}-0`,
          name: 'Requirements Analyst',
          role: 'Analyze website requirements and create specifications',
          tools: ['web_search', 'file_write'],
          model: 'gpt-4o',
          temperature: 0.7,
          system_prompt: `Analyze requirements for: ${taskInput}`,
          color: AGENT_COLORS[0].value
        },
        {
          id: `agent-${Date.now()}-1`,
          name: 'Frontend Developer',
          role: 'Develop frontend code and components',
          tools: ['file_write', 'code_execute', 'python_repl'],
          model: 'gpt-4o',
          temperature: 0.7,
          system_prompt: `Create frontend code for: ${taskInput}`,
          color: AGENT_COLORS[1].value
        },
        {
          id: `agent-${Date.now()}-2`,
          name: 'UI Designer',
          role: 'Design user interface and experience',
          tools: ['generate_image', 'file_write'],
          model: 'gpt-4o-mini',
          temperature: 0.8,
          system_prompt: `Design UI for: ${taskInput}`,
          color: AGENT_COLORS[2].value
        }
      ];
    } else if (task.includes('data') || task.includes('analyze')) {
      generatedAgents = [
        {
          id: `agent-${Date.now()}-0`,
          name: 'Data Collector',
          role: 'Collect and prepare data from various sources',
          tools: ['web_search', 'csv_analyze', 'file_read'],
          model: 'gpt-4o',
          temperature: 0.5,
          system_prompt: `Collect data for: ${taskInput}`,
          color: AGENT_COLORS[3].value
        },
        {
          id: `agent-${Date.now()}-1`,
          name: 'Data Analyst',
          role: 'Analyze and process collected data',
          tools: ['data_query', 'python_repl', 'json_parse'],
          model: 'gpt-4o',
          temperature: 0.6,
          system_prompt: `Analyze data for: ${taskInput}`,
          color: AGENT_COLORS[4].value
        },
        {
          id: `agent-${Date.now()}-2`,
          name: 'Report Generator',
          role: 'Generate insights and comprehensive reports',
          tools: ['file_write', 'text_summary', 'generate_image'],
          model: 'gpt-4o',
          temperature: 0.7,
          system_prompt: `Generate report for: ${taskInput}`,
          color: AGENT_COLORS[5].value
        }
      ];
    } else {
      generatedAgents = [
        {
          id: `agent-${Date.now()}-0`,
          name: 'Research Specialist',
          role: 'Research and gather relevant information',
          tools: ['web_search', 'web_scrape', 'file_write'],
          model: 'gpt-4o',
          temperature: 0.7,
          system_prompt: `Research and gather information for: ${taskInput}`,
          color: AGENT_COLORS[6].value
        },
        {
          id: `agent-${Date.now()}-1`,
          name: 'Implementation Expert',
          role: 'Implement the solution effectively',
          tools: ['file_write', 'code_execute', 'python_repl'],
          model: 'gpt-4o',
          temperature: 0.7,
          system_prompt: `Implement solution for: ${taskInput}`,
          color: AGENT_COLORS[7].value
        },
        {
          id: `agent-${Date.now()}-2`,
          name: 'Quality Reviewer',
          role: 'Review and validate all results',
          tools: ['file_read', 'text_summary', 'sentiment_analysis'],
          model: 'gpt-4o-mini',
          temperature: 0.6,
          system_prompt: `Review and validate results for: ${taskInput}`,
          color: AGENT_COLORS[0].value
        }
      ];
    }
    
    setAgents(generatedAgents);
    
    const toolsMap: { [key: string]: string[] } = {};
    generatedAgents.forEach(agent => {
      toolsMap[agent.id] = agent.tools;
    });
    setSelectedTools(toolsMap);
    
    // FIXED: Update persistent state
    updatePersistentState({
      agents: generatedAgents,
      selectedTools: toolsMap
    });
  };

  const generateDynamicAgents = async () => {
    if (!taskInput.trim()) return;
    
    setIsGenerating(true);
    try {
      const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      let token = localStorage.getItem('access_token') || localStorage.getItem('token');
      if (!token) {
        token = 'demo-token';
        localStorage.setItem('access_token', token);
      }
      
      const response = await fetch(`${baseUrl}/orchestrator/orchestrate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          task: taskInput,
          preferences: {
            generate_unique: true,
            avoid_templates: true
          },
          context: { allowed_tools: realEnabledTools }
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        const newAgents: Agent[] = result.agents.map((agent: any, index: number) => ({
          id: `agent-${Date.now()}-${index}`,
          name: agent.name,
          role: agent.role || agent.description,
          tools: agent.tools || [],
          model: agent.model || 'gpt-4o-mini',
          temperature: 0.7,
          system_prompt: agent.system_prompt,
          color: AGENT_COLORS[index % AGENT_COLORS.length].value
        }));
        
        setAgents(newAgents);
        
        const toolsMap: { [key: string]: string[] } = {};
        newAgents.forEach(agent => {
          toolsMap[agent.id] = agent.tools;
        });
        setSelectedTools(toolsMap);
        
        // FIXED: Update persistent state
        updatePersistentState({
          agents: newAgents,
          selectedTools: toolsMap
        });
      } else if (response.status === 401) {
        console.log('Using local agent generation as fallback');
        generateLocalAgents();
      }
    } catch (error) {
      console.error('Failed to generate agents:', error);
      generateLocalAgents();
    } finally {
      setIsGenerating(false);
    }
  };

  const addCustomAgent = () => {
    const newAgent: Agent = {
      id: `agent-${Date.now()}`,
      name: `Custom Agent ${agents.length + 1}`,
      role: 'Define the role of this agent',
      tools: [],
      model: 'gpt-4o-mini',
      temperature: 0.7,
      system_prompt: 'You are a helpful assistant.',
      color: AGENT_COLORS[agents.length % AGENT_COLORS.length].value
    };
    
    const updatedAgents = [...agents, newAgent];
    const updatedSelectedTools = { ...selectedTools, [newAgent.id]: [] };
    
    setAgents(updatedAgents);
    setSelectedTools(updatedSelectedTools);
    setExpandedAgent(newAgent.id);
    
    // FIXED: Update persistent state
    updatePersistentState({
      agents: updatedAgents,
      selectedTools: updatedSelectedTools,
      expandedAgent: newAgent.id
    });
  };

  const removeAgent = (agentId: string) => {
    const updatedAgents = agents.filter(a => a.id !== agentId);
    const newSelectedTools = { ...selectedTools };
    delete newSelectedTools[agentId];
    
    setAgents(updatedAgents);
    setSelectedTools(newSelectedTools);
    
    // FIXED: Update persistent state
    updatePersistentState({
      agents: updatedAgents,
      selectedTools: newSelectedTools
    });
  };

  const updateAgent = (agentId: string, field: string, value: any) => {
    const updatedAgents = agents.map(agent => 
      agent.id === agentId ? { ...agent, [field]: value } : agent
    );
    
    setAgents(updatedAgents);
    
    // FIXED: Update persistent state
    updatePersistentState({
      agents: updatedAgents
    });
  };

  const toggleTool = (agentId: string, toolId: string) => {
    const currentTools = selectedTools[agentId] || [];
    const newTools = currentTools.includes(toolId)
      ? currentTools.filter(t => t !== toolId)
      : [...currentTools, toolId];
    
    const updatedSelectedTools = { ...selectedTools, [agentId]: newTools };
    setSelectedTools(updatedSelectedTools);
    updateAgent(agentId, 'tools', newTools);
    
    // FIXED: Update persistent state
    updatePersistentState({
      selectedTools: updatedSelectedTools
    });
  };

  // FIXED: Update task input with persistence
  const handleTaskInputChange = (value: string) => {
    setTaskInput(value);
    updatePersistentState({ taskInput: value });
  };

  // FIXED: Update expanded agent with persistence
  const handleExpandedAgentChange = (agentId: string | null) => {
    setExpandedAgent(agentId);
    updatePersistentState({ expandedAgent: agentId });
  };

  // FIXED: Update tool library visibility with persistence
  const handleToolLibraryToggle = () => {
    const newValue = !showToolLibrary;
    setShowToolLibrary(newValue);
    updatePersistentState({ showToolLibrary: newValue });
  };

  // FIXED: Update selected category with persistence
  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    updatePersistentState({ selectedCategory: category });
  };

  const executeWorkflow = () => {
    if (agents.length === 0) return;
    
    const workflow = {
      id: `workflow-${Date.now()}`,
      name: `Dynamic: ${taskInput}`,
      description: taskInput,
      tasks: agents.map((agent, index) => ({
        task_id: `task-${index}`,
        agent_type: agent.name,
        description: agent.role,
        system_prompt: agent.system_prompt,
        tools: agent.tools,
        dependencies: index > 0 ? [`task-${index - 1}`] : [],
        priority: agents.length - index,
        shared_memory_keys: [],
        output_artifacts: [],
        status: 'pending'
      })),
      agents: agents.map(agent => ({
        name: agent.name,
        system_prompt: agent.system_prompt,
        tools: agent.tools,
        model: agent.model || 'gpt-4o',
        temperature: agent.temperature,
        role: agent.role
      })),
      created_at: new Date().toISOString(),
      is_dynamic: true,
      shared_memory: {},
      context_flow: {}
    };
    
    onWorkflowStart(workflow);
  };

  const categories = ['all', ...Array.from(new Set(AVAILABLE_TOOLS.map(t => t.category)))];
  const filteredTools = selectedCategory === 'all' 
    ? AVAILABLE_TOOLS 
    : AVAILABLE_TOOLS.filter(t => t.category === selectedCategory);

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      'File Operations': '#10b981',
      'Code Tools': '#3b82f6',
      'Web Tools': '#f59e0b',
      'Data Tools': '#8b5cf6',
      'AI Tools': '#ec4899',
      'Communication': '#06b6d4'
    };
    return colors[category] || '#6b7280';
  };

  return (
    <div className="orchestrator-container">
      {/* Header Section */}
      <div className="orchestrator-header">
        <div className="header-left">
          <div className="header-icon">
            <Sparkles size={22} color="white" />
          </div>
          <div>
            <h1>Dynamic Agent Orchestrator</h1>
            <p className="header-subtitle">Create intelligent multi-agent workflows</p>
          </div>
        </div>
        <button 
          className={`tool-library-toggle ${showToolLibrary ? 'active' : ''}`}
          onClick={handleToolLibraryToggle}
        >
          <Settings size={16} />
          Tool Library
        </button>
      </div>

      {/* Task Input Section */}
      <div className="task-section">
        <div className="task-input-wrapper">
          <textarea
            value={taskInput}
            onChange={(e) => handleTaskInputChange(e.target.value)}
            placeholder="Describe your task... (e.g., 'Create a website for a coffee shop')"
            className="task-input"
          />
          <div className="task-hint">
            Tip: Be specific about what you want to achieve for better agent generation
          </div>
        </div>
        <div className="task-actions">
          <button 
            onClick={generateDynamicAgents}
            disabled={isGenerating || !taskInput.trim()}
            className="generate-btn primary"
          >
            {isGenerating ? (
              <>
                <RefreshCw size={16} className="spinning" />
                Generating Agents...
              </>
            ) : (
              <>
                <Zap size={16} />
                Generate Agents
              </>
            )}
          </button>
          <button onClick={addCustomAgent} className="generate-btn secondary">
            <Plus size={16} />
            Add Custom
          </button>
        </div>
      </div>

      {/* Tool Library Section */}
      {showToolLibrary && (
        <div className="tool-library-section">
          <div className="library-header">
            <h3>Available Tools</h3>
            {realEnabledTools.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: '#9aa0b4', marginBottom: 6 }}>Real Enabled Tools</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {realEnabledTools.map((t) => (
                    <button
                      key={t}
                      className={`category-pill ${agents.some(a => (a.tools || []).includes(t)) ? 'active' : ''}`}
                      onClick={() => {
                        const currentId = expandedAgent || (agents[0]?.id);
                        if (!currentId) return;
                        // Update agents array and selectedTools map in sync
                        let updatedAgents = agents.map(a => {
                          if (a.id !== currentId) return a;
                          const has = (a.tools || []).includes(t);
                          const tools = has ? a.tools.filter(x => x !== t) : [...(a.tools || []), t];
                          return { ...a, tools };
                        });
                        setAgents(updatedAgents);
                        const cur = selectedTools[currentId] || [];
                        const curHas = cur.includes(t);
                        const nextTools = curHas ? cur.filter(x => x !== t) : [...cur, t];
                        const updatedSelected = { ...selectedTools, [currentId]: nextTools };
                        setSelectedTools(updatedSelected);
                        // Persist via parent
                        onStateUpdate && onStateUpdate({ selectedTools: updatedSelected, agents: updatedAgents });
                      }}
                    >{t}</button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ 
              padding: '16px', 
              background: 'linear-gradient(135deg, rgba(74, 158, 255, 0.15), rgba(139, 92, 246, 0.15))', 
              border: '1px solid rgba(74, 158, 255, 0.3)', 
              borderRadius: '10px', 
              marginBottom: '20px',
              fontSize: '14px',
              color: '#ffffff',
              lineHeight: '1.6'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '18px' }}>💡</span>
                <strong style={{ fontSize: '15px' }}>Understanding Tool Configuration</strong>
              </div>
              <div style={{ color: '#e4e6eb' }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ color: '#4a9eff' }}>Here in Orchestrator:</strong> Select <em>tool capabilities</em> for agents
                  <br />
                  <span style={{ fontSize: '13px', color: '#8b92a8' }}>
                    These are templates that define what types of actions agents can perform
                  </span>
                </div>
                <div>
                  <strong style={{ color: '#10b981' }}>In Settings Page:</strong> Configure <em>actual implementations</em>
                  <br />
                  <span style={{ fontSize: '13px', color: '#8b92a8' }}>
                    Connect MCP servers, add API keys, and enable/disable specific tools
                  </span>
                </div>
              </div>
            </div>
            <div className="category-pills">
              {categories.map(cat => (
                <button
                  key={cat}
                  className={`category-pill ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => handleCategoryChange(cat)}
                  style={{
                    backgroundColor: selectedCategory === cat ? getCategoryColor(cat) : 'transparent',
                    borderColor: getCategoryColor(cat)
                  }}
                >
                  {cat === 'all' ? 'All Tools' : cat}
                </button>
              ))}
            </div>
          </div>
          <div className="tools-grid">
            {filteredTools.map(tool => (
              <div 
                key={tool.id} 
                className="tool-card"
                style={{ borderColor: tool.color }}
              >
                <div className="tool-icon" style={{ backgroundColor: tool.color + '20', color: tool.color }}>
                  {tool.icon}
                </div>
                <div className="tool-content">
                  <div className="tool-name">{tool.name}</div>
                  <div className="tool-description">{tool.description}</div>
                  <div className="tool-category" style={{ color: tool.color }}>
                    {tool.category}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agents Section - Now scrollable */}
      {agents.length > 0 && (
        <div className="agents-section">
          <div className="agents-header">
            <h3>Generated Agents ({agents.length})</h3>
            <div className="agents-hint">Click on an agent to configure its settings</div>
          </div>
          
          <div className="agents-grid">
            {agents.map((agent, index) => (
              <div 
                key={agent.id} 
                className={`agent-card ${expandedAgent === agent.id ? 'expanded' : ''}`}
                style={{ '--agent-color': agent.color } as React.CSSProperties}
              >
                <div className="agent-header">
                  <div className="agent-number" style={{ backgroundColor: agent.color }}>
                    {index + 1}
                  </div>
                  <div className="agent-info">
                    <input
                      type="text"
                      value={agent.name}
                      onChange={(e) => updateAgent(agent.id, 'name', e.target.value)}
                      className="agent-name"
                      placeholder="Agent name..."
                    />
                    <input
                      type="text"
                      value={agent.role}
                      onChange={(e) => updateAgent(agent.id, 'role', e.target.value)}
                      className="agent-role"
                      placeholder="Agent role..."
                    />
                  </div>
                  <div className="agent-actions">
                    <button
                      onClick={() => handleExpandedAgentChange(expandedAgent === agent.id ? null : agent.id)}
                      className="expand-btn"
                    >
                      {expandedAgent === agent.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <button
                      onClick={() => removeAgent(agent.id)}
                      className="delete-btn"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="agent-tools-preview">
                  <div className="tools-count">
                    {agent.tools.length} tools selected
                  </div>
                  <div className="tools-chips">
                    {agent.tools.slice(0, 3).map(toolId => {
                      const tool = AVAILABLE_TOOLS.find(t => t.id === toolId);
                      return tool ? (
                        <span key={toolId} className="tool-chip" style={{ backgroundColor: tool.color + '20', color: tool.color }}>
                          {tool.name}
                        </span>
                      ) : null;
                    })}
                    {agent.tools.length > 3 && (
                      <span className="tool-chip more">+{agent.tools.length - 3} more</span>
                    )}
                  </div>
                </div>

                {expandedAgent === agent.id && (
                  <div className="agent-details">
                    <div className="details-section">
                      <label className="section-label">Model Configuration</label>
                      <div className="model-selector">
                        {MODELS.map(model => (
                          <div
                            key={model.id}
                            className={`model-option ${agent.model === model.id ? 'selected' : ''}`}
                            onClick={() => updateAgent(agent.id, 'model', model.id)}
                          >
                            <div className="model-header">
                              <span className="model-name">{model.name}</span>
                              {model.badge && <span className="model-badge">{model.badge}</span>}
                            </div>
                            <span className="model-description">{model.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="details-section">
                      <label className="section-label">
                        Temperature: <span className="temperature-value">{agent.temperature}</span>
                      </label>
                      <div className="temperature-slider">
                        <span className="temp-label">Precise</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={agent.temperature}
                          onChange={(e) => updateAgent(agent.id, 'temperature', parseFloat(e.target.value))}
                          style={{ '--value': `${agent.temperature * 100}%` } as React.CSSProperties}
                        />
                        <span className="temp-label">Creative</span>
                      </div>
                    </div>

                    <div className="details-section">
                      <label className="section-label">Agent Color</label>
                      <div className="color-selector">
                        {AGENT_COLORS.map(color => (
                          <button
                            key={color.value}
                            className={`color-option ${agent.color === color.value ? 'selected' : ''}`}
                            style={{ backgroundColor: color.value }}
                            onClick={() => updateAgent(agent.id, 'color', color.value)}
                            title={color.name}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="details-section">
                      <label className="section-label">System Prompt</label>
                      <textarea
                        value={agent.system_prompt}
                        onChange={(e) => updateAgent(agent.id, 'system_prompt', e.target.value)}
                        className="system-prompt"
                        placeholder="Define the agent's behavior and instructions..."
                      />
                    </div>

                    <div className="details-section">
                      <label className="section-label">Select Tools</label>
                      <div className="tools-selection">
                        {Object.entries(
                          AVAILABLE_TOOLS.reduce((acc, tool) => {
                            if (!acc[tool.category]) acc[tool.category] = [];
                            acc[tool.category].push(tool);
                            return acc;
                          }, {} as { [key: string]: Tool[] })
                        ).map(([category, tools]) => (
                          <div key={category} className="tool-category">
                            <div className="category-header" style={{ color: getCategoryColor(category) }}>
                              {category}
                            </div>
                            <div className="category-tools">
                              {tools.map(tool => (
                                <label
                                  key={tool.id}
                                  className={`tool-option ${agent.tools.includes(tool.id) ? 'selected' : ''}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={agent.tools.includes(tool.id)}
                                    onChange={() => toggleTool(agent.id, tool.id)}
                                  />
                                  <span className="tool-icon" style={{ color: tool.color }}>
                                    {tool.icon}
                                  </span>
                                  <span className="tool-name">{tool.name}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Execute Button - Always visible at bottom */}
      {agents.length > 0 && (
        <div className="execute-section">
          <button onClick={executeWorkflow} className="execute-btn">
            <Play size={16} />
            Execute Workflow with {agents.length} Agents
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
};
