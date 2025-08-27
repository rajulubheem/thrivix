import React, { useState, useEffect } from 'react';
import './SystemSettings.css';

interface ModelConfig {
  name: string;
  provider: string;
  max_tokens: number;
  temperature: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  enabled: boolean;
}

interface AgentConfig {
  name: string;
  model: string;
  max_tokens: number;
  temperature: number;
  system_prompt?: string;
  tools: string[];
  enabled: boolean;
}

interface SwarmConfig {
  max_handoffs: number;
  max_iterations: number;
  execution_timeout: number;
  node_timeout: number;
  repetitive_handoff_detection_window: number;
  repetitive_handoff_min_unique_agents: number;
}

interface SystemSettingsData {
  models: Record<string, ModelConfig>;
  agents: Record<string, AgentConfig>;
  swarm: SwarmConfig;
  general: Record<string, any>;
}

const SystemSettings: React.FC = () => {
  const [settings, setSettings] = useState<SystemSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'models' | 'agents' | 'swarm' | 'general'>('models');
  const [availableModels, setAvailableModels] = useState<any>({});
  const [availableTools, setAvailableTools] = useState<any>({});

  useEffect(() => {
    loadSettings();
    loadAvailableModels();
    loadAvailableTools();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/settings/`);
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableModels = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/settings/available-models`);
      if (response.ok) {
        const data = await response.json();
        setAvailableModels(data);
      }
    } catch (error) {
      console.error('Error loading available models:', error);
    }
  };

  const loadAvailableTools = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/settings/available-tools`);
      if (response.ok) {
        const data = await response.json();
        setAvailableTools(data);
      }
    } catch (error) {
      console.error('Error loading available tools:', error);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    
    setSaving(true);
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/settings/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });
      
      if (response.ok) {
        // Show success message
        console.log('Settings saved successfully');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const updateModelConfig = (modelId: string, updates: Partial<ModelConfig>) => {
    if (!settings) return;
    
    setSettings({
      ...settings,
      models: {
        ...settings.models,
        [modelId]: {
          ...settings.models[modelId],
          ...updates,
        },
      },
    });
  };

  const updateAgentConfig = (agentId: string, updates: Partial<AgentConfig>) => {
    if (!settings) return;
    
    setSettings({
      ...settings,
      agents: {
        ...settings.agents,
        [agentId]: {
          ...settings.agents[agentId],
          ...updates,
        },
      },
    });
  };

  const updateSwarmConfig = (updates: Partial<SwarmConfig>) => {
    if (!settings) return;
    
    setSettings({
      ...settings,
      swarm: {
        ...settings.swarm,
        ...updates,
      },
    });
  };

  if (loading) {
    return <div className="system-settings-loading">Loading settings...</div>;
  }

  if (!settings) {
    return <div className="system-settings-error">Failed to load settings</div>;
  }

  return (
    <div className="system-settings">
      <div className="system-settings-header">
        <h2>System Settings</h2>
        <button 
          className={`save-button ${saving ? 'saving' : ''}`}
          onClick={saveSettings}
          disabled={saving}
        >
          {saving ? '💾 Saving...' : '💾 Save Changes'}
        </button>
      </div>

      <div className="system-settings-nav">
        <button
          className={`nav-button ${activeSection === 'models' ? 'active' : ''}`}
          onClick={() => setActiveSection('models')}
        >
          🤖 Models
        </button>
        <button
          className={`nav-button ${activeSection === 'agents' ? 'active' : ''}`}
          onClick={() => setActiveSection('agents')}
        >
          👥 Agents
        </button>
        <button
          className={`nav-button ${activeSection === 'swarm' ? 'active' : ''}`}
          onClick={() => setActiveSection('swarm')}
        >
          🚀 Swarm Config
        </button>
        <button
          className={`nav-button ${activeSection === 'general' ? 'active' : ''}`}
          onClick={() => setActiveSection('general')}
        >
          ⚙️ General
        </button>
      </div>

      <div className="system-settings-content">
        {activeSection === 'models' && (
          <div className="models-section">
            <h3>Model Configuration</h3>
            <div className="models-grid">
              {Object.entries(settings.models).map(([modelId, model]) => (
                <div key={modelId} className="model-card">
                  <div className="model-header">
                    <h4>{model.name}</h4>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={model.enabled}
                        onChange={(e) => updateModelConfig(modelId, { enabled: e.target.checked })}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                  
                  <div className="model-fields">
                    <div className="field">
                      <label>Provider</label>
                      <select
                        value={model.provider}
                        onChange={(e) => updateModelConfig(modelId, { provider: e.target.value })}
                      >
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                      </select>
                    </div>
                    
                    <div className="field">
                      <label>Max Tokens</label>
                      <input
                        type="number"
                        value={model.max_tokens}
                        min={1}
                        max={128000}
                        onChange={(e) => updateModelConfig(modelId, { max_tokens: parseInt(e.target.value) })}
                      />
                    </div>
                    
                    <div className="field">
                      <label>Temperature</label>
                      <input
                        type="number"
                        value={model.temperature}
                        min={0}
                        max={2}
                        step={0.1}
                        onChange={(e) => updateModelConfig(modelId, { temperature: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'agents' && (
          <div className="agents-section">
            <h3>Agent Configuration</h3>
            <div className="agents-grid">
              {Object.entries(settings.agents).map(([agentId, agent]) => (
                <div key={agentId} className="agent-card">
                  <div className="agent-header">
                    <h4>{agent.name}</h4>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={agent.enabled}
                        onChange={(e) => updateAgentConfig(agentId, { enabled: e.target.checked })}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                  
                  <div className="agent-fields">
                    <div className="field">
                      <label>Model</label>
                      <select
                        value={agent.model}
                        onChange={(e) => updateAgentConfig(agentId, { model: e.target.value })}
                      >
                        {Object.keys(settings.models).map(modelId => (
                          <option key={modelId} value={modelId}>
                            {settings.models[modelId].name}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="field">
                      <label>Max Tokens</label>
                      <input
                        type="number"
                        value={agent.max_tokens}
                        min={1}
                        max={128000}
                        onChange={(e) => updateAgentConfig(agentId, { max_tokens: parseInt(e.target.value) })}
                      />
                    </div>
                    
                    <div className="field">
                      <label>Temperature</label>
                      <input
                        type="number"
                        value={agent.temperature}
                        min={0}
                        max={2}
                        step={0.1}
                        onChange={(e) => updateAgentConfig(agentId, { temperature: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'swarm' && (
          <div className="swarm-section">
            <h3>Swarm Execution Configuration</h3>
            <div className="swarm-config">
              <div className="config-group">
                <h4>🔄 Handoff Limits</h4>
                <div className="field">
                  <label>Max Handoffs</label>
                  <input
                    type="number"
                    value={settings.swarm.max_handoffs}
                    min={1}
                    max={100}
                    onChange={(e) => updateSwarmConfig({ max_handoffs: parseInt(e.target.value) })}
                  />
                  <span className="field-help">Maximum number of agent handoffs allowed</span>
                </div>
                
                <div className="field">
                  <label>Max Iterations</label>
                  <input
                    type="number"
                    value={settings.swarm.max_iterations}
                    min={1}
                    max={100}
                    onChange={(e) => updateSwarmConfig({ max_iterations: parseInt(e.target.value) })}
                  />
                  <span className="field-help">Maximum total iterations across all agents</span>
                </div>
              </div>

              <div className="config-group">
                <h4>⏱️ Timeout Settings</h4>
                <div className="field">
                  <label>Execution Timeout (seconds)</label>
                  <input
                    type="number"
                    value={settings.swarm.execution_timeout}
                    min={60}
                    max={3600}
                    onChange={(e) => updateSwarmConfig({ execution_timeout: parseFloat(e.target.value) })}
                  />
                  <span className="field-help">Total execution timeout (60-3600 seconds)</span>
                </div>
                
                <div className="field">
                  <label>Node Timeout (seconds)</label>
                  <input
                    type="number"
                    value={settings.swarm.node_timeout}
                    min={30}
                    max={1800}
                    onChange={(e) => updateSwarmConfig({ node_timeout: parseFloat(e.target.value) })}
                  />
                  <span className="field-help">Individual agent timeout (30-1800 seconds)</span>
                </div>
              </div>

              <div className="config-group">
                <h4>🔁 Loop Detection</h4>
                <div className="field">
                  <label>Detection Window</label>
                  <input
                    type="number"
                    value={settings.swarm.repetitive_handoff_detection_window}
                    min={0}
                    max={50}
                    onChange={(e) => updateSwarmConfig({ repetitive_handoff_detection_window: parseInt(e.target.value) })}
                  />
                  <span className="field-help">Number of recent handoffs to check for loops (0 = disabled)</span>
                </div>
                
                <div className="field">
                  <label>Min Unique Agents</label>
                  <input
                    type="number"
                    value={settings.swarm.repetitive_handoff_min_unique_agents}
                    min={1}
                    max={20}
                    onChange={(e) => updateSwarmConfig({ repetitive_handoff_min_unique_agents: parseInt(e.target.value) })}
                  />
                  <span className="field-help">Minimum unique agents required in detection window</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'general' && (
          <div className="general-section">
            <h3>General Settings</h3>
            <div className="general-config">
              <div className="field">
                <label>Auto Save</label>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.general.auto_save}
                    onChange={(e) => setSettings({
                      ...settings,
                      general: { ...settings.general, auto_save: e.target.checked }
                    })}
                  />
                  <span className="slider"></span>
                </label>
              </div>
              
              <div className="field">
                <label>Debug Mode</label>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.general.debug_mode}
                    onChange={(e) => setSettings({
                      ...settings,
                      general: { ...settings.general, debug_mode: e.target.checked }
                    })}
                  />
                  <span className="slider"></span>
                </label>
              </div>
              
              <div className="field">
                <label>Streaming Enabled</label>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.general.streaming_enabled}
                    onChange={(e) => setSettings({
                      ...settings,
                      general: { ...settings.general, streaming_enabled: e.target.checked }
                    })}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SystemSettings;