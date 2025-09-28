import React, { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronRight, Settings, Wrench, Save, Trash2, Copy } from 'lucide-react';
import './BlockSettingsPanel.css';

interface BlockSettingsPanelProps {
  node: any;
  onClose: () => void;
  onUpdate: (nodeId: string, data: any) => void;
  onDelete: (nodeId: string) => void;
  onDuplicate: (nodeId: string) => void;
  isDarkMode?: boolean;
  availableTools?: string[];
}

const BlockSettingsPanel: React.FC<BlockSettingsPanelProps> = ({
  node,
  onClose,
  onUpdate,
  onDelete,
  onDuplicate,
  isDarkMode = false,
  availableTools = []
}) => {
  // Initialize with proper tools array
  const initialTools = (() => {
    const nodeTools = node?.data?.tools || node?.data?.toolsPlanned || [];
    return Array.isArray(nodeTools) ? nodeTools : [];
  })();

  const [formData, setFormData] = useState({
    name: node?.data?.name || node?.data?.label || '',
    type: node?.data?.type || node?.data?.nodeType || 'analysis',
    agent_role: node?.data?.agent_role || node?.data?.agentRole || '',
    description: node?.data?.description || '',
    tools: initialTools,
    parameters: node?.data?.parameters || {},
    enabled: node?.data?.enabled !== false
  });

  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    tools: true,
    parameters: false,
    advanced: false
  });

  // Get default available tools if not provided
  const defaultTools = [
    'tavily_search', 'web_search', 'tavily_web_search',
    'file_write', 'file_read', 'python_repl', 'calculator',
    'current_time', 'sleep', 'environment',
    'system_info', 'journal', 'memory',
    'use_llm', 'wikipedia_search', 'weather',
    'news_search', 'stock_price', 'crypto_price'
  ];

  const allTools = availableTools.length > 0 ? availableTools : defaultTools;

  useEffect(() => {
    // Ensure tools is always an array
    const nodeTools = node?.data?.tools || node?.data?.toolsPlanned || [];
    const toolsArray = Array.isArray(nodeTools) ? nodeTools : [];

    // Debug logging
    console.log('BlockSettingsPanel - Node data updated:', {
      nodeId: node?.id,
      tools: toolsArray,
      rawTools: node?.data?.tools,
      rawToolsPlanned: node?.data?.toolsPlanned,
      fullData: node?.data
    });

    setFormData({
      name: node?.data?.name || node?.data?.label || '',
      type: node?.data?.type || node?.data?.nodeType || 'analysis',
      agent_role: node?.data?.agent_role || node?.data?.agentRole || '',
      description: node?.data?.description || '',
      tools: toolsArray,
      parameters: node?.data?.parameters || {},
      enabled: node?.data?.enabled !== false
    });
  }, [node?.id, node?.data]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleToolToggle = (tool: string) => {
    setFormData(prev => {
      const currentTools = Array.isArray(prev.tools) ? prev.tools : [];
      const newTools = currentTools.includes(tool)
        ? currentTools.filter((t: string) => t !== tool)
        : [...currentTools, tool];
      return { ...prev, tools: newTools };
    });
  };

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const handleSave = () => {
    setSaveStatus('saving');

    // Debug logging
    console.log('BlockSettingsPanel - Saving with tools:', formData.tools);

    const updatedData = {
      ...node.data,
      name: formData.name,
      label: formData.name, // Keep both for compatibility
      type: formData.type,
      nodeType: formData.type, // Keep both for compatibility
      agentRole: formData.agent_role,
      agent_role: formData.agent_role, // Keep both for compatibility
      description: formData.description,
      tools: formData.tools,
      toolsPlanned: formData.tools, // Keep both for compatibility
      parameters: formData.parameters,
      enabled: formData.enabled
    };

    console.log('BlockSettingsPanel - Updating node with data:', updatedData);
    onUpdate(node.id, updatedData);

    // Show saved status briefly
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this block?')) {
      onDelete(node.id);
      onClose();
    }
  };

  const handleDuplicate = () => {
    onDuplicate(node.id);
    onClose();
  };

  if (!node) return null;

  const blockTypes = [
    { value: 'analysis', label: 'Analysis' },
    { value: 'tool_call', label: 'Tool Call' },
    { value: 'decision', label: 'Decision' },
    { value: 'input', label: 'Input' },
    { value: 'parallel', label: 'Parallel' },
    { value: 'final', label: 'Final State' }
  ];

  return (
    <div className={`block-settings-panel ${isDarkMode ? 'dark' : ''}`}>
      <div className="panel-header">
        <div className="header-title">
          <Settings size={20} />
          <h3>Block Settings</h3>
        </div>
        <button className="close-btn" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div className="panel-content">
        {/* Basic Information */}
        <div className="settings-section">
          <button
            className="section-header"
            onClick={() => toggleSection('basic')}
          >
            {expandedSections.basic ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span>Basic Information</span>
          </button>

          {expandedSections.basic && (
            <div className="section-content">
              <div className="form-group">
                <label>ID</label>
                <input
                  type="text"
                  value={node.id}
                  disabled
                  className="form-input disabled"
                />
              </div>

              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="form-input"
                  placeholder="Enter block name"
                />
              </div>

              <div className="form-group">
                <label>Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="form-input"
                >
                  {blockTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Agent Role</label>
                <input
                  type="text"
                  value={formData.agent_role}
                  onChange={(e) => setFormData({ ...formData, agent_role: e.target.value })}
                  className="form-input"
                  placeholder="e.g., Analyst, Decision Maker, Coordinator"
                />
              </div>

              <div className="form-group">
                <label>Description/Prompt</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="form-textarea"
                  placeholder="Describe what this block does..."
                  rows={4}
                />
              </div>
            </div>
          )}
        </div>

        {/* Tools Selection */}
        <div className="settings-section">
          <button
            className="section-header"
            onClick={() => toggleSection('tools')}
          >
            {expandedSections.tools ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <Wrench size={16} />
            <span>Tools ({formData.tools.length} selected)</span>
          </button>

          {expandedSections.tools && (
            <div className="section-content">
              <div className="tools-actions">
                <button
                  className="action-btn"
                  onClick={() => setFormData({ ...formData, tools: allTools })}
                >
                  Select All
                </button>
                <button
                  className="action-btn"
                  onClick={() => setFormData({ ...formData, tools: [] })}
                >
                  Clear All
                </button>
              </div>

              <div className="tools-grid">
                {allTools.map(tool => {
                  const isChecked = Array.isArray(formData.tools) && formData.tools.includes(tool);
                  return (
                    <label
                      key={tool}
                      className="tool-checkbox"
                      style={{
                        backgroundColor: isChecked ? (isDarkMode ? '#1e3a8a' : '#eff6ff') : 'transparent',
                        borderColor: isChecked ? '#3b82f6' : undefined
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToolToggle(tool)}
                      />
                      <span className="tool-name">{tool.replace(/_/g, ' ')}</span>
                    </label>
                  );
                })}
              </div>

              {formData.tools.length === 0 ? (
                <div className="tools-hint">
                  No tools selected - the agent will use LLM capabilities only
                </div>
              ) : (
                <div className="tools-hint" style={{
                  backgroundColor: isDarkMode ? '#1e3a8a' : '#eff6ff',
                  borderColor: '#3b82f6',
                  color: isDarkMode ? '#93c5fd' : '#1e40af'
                }}>
                  <strong>Selected tools ({formData.tools.length}):</strong> {formData.tools.join(', ')}
                </div>
              )}

              {/* Debug info - remove in production */}
              {process.env.NODE_ENV === 'development' && (
                <div style={{
                  fontSize: '10px',
                  color: '#888',
                  marginTop: '8px',
                  padding: '4px',
                  backgroundColor: isDarkMode ? '#0f172a' : '#f8f8f8',
                  borderRadius: '4px'
                }}>
                  Node ID: {node?.id}<br/>
                  Current Tools: {JSON.stringify(formData.tools)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Parameters (if any) */}
        {Object.keys(formData.parameters).length > 0 && (
          <div className="settings-section">
            <button
              className="section-header"
              onClick={() => toggleSection('parameters')}
            >
              {expandedSections.parameters ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span>Parameters</span>
            </button>

            {expandedSections.parameters && (
              <div className="section-content">
                <pre className="parameters-view">
                  {JSON.stringify(formData.parameters, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Advanced Settings */}
        <div className="settings-section">
          <button
            className="section-header"
            onClick={() => toggleSection('advanced')}
          >
            {expandedSections.advanced ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span>Advanced</span>
          </button>

          {expandedSections.advanced && (
            <div className="section-content">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                />
                <span>Block Enabled</span>
              </label>

              <div className="danger-zone">
                <button
                  className="action-btn duplicate"
                  onClick={handleDuplicate}
                >
                  <Copy size={16} />
                  Duplicate Block
                </button>
                <button
                  className="action-btn delete"
                  onClick={handleDelete}
                >
                  <Trash2 size={16} />
                  Delete Block
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="panel-footer">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          style={{
            backgroundColor: saveStatus === 'saved' ? '#10b981' : undefined,
            opacity: saveStatus === 'saving' ? 0.7 : 1,
            transition: 'all 0.2s'
          }}
        >
          <Save size={16} />
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? '✓ Saved!' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

export default BlockSettingsPanel;