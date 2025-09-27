import React, { useState } from 'react';
import {
  Plus,
  Search,
  Layers,
  GitBranch,
  Cpu,
  Users,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Grid,
  Copy,
  Trash2,
  Download,
  Upload,
  Play,
  Pause,
  Settings,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Home
} from 'lucide-react';

interface BlockToolbarProps {
  onAddBlock: (type: string) => void;
  onArrangeBlocks: () => void;
  onRunWorkflow?: () => void;
  onStopWorkflow?: () => void;
  onExportWorkflow?: () => void;
  onImportWorkflow?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitView?: () => void;
  isRunning?: boolean;
  selectedBlockCount?: number;
  onDeleteSelected?: () => void;
  onGroupSelected?: () => void;
}

const BLOCK_TEMPLATES = [
  { type: 'analysis', icon: Search, label: 'Analysis', color: '#3B82F6' },
  { type: 'tool_call', icon: Cpu, label: 'Tool Call', color: '#10B981' },
  { type: 'decision', icon: GitBranch, label: 'Decision', color: '#F59E0B' },
  { type: 'validation', icon: CheckCircle, label: 'Validation', color: '#8B5CF6' },
  { type: 'human', icon: Users, label: 'Human Input', color: '#6366F1' },
  { type: 'parallel', icon: Layers, label: 'Parallel', color: '#84CC16' },
  { type: 'loop', icon: RefreshCw, label: 'Loop', color: '#F97316' },
  { type: 'final', icon: AlertTriangle, label: 'Final', color: '#EF4444' }
];

export const BlockToolbar: React.FC<BlockToolbarProps> = ({
  onAddBlock,
  onArrangeBlocks,
  onRunWorkflow,
  onStopWorkflow,
  onExportWorkflow,
  onImportWorkflow,
  onZoomIn,
  onZoomOut,
  onFitView,
  isRunning = false,
  selectedBlockCount = 0,
  onDeleteSelected,
  onGroupSelected
}) => {
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredBlocks = BLOCK_TEMPLATES.filter(block =>
    block.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddBlock = (type: string) => {
    onAddBlock(type);
    setShowBlockMenu(false);
    setSearchTerm('');
  };

  return (
    <div className="absolute top-4 left-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        {/* Main Toolbar */}
        <div className="flex items-center gap-1 p-2">
          {/* Add Block Button */}
          <div className="relative">
            <button
              onClick={() => setShowBlockMenu(!showBlockMenu)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2"
              title="Add Block"
            >
              <Plus size={18} />
              <span className="text-sm font-medium">Add Block</span>
            </button>

            {/* Block Menu Dropdown */}
            {showBlockMenu && (
              <div className="absolute top-full mt-2 left-0 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* Search */}
                <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                  <div className="relative">
                    <Search size={16} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search blocks..."
                      className="w-full pl-8 pr-2 py-1 text-sm border rounded bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Block List */}
                <div className="max-h-80 overflow-y-auto p-2">
                  {filteredBlocks.length > 0 ? (
                    <div className="grid gap-1">
                      {filteredBlocks.map((block) => (
                        <button
                          key={block.type}
                          onClick={() => handleAddBlock(block.type)}
                          className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-left"
                        >
                          <div
                            className="w-8 h-8 rounded flex items-center justify-center"
                            style={{ backgroundColor: `${block.color}20` }}
                          >
                            <block.icon size={16} style={{ color: block.color }} />
                          </div>
                          <div>
                            <div className="text-sm font-medium">{block.label}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              Add {block.label.toLowerCase()} block
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      No blocks found
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

          {/* Workflow Controls */}
          {onRunWorkflow && (
            <button
              onClick={isRunning ? onStopWorkflow : onRunWorkflow}
              className={`p-2 rounded-lg transition-colors flex items-center gap-2 ${
                isRunning
                  ? 'bg-red-100 hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800 text-red-600'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title={isRunning ? 'Stop Workflow' : 'Run Workflow'}
            >
              {isRunning ? <Pause size={18} /> : <Play size={18} />}
              <span className="text-sm font-medium">{isRunning ? 'Stop' : 'Run'}</span>
            </button>
          )}

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

          {/* Layout Controls */}
          <button
            onClick={onArrangeBlocks}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Auto Arrange"
          >
            <Grid size={18} />
          </button>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

          {/* Zoom Controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={onZoomIn}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Zoom In"
            >
              <ZoomIn size={18} />
            </button>
            <button
              onClick={onZoomOut}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Zoom Out"
            >
              <ZoomOut size={18} />
            </button>
            <button
              onClick={onFitView}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Fit to View"
            >
              <Maximize2 size={18} />
            </button>
          </div>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

          {/* Import/Export */}
          <button
            onClick={onExportWorkflow}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Export Workflow"
          >
            <Download size={18} />
          </button>
          <button
            onClick={onImportWorkflow}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Import Workflow"
          >
            <Upload size={18} />
          </button>
        </div>

        {/* Selection Actions */}
        {selectedBlockCount > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 px-2 py-1 flex items-center justify-between bg-blue-50 dark:bg-blue-900/20">
            <span className="text-sm text-blue-600 dark:text-blue-400">
              {selectedBlockCount} block{selectedBlockCount > 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={onGroupSelected}
                className="p-1 hover:bg-blue-200 dark:hover:bg-blue-800 rounded transition-colors"
                title="Group Selected"
              >
                <Layers size={16} />
              </button>
              <button
                onClick={onDeleteSelected}
                className="p-1 hover:bg-red-200 dark:hover:bg-red-800 rounded transition-colors text-red-600"
                title="Delete Selected"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Running Indicator */}
      {isRunning && (
        <div className="mt-2 bg-green-100 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-lg px-3 py-2 flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm text-green-700 dark:text-green-400">Workflow Running</span>
        </div>
      )}
    </div>
  );
};