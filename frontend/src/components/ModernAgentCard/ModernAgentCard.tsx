import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Brain,
  Cpu,
  Zap,
  Settings,
  ChevronDown,
  ChevronUp,
  Activity,
  Code,
  FileText,
  Globe,
  Database,
  Terminal,
  Trash2,
  Edit3,
  Check,
  X
} from 'lucide-react';
import './ModernAgentCard.css';

interface Tool {
  id: string;
  name: string;
  icon: React.ReactNode;
  category: string;
}

interface AgentCardProps {
  agent: {
    id: string;
    name: string;
    role: string;
    avatar?: string;
    color: string;
    status: 'idle' | 'thinking' | 'working' | 'complete';
    model: string;
    temperature: number;
    tools: string[];
    tokensUsed?: number;
    systemPrompt?: string;
  };
  onUpdate?: (agent: any) => void;
  onDelete?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

const AVAILABLE_TOOLS: Tool[] = [
  { id: 'file_read', name: 'File Read', icon: <FileText size={14} />, category: 'Files' },
  { id: 'file_write', name: 'File Write', icon: <FileText size={14} />, category: 'Files' },
  { id: 'code_execute', name: 'Code Execute', icon: <Code size={14} />, category: 'Code' },
  { id: 'web_search', name: 'Web Search', icon: <Globe size={14} />, category: 'Web' },
  { id: 'data_query', name: 'Data Query', icon: <Database size={14} />, category: 'Data' },
  { id: 'shell_command', name: 'Shell', icon: <Terminal size={14} />, category: 'System' }
];

const MODEL_OPTIONS = [
  { id: 'gpt-4o', name: 'GPT-4 Optimized', badge: 'Powerful' },
  { id: 'gpt-4o-mini', name: 'GPT-4 Mini', badge: 'Fast' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', badge: 'Efficient' }
];

export const ModernAgentCard: React.FC<AgentCardProps> = ({
  agent,
  onUpdate,
  onDelete,
  isExpanded = false,
  onToggleExpand
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(agent.name);
  const [editedRole, setEditedRole] = useState(agent.role);
  const [localExpanded, setLocalExpanded] = useState(isExpanded);

  const expanded = onToggleExpand ? isExpanded : localExpanded;
  const toggleExpand = onToggleExpand || (() => setLocalExpanded(!localExpanded));

  const getStatusIcon = () => {
    switch (agent.status) {
      case 'thinking': return <Brain className="animate-pulse" />;
      case 'working': return <Cpu className="animate-spin" />;
      case 'complete': return <Check />;
      default: return <Bot />;
    }
  };

  const getStatusColor = () => {
    switch (agent.status) {
      case 'thinking': return '#f59e0b';
      case 'working': return '#3b82f6';
      case 'complete': return '#10b981';
      default: return '#6b7280';
    }
  };

  const handleSave = () => {
    if (onUpdate) {
      onUpdate({
        ...agent,
        name: editedName,
        role: editedRole
      });
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedName(agent.name);
    setEditedRole(agent.role);
    setIsEditing(false);
  };

  const toggleTool = (toolId: string) => {
    if (onUpdate) {
      const newTools = agent.tools.includes(toolId)
        ? agent.tools.filter(t => t !== toolId)
        : [...agent.tools, toolId];
      onUpdate({ ...agent, tools: newTools });
    }
  };

  const updateModel = (modelId: string) => {
    if (onUpdate) {
      onUpdate({ ...agent, model: modelId });
    }
  };

  const updateTemperature = (temperature: number) => {
    if (onUpdate) {
      onUpdate({ ...agent, temperature });
    }
  };

  return (
    <motion.div
      className="modern-agent-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      layout
      style={{ '--agent-color': agent.color } as React.CSSProperties}
    >
      {/* Card Header */}
      <div className="agent-card-header">
        <div className="agent-identity">
          <motion.div 
            className="agent-avatar"
            style={{ background: agent.color }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <span>{agent.avatar || '🤖'}</span>
          </motion.div>
          
          <div className="agent-info">
            {isEditing ? (
              <>
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="agent-name-input"
                  placeholder="Agent name..."
                />
                <input
                  type="text"
                  value={editedRole}
                  onChange={(e) => setEditedRole(e.target.value)}
                  className="agent-role-input"
                  placeholder="Agent role..."
                />
              </>
            ) : (
              <>
                <h3 className="agent-name">{agent.name}</h3>
                <p className="agent-role">{agent.role}</p>
              </>
            )}
          </div>
        </div>

        <div className="agent-actions">
          <div 
            className="agent-status"
            style={{ color: getStatusColor() }}
          >
            {getStatusIcon()}
            <span>{agent.status}</span>
          </div>
          
          {isEditing ? (
            <div className="edit-actions">
              <motion.button
                className="icon-btn success"
                onClick={handleSave}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <Check size={16} />
              </motion.button>
              <motion.button
                className="icon-btn danger"
                onClick={handleCancel}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <X size={16} />
              </motion.button>
            </div>
          ) : (
            <div className="card-actions">
              <motion.button
                className="icon-btn"
                onClick={() => setIsEditing(true)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <Edit3 size={16} />
              </motion.button>
              <motion.button
                className="icon-btn"
                onClick={toggleExpand}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </motion.button>
              {onDelete && (
                <motion.button
                  className="icon-btn danger"
                  onClick={onDelete}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <Trash2 size={16} />
                </motion.button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="agent-stats">
        <div className="stat-item">
          <Zap size={14} />
          <span>{agent.tokensUsed || 0} tokens</span>
        </div>
        <div className="stat-item">
          <Settings size={14} />
          <span>{agent.tools.length} tools</span>
        </div>
        <div className="stat-item">
          <Activity size={14} />
          <span>{agent.model}</span>
        </div>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            className="agent-details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Model Selection */}
            <div className="detail-section">
              <h4 className="section-title">Model</h4>
              <div className="model-options">
                {MODEL_OPTIONS.map(model => (
                  <motion.div
                    key={model.id}
                    className={`model-option ${agent.model === model.id ? 'selected' : ''}`}
                    onClick={() => updateModel(model.id)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="model-name">{model.name}</span>
                    {model.badge && (
                      <span className="model-badge">{model.badge}</span>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Temperature Control */}
            <div className="detail-section">
              <h4 className="section-title">
                Temperature: <span className="temp-value">{agent.temperature}</span>
              </h4>
              <div className="temperature-control">
                <span className="temp-label">Precise</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={agent.temperature}
                  onChange={(e) => updateTemperature(parseFloat(e.target.value))}
                  className="temp-slider"
                />
                <span className="temp-label">Creative</span>
              </div>
            </div>

            {/* Tools Selection */}
            <div className="detail-section">
              <h4 className="section-title">Tools</h4>
              <div className="tools-grid">
                {AVAILABLE_TOOLS.map(tool => (
                  <motion.div
                    key={tool.id}
                    className={`tool-item ${agent.tools.includes(tool.id) ? 'selected' : ''}`}
                    onClick={() => toggleTool(tool.id)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {tool.icon}
                    <span>{tool.name}</span>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* System Prompt */}
            {agent.systemPrompt && (
              <div className="detail-section">
                <h4 className="section-title">System Prompt</h4>
                <div className="system-prompt">
                  {agent.systemPrompt}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};