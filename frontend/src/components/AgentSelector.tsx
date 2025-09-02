import React, { useState } from 'react';
import { Agent, AgentTemplate } from '../types/swarm';
import './AgentSelector.css';

interface AgentSelectorProps {
  selectedAgents: Agent[];
  onSelectionChange: (agents: Agent[]) => void;
  isAutoSelect: boolean;
  onAutoSelectChange: (auto: boolean) => void;
  disabled?: boolean;
}

const agentTemplates: AgentTemplate[] = [
  {
    id: 'researcher',
    name: 'Researcher',
    description: 'Gathers information and analyzes requirements',
    icon: '🔍',
    system_prompt: 'You are a research specialist...',
    tools: ['http_request', 'file_read', 'current_time'],
    category: 'research'
  },
  {
    id: 'architect',
    name: 'Architect',
    description: 'Designs system architecture and structure',
    icon: '🏗️',
    system_prompt: 'You are a system architect...',
    tools: ['editor', 'file_write'],
    category: 'development'
  },
  {
    id: 'developer',
    name: 'Developer',
    description: 'Implements solutions in code',
    icon: '💻',
    system_prompt: 'You are a skilled developer...',
    tools: ['editor', 'python_repl', 'shell', 'file_write', 'file_read'],
    category: 'development'
  },
  {
    id: 'tester',
    name: 'Tester',
    description: 'Validates functionality and quality',
    icon: '🧪',
    system_prompt: 'You are a QA specialist...',
    tools: ['python_repl', 'shell', 'file_read'],
    category: 'review'
  },
  {
    id: 'documenter',
    name: 'Documenter',
    description: 'Creates comprehensive documentation',
    icon: '📝',
    system_prompt: 'You are a technical writer...',
    tools: ['editor', 'file_write'],
    category: 'creative'
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Performs final quality checks',
    icon: '✅',
    system_prompt: 'You are a senior reviewer...',
    tools: ['file_read', 'calculator'],
    category: 'review'
  }
];

const AgentSelector: React.FC<AgentSelectorProps> = ({
  selectedAgents,
  onSelectionChange,
  isAutoSelect,
  onAutoSelectChange,
  disabled = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredAgents = agentTemplates.filter(agent => {
    const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         agent.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || agent.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const toggleAgent = (template: AgentTemplate) => {
    const existing = selectedAgents.find(a => a.name === template.name);
    if (existing) {
      onSelectionChange(selectedAgents.filter(a => a.name !== template.name));
    } else {
      const newAgent: Agent = {
        name: template.name,
        system_prompt: template.system_prompt,
        tools: template.tools,
        description: template.description
      };
      onSelectionChange([...selectedAgents, newAgent]);
    }
  };

  const isSelected = (template: AgentTemplate) => {
    return selectedAgents.some(a => a.name === template.name);
  };

  return (
    <div className="agent-selector">
      <div className="selector-header">
        <h3>Agent Configuration</h3>
        <div className="auto-select-toggle">
          <label>
            <input
              type="checkbox"
              checked={isAutoSelect}
              onChange={(e) => onAutoSelectChange(e.target.checked)}
              disabled={disabled}
            />
            Auto-select agents
          </label>
        </div>
      </div>

      {!isAutoSelect && (
        <div className="selector-content">
          <div className="search-filter">
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
              disabled={disabled}
            />
            
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="category-filter"
              disabled={disabled}
            >
              <option value="all">All Categories</option>
              <option value="research">Research</option>
              <option value="development">Development</option>
              <option value="analysis">Analysis</option>
              <option value="creative">Creative</option>
              <option value="review">Review</option>
            </select>
          </div>

          <div className="agent-grid">
            {filteredAgents.map((template) => (
              <div
                key={template.id}
                className={`agent-card ${isSelected(template) ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
                onClick={() => !disabled && toggleAgent(template)}
              >
                <div className="card-header">
                  <div className="agent-icon">{template.icon}</div>
                  {isSelected(template) && <span className="check-mark">✓</span>}
                </div>
                <h4 className="agent-name">{template.name}</h4>
                <p className="agent-description">{template.description}</p>
                <div className="agent-tools">
                  {template.tools.slice(0, 3).map((tool) => (
                    <span key={tool} className="tool-tag">{tool}</span>
                  ))}
                  {template.tools.length > 3 && (
                    <span className="tool-tag more">+{template.tools.length - 3}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {selectedAgents.length > 0 && (
            <div className="selected-summary">
              <div className="summary-header">
                <span>Selected Agents ({selectedAgents.length})</span>
                <button
                  onClick={() => onSelectionChange([])}
                  className="clear-button"
                  disabled={disabled}
                >
                  Clear all
                </button>
              </div>
              <div className="selected-agents">
                {selectedAgents.map((agent) => (
                  <span key={agent.name} className="selected-agent">
                    {agent.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {isAutoSelect && (
        <div className="auto-select-info">
          <div className="auto-icon">✨</div>
          <h4>Automatic Agent Selection</h4>
          <p>
            Agents will be automatically selected based on your task requirements.
            The system will analyze your task and choose the most appropriate agents.
          </p>
        </div>
      )}
    </div>
  );
};

export default AgentSelector;