import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  X,
  ChevronRight,
  ChevronDown,
  Layers,
  Wrench,
  Cpu,
  GitBranch,
  Database,
  CheckCircle,
  AlertCircle,
  Filter,
  Plus,
  Zap,
  Brain,
  Settings,
  Play
} from 'lucide-react';
import { unifiedToolService, ToolSchema } from '../../../services/unifiedToolService';
import './UnifiedBlockManager.css';

interface UnifiedBlockManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onAddBlock: (blockConfig: BlockConfig) => void;
  isDarkMode?: boolean;
  selectedTools?: Set<string>;
  onToolsChange?: (tools: Set<string>) => void;
}

export interface BlockConfig {
  type: 'unified' | 'tool' | 'professional';  // Single unified type
  subType: string;  // 'analysis', 'tool_call', 'decision', 'input', 'parallel', 'final', etc.
  name: string;
  description?: string;
  toolName?: string;
  toolSchema?: ToolSchema;
  tools?: string[];
  agent_role?: string;
  parameters?: any;
  icon?: any;
  color?: string;
  category?: string;
  hasExecutionCapability?: boolean;
}

interface Category {
  id: string;
  name: string;
  icon: any;
  color: string;
  description: string;
  expanded: boolean;
  items: BlockConfig[];
}

const UnifiedBlockManager: React.FC<UnifiedBlockManagerProps> = ({
  isOpen,
  onClose,
  onAddBlock,
  isDarkMode = false,
  selectedTools = new Set(),
  onToolsChange
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['workflow', 'tools']));
  const [availableTools, setAvailableTools] = useState<ToolSchema[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<'add' | 'filter'>('add'); // Toggle between adding blocks and filtering tools

  // Load available tools
  useEffect(() => {
    const loadTools = async () => {
      setLoading(true);
      try {
        const tools = await unifiedToolService.getAllSchemas();
        setAvailableTools(tools.filter((t: ToolSchema) => t.available_in_ui !== false));
      } catch (error) {
        console.error('Failed to load tools:', error);
      }
      setLoading(false);
    };
    loadTools();
  }, []);

  // Define categories with their blocks
  const categories: Category[] = useMemo(() => {
    const cats: Category[] = [
      {
        id: 'workflow',
        name: 'Workflow Blocks',
        icon: GitBranch,
        color: '#3B82F6',
        description: 'Control flow and logic blocks',
        expanded: expandedCategories.has('workflow'),
        items: [
          {
            type: 'professional',
            subType: 'analysis',
            name: 'Analysis',
            description: 'Analyze data and make decisions',
            icon: Brain,
            color: '#3B82F6',
            category: 'workflow',
            agent_role: 'Analyst'
          },
          {
            type: 'professional',
            subType: 'decision',
            name: 'Decision',
            description: 'Human or automated decision point',
            icon: GitBranch,
            color: '#8B5CF6',
            category: 'workflow',
            agent_role: 'Decision Maker'
          },
          {
            type: 'professional',
            subType: 'parallel',
            name: 'Parallel',
            description: 'Execute multiple branches simultaneously',
            icon: Layers,
            color: '#EC4899',
            category: 'workflow',
            agent_role: 'Coordinator'
          },
          {
            type: 'professional',
            subType: 'input',
            name: 'Input',
            description: 'Collect user or system input',
            icon: Settings,
            color: '#14B8A6',
            category: 'workflow',
            agent_role: 'Input Handler'
          },
          {
            type: 'professional',
            subType: 'tool_call',
            name: 'Tool Execution',
            description: 'Execute specific tools',
            icon: Wrench,
            color: '#F59E0B',
            category: 'workflow',
            agent_role: 'Executor',
            tools: []
          },
          {
            type: 'professional',
            subType: 'final',
            name: 'Final State',
            description: 'Success or failure endpoint',
            icon: CheckCircle,
            color: '#10B981',
            category: 'workflow',
            agent_role: 'Finalizer'
          }
        ]
      },
      {
        id: 'tools',
        name: 'Tools & Services',
        icon: Wrench,
        color: '#F59E0B',
        description: 'External tools and integrations',
        expanded: expandedCategories.has('tools'),
        items: availableTools.map(tool => ({
          type: 'tool',
          subType: 'tool',
          name: tool.display_name || tool.name,
          description: tool.description,
          toolName: tool.name,
          toolSchema: tool,
          icon: Wrench,
          color: tool.color || '#64748B',
          category: tool.category || 'tools',
          hasExecutionCapability: true,
          parameters: tool.examples?.[0] || {}
        }))
      },
      {
        id: 'ai',
        name: 'AI & Intelligence',
        icon: Brain,
        color: '#8B5CF6',
        description: 'AI-powered processing blocks',
        expanded: expandedCategories.has('ai'),
        items: [
          {
            type: 'professional',
            subType: 'ai_analysis',
            name: 'AI Analysis',
            description: 'Advanced AI-powered analysis',
            icon: Brain,
            color: '#8B5CF6',
            category: 'ai',
            agent_role: 'AI Analyst',
            tools: ['use_llm']
          },
          {
            type: 'professional',
            subType: 'ai_generation',
            name: 'AI Generation',
            description: 'Generate content using AI',
            icon: Zap,
            color: '#A855F7',
            category: 'ai',
            agent_role: 'AI Generator',
            tools: ['use_llm', 'python_repl']
          }
        ]
      },
      {
        id: 'data',
        name: 'Data Processing',
        icon: Database,
        color: '#10B981',
        description: 'Data manipulation and storage',
        expanded: expandedCategories.has('data'),
        items: [
          {
            type: 'professional',
            subType: 'data_transform',
            name: 'Transform',
            description: 'Transform and process data',
            icon: Cpu,
            color: '#10B981',
            category: 'data',
            agent_role: 'Data Processor',
            tools: ['python_repl']
          },
          {
            type: 'professional',
            subType: 'data_validation',
            name: 'Validation',
            description: 'Validate data integrity',
            icon: CheckCircle,
            color: '#06B6D4',
            category: 'data',
            agent_role: 'Validator'
          }
        ]
      }
    ];

    return cats;
  }, [availableTools, expandedCategories]);

  // Filter items based on search
  const filteredItems = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    const filtered: BlockConfig[] = [];

    categories.forEach(category => {
      if (selectedCategory === 'all' || selectedCategory === category.id) {
        category.items.forEach(item => {
          if (
            item.name.toLowerCase().includes(searchLower) ||
            item.description?.toLowerCase().includes(searchLower) ||
            item.toolName?.toLowerCase().includes(searchLower) ||
            item.subType.toLowerCase().includes(searchLower)
          ) {
            filtered.push(item);
          }
        });
      }
    });

    return filtered;
  }, [searchTerm, selectedCategory, categories]);

  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const handleAddBlock = (block: BlockConfig) => {
    onAddBlock(block);
    // Don't close if shift is held for multiple additions
    if (!window.event || !(window.event as KeyboardEvent).shiftKey) {
      onClose();
    }
  };

  const handleToolToggle = (toolName: string) => {
    if (!onToolsChange) return;

    const newTools = new Set(selectedTools);
    if (newTools.has(toolName)) {
      newTools.delete(toolName);
    } else {
      newTools.add(toolName);
    }
    onToolsChange(newTools);
  };

  if (!isOpen) return null;

  return (
    <div className={`unified-block-manager ${isDarkMode ? 'dark' : ''}`}>
      <div className="manager-overlay" onClick={onClose} />

      <div className="manager-panel">
        {/* Header */}
        <div className="manager-header">
          <div className="header-content">
            <div className="header-title">
              <Layers size={20} />
              <h2>Block Manager</h2>
            </div>
            <button onClick={onClose} className="close-btn">
              <X size={20} />
            </button>
          </div>

          {/* Mode Toggle */}
          <div className="mode-toggle">
            <button
              className={`mode-btn ${filterMode === 'add' ? 'active' : ''}`}
              onClick={() => setFilterMode('add')}
            >
              <Plus size={16} />
              Add Blocks
            </button>
            <button
              className={`mode-btn ${filterMode === 'filter' ? 'active' : ''}`}
              onClick={() => setFilterMode('filter')}
            >
              <Filter size={16} />
              Filter Tools
            </button>
          </div>

          {/* Search */}
          <div className="search-container">
            <Search size={18} />
            <input
              type="text"
              placeholder={filterMode === 'add' ? 'Search blocks and tools...' : 'Search tools to enable/disable...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="clear-search">
                <X size={16} />
              </button>
            )}
          </div>

          {/* Category Filter (only in add mode) */}
          {filterMode === 'add' && (
            <div className="category-filter">
              <button
                className={`filter-btn ${selectedCategory === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('all')}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  className={`filter-btn ${selectedCategory === cat.id ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat.id)}
                >
                  <cat.icon size={14} />
                  {cat.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="manager-content">
          {loading ? (
            <div className="loading-state">
              <div className="spinner" />
              <p>Loading blocks and tools...</p>
            </div>
          ) : filterMode === 'add' ? (
            // Add Blocks Mode
            <div className="categories-list">
              {categories.map(category => {
                if (selectedCategory !== 'all' && selectedCategory !== category.id) {
                  return null;
                }

                const categoryItems = category.items.filter(item => {
                  const searchLower = searchTerm.toLowerCase();
                  return (
                    item.name.toLowerCase().includes(searchLower) ||
                    item.description?.toLowerCase().includes(searchLower) ||
                    item.toolName?.toLowerCase().includes(searchLower)
                  );
                });

                if (categoryItems.length === 0) return null;

                return (
                  <div key={category.id} className="category-section">
                    <button
                      className="category-header"
                      onClick={() => toggleCategory(category.id)}
                    >
                      {category.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <category.icon size={18} style={{ color: category.color }} />
                      <span className="category-name">{category.name}</span>
                      <span className="category-count">{categoryItems.length}</span>
                    </button>

                    {category.expanded && (
                      <div className="category-items">
                        {categoryItems.map((item, index) => (
                          <button
                            key={`${item.toolName || item.subType}-${index}`}
                            className="block-item"
                            onClick={() => handleAddBlock(item)}
                            title={`${item.description}\n\nClick to add, Shift+Click to add multiple`}
                          >
                            <div className="item-icon" style={{ color: item.color }}>
                              {React.createElement(item.icon || Wrench, { size: 20 })}
                            </div>
                            <div className="item-content">
                              <div className="item-name">{item.name}</div>
                              <div className="item-description">{item.description}</div>
                              {item.toolName && (
                                <div className="item-meta">
                                  <span className="tool-name">{item.toolName}</span>
                                  {item.hasExecutionCapability && <Play size={12} />}
                                </div>
                              )}
                            </div>
                            <div className="item-action">
                              <Plus size={16} />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredItems.length === 0 && (
                <div className="empty-state">
                  <AlertCircle size={48} />
                  <h3>No blocks found</h3>
                  <p>Try adjusting your search or filters</p>
                </div>
              )}
            </div>
          ) : (
            // Filter Tools Mode
            <div className="tools-filter-list">
              <div className="filter-info">
                <AlertCircle size={16} />
                <p>Select which tools the AI can use. Leave empty to allow all tools.</p>
              </div>

              <div className="tools-grid">
                {availableTools
                  .filter(tool =>
                    tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    tool.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    tool.description?.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map(tool => (
                    <label key={tool.name} className="tool-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedTools.has(tool.name)}
                        onChange={() => handleToolToggle(tool.name)}
                      />
                      <div className="tool-info">
                        <div className="tool-header">
                          <Wrench size={16} style={{ color: tool.color || '#64748B' }} />
                          <span className="tool-display-name">{tool.display_name || tool.name}</span>
                        </div>
                        <div className="tool-description">{tool.description}</div>
                      </div>
                    </label>
                  ))}
              </div>

              {selectedTools.size > 0 && (
                <div className="selected-tools-summary">
                  <strong>{selectedTools.size} tools selected</strong>
                  <button onClick={() => onToolsChange?.(new Set())} className="clear-btn">
                    Clear all
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="manager-footer">
          <div className="footer-info">
            {filterMode === 'add' ? (
              <span>💡 Tip: Hold Shift while clicking to add multiple blocks</span>
            ) : (
              <span>🔧 {selectedTools.size === 0 ? 'All tools enabled' : `${selectedTools.size} tools restricted`}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnifiedBlockManager;