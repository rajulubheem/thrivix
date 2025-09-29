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
  position?: { x: number; y: number };
}

const normalizeTools = (input: any): string[] => {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input
      .map((tool) => (typeof tool === 'string' ? tool.trim() : String(tool)))
      .filter((tool) => tool.length > 0);
  }

  if (input instanceof Set) {
    return Array.from(input)
      .map((tool) => (typeof tool === 'string' ? tool.trim() : String(tool)))
      .filter((tool) => tool.length > 0);
  }

  if (typeof input === 'string') {
    return input
      .split(',')
      .map((tool) => tool.trim())
      .filter((tool) => tool.length > 0);
  }

  if (typeof input === 'object') {
    return Object.keys(input as Record<string, unknown>)
      .filter((key) => {
        const value = (input as Record<string, unknown>)[key];
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        if (Array.isArray(value)) return value.length > 0;
        return Boolean(value);
      })
      .map((key) => key.trim())
      .filter((key) => key.length > 0);
  }

  return [];
};

const collectNodeTools = (node: any): string[] => {
  const sources = [
    node?.data?.tools,
    node?.data?.toolsPlanned,
    node?.data?.selected_tools,
    node?.data?.toolsUsed
  ];

  const result: string[] = [];
  sources.forEach((source) => {
    normalizeTools(source).forEach((tool) => {
      if (!result.includes(tool)) {
        result.push(tool);
      }
    });
  });

  return result;
};

const BlockSettingsPanel: React.FC<BlockSettingsPanelProps> = ({
  node,
  onClose,
  onUpdate,
  onDelete,
  onDuplicate,
  isDarkMode = false,
  availableTools = [],
  position
}) => {
  const [formData, setFormData] = useState({
    name: node?.data?.name || node?.data?.label || '',
    type: node?.data?.type || node?.data?.nodeType || 'analysis',
    agent_role: node?.data?.agent_role || node?.data?.agentRole || '',
    description: node?.data?.description || '',
    tools: collectNodeTools(node),
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

  // Add keyboard shortcut to close panel with Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    // Ensure tools is always an array
    const toolsArray = collectNodeTools(node);

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
  }, [node]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleToolToggle = (tool: string) => {
    setFormData(prev => {
      const normalizedTool = tool.trim();
      const currentTools = Array.isArray(prev.tools) ? prev.tools : [];
      const exists = currentTools.includes(normalizedTool);
      const newTools = exists
        ? currentTools.filter((t: string) => t !== normalizedTool)
        : [...currentTools, normalizedTool];
      return { ...prev, tools: newTools };
    });
  };

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const handleSave = () => {
    setSaveStatus('saving');

    // Debug logging
    console.log('BlockSettingsPanel - Saving with tools:', formData.tools);

    const toolsToSave = Array.from(
      new Set(
        (Array.isArray(formData.tools) ? formData.tools : [])
          .map((tool) => tool.trim())
          .filter((tool) => tool.length > 0)
      )
    );

    const updatedData = {
      ...node.data,
      name: formData.name,
      label: formData.name, // Keep both for compatibility
      type: formData.type,
      nodeType: formData.type, // Keep both for compatibility
      agentRole: formData.agent_role,
      agent_role: formData.agent_role, // Keep both for compatibility
      description: formData.description,
      tools: toolsToSave,
      toolsPlanned: toolsToSave, // Keep both for compatibility
      selected_tools: toolsToSave,
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
    <>
      {/* Backdrop overlay */}
      <div
        className="block-settings-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(2px)',
          zIndex: 999,
          animation: 'fadeIn 0.2s ease-out',
        }}
      />

      <div
        className={`block-settings-panel ${isDarkMode ? 'dark' : ''}`}
        style={{
          position: 'fixed',
          right: '20px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '420px',
          maxWidth: 'calc(100vw - 40px)',
          maxHeight: 'calc(100vh - 120px)',
          backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
          borderRadius: '16px',
          boxShadow: isDarkMode
            ? '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(148, 163, 184, 0.1)'
            : '0 20px 50px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1000,
          animation: 'slideInRight 0.3s ease-out',
          border: isDarkMode ? '1px solid #1e293b' : '1px solid #e5e7eb',
        }}
      >
      <div className="panel-header" style={{
        padding: '20px 24px',
        borderBottom: isDarkMode ? '1px solid #1e293b' : '1px solid #e5e7eb',
        background: isDarkMode
          ? 'linear-gradient(to bottom, #0f172a, #0f172a)'
          : 'linear-gradient(to bottom, #ffffff, #fafafa)',
      }}>
        <div className="header-title" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: isDarkMode ? '#f1f5f9' : '#0f172a',
        }}>
          <Settings size={20} color={isDarkMode ? '#60a5fa' : '#3b82f6'} />
          <h3 style={{
            margin: 0,
            fontSize: '18px',
            fontWeight: 600,
            color: 'inherit',
          }}>Block Settings</h3>
        </div>
        <button
          className="close-btn"
          onClick={onClose}
          style={{
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isDarkMode ? '#1e293b' : '#f1f5f9',
            border: 'none',
            borderRadius: '8px',
            color: isDarkMode ? '#94a3b8' : '#64748b',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = isDarkMode ? '#334155' : '#e2e8f0';
            e.currentTarget.style.color = isDarkMode ? '#f1f5f9' : '#0f172a';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isDarkMode ? '#1e293b' : '#f1f5f9';
            e.currentTarget.style.color = isDarkMode ? '#94a3b8' : '#64748b';
          }}
        >
          <X size={20} />
        </button>
      </div>

      <div className="panel-content" style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px',
        backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
      }}>
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
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      tools: Array.from(
                        new Set(
                          allTools
                            .map((tool) => tool.trim())
                            .filter((tool) => tool.length > 0)
                        )
                      )
                    }))
                  }
                >
                  Select All
                </button>
                <button
                  className="action-btn"
                  onClick={() => setFormData((prev) => ({ ...prev, tools: [] }))}
                >
                  Clear All
                </button>
              </div>

              <div className="tools-grid">
                {allTools.map(tool => {
                  const normalizedTool = tool.trim();
                  const isChecked = Array.isArray(formData.tools) && formData.tools.includes(normalizedTool);
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

      <div className="panel-footer" style={{
        padding: '20px 24px',
        borderTop: isDarkMode ? '1px solid #1e293b' : '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '12px',
        backgroundColor: isDarkMode ? '#0f172a' : '#fafafa',
        borderBottomLeftRadius: '16px',
        borderBottomRightRadius: '16px',
      }}>
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
    </>
  );
};

export default BlockSettingsPanel;