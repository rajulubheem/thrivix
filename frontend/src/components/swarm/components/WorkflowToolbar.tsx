import React, { useState } from 'react';
import {
  Plus, Search, Layers, GitBranch, Cpu, Users, CheckCircle, AlertTriangle,
  RefreshCw, Grid, Play, Pause, Download, Upload, ZoomIn, ZoomOut,
  Maximize2, Settings, ChevronDown, Wrench, Zap, ArrowRight, Sparkles, FileText, BookOpen
} from 'lucide-react';
import { workflowTemplates, WorkflowTemplate, getTemplatesByCategory } from '../templates/WorkflowTemplates';
import { realWorkflowTemplates, validateTemplateTools, getSuggestedInstalls } from '../templates/RealToolsTemplates';

interface WorkflowToolbarProps {
  onAddBlock: (type: string, position?: { x: number; y: number }) => void;
  onArrangeBlocks: () => void;
  onRunWorkflow?: () => void;
  onStopWorkflow?: () => void;
  onClearHistory?: () => void;
  onExportWorkflow?: () => void;
  onImportWorkflow?: () => void;
  onImportTemplate?: (template: WorkflowTemplate) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitView?: () => void;
  isRunning?: boolean;
  hasExecutionHistory?: boolean;
  availableTools?: string[];
  selectedTools?: Set<string>;
  onToolsChange?: (tools: Set<string>) => void;
  onEnhanceFlow?: (prompt: string, selectedNodeIds: string[]) => void;
  selectedNodes?: any[];
}

const BLOCK_TEMPLATES = [
  {
    category: 'Basic',
    blocks: [
      { type: 'analysis', icon: '🔍', label: 'Analysis', color: '#3B82F6', description: 'Analyze data or context' },
      { type: 'tool_call', icon: Wrench, label: 'Tool Call', color: '#10B981', description: 'Execute tools' },
      { type: 'decision', icon: GitBranch, label: 'Decision', color: '#F59E0B', description: 'Conditional branching' },
      { type: 'validation', icon: CheckCircle, label: 'Validation', color: '#8B5CF6', description: 'Validate data' },
    ]
  },
  {
    category: 'Advanced',
    blocks: [
      { type: 'transformation', icon: RefreshCw, label: 'Transform', color: '#EC4899', description: 'Transform data' },
      { type: 'human', icon: Users, label: 'Human Input', color: '#6366F1', description: 'Request human input' },
      { type: 'parallel', icon: Zap, label: 'Parallel', color: '#84CC16', description: 'Run tasks in parallel' },
      { type: 'loop', icon: RefreshCw, label: 'Loop', color: '#F97316', description: 'Iterate over items' },
    ]
  },
  {
    category: 'Control',
    blocks: [
      { type: 'initial', icon: Play, label: 'Start', color: '#22C55E', description: 'Workflow entry point' },
      { type: 'final', icon: AlertTriangle, label: 'End', color: '#EF4444', description: 'Workflow exit point' },
    ]
  }
];

export const WorkflowToolbar: React.FC<WorkflowToolbarProps> = ({
  onAddBlock,
  onArrangeBlocks,
  onRunWorkflow,
  onStopWorkflow,
  onClearHistory,
  onExportWorkflow,
  onImportWorkflow,
  onImportTemplate,
  onZoomIn,
  onZoomOut,
  onFitView,
  isRunning = false,
  hasExecutionHistory = false,
  availableTools = [],
  selectedTools = new Set(),
  onToolsChange,
  onEnhanceFlow,
  selectedNodes = []
}) => {
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showToolsPanel, setShowToolsPanel] = useState(false);
  const [showEnhancePanel, setShowEnhancePanel] = useState(false);
  const [enhancePrompt, setEnhancePrompt] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateCategory, setTemplateCategory] = useState<'all' | 'simple' | 'medium' | 'complex'>('all');
  const [templateSearch, setTemplateSearch] = useState('');
  const [useRealTools, setUseRealTools] = useState(true);  // Toggle between demo and real templates

  const filteredBlocks = BLOCK_TEMPLATES.flatMap(category => {
    if (selectedCategory !== 'all' && selectedCategory !== category.category) {
      return [];
    }
    return category.blocks.filter(block =>
      block.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      block.description.toLowerCase().includes(searchTerm.toLowerCase())
    ).map(block => ({ ...block, category: category.category }));
  });

  const handleDragStart = (event: React.DragEvent, blockType: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/reactflow', blockType);
    event.dataTransfer.setData('application/json', JSON.stringify({ type: blockType, useEnhanced: true }));
  };

  return (
    <div className="absolute top-4 left-4 z-50 flex flex-col gap-2">
      {/* Main Toolbar */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-1 p-2">
          {/* Templates Button */}
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg
                     transition-colors flex items-center gap-2 text-sm font-medium"
            title="Use workflow templates"
          >
            <FileText size={16} />
            Templates
          </button>

          {/* Block Menu */}
          <div className="relative">
            <button
              onClick={() => setShowBlockMenu(!showBlockMenu)}
              className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg
                       transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <Plus size={16} />
              Add Block
              <ChevronDown size={14} />
            </button>

            {showBlockMenu && (
              <div className="absolute top-full mt-2 left-0 w-80 bg-white dark:bg-gray-900
                            rounded-lg shadow-xl border border-gray-200 dark:border-gray-700">
                {/* Search and Filter */}
                <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search blocks..."
                    className="w-full px-3 py-1.5 text-sm border rounded-md
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />

                  <div className="flex gap-1 mt-2">
                    {['all', 'Basic', 'Advanced', 'Control'].map(cat => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-2 py-1 text-xs rounded transition-colors
                                  ${selectedCategory === cat
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200'}`}
                      >
                        {cat === 'all' ? 'All' : cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Block List */}
                <div className="max-h-96 overflow-y-auto p-2">
                  {filteredBlocks.length > 0 ? (
                    <div className="space-y-1">
                      {filteredBlocks.map((block, idx) => {
                        const Icon = typeof block.icon === 'string' ? null : block.icon;
                        return (
                          <div
                            key={`${block.type}-${idx}`}
                            draggable
                            onDragStart={(e) => handleDragStart(e, block.type)}
                            onClick={() => {
                              onAddBlock(block.type);
                              setShowBlockMenu(false);
                            }}
                            className="flex items-start gap-3 p-2.5 hover:bg-gray-50
                                     dark:hover:bg-gray-800 rounded-lg cursor-move
                                     transition-colors group"
                          >
                            <div
                              className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0
                                       group-hover:scale-110 transition-transform"
                              style={{ backgroundColor: `${block.color}20` }}
                            >
                              {Icon ? (
                                <Icon size={16} style={{ color: block.color }} />
                              ) : (
                                <span className="text-sm">{typeof block.icon === 'string' ? block.icon : ''}</span>
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{block.label}</span>
                                <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800
                                               rounded text-gray-500">
                                  {block.category}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {block.description}
                              </p>
                            </div>
                            <ArrowRight size={14} className="text-gray-400 opacity-0 group-hover:opacity-100
                                                           transition-opacity flex-shrink-0 mt-2" />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      No blocks found
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Quick Add</div>
                  <div className="flex gap-1">
                    {BLOCK_TEMPLATES[0].blocks.slice(0, 4).map(block => {
                      const Icon = typeof block.icon === 'string' ? null : block.icon;
                      return (
                        <button
                          key={block.type}
                          onClick={() => {
                            onAddBlock(block.type);
                            setShowBlockMenu(false);
                          }}
                          className="flex-1 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800
                                   rounded transition-colors"
                          title={block.label}
                        >
                          {Icon ? (
                            <Icon size={14} style={{ color: block.color }} className="mx-auto" />
                          ) : (
                            <span className="text-xs">{typeof block.icon === 'string' ? block.icon : ''}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

          {/* Workflow Controls */}
          {onRunWorkflow && (
            <button
              onClick={isRunning ? onStopWorkflow : onRunWorkflow}
              className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium
                        ${isRunning
                          ? 'bg-red-100 hover:bg-red-200 text-red-600 dark:bg-red-900/20'
                          : 'bg-green-100 hover:bg-green-200 text-green-600 dark:bg-green-900/20'}`}
            >
              {isRunning ? <Pause size={16} /> : <Play size={16} />}
              {isRunning ? 'Stop' : 'Run'}
            </button>
          )}

          {hasExecutionHistory && onClearHistory && (
            <button
              onClick={onClearHistory}
              className="px-3 py-2 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 dark:bg-amber-900/20
                        transition-colors flex items-center gap-2 text-sm font-medium"
              title="Clear execution history and reset block statuses"
            >
              <RefreshCw size={16} />
              Clear History
            </button>
          )}

          <button
            onClick={onArrangeBlocks}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Auto Arrange"
          >
            <Grid size={16} />
          </button>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

          {/* View Controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={onZoomIn}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="Zoom In"
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={onZoomOut}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="Zoom Out"
            >
              <ZoomOut size={16} />
            </button>
            <button
              onClick={onFitView}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="Fit View"
            >
              <Maximize2 size={16} />
            </button>
          </div>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

          {/* Tools Selection */}
          <button
            onClick={() => setShowToolsPanel(!showToolsPanel)}
            className={`p-2 rounded-lg transition-colors flex items-center gap-1 ${
              showToolsPanel ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            title="Configure Tools"
          >
            <Wrench size={16} />
            {selectedTools.size > 0 && (
              <span className="text-xs bg-blue-500 text-white rounded-full px-1.5">
                {selectedTools.size}
              </span>
            )}
          </button>

          {/* AI Enhance */}
          <button
            onClick={() => setShowEnhancePanel(!showEnhancePanel)}
            className={`p-2 rounded-lg transition-colors flex items-center gap-1 ${
              showEnhancePanel ? 'bg-purple-100 dark:bg-purple-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            title="Enhance Flow with AI"
          >
            <Sparkles size={16} />
            {selectedNodes.length > 0 && (
              <span className="text-xs bg-purple-500 text-white rounded-full px-1.5">
                {selectedNodes.length}
              </span>
            )}
          </button>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

          {/* Import/Export */}
          <button
            onClick={onExportWorkflow}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Export"
          >
            <Download size={16} />
          </button>
          <button
            onClick={onImportWorkflow}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Import"
          >
            <Upload size={16} />
          </button>
        </div>
      </div>

      {/* Status Bar */}
      {isRunning && (
        <div className="bg-green-100 dark:bg-green-900/20 border border-green-300
                      dark:border-green-700 rounded-lg px-3 py-2 flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm text-green-700 dark:text-green-400">Workflow Running</span>
        </div>
      )}

      {/* AI Enhance Panel */}
      {showEnhancePanel && (
        <div className="absolute top-16 left-4 w-96 bg-white dark:bg-gray-900 rounded-lg shadow-lg
                      border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-sm font-medium flex items-center gap-2">
                <Sparkles size={14} className="text-purple-500" />
                AI Flow Enhancement
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {selectedNodes.length > 0
                  ? `Enhance ${selectedNodes.length} selected block(s)`
                  : 'Select blocks to enhance or enhance entire flow'}
              </p>
            </div>
            <button
              onClick={() => setShowEnhancePanel(false)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            >
              <ChevronDown size={14} />
            </button>
          </div>

          <textarea
            value={enhancePrompt}
            onChange={(e) => setEnhancePrompt(e.target.value)}
            placeholder="Describe how you want to enhance the selected blocks or entire workflow...

Examples:
• Add error handling and retry logic
• Add validation steps before each tool call
• Break down into smaller, more specific steps
• Add parallel processing where possible
• Add human review checkpoints"
            className="w-full h-32 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600
                     rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500
                     bg-white dark:bg-gray-800"
          />

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                if (onEnhanceFlow && enhancePrompt.trim()) {
                  const nodeIds = selectedNodes.map(n => n.id);
                  onEnhanceFlow(enhancePrompt, nodeIds);
                  setEnhancePrompt('');
                  setShowEnhancePanel(false);
                }
              }}
              disabled={!enhancePrompt.trim()}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors
                        flex items-center justify-center gap-2
                        ${enhancePrompt.trim()
                          ? 'bg-purple-500 hover:bg-purple-600 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}
            >
              <Sparkles size={14} />
              Enhance {selectedNodes.length > 0 ? 'Selected' : 'Flow'}
            </button>

            <button
              onClick={() => {
                setEnhancePrompt('');
                setShowEnhancePanel(false);
              }}
              className="px-3 py-2 text-sm bg-gray-200 dark:bg-gray-700 rounded-lg
                       hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>

          {selectedNodes.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Selected blocks:</p>
              <div className="flex flex-wrap gap-1">
                {selectedNodes.slice(0, 5).map(node => (
                  <span key={node.id} className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/30
                                                text-purple-700 dark:text-purple-300 rounded">
                    {node.data?.name || node.id}
                  </span>
                ))}
                {selectedNodes.length > 5 && (
                  <span className="px-2 py-1 text-xs text-gray-500">
                    +{selectedNodes.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Templates Panel */}
      {showTemplates && (
        <div className="absolute top-16 left-4 w-[500px] bg-white dark:bg-gray-900 rounded-lg shadow-lg
                      border border-gray-200 dark:border-gray-700">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium flex items-center gap-2">
                <BookOpen size={18} />
                Workflow Templates
              </h3>
              <button
                onClick={() => setShowTemplates(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              >
                ×
              </button>
            </div>

            <input
              type="text"
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              placeholder="Search templates..."
              className="w-full px-3 py-1.5 text-sm border rounded-md
                       focus:outline-none focus:ring-2 focus:ring-purple-500 mb-3"
            />

            <div className="flex gap-1">
              {['all', 'simple', 'medium', 'complex'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setTemplateCategory(cat as any)}
                  className={`px-3 py-1 text-xs rounded transition-colors capitalize
                            ${templateCategory === cat
                              ? 'bg-purple-500 text-white'
                              : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 pb-2">
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={useRealTools}
                onChange={(e) => setUseRealTools(e.target.checked)}
                className="rounded"
              />
              <span>Use Real Tools</span>
            </label>
            <span className="text-xs text-gray-500">
              {useRealTools ? '(strands-agents-tools)' : '(demo templates)'}
            </span>
          </div>

          <div className="max-h-96 overflow-y-auto p-3">
            <div className="grid gap-2">
              {(useRealTools ? realWorkflowTemplates : workflowTemplates)
                .filter(template => {
                  const matchesCategory = templateCategory === 'all' || template.category === templateCategory;
                  const matchesSearch = !templateSearch ||
                    template.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                    template.description.toLowerCase().includes(templateSearch.toLowerCase()) ||
                    template.tags.some(tag => tag.toLowerCase().includes(templateSearch.toLowerCase()));
                  return matchesCategory && matchesSearch;
                })
                .map(template => {
                  // Validate tools if using real templates
                  const validation = useRealTools && 'requiredTools' in template
                    ? validateTemplateTools(template as any, availableTools)
                    : { isValid: true, missing: [], optional: [] };

                  return (
                    <div
                      key={template.id}
                      className={`p-3 bg-gray-50 dark:bg-gray-800 rounded-lg transition-colors cursor-pointer group
                               ${validation.isValid ? 'hover:bg-gray-100 dark:hover:bg-gray-700' : 'opacity-75'}`}
                      onClick={() => {
                        if (onImportTemplate) {
                          if (!validation.isValid) {
                            const install = getSuggestedInstalls(validation.missing);
                            const confirmImport = window.confirm(`This template requires missing tools:\n${validation.missing.join(', ')}\n\nSuggested installations:\n${install.join('\n')}\n\nImport anyway?`);
                            if (confirmImport) {
                              onImportTemplate(template);
                              setShowTemplates(false);
                            }
                          } else {
                            onImportTemplate(template);
                            setShowTemplates(false);
                          }
                        }
                      }}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <h4 className="font-medium text-sm group-hover:text-purple-600 dark:group-hover:text-purple-400">
                          {template.name}
                        </h4>
                        <span className={`px-2 py-0.5 text-xs rounded capitalize
                                       ${template.category === 'simple' ? 'bg-green-100 text-green-700' :
                                         template.category === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                         'bg-red-100 text-red-700'}`}>
                          {template.category}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                        {template.description}
                      </p>

                      {/* Tool validation warnings */}
                      {!validation.isValid && (
                        <div className="mb-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-xs">
                          <div className="flex items-start gap-1">
                            <AlertTriangle size={12} className="text-yellow-600 mt-0.5" />
                            <div>
                              <div className="text-yellow-700 dark:text-yellow-400">
                                Missing tools: {validation.missing.join(', ')}
                              </div>
                              {validation.optional.length > 0 && (
                                <div className="text-gray-600 dark:text-gray-400 mt-1">
                                  Optional: {validation.optional.join(', ')}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex flex-wrap gap-1">
                          {template.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{template.machine.states.length} states</span>
                          {validation.isValid && useRealTools && (
                            <CheckCircle size={12} className="text-green-500" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Tools Panel */}
      {showToolsPanel && availableTools.length > 0 && (
        <div className="absolute top-16 left-4 w-64 bg-white dark:bg-gray-900 rounded-lg shadow-lg
                      border border-gray-200 dark:border-gray-700 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Available Tools</span>
            <button
              onClick={() => setShowToolsPanel(false)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            >
              <ChevronDown size={14} />
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1">
            {availableTools.map(tool => (
              <label
                key={tool}
                className="flex items-center gap-2 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-800
                         rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedTools.has(tool)}
                  onChange={(e) => {
                    if (onToolsChange) {
                      const newTools = new Set(selectedTools);
                      if (e.target.checked) {
                        newTools.add(tool);
                      } else {
                        newTools.delete(tool);
                      }
                      onToolsChange(newTools);
                    }
                  }}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">{tool}</span>
              </label>
            ))}
          </div>

          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (onToolsChange) {
                    onToolsChange(new Set(availableTools));
                  }
                }}
                className="flex-1 text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Select All
              </button>
              <button
                onClick={() => {
                  if (onToolsChange) {
                    onToolsChange(new Set());
                  }
                }}
                className="flex-1 text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded
                         hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};