import React, { useState, useRef, useEffect, memo } from 'react';
import { BlockStatus } from '../../../types/workflow';
import { Handle, Position, type NodeProps, useUpdateNodeInternals } from 'reactflow';
import {
  Settings, X, Check, Trash2, Copy,
  GitBranch, Users, AlertCircle, Zap, RefreshCw, Wrench,
  Code, Maximize2, Minimize2, MoreVertical
} from 'lucide-react';

interface WorkflowBlockData {
  type: string;
  name: string;
  description?: string;
  agent_role?: string;
  tools?: string[];
  transitions?: Record<string, string>;
  retry_count?: number;
  timeout?: number;
  isActive?: boolean;
  isError?: boolean;
  isCompleted?: boolean;
  enabled?: boolean;
  advancedMode?: boolean;
  isWide?: boolean;
  height?: number;
  isExecuting?: boolean;
  isDimmed?: boolean;
  currentAction?: string;
  currentActionDetail?: string;
  activeTools?: string[];
  status?: BlockStatus;
  isNextToExecute?: boolean;
  nextStepPreview?: string;
  wasExecuted?: boolean;
  executionOrder?: number;
  executionDuration?: number;
  executionDurationText?: string;
  executedTools?: string[];
  onUpdate?: (id: string, updates: any) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onToggleEnabled?: (id: string) => void;
  onToggleAdvanced?: (id: string) => void;
  onToggleWide?: (id: string) => void;
  onOpenSettings?: (id: string) => void;
  availableTools?: string[];
}

const normalizeToolArray = (value: any): string[] => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((tool) => (typeof tool === 'string' ? tool.trim() : String(tool)))
      .filter((tool) => tool.length > 0);
  }

  if (value instanceof Set) {
    return Array.from(value)
      .map((tool) => (typeof tool === 'string' ? tool.trim() : String(tool)))
      .filter((tool) => tool.length > 0);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((tool) => tool.trim())
      .filter((tool) => tool.length > 0);
  }

  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .filter((key) => {
        const entry = (value as Record<string, unknown>)[key];
        if (typeof entry === 'boolean') return entry;
        if (typeof entry === 'number') return entry !== 0;
        if (Array.isArray(entry)) return entry.length > 0;
        return Boolean(entry);
      })
      .map((key) => key.trim())
      .filter((key) => key.length > 0);
  }

  return [];
};

const toolsEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};

const BLOCK_CONFIG = {
  analysis: { color: '#3B82F6', icon: '🔍', label: 'Analysis', bgColor: 'rgba(59, 130, 246, 0.1)' },
  tool_call: { color: '#10B981', icon: Wrench, label: 'Tool Call', bgColor: 'rgba(16, 185, 129, 0.1)' },
  decision: { color: '#F59E0B', icon: GitBranch, label: 'Decision', bgColor: 'rgba(245, 158, 11, 0.1)' },
  validation: { color: '#8B5CF6', icon: Check, label: 'Validation', bgColor: 'rgba(139, 92, 246, 0.1)' },
  transformation: { color: '#EC4899', icon: RefreshCw, label: 'Transform', bgColor: 'rgba(236, 72, 153, 0.1)' },
  parallel: { color: '#84CC16', icon: Zap, label: 'Parallel', bgColor: 'rgba(132, 204, 22, 0.1)' },
  parallel_load: { color: '#22C55E', icon: Zap, label: 'Parallel Load', bgColor: 'rgba(34, 197, 94, 0.1)' },
  loop: { color: '#F97316', icon: RefreshCw, label: 'Loop', bgColor: 'rgba(249, 115, 22, 0.1)' },
  human: { color: '#6366F1', icon: Users, label: 'Human', bgColor: 'rgba(99, 102, 241, 0.1)' },
  final: { color: '#EF4444', icon: AlertCircle, label: 'Final', bgColor: 'rgba(239, 68, 68, 0.1)' },
  join: { color: '#0EA5E9', icon: GitBranch, label: 'Join', bgColor: 'rgba(14, 165, 233, 0.1)' }
};

export const ProfessionalWorkflowBlock = memo<NodeProps<WorkflowBlockData>>(({
  id,
  data,
  selected,
  dragging
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [localName, setLocalName] = useState(data.name);
  const [localDescription, setLocalDescription] = useState(data.description || '');
  const [localTools, setLocalTools] = useState<string[]>(normalizeToolArray(data.tools));
  const [showToolPicker, setShowToolPicker] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const blockRef = useRef<HTMLDivElement>(null);
  const updateNodeInternals = useUpdateNodeInternals();

  const config = BLOCK_CONFIG[data.type as keyof typeof BLOCK_CONFIG] || BLOCK_CONFIG.analysis;
  const NodeIcon = typeof config.icon === 'string' ? null : config.icon;
  const {
    onUpdate: updateBlock,
    height: blockHeight,
    isWide: blockIsWide,
    advancedMode: blockAdvancedMode
  } = data;

  // Calculate dynamic height based on content
  useEffect(() => {
    if (blockRef.current && updateBlock) {
      const measuredHeight = blockRef.current.offsetHeight;
      if (measuredHeight !== blockHeight) {
        updateBlock(id, { height: measuredHeight });
        updateNodeInternals(id);
      }
    }
  }, [
    blockHeight,
    blockIsWide,
    blockAdvancedMode,
    id,
    localDescription,
    localTools,
    updateBlock,
    updateNodeInternals
  ]);

  useEffect(() => {
    setLocalName(data.name);
  }, [data.name]);

  useEffect(() => {
    setLocalDescription(data.description || '');
  }, [data.description]);

  useEffect(() => {
    const normalized = normalizeToolArray(data.tools);
    setLocalTools((prev) => (toolsEqual(prev, normalized) ? prev : normalized));
  }, [data.tools]);

  // Auto-save on changes
  useEffect(() => {
    const timer = setTimeout(() => {
      const normalizedDataTools = normalizeToolArray(data.tools);
      if (
        updateBlock &&
        (
          localName !== data.name ||
          localDescription !== (data.description || '') ||
          !toolsEqual(localTools, normalizedDataTools)
        )
      ) {
        updateBlock(id, {
          name: localName,
          description: localDescription,
          tools: localTools
        });
      }
    }, 500); // Debounce updates
    return () => clearTimeout(timer);
  }, [localName, localDescription, localTools, id, data.name, data.description, data.tools, updateBlock]);

  const handleAddTool = (tool: string) => {
    const normalizedTool = tool.trim();
    if (normalizedTool.length === 0) {
      return;
    }
    if (!localTools.includes(normalizedTool)) {
      setLocalTools([...localTools, normalizedTool]);
    }
  };

  const handleRemoveTool = (tool: string) => {
    setLocalTools(localTools.filter(t => t !== tool));
  };

  // Determine current execution state
  const isRunning = data.status === 'running' || data.isExecuting;
  const isCompleted = data.status === 'completed';
  const isFailed = data.status === 'failed';

  return (
    <div
      ref={blockRef}
      className={`
        workflow-block relative bg-white dark:bg-gray-900 rounded-lg
        transition-all duration-300 cursor-pointer select-none
        ${selected ? 'ring-2 ring-blue-500 ring-offset-2 shadow-xl' : 'shadow-md hover:shadow-lg'}
        ${dragging ? 'opacity-50' : ''}
        ${isRunning ? 'animate-pulse ring-2 ring-yellow-400 ring-offset-2' : ''}
        ${isCompleted ? 'ring-2 ring-green-400 ring-offset-1' : ''}
        ${isFailed ? 'ring-2 ring-red-400 ring-offset-1' : ''}
        ${data.isDimmed ? 'opacity-40' : ''}
        ${!data.enabled ? 'opacity-60' : ''}
      `}
      style={{
        borderLeft: `6px solid ${isRunning ? '#FCD34D' : isCompleted ? '#10B981' : isFailed ? '#EF4444' : config.color}`,
        backgroundColor: isRunning ? 'rgba(254, 243, 199, 0.1)' :
                        data.wasExecuted ? 'rgba(16, 185, 129, 0.05)' :
                        isHovered ? config.bgColor : 'white',
        width: data.isWide ? '400px' : '320px',
        minHeight: '120px',
        transform: isRunning ? 'scale(1.02)' : 'scale(1)',
        boxShadow: isRunning ? '0 0 20px rgba(251, 191, 36, 0.4)' :
                  data.wasExecuted ? '0 0 10px rgba(16, 185, 129, 0.2)' : undefined
      }}
      onMouseEnter={() => !isRunning && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white !-top-1.5
                   hover:!w-4 hover:!h-4 hover:!-top-2 transition-all"
      />

      <Handle
        type="source"
        position={Position.Bottom}
        id="source"
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-white !-bottom-1.5
                   hover:!w-4 hover:!h-4 hover:!-bottom-2 transition-all"
      />

      {/* Decision/Validation side handles */}
      {(data.type === 'decision' || data.type === 'validation') && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="success"
            className="!w-3 !h-3 !bg-green-500 !border-2 !border-white !-right-1.5"
            style={{ top: '35%' }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="failure"
            className="!w-3 !h-3 !bg-red-500 !border-2 !border-white !-right-1.5"
            style={{ top: '65%' }}
          />
        </>
      )}

      {/* Execution Status Indicator */}
      {isRunning && data.currentActionDetail && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
          <div className="flex items-center gap-1 px-3 py-1 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full animate-bounce">
            <RefreshCw size={10} className="animate-spin" />
            {data.currentActionDetail}
          </div>
        </div>
      )}

      {/* Execution History Badge */}
      {data.wasExecuted && !isRunning && (
        <div className="absolute -top-2 -right-2 z-10">
          <div className="flex items-center gap-1 px-2 py-0.5 bg-green-500 text-white text-xs font-bold rounded-full">
            {data.executionOrder && <span>#{data.executionOrder}</span>}
            {data.executionDurationText && (
              <span className="text-green-100">({data.executionDurationText})</span>
            )}
          </div>
        </div>
      )}

      {/* Current Action Display */}
      {data.currentAction && (
        <div className="absolute -bottom-8 left-0 right-0 z-10">
          <div className="mx-auto px-3 py-1 bg-blue-500 text-white text-xs rounded-full shadow-lg max-w-xs text-center truncate font-medium">
            {data.currentAction}
          </div>
        </div>
      )}

      {/* Executed Tools Display */}
      {data.executedTools && data.executedTools.length > 0 && !isRunning && (
        <div className="absolute -bottom-6 left-0 right-0 z-10">
          <div className="mx-auto px-2 py-0.5 bg-gray-600 text-white text-xs rounded shadow text-center">
            🛠 {data.executedTools.join(', ')}
          </div>
        </div>
      )}

      {/* Next Step Preview */}
      {data.isNextToExecute && !isRunning && (
        <div className="absolute -top-8 left-0 right-0 z-10">
          <div className="mx-auto px-2 py-1 bg-indigo-500 text-white text-xs rounded shadow-lg max-w-xs text-center animate-pulse">
            ⏭️ Next: {data.nextStepPreview || 'Preparing...'}
          </div>
        </div>
      )}

      {/* Settings Button - Appears on Hover */}
      {isHovered && data.onOpenSettings && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onOpenSettings?.(id);
          }}
          className="absolute -top-2 -left-2 z-20 w-8 h-8 bg-blue-500 text-white rounded-full
                     flex items-center justify-center shadow-lg hover:bg-blue-600 transition-all
                     hover:scale-110 active:scale-95"
          title="Open Settings"
        >
          <Settings size={14} />
        </button>
      )}

      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 flex-1">
          {typeof config.icon === 'string' ? (
            <span className="text-lg">{config.icon}</span>
          ) : NodeIcon ? (
            <NodeIcon
              size={16}
              style={{ color: isRunning ? '#FCD34D' : config.color }}
              className={isRunning ? 'animate-spin' : ''}
            />
          ) : null}

          <input
            value={localName}
            onChange={(e) => !isRunning && setLocalName(e.target.value)}
            className="flex-1 px-2 py-1 text-sm font-medium bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none"
            placeholder="Block name..."
            disabled={isRunning}
          />
          {!data.enabled && (
            <span className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded">
              Disabled
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
              {data.advancedMode !== undefined && (
                <button
                  onClick={() => data.onToggleAdvanced?.(id)}
                  className={`p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors
                             ${data.advancedMode ? 'text-blue-500' : 'text-gray-400'}`}
                >
                  <Code size={14} />
                </button>
              )}

              <button
                onClick={() => data.onToggleWide?.(id)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              >
                {data.isWide ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>

              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                >
                  <MoreVertical size={14} />
                </button>

                {showMenu && (
                  <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-800
                                  rounded-lg shadow-lg border border-gray-200 dark:border-gray-700
                                  py-1 z-50">
                    <button
                      onClick={() => {
                        data.onToggleEnabled?.(id);
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100
                                 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <Settings size={12} />
                      {data.enabled ? 'Disable' : 'Enable'}
                    </button>

                    <button
                      onClick={() => {
                        data.onDuplicate?.(id);
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100
                                 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <Copy size={12} />
                      Duplicate
                    </button>

                    <div className="border-t border-gray-200 dark:border-gray-700 my-1" />

                    <button
                      onClick={() => {
                        data.onDelete?.(id);
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-1.5 text-left text-sm hover:bg-red-50
                                 dark:hover:bg-red-900/20 text-red-600 flex items-center gap-2"
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  </div>
                )}
              </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-3">
        {/* Type Badge & Agent Role */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="px-2 py-1 text-xs font-medium text-white rounded"
            style={{ backgroundColor: config.color }}
          >
            {config.label.toUpperCase()}
          </span>

          {data.agent_role && (
            <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 rounded flex items-center gap-1">
              <Users size={10} />
              {data.agent_role}
            </span>
          )}
        </div>

        {/* Description */}
        <div>
          <textarea
            value={localDescription}
            onChange={(e) => setLocalDescription(e.target.value)}
            placeholder="Add description or prompt..."
            className="w-full px-2 py-1 text-xs bg-transparent border border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none rounded resize-none"
            rows={2}
          />
        </div>

        {/* Tools Section */}
        {(data.type === 'tool_call' || (localTools.length > 0)) && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-500">Tools</span>
              <button
                onClick={() => setShowToolPicker(!showToolPicker)}
                className="text-xs text-blue-500 hover:text-blue-600"
              >
                {showToolPicker ? 'Hide' : 'Add'}
              </button>
            </div>

            <div className="flex flex-wrap gap-1">
              {localTools.map(tool => (
                <span
                  key={tool}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs
                           bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded"
                >
                  {tool}
                  <button
                    onClick={() => handleRemoveTool(tool)}
                    className="hover:text-red-500 ml-1"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>

            {showToolPicker && data.availableTools && (
              <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded border max-h-32 overflow-y-auto">
                <div className="grid grid-cols-2 gap-1">
                  {data.availableTools
                    .filter(tool => !localTools.includes(tool))
                    .map(tool => (
                      <button
                        key={tool}
                        onClick={() => handleAddTool(tool)}
                        className="px-2 py-1 text-xs text-left hover:bg-blue-100
                                 dark:hover:bg-blue-900/30 rounded transition-colors"
                      >
                        + {tool}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Advanced Mode Content */}
        {data.advancedMode && (
          <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-500">Timeout</span>
                <div className="font-medium">{data.timeout || 60}s</div>
              </div>
              <div>
                <span className="text-gray-500">Retries</span>
                <div className="font-medium">{data.retry_count || 0}</div>
              </div>
            </div>

            {data.transitions && Object.keys(data.transitions).length > 0 && (
              <div>
                <span className="text-xs text-gray-500">Transitions</span>
                <div className="mt-1 space-y-1">
                  {Object.entries(data.transitions).map(([event, target]) => (
                    <div key={event} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 dark:text-gray-400">{event}</span>
                      <span className="text-gray-800 dark:text-gray-200">→ {target || 'none'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status Indicators */}
      {data.isActive && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
      )}
      {data.isError && (
        <div className="absolute -top-1 -left-1 w-3 h-3 bg-red-500 rounded-full" />
      )}
      {data.isCompleted && (
        <div className="absolute -bottom-1 -right-1">
          <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
            <Check size={12} className="text-white" />
          </div>
        </div>
      )}
    </div>
  );
});

ProfessionalWorkflowBlock.displayName = 'ProfessionalWorkflowBlock';
