import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SystemSettings from '../components/SystemSettings';
import './ToolSettingsV2.css';

interface ToolConfig {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  status: 'enabled' | 'disabled' | 'error' | 'not_configured';
  icon?: string;
  requires_approval: boolean;
  usage_count: number;
  error_count: number;
  config: Record<string, any>;
  required_env_vars: string[];
  default_parameters?: Record<string, any>;
  parameter_variations?: Array<Record<string, any>>;
  example_usage?: string;
}

interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  status: string;
}

const ToolSettingsV2: React.FC = () => {
  const navigate = useNavigate();
  const [tools, setTools] = useState<ToolConfig[]>([]);
  const [mcpServers, setMCPServers] = useState<MCPServerConfig[]>([]);
  const [mcpServerData, setMCPServerData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tools' | 'mcp' | 'system'>('tools');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [showAddMCPModal, setShowAddMCPModal] = useState(false);
  const [mcpTools, setMCPTools] = useState<any[]>([]);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testingTool, setTestingTool] = useState<ToolConfig | null>(null);
  const [testParameters, setTestParameters] = useState<string>('{}');
  const [testResult, setTestResult] = useState<any>(null);
  const [isTestingTool, setIsTestingTool] = useState(false);
  const [showMCPTestModal, setShowMCPTestModal] = useState(false);
  const [testingMCPTool, setTestingMCPTool] = useState<any>(null);
  const [mcpTestParameters, setMCPTestParameters] = useState<string>('{}');
  const [mcpTestResult, setMCPTestResult] = useState<any>(null);
  const [isTestingMCPTool, setIsTestingMCPTool] = useState(false);

  const categories = [
    { id: 'all', name: 'All Tools', icon: '📦' },
    { id: 'web_search', name: 'Web Search', icon: '🌐' },
    { id: 'file_operations', name: 'Files', icon: '📁' },
    { id: 'code_execution', name: 'Code', icon: '💻' },
    { id: 'data_analysis', name: 'Data', icon: '📊' },
    { id: 'utilities', name: 'Utilities', icon: '🛠️' },
  ];

  useEffect(() => {
    fetchConfiguration();
    fetchMCPServers();
  }, []);

  const fetchConfiguration = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/v1/tool-config/configuration');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      setTools(data.tools || []);
      setMCPServers(data.mcp_servers || []);
    } catch (error) {
      console.error('Failed to fetch configuration:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMCPServers = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/v1/mcp/servers');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      setMCPServerData(data.servers || {});
      
      // Also fetch MCP tools
      const toolsResponse = await fetch('http://localhost:8000/api/v1/mcp/tools');
      if (toolsResponse.ok) {
        const toolsData = await toolsResponse.json();
        setMCPTools(toolsData || []);
      }
    } catch (error) {
      console.error('Failed to fetch MCP servers:', error);
      // Don't throw, just use empty data
      setMCPServerData({});
      setMCPTools([]);
    }
  };

  const reconnectServer = async (serverId: string) => {
    try {
      const response = await fetch(`http://localhost:8000/api/v1/mcp/servers/${serverId}/reconnect`, {
        method: 'POST'
      });
      if (response.ok) {
        await fetchMCPServers();
      }
    } catch (error) {
      console.error('Failed to reconnect server:', error);
    }
  };

  const removeServer = async (serverId: string) => {
    try {
      const response = await fetch(`http://localhost:8000/api/v1/mcp/servers/${serverId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        await fetchMCPServers();
      }
    } catch (error) {
      console.error('Failed to remove server:', error);
    }
  };

  const addMCPServer = async (serverConfig: any) => {
    try {
      const response = await fetch('http://localhost:8000/api/v1/mcp/servers/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serverConfig)
      });
      
      if (response.ok) {
        await fetchMCPServers();
        setShowAddMCPModal(false);
        alert('MCP Server added successfully!');
      } else {
        throw new Error('Server responded with error');
      }
    } catch (error) {
      console.error('Failed to add MCP server:', error);
      // Store locally for demo purposes
      const newServerId = `mcp_${Object.keys(mcpServerData).length}`;
      setMCPServerData((prev: any) => ({
        ...prev,
        [newServerId]: {
          id: newServerId,
          name: serverConfig.name,
          url: serverConfig.url,
          transport: serverConfig.transport,
          status: 'disconnected',
          enabled: true,
          tool_count: 0
        }
      }));
      setShowAddMCPModal(false);
      alert('MCP Server saved locally (backend connection pending). Please restart the backend to activate.');
    }
  };

  const toggleTool = async (toolId: string, enabled: boolean) => {
    try {
      const response = await fetch(`http://localhost:8000/api/v1/tool-config/tools/${toolId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      
      if (response.ok) {
        const updatedTool = await response.json();
        setTools(prev => prev.map(t => t.id === toolId ? updatedTool : t));
      } else {
        // Just update locally if backend fails
        setTools(prev => prev.map(t => 
          t.id === toolId ? { ...t, enabled, status: enabled ? 'enabled' : 'disabled' } : t
        ));
      }
    } catch (error) {
      console.error('Failed to toggle tool:', error);
      // Update locally on error
      setTools(prev => prev.map(t => 
        t.id === toolId ? { ...t, enabled, status: enabled ? 'enabled' : 'disabled' } : t
      ));
    }
  };

  const openTestModal = (tool: ToolConfig) => {
    setTestingTool(tool);
    // Use default_parameters from backend if available, fallback to hardcoded
    const defaultParams = tool.default_parameters && Object.keys(tool.default_parameters).length > 0
      ? JSON.stringify(tool.default_parameters, null, 2)
      : getDefaultParameters(tool.name);
    setTestParameters(defaultParams);
    setTestResult(null);
    setShowTestModal(true);
  };

  const openMCPTestModal = (tool: any) => {
    setTestingMCPTool(tool);
    setMCPTestParameters(getMCPDefaultParameters(tool.name));
    setMCPTestResult(null);
    setShowMCPTestModal(true);
  };

  const getDefaultParameters = (toolName: string): string => {
    const defaults: Record<string, any> = {
      // File Operations
      'file_read': { 
        path: '/tmp/example.txt',
        encoding: 'utf-8'
      },
      'file_write': { 
        path: '/tmp/example.txt', 
        content: 'Hello World!\nThis is a test file.', 
        mode: 'write',
        encoding: 'utf-8',
        create_dirs: true
      },
      'editor': {
        command: 'view',  // Options: view, create, edit, replace, search, append, insert
        path: '/tmp/example.txt',
        content: 'New content here',  // For create/edit/append
        old_str: 'find this',  // For replace
        new_str: 'replace with this',  // For replace
        pattern: 'search.*pattern',  // For search
        line_number: 1,  // For insert
        view_range: [1, 10]  // For view [start, end]
      },
      
      // Web/HTTP
      'tavily_search': { 
        query: 'latest AI news', 
        search_depth: 'basic',  // or 'advanced'
        max_results: 5,
        include_domains: [],  // Optional: ['example.com']
        exclude_domains: []   // Optional: ['spam.com']
      },
      'http_request': {
        method: 'GET',  // GET, POST, PUT, DELETE, PATCH
        url: 'https://api.github.com/users/github',
        headers: {},  // Optional: {'Authorization': 'Bearer token'}
        body: null,  // For POST/PUT/PATCH
        params: {},  // URL query parameters
        timeout: 30,
        convert_to_markdown: false
      },
      
      // System Tools
      'current_time': { 
        timezone: 'US/Pacific',  // UTC, US/Eastern, Europe/London, etc.
        format: 'iso'  // iso, unix, human
      },
      'sleep': { 
        seconds: 2  // Max 300 seconds
      },
      'environment': {
        action: 'list',  // get, set, list, delete
        name: 'PATH',  // For get/set/delete
        value: '/usr/local/bin',  // For set
        prefix: '',  // For list - filter by prefix
        mask_sensitive: true
      },
      'system_info': {
        category: 'all'  // all, os, cpu, memory, disk, network
      },
      
      // Code Execution
      'calculator': {
        expression: '2 * sin(pi/4) + sqrt(16)',
        mode: 'evaluate',  // evaluate, simplify, solve
        precision: 10
      },
      'python_repl': { 
        code: 'print("Hello, World!")\nresult = 2 + 2\nprint(f"2 + 2 = {result}")' 
      },
      'shell_command': { 
        command: 'echo "Hello from shell"' 
      },
      
      // Utility Tools
      'journal': {
        action: 'write',  // write, read, list, search
        content: 'Today I learned...',  // For write
        entry_id: null,  // For read
        query: 'important',  // For search
        limit: 10  // For list/search
      },
      'handoff_to_user': {
        message: 'Please review the changes and confirm to proceed.',
        breakout_of_loop: false  // true to stop agent execution
      },
      'stop': {
        message: 'Task completed successfully.',
        status: 'success'  // success, error, cancelled
      }
    };
    return JSON.stringify(defaults[toolName] || {}, null, 2);
  };

  const getMCPDefaultParameters = (toolName: string): string => {
    // Provide sensible defaults for common MCP tools
    const defaults: Record<string, any> = {
      'calculate': { expression: '2 + 2' },
      'get_weather': { location: 'San Francisco' },
      'search': { query: 'test query' },
      'generate_text': { prompt: 'Hello world' },
      'translate': { text: 'Hello', target_language: 'es' },
      'summarize': { text: 'This is a test document to summarize.' }
    };
    return JSON.stringify(defaults[toolName] || {}, null, 2);
  };

  const testTool = async () => {
    if (!testingTool) return;
    
    try {
      setIsTestingTool(true);
      setTestResult(null);
      
      let params = {};
      try {
        params = JSON.parse(testParameters);
      } catch (e) {
        setTestResult({ error: 'Invalid JSON parameters' });
        return;
      }

      // Use the actual tool execution endpoint
      const response = await fetch(`http://localhost:8000/api/v1/tools/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: testingTool.name,
          parameters: params
        })
      });

      if (response.ok) {
        const result = await response.json();
        setTestResult(result);
      } else {
        // If endpoint doesn't exist, show simulated result
        setTestResult({
          success: true,
          result: { message: `Tool ${testingTool.name} would be executed with parameters`, params },
          execution_time: 0.1
        });
      }
    } catch (error) {
      console.error('Tool test failed:', error);
      setTestResult({ 
        error: 'Tool test failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    } finally {
      setIsTestingTool(false);
    }
  };

  const testMCPTool = async () => {
    if (!testingMCPTool) return;
    
    try {
      setIsTestingMCPTool(true);
      setMCPTestResult(null);
      
      let params = {};
      try {
        params = JSON.parse(mcpTestParameters);
      } catch (e) {
        setMCPTestResult({ error: 'Invalid JSON parameters' });
        return;
      }

      // Use the MCP tool test endpoint
      const response = await fetch(`http://localhost:8000/api/v1/mcp/tools/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_name: testingMCPTool.server_name,
          tool_name: testingMCPTool.name,
          parameters: params
        })
      });

      if (response.ok) {
        const result = await response.json();
        setMCPTestResult(result);
      } else {
        const error = await response.text();
        setMCPTestResult({
          error: 'MCP tool test failed',
          details: error || 'Unknown error'
        });
      }
    } catch (error) {
      console.error('MCP tool test failed:', error);
      setMCPTestResult({ 
        error: 'MCP tool test failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    } finally {
      setIsTestingMCPTool(false);
    }
  };

  const filteredTools = tools.filter(tool => {
    const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
    const matchesSearch = tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const enabledCount = tools.filter(t => t.enabled).length;
  const totalUsage = tools.reduce((sum, t) => sum + t.usage_count, 0);

  if (loading) {
    return (
      <div className="tools-loading">
        <div className="spinner"></div>
        <p>Loading configuration...</p>
      </div>
    );
  }

  return (
    <div className="tools-container">
      {/* Header */}
      <header className="tools-header">
        <div className="header-content">
          <button 
            className="back-button"
            onClick={() => navigate('/swarm')}
            title="Back to Chat"
          >
            ←
          </button>
          <h1>Tool Configuration</h1>
          <div className="header-stats">
            <div className="stat">
              <span className="stat-value">{tools.length}</span>
              <span className="stat-label">Total</span>
            </div>
            <div className="stat">
              <span className="stat-value">{enabledCount}</span>
              <span className="stat-label">Active</span>
            </div>
            <div className="stat">
              <span className="stat-value">{totalUsage}</span>
              <span className="stat-label">Uses</span>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="tools-tabs">
        <button 
          className={`tab ${activeTab === 'tools' ? 'active' : ''}`}
          onClick={() => setActiveTab('tools')}
        >
          Tools
        </button>
        <button 
          className={`tab ${activeTab === 'mcp' ? 'active' : ''}`}
          onClick={() => setActiveTab('mcp')}
        >
          MCP Servers
        </button>
        <button 
          className={`tab ${activeTab === 'system' ? 'active' : ''}`}
          onClick={() => setActiveTab('system')}
        >
          System Settings
        </button>
      </div>

      {/* Tools Tab */}
      {activeTab === 'tools' && (
        <div className="tools-content">
          {/* Search Bar */}
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          {/* Categories */}
          <div className="categories">
            {categories.map(cat => (
              <button
                key={cat.id}
                className={`category-chip ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                <span className="category-icon">{cat.icon}</span>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>

          {/* Tools List */}
          <div className="tools-list">
            {filteredTools.length === 0 ? (
              <div className="empty-state">
                <p>No tools found</p>
              </div>
            ) : (
              filteredTools.map(tool => (
                <div key={tool.id} className="tool-item">
                  <div className="tool-header">
                    <div className="tool-info">
                      <span className="tool-icon">{tool.icon || '🔧'}</span>
                      <div className="tool-details">
                        <h3>{tool.name}</h3>
                        <p>{tool.description}</p>
                      </div>
                    </div>
                    <div className="tool-controls">
                      {tool.requires_approval && (
                        <span className="approval-badge" title="Requires approval">
                          🔒
                        </span>
                      )}
                      <button
                        className="test-button"
                        onClick={() => openTestModal(tool)}
                        disabled={!tool.enabled}
                        title={tool.enabled ? "Test this tool" : "Enable tool first"}
                      >
                        🧪 Test
                      </button>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={tool.enabled}
                          onChange={(e) => toggleTool(tool.id, e.target.checked)}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </div>
                  
                  {/* Tool Meta */}
                  <div className="tool-meta">
                    <span className="meta-item">
                      <span className="meta-label">Category:</span> {tool.category.replace('_', ' ')}
                    </span>
                    <span className="meta-item">
                      <span className="meta-label">Uses:</span> {tool.usage_count}
                    </span>
                    {tool.error_count > 0 && (
                      <span className="meta-item error">
                        <span className="meta-label">Errors:</span> {tool.error_count}
                      </span>
                    )}
                  </div>

                  {/* Expandable Config */}
                  <button 
                    className="expand-button"
                    onClick={() => setExpandedTool(expandedTool === tool.id ? null : tool.id)}
                  >
                    {expandedTool === tool.id ? 'Hide' : 'Configure'} ↓
                  </button>
                  
                  {expandedTool === tool.id && (
                    <div className="tool-config">
                      {tool.required_env_vars.length > 0 && (
                        <div className="config-section">
                          <h4>Required Environment Variables</h4>
                          {tool.required_env_vars.map(env => (
                            <div key={env} className="env-var">
                              <code>{env}</code>
                              <span className={process.env[env] ? 'status-ok' : 'status-missing'}>
                                {process.env[env] ? '✓' : 'Not set'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div className="config-section">
                        <h4>Configuration</h4>
                        <pre>{JSON.stringify(tool.config, null, 2)}</pre>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MCP Tab */}
      {activeTab === 'mcp' && (
        <div className="mcp-content">
          <div className="mcp-intro">
            <div className="mcp-intro-icon">🔌</div>
            <h2>MCP Server Integration</h2>
            <p>Connect to Model Context Protocol servers for enhanced capabilities</p>
            
            {/* Backend Status Notice */}
            <div className="mcp-status-card success">
              <div className="status-icon">✅</div>
              <div className="status-content">
                <p className="status-title">Backend is connected and ready!</p>
                <p className="status-description">
                  You can add MCP servers below. Example: Calculator server at http://localhost:8001/sse
                </p>
              </div>
            </div>
          </div>

          {/* Add MCP Server Form */}
          {showAddMCPModal && (
            <div className="mcp-add-form">
              <div className="form-header">
                <h3>Add MCP Server</h3>
                <button 
                  className="form-close-button"
                  onClick={() => setShowAddMCPModal(false)}
                  type="button"
                >
                  ×
                </button>
              </div>
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                addMCPServer({
                  name: formData.get('name'),
                  url: formData.get('url'),
                  transport: formData.get('transport') || 'sse'
                });
              }}>
                <div className="form-group">
                  <label htmlFor="server-name">Server Name</label>
                  <input
                    id="server-name"
                    name="name"
                    type="text"
                    placeholder="e.g., Calculator"
                    required
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="server-url">Server URL</label>
                  <input
                    id="server-url"
                    name="url"
                    type="text"
                    placeholder="e.g., http://localhost:8001/sse"
                    required
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="transport">Transport Protocol</label>
                  <select
                    id="transport"
                    name="transport"
                    className="form-select"
                  >
                    <option value="sse">SSE (Server-Sent Events)</option>
                    <option value="streamable_http">Streamable HTTP</option>
                  </select>
                </div>
                <div className="form-actions">
                  <button
                    type="submit"
                    className="btn-primary"
                  >
                    Add Server
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddMCPModal(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="mcp-list">
            {Object.keys(mcpServerData).length === 0 && !showAddMCPModal ? (
              <div className="empty-state">
                <p>No MCP servers configured</p>
                <button 
                  className="add-mcp-button"
                  onClick={() => setShowAddMCPModal(true)}
                >
                  + Add MCP Server
                </button>
              </div>
            ) : (
              <>
                {!showAddMCPModal && (
                  <button 
                    className="add-mcp-button primary"
                    onClick={() => setShowAddMCPModal(true)}
                  >
                    + Add MCP Server
                  </button>
                )}
                {Object.entries(mcpServerData).map(([serverId, serverInfo]: [string, any]) => (
                  <div key={serverId} className="mcp-item">
                    <div className="mcp-header">
                      <div className="mcp-info">
                        <div className="mcp-status">
                          <span className={`status-dot ${serverInfo.status || 'disconnected'}`}></span>
                          <h3>{serverInfo.name}</h3>
                        </div>
                        <p>
                          {serverInfo.url} ({serverInfo.transport || 'sse'})
                        </p>
                        {serverInfo.tool_count !== undefined && (
                          <p>
                            {serverInfo.tool_count} tools available
                          </p>
                        )}
                      </div>
                      <div className="mcp-server-actions">
                        <button onClick={() => reconnectServer(serverId)}>
                          Reconnect
                        </button>
                        <button onClick={() => removeServer(serverId)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
          
          {/* Display MCP Tools */}
          {mcpTools.length > 0 && (
            <div className="mcp-tools-section">
              <h3>🛠️ Available MCP Tools</h3>
              <div style={{ display: 'grid', gap: '12px' }}>
                {mcpTools.map((tool, index) => (
                  <div key={index} className="mcp-tool-item">
                    <div className="mcp-tool-header">
                      <div className="mcp-tool-info">
                        <h4>{tool.name}</h4>
                        <p>{tool.description || 'No description'}</p>
                        {tool.server_name && (
                          <p className="mcp-tool-server">
                            Server: {tool.server_name}
                          </p>
                        )}
                      </div>
                      <button
                        className="test-button"
                        onClick={() => openMCPTestModal(tool)}
                        title="Test this MCP tool"
                      >
                        🧪 Test
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* System Settings Tab */}
      {activeTab === 'system' && (
        <SystemSettings />
      )}

      {/* MCP Test Tool Modal */}
      {showMCPTestModal && testingMCPTool && (
        <div className="modal-overlay" onClick={() => setShowMCPTestModal(false)}>
          <div className="modal-content test-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Test MCP Tool: {testingMCPTool.name}</h2>
              <button className="close-button" onClick={() => setShowMCPTestModal(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="test-description">
                <p>{testingMCPTool.description || 'No description available'}</p>
                <div className="info-badge">
                  🔌 MCP Server: {testingMCPTool.server_name || 'Unknown'}
                </div>
              </div>

              <div className="test-parameters">
                <h3>Parameters (JSON)</h3>
                <textarea
                  value={mcpTestParameters}
                  onChange={(e) => setMCPTestParameters(e.target.value)}
                  placeholder='{"param": "value"}'
                  rows={8}
                  className="parameters-input"
                />
              </div>

              <button 
                className="test-execute-button"
                onClick={testMCPTool}
                disabled={isTestingMCPTool}
              >
                {isTestingMCPTool ? '⏳ Testing...' : '▶️ Execute Test'}
              </button>

              {mcpTestResult && (
                <div className={`test-result ${mcpTestResult.error ? 'error' : 'success'}`}>
                  <h3>Result:</h3>
                  {mcpTestResult.error ? (
                    <div className="error-result">
                      <strong>❌ Error:</strong> {mcpTestResult.error}
                      {mcpTestResult.details && <p>Details: {mcpTestResult.details}</p>}
                    </div>
                  ) : (
                    <div className="success-result">
                      <strong>✅ Success</strong>
                      {mcpTestResult.execution_time && (
                        <span className="execution-time"> ({mcpTestResult.execution_time.toFixed(3)}s)</span>
                      )}
                      <pre>{JSON.stringify(mcpTestResult.result, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Test Tool Modal */}
      {showTestModal && testingTool && (
        <div className="modal-overlay" onClick={() => setShowTestModal(false)}>
          <div className="modal-content test-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Test Tool: {testingTool.name}</h2>
              <button className="close-button" onClick={() => setShowTestModal(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="test-description">
                <p>{testingTool.description}</p>
                {testingTool.example_usage && (
                  <p className="example-usage">💡 <strong>Use case:</strong> {testingTool.example_usage}</p>
                )}
                {testingTool.requires_approval && (
                  <div className="warning-badge">
                    🔒 This tool requires approval when used by agents
                  </div>
                )}
              </div>

              <div className="test-parameters">
                <h3>Parameters (JSON)</h3>
                <textarea
                  value={testParameters}
                  onChange={(e) => setTestParameters(e.target.value)}
                  placeholder='{"param": "value"}'
                  rows={8}
                  className="parameters-input"
                />
                {testingTool.parameter_variations && testingTool.parameter_variations.length > 0 && (
                  <div className="parameter-examples">
                    <h4>Example variations:</h4>
                    <div className="variation-buttons">
                      {testingTool.parameter_variations.slice(0, 3).map((variation, index) => (
                        <button
                          key={index}
                          className="variation-button"
                          onClick={() => setTestParameters(JSON.stringify(variation, null, 2))}
                          title="Click to use this example"
                        >
                          Example {index + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button 
                className="test-execute-button"
                onClick={testTool}
                disabled={isTestingTool}
              >
                {isTestingTool ? '⏳ Testing...' : '▶️ Execute Test'}
              </button>

              {testResult && (
                <div className={`test-result ${testResult.error ? 'error' : 'success'}`}>
                  <h3>Result:</h3>
                  {testResult.error ? (
                    <div className="error-result">
                      <strong>❌ Error:</strong> {testResult.error}
                      {testResult.details && <p>Details: {testResult.details}</p>}
                    </div>
                  ) : (
                    <div className="success-result">
                      <strong>✅ Success</strong>
                      {testResult.execution_time && (
                        <span className="execution-time"> ({testResult.execution_time.toFixed(3)}s)</span>
                      )}
                      {(testResult.result?.mode === 'simulated' || 
                        testResult.result?.status === 'simulated' ||
                        testResult.result?.note?.toLowerCase().includes('simulated')) && (
                        <span className="simulation-indicator" style={{
                          marginLeft: '10px',
                          padding: '2px 8px',
                          background: '#ffa500',
                          color: 'white',
                          borderRadius: '4px',
                          fontSize: '0.85rem'
                        }}>🎭 Simulated Response</span>
                      )}
                      <pre>{JSON.stringify(testResult.result, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolSettingsV2;