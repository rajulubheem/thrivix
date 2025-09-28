import React, { useState, useEffect, useRef } from 'react';
import {
  Search, ChevronDown, ChevronRight, X, Plus,
  FileText, Terminal, Globe, Code, Calculator, Clock,
  Database, Settings, Edit3, Shield, Wrench, Package
} from 'lucide-react';
import { toolSchemaService, ToolSchema } from '../../../services/toolSchemaService';
import { unifiedToolService } from '../../../services/unifiedToolService';

interface ToolPaletteProps {
  onAddTool: (toolName: string, schema: ToolSchema) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

// Tool icon mapping
const TOOL_ICONS: Record<string, any> = {
  'file_read': FileText,
  'file_write': FileText,
  'http_request': Globe,
  'shell': Terminal,
  'python_repl': Code,
  'calculator': Calculator,
  'current_time': Clock,
  'use_aws': Database,
  'editor': Edit3,
  'environment': Settings,
  'memory': Database,
  'tavily_search': Globe,
};

// Category icon mapping
const CATEGORY_ICONS: Record<string, any> = {
  'file': FileText,
  'system': Terminal,
  'network': Globe,
  'compute': Code,
  'data': Database,
  'utility': Wrench,
  'ai': Code,
  'cloud': Database,
};

// Category colors
const CATEGORY_COLORS: Record<string, string> = {
  'file': '#3B82F6',
  'system': '#10B981',
  'network': '#F59E0B',
  'compute': '#8B5CF6',
  'data': '#EC4899',
  'utility': '#84CC16',
  'ai': '#F97316',
  'cloud': '#6366F1',
};

export const ToolPalette: React.FC<ToolPaletteProps> = ({
  onAddTool,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const [tools, setTools] = useState<ToolSchema[]>([]);
  const [categorizedTools, setCategorizedTools] = useState<Map<string, ToolSchema[]>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const paletteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTools();
  }, []);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(event.target as Node)) {
        if (onToggleCollapse && !isCollapsed) {
          onToggleCollapse();
        }
      }
    };

    if (!isCollapsed) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCollapsed, onToggleCollapse]);

  const loadTools = async () => {
    setLoading(true);
    try {
      // Load tools from unified service for Strands compatibility
      const allTools = await unifiedToolService.getAllSchemas();

      // Filter tools available in UI
      const uiTools = allTools.filter(tool => tool.available_in_ui !== false);
      setTools(uiTools);

      const categorized = await unifiedToolService.getCategorizedTools();
      // Filter categorized tools for UI availability
      const filteredCategorized = new Map<string, ToolSchema[]>();
      categorized.forEach((tools, category) => {
        const filtered = tools.filter(tool => tool.available_in_ui !== false);
        if (filtered.length > 0) {
          filteredCategorized.set(category, filtered);
        }
      });
      setCategorizedTools(filteredCategorized);

      // Expand first few categories by default
      const categories = Array.from(categorized.keys()).slice(0, 3);
      setExpandedCategories(new Set(categories));
    } catch (error) {
      console.error('Failed to load tools:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleDragStart = (e: React.DragEvent, tool: ToolSchema) => {
    e.dataTransfer.setData('application/reactflow', JSON.stringify({
      type: 'tool',
      toolName: tool.name,
      schema: tool
    }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const filteredTools = searchQuery
    ? tools.filter(tool =>
        tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : null;

  const getFilteredCategorizedTools = (): Map<string, ToolSchema[]> => {
    if (!searchQuery) return categorizedTools;

    const filtered = new Map<string, ToolSchema[]>();
    Array.from(categorizedTools.entries()).forEach(([category, categoryTools]) => {
      const matchingTools = categoryTools.filter(tool =>
        tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
      if (matchingTools.length > 0) {
        filtered.set(category, matchingTools);
      }
    });
    return filtered;
  };

  if (isCollapsed) {
    return (
      <div
        ref={paletteRef}
        style={{
          position: 'fixed',
          left: '20px',
          top: '100px',
          zIndex: 1000
        }}
      >
        <button
          onClick={onToggleCollapse}
          className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow-lg
                     hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors
                     flex items-center gap-2 text-sm font-medium
                     border border-gray-200 dark:border-gray-700"
        >
          <Package size={18} />
          <span>Tools</span>
          <ChevronRight size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={paletteRef}
      style={{
        position: 'fixed',
        left: '20px',
        top: '100px',
        width: '320px',
        maxHeight: '70vh',
        zIndex: 1000,
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
        border: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
      className="tool-palette-container"
    >
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#f9fafb'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px'
        }}>
          <h3 style={{
            margin: 0,
            fontSize: '14px',
            fontWeight: 600,
            color: '#1f2937'
          }}>
            Tool Palette
          </h3>
          <button
            onClick={onToggleCollapse}
            style={{
              padding: '4px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <X size={16} color="#6b7280" />
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#9ca3af'
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tools..."
            style={{
              width: '100%',
              padding: '6px 32px',
              fontSize: '13px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              backgroundColor: 'white',
              outline: 'none'
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
            onBlur={(e) => e.currentTarget.style.borderColor = '#d1d5db'}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                padding: '2px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                borderRadius: '3px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <X size={12} color="#6b7280" />
            </button>
          )}
        </div>
      </div>

      {/* Tools List */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px',
        maxHeight: 'calc(70vh - 120px)'
      }}>
        {loading ? (
          <div style={{
            textAlign: 'center',
            padding: '32px',
            color: '#6b7280',
            fontSize: '13px'
          }}>
            Loading tools...
          </div>
        ) : (
          <>
            {/* Show filtered results or categorized view */}
            {searchQuery && filteredTools ? (
              <div>
                {filteredTools.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '16px',
                    color: '#6b7280',
                    fontSize: '13px'
                  }}>
                    No tools found matching "{searchQuery}"
                  </div>
                ) : (
                  filteredTools.map(tool => (
                    <ToolItem
                      key={tool.name}
                      tool={tool}
                      onAdd={() => onAddTool(tool.name, tool)}
                      onDragStart={(e) => handleDragStart(e, tool)}
                    />
                  ))
                )}
              </div>
            ) : (
              <div>
                {Array.from(getFilteredCategorizedTools()).map(([category, categoryTools]) => (
                  <div key={category} className="border border-gray-200 dark:border-gray-700 rounded-lg">
                    <button
                      onClick={() => toggleCategory(category)}
                      className="w-full px-3 py-2 flex items-center justify-between
                                 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {React.createElement(CATEGORY_ICONS[category] || Package, {
                          size: 14,
                          style: { color: CATEGORY_COLORS[category] || '#6B7280' }
                        })}
                        <span className="text-sm font-medium capitalize">
                          {category}
                        </span>
                        <span className="text-xs text-gray-500">
                          ({categoryTools.length})
                        </span>
                      </div>
                      {expandedCategories.has(category) ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </button>

                    {expandedCategories.has(category) && (
                      <div className="px-2 py-1 space-y-1 bg-gray-50 dark:bg-gray-900/50">
                        {categoryTools.map(tool => (
                          <ToolItem
                            key={tool.name}
                            tool={tool}
                            onAdd={() => onAddTool(tool.name, tool)}
                            onDragStart={(e) => handleDragStart(e, tool)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 16px',
        borderTop: '1px solid #e5e7eb',
        fontSize: '11px',
        color: '#6b7280',
        backgroundColor: '#f9fafb'
      }}>
        Drag tools to canvas or click + to add
      </div>
    </div>
  );
};

// Individual tool item component
const ToolItem: React.FC<{
  tool: ToolSchema;
  onAdd: () => void;
  onDragStart: (e: React.DragEvent) => void;
}> = ({ tool, onAdd, onDragStart }) => {
  const Icon = TOOL_ICONS[tool.name] || Wrench;
  const color = CATEGORY_COLORS[tool.category || 'utility'] || '#6B7280';

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="px-3 py-2 flex items-center justify-between
                 bg-white dark:bg-gray-800 rounded-md
                 hover:bg-gray-100 dark:hover:bg-gray-700
                 cursor-move transition-colors group"
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Icon size={14} style={{ color }} className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {tool.name.replace(/_/g, ' ')}
          </div>
          <div className="text-xs text-gray-500 truncate">
            {tool.description}
          </div>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAdd();
        }}
        className="p-1 opacity-0 group-hover:opacity-100
                   hover:bg-gray-200 dark:hover:bg-gray-600
                   rounded transition-all"
        title="Add to canvas"
      >
        <Plus size={14} />
      </button>
    </div>
  );
};

export default ToolPalette;