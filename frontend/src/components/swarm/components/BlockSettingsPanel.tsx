import React, { useState, useEffect, useRef } from 'react';
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
  const panelRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState({
    name: node?.data?.name || node?.data?.label || '',
    type: node?.data?.type || node?.data?.nodeType || 'analysis',
    agent_role: node?.data?.agent_role || node?.data?.agentRole || '',
    description: node?.data?.description || '',
    tools: collectNodeTools(node),
    parameters: node?.data?.parameters || {},
    enabled: node?.data?.enabled !== false,
    isStart: !!node?.data?.isStart
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

  // Add click-outside-to-close handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        // Check if the click is on a workflow block (don't close if clicking on a block)
        const targetElement = event.target as HTMLElement;
        const isWorkflowBlock = targetElement.closest('.workflow-block');
        if (!isWorkflowBlock) {
          onClose();
        }
      }
    };

    // Add event listener after a short delay to prevent immediate closure
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
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
      enabled: node?.data?.enabled !== false,
      isStart: !!node?.data?.isStart
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
      enabled: formData.enabled,
      isStart: !!formData.isStart
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
    { value: 'parallel_load', label: 'Parallel Load' },
    { value: 'join', label: 'Join' },
    { value: 'loop', label: 'Loop' },
    { value: 'final', label: 'Final State' }
  ];

  return (
    <>
      {/* Removed backdrop overlay to allow workflow interaction */}

      <div
        ref={panelRef}
        className={`block-settings-panel ${isDarkMode ? 'dark' : ''}`}
      >
      <div className="panel-header">
        <div className="header-title">
          <Settings size={20} />
          <h3>Block Settings</h3>
        </div>
        <button
          className="close-btn"
          onClick={onClose}
        >
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
                <div className="tools-hint">
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

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={!!formData.isStart}
                  onChange={(e) => setFormData({ ...formData, isStart: e.target.checked })}
                />
                <span>Mark as Start</span>
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
    </>
  );
};

export default BlockSettingsPanel;
