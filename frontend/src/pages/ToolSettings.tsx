import React, { useState, useEffect } from 'react';
import {
  Settings,
  Wrench,
  Server,
  PlayCircle,
  StopCircle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  AlertCircle,
  Info,
  Search,
  Filter,
  ToggleLeft,
  ToggleRight,
  TestTube,
  Activity,
  Globe,
  FileText,
  Code,
  Database,
  MessageCircle,
  Shield,
  Zap,
  Package
} from 'lucide-react';
import '../styles/ToolSettings.css';

interface ToolConfig {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  status: 'enabled' | 'disabled' | 'error' | 'not_configured';
  version?: string;
  author?: string;
  icon?: string;
  config: Record<string, any>;
  required_env_vars: string[];
  requires_approval: boolean;
  rate_limit?: number;
  timeout: number;
  mcp_server_id?: string;
  usage_count: number;
  last_used?: string;
  error_count: number;
  last_error?: string;
  allowed_agents: string[];
  blocked_agents: string[];
}

interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  auto_start: boolean;
  status: string;
  last_connected?: string;
  error_message?: string;
}

interface CategoryInfo {
  id: string;
  name: string;
  count: number;
  enabled: number;
}

const ToolSettings: React.FC = () => {
  const [tools, setTools] = useState<ToolConfig[]>([]);
  const [mcpServers, setMCPServers] = useState<MCPServerConfig[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [statistics, setStatistics] = useState<any>({
    total_tools: 0,
    enabled_tools: 0,
    total_usage: 0,
    mcp_servers: 0,
    active_servers: 0
  });
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTool, setEditingTool] = useState<string | null>(null);
  const [editingServer, setEditingServer] = useState<string | null>(null);
  const [testingTool, setTestingTool] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, any>>({});

  // Category icons mapping
  const categoryIcons: Record<string, React.ReactNode> = {
    web_search: <Globe className="w-4 h-4" />,
    file_operations: <FileText className="w-4 h-4" />,
    code_execution: <Code className="w-4 h-4" />,
    data_analysis: <Database className="w-4 h-4" />,
    communication: <MessageCircle className="w-4 h-4" />,
    mcp_external: <Server className="w-4 h-4" />,
    utilities: <Wrench className="w-4 h-4" />,
    ai_models: <Zap className="w-4 h-4" />,
    custom: <Plus className="w-4 h-4" />
  };

  // Fetch configuration
  const fetchConfiguration = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/v1/tool-config/configuration', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setTools(data.tools || []);
      setMCPServers(data.mcp_servers || []);
      setCategories(data.categories || []);
      setStatistics(data.statistics || {
        total_tools: 0,
        enabled_tools: 0,
        total_usage: 0,
        mcp_servers: 0,
        active_servers: 0
      });
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch configuration:', error);
      // Set default empty data on error
      setTools([]);
      setMCPServers([]);
      setCategories([]);
      setStatistics({
        total_tools: 0,
        enabled_tools: 0,
        total_usage: 0,
        mcp_servers: 0,
        active_servers: 0
      });
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfiguration();
  }, []);

  // Toggle tool enabled status
  const toggleTool = async (toolId: string, enabled: boolean) => {
    try {
      const response = await fetch(`http://localhost:8000/api/v1/tool-config/tools/${toolId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ enabled })
      });
      
      if (response.ok) {
        const updatedTool = await response.json();
        setTools(prev => prev.map(t => t.id === toolId ? updatedTool : t));
      }
    } catch (error) {
      console.error('Failed to toggle tool:', error);
    }
  };

  // Test a tool
  const testTool = async (toolId: string) => {
    setTestingTool(toolId);
    try {
      const response = await fetch(`http://localhost:8000/api/v1/tool-config/tools/${toolId}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          test_params: {
            query: 'test query',
            max_results: 3
          }
        })
      });
      
      const result = await response.json();
      setTestResults(prev => ({ ...prev, [toolId]: result }));
    } catch (error) {
      console.error('Failed to test tool:', error);
      setTestResults(prev => ({ 
        ...prev, 
        [toolId]: { success: false, error: 'Test failed' }
      }));
    } finally {
      setTestingTool(null);
    }
  };

  // Update tool configuration
  const updateToolConfig = async (toolId: string, config: any) => {
    try {
      const response = await fetch(`http://localhost:8000/api/v1/tool-config/tools/${toolId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ config })
      });
      
      if (response.ok) {
        const updatedTool = await response.json();
        setTools(prev => prev.map(t => t.id === toolId ? updatedTool : t));
        setEditingTool(null);
      }
    } catch (error) {
      console.error('Failed to update tool config:', error);
    }
  };

  // Toggle MCP server
  const toggleMCPServer = async (serverId: string, enabled: boolean) => {
    try {
      const response = await fetch(`http://localhost:8000/api/v1/tool-config/mcp-servers/${serverId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ enabled })
      });
      
      if (response.ok) {
        const updatedServer = await response.json();
        setMCPServers(prev => prev.map(s => s.id === serverId ? updatedServer : s));
      }
    } catch (error) {
      console.error('Failed to toggle MCP server:', error);
    }
  };

  // Start MCP server
  const startMCPServer = async (serverId: string) => {
    try {
      await fetch(`http://localhost:8000/api/v1/tool-config/mcp-servers/${serverId}/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      fetchConfiguration();
    } catch (error) {
      console.error('Failed to start MCP server:', error);
    }
  };

  // Stop MCP server
  const stopMCPServer = async (serverId: string) => {
    try {
      await fetch(`http://localhost:8000/api/v1/tool-config/mcp-servers/${serverId}/stop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      fetchConfiguration();
    } catch (error) {
      console.error('Failed to stop MCP server:', error);
    }
  };

  // Filter tools
  const filteredTools = tools.filter(tool => {
    const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
    const matchesSearch = tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (loading) {
    return (
      <div className="tool-settings-container">
        <div className="loading-container">
          <RefreshCw className="w-12 h-12 loading-spinner" style={{ color: 'white' }} />
          <div className="loading-text">Loading Tool Configuration...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="tool-settings-container">
      <div className="tool-settings-wrapper">
        {/* Header */}
        <div className="tool-settings-header">
          <div className="header-title-section">
            <div className="header-title">
              <Settings className="w-10 h-10" style={{ color: '#667eea' }} />
              <h1>Tool Management</h1>
            </div>
            <button
              onClick={fetchConfiguration}
              className="refresh-button"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        
          {/* Statistics */}
          <div className="stats-grid">
            <div className="stat-card total">
              <div className="stat-value" style={{ color: '#3b82f6' }}>{statistics.total_tools || 0}</div>
              <div className="stat-label">Total Tools</div>
            </div>
            <div className="stat-card enabled">
              <div className="stat-value" style={{ color: '#10b981' }}>{statistics.enabled_tools || 0}</div>
              <div className="stat-label">Enabled Tools</div>
            </div>
            <div className="stat-card usage">
              <div className="stat-value" style={{ color: '#8b5cf6' }}>{statistics.total_usage || 0}</div>
              <div className="stat-label">Total Usage</div>
            </div>
            <div className="stat-card servers">
              <div className="stat-value" style={{ color: '#6366f1' }}>{statistics.active_servers || 0}</div>
              <div className="stat-label">Active MCP Servers</div>
            </div>
          </div>
        </div>

        {/* Tools Section */}
        <div className="tools-section">
          <h2 className="section-header">
            <Wrench className="w-6 h-6" />
            Tools Configuration
          </h2>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search tools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedCategory === 'all' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            {categories && categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  selectedCategory === cat.id 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {categoryIcons[cat.id]}
                {cat.name} ({cat.enabled}/{cat.count})
              </button>
            ))}
          </div>
        </div>

        {/* Tools Grid */}
        <div className="grid gap-4">
          {filteredTools.map(tool => (
            <div key={tool.id} className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-4">
                  <div className="text-2xl">
                    {tool.icon || categoryIcons[tool.category] || '🔧'}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-1">{tool.name}</h3>
                    <p className="text-gray-600 text-sm mb-2">{tool.description}</p>
                    <div className="flex flex-wrap gap-2">
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                        {tool.category}
                      </span>
                      {tool.requires_approval && (
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs flex items-center gap-1">
                          <Shield className="w-3 h-3" />
                          Requires Approval
                        </span>
                      )}
                      {tool.version && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                          v{tool.version}
                        </span>
                      )}
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">
                        {tool.usage_count} uses
                      </span>
                      {tool.error_count > 0 && (
                        <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs">
                          {tool.error_count} errors
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Test Tool */}
                  <button
                    onClick={() => testTool(tool.id)}
                    disabled={!tool.enabled || testingTool === tool.id}
                    className={`p-2 rounded-lg transition-colors ${
                      tool.enabled && testingTool !== tool.id
                        ? 'hover:bg-gray-100'
                        : 'opacity-50 cursor-not-allowed'
                    }`}
                    title="Test tool"
                  >
                    {testingTool === tool.id ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <TestTube className="w-4 h-4" />
                    )}
                  </button>
                  
                  {/* Edit Configuration */}
                  <button
                    onClick={() => setEditingTool(editingTool === tool.id ? null : tool.id)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Edit configuration"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  
                  {/* Toggle Enabled */}
                  <button
                    onClick={() => toggleTool(tool.id, !tool.enabled)}
                    className={`p-2 rounded-lg transition-colors ${
                      tool.enabled 
                        ? 'text-green-600 hover:bg-green-50' 
                        : 'text-gray-400 hover:bg-gray-100'
                    }`}
                    title={tool.enabled ? 'Disable tool' : 'Enable tool'}
                  >
                    {tool.enabled ? (
                      <ToggleRight className="w-6 h-6" />
                    ) : (
                      <ToggleLeft className="w-6 h-6" />
                    )}
                  </button>
                </div>
              </div>

              {/* Test Results */}
              {testResults[tool.id] && (
                <div className={`mb-4 p-3 rounded-lg ${
                  testResults[tool.id].success 
                    ? 'bg-green-50 border border-green-200' 
                    : 'bg-red-50 border border-red-200'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    {testResults[tool.id].success ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600" />
                    )}
                    <span className="font-medium">
                      Test {testResults[tool.id].success ? 'Passed' : 'Failed'}
                    </span>
                    <span className="text-sm text-gray-600">
                      ({testResults[tool.id].execution_time?.toFixed(2)}s)
                    </span>
                  </div>
                  {testResults[tool.id].error && (
                    <div className="text-sm text-red-600">
                      Error: {testResults[tool.id].error}
                    </div>
                  )}
                </div>
              )}

              {/* Edit Configuration Panel */}
              {editingTool === tool.id && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-3">Configuration</h4>
                  
                  {/* Required Environment Variables */}
                  {tool.required_env_vars.length > 0 && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium mb-2">
                        Required Environment Variables
                      </label>
                      <div className="space-y-2">
                        {tool.required_env_vars.map(envVar => (
                          <div key={envVar} className="flex items-center gap-2">
                            <span className="text-sm font-mono bg-white px-2 py-1 rounded">
                              {envVar}
                            </span>
                            <span className={`text-xs ${
                              process.env[envVar] ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {process.env[envVar] ? '✓ Set' : '✗ Not set'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Tool-specific Configuration */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-2">
                      Tool Configuration
                    </label>
                    <textarea
                      value={JSON.stringify(tool.config, null, 2)}
                      onChange={(e) => {
                        try {
                          const newConfig = JSON.parse(e.target.value);
                          // Update local state
                        } catch (err) {
                          // Invalid JSON
                        }
                      }}
                      className="w-full h-32 p-2 border rounded font-mono text-sm"
                    />
                  </div>
                  
                  {/* Settings */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Rate Limit (per minute)
                      </label>
                      <input
                        type="number"
                        value={tool.rate_limit || ''}
                        placeholder="Unlimited"
                        className="w-full p-2 border rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Timeout (seconds)
                      </label>
                      <input
                        type="number"
                        value={tool.timeout}
                        className="w-full p-2 border rounded"
                      />
                    </div>
                  </div>
                  
                  {/* Approval Settings */}
                  <div className="mb-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={tool.requires_approval}
                        onChange={(e) => {
                          // Update requires_approval
                        }}
                        className="rounded"
                      />
                      <span className="text-sm font-medium">
                        Require user approval before execution
                      </span>
                    </label>
                  </div>
                  
                  {/* Agent Restrictions */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Allowed Agents (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={tool.allowed_agents.join(', ')}
                        placeholder="All agents"
                        className="w-full p-2 border rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Blocked Agents (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={tool.blocked_agents.join(', ')}
                        placeholder="None"
                        className="w-full p-2 border rounded text-sm"
                      />
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingTool(null)}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => updateToolConfig(tool.id, tool.config)}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        </div>

        {/* MCP Servers Section */}
        <div className="servers-section">
          <h2 className="section-header">
            <Server className="w-6 h-6" />
            MCP Servers
          </h2>

        <div className="grid gap-4">
          {mcpServers.map(server => (
            <div key={server.id} className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-3 h-3 rounded-full ${
                    server.status === 'running' ? 'bg-green-500' :
                    server.status === 'error' ? 'bg-red-500' :
                    'bg-gray-400'
                  }`} />
                  
                  <div>
                    <h3 className="text-lg font-semibold">{server.name}</h3>
                    <div className="text-sm text-gray-600 font-mono">
                      {server.command} {server.args.join(' ')}
                    </div>
                    {server.error_message && (
                      <div className="text-sm text-red-600 mt-1">
                        {server.error_message}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Start/Stop Server */}
                  {server.status === 'running' ? (
                    <button
                      onClick={() => stopMCPServer(server.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      title="Stop server"
                    >
                      <StopCircle className="w-5 h-5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => startMCPServer(server.id)}
                      disabled={!server.enabled}
                      className={`p-2 rounded-lg ${
                        server.enabled
                          ? 'text-green-600 hover:bg-green-50'
                          : 'text-gray-400 cursor-not-allowed'
                      }`}
                      title="Start server"
                    >
                      <PlayCircle className="w-5 h-5" />
                    </button>
                  )}
                  
                  {/* Edit Server */}
                  <button
                    onClick={() => setEditingServer(editingServer === server.id ? null : server.id)}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                    title="Edit configuration"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  
                  {/* Toggle Enabled */}
                  <button
                    onClick={() => toggleMCPServer(server.id, !server.enabled)}
                    className={`p-2 rounded-lg ${
                      server.enabled 
                        ? 'text-green-600 hover:bg-green-50' 
                        : 'text-gray-400 hover:bg-gray-100'
                    }`}
                    title={server.enabled ? 'Disable server' : 'Enable server'}
                  >
                    {server.enabled ? (
                      <ToggleRight className="w-6 h-6" />
                    ) : (
                      <ToggleLeft className="w-6 h-6" />
                    )}
                  </button>
                </div>
              </div>

              {/* Edit Server Panel */}
              {editingServer === server.id && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-3">Server Configuration</h4>
                  
                  {/* Environment Variables */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-2">
                      Environment Variables
                    </label>
                    {Object.entries(server.env).map(([key, value]) => (
                      <div key={key} className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={key}
                          className="flex-1 p-2 border rounded font-mono text-sm"
                          readOnly
                        />
                        <input
                          type="text"
                          value={value}
                          placeholder="Enter value"
                          className="flex-2 p-2 border rounded text-sm"
                        />
                      </div>
                    ))}
                  </div>
                  
                  {/* Auto-start */}
                  <div className="mb-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={server.auto_start}
                        onChange={(e) => {
                          // Update auto_start
                        }}
                        className="rounded"
                      />
                      <span className="text-sm font-medium">
                        Auto-start when application launches
                      </span>
                    </label>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingServer(null)}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        
        {/* Add MCP Server Button */}
        <button className="mt-4 w-full p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 flex items-center justify-center gap-2 text-gray-600 hover:text-gray-800">
          <Plus className="w-5 h-5" />
          Add MCP Server
        </button>
        </div>
      </div>
    </div>
  );
};

export default ToolSettings;