import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import {
  Settings,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  Edit3,
  Trash2,
  Copy,
  Wrench,
  Users,
  GitBranch,
  AlertCircle,
  Zap,
  RefreshCw,
  Play
} from 'lucide-react';

interface EnhancedAgentNodeData {
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
  onUpdate?: (id: string, updates: any) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onExecute?: (id: string) => void;
}

const NODE_COLORS: Record<string, string> = {
  analysis: '#3B82F6',
  tool_call: '#10B981',
  decision: '#F59E0B',
  validation: '#8B5CF6',
  transformation: '#EC4899',
  aggregation: '#06B6D4',
  parallel: '#84CC16',
  loop: '#F97316',
  human: '#6366F1',
  final: '#EF4444',
  initial: '#22C55E',
  default: '#64748B'
};

const NODE_ICONS: Record<string, any> = {
  analysis: '🔍',
  tool_call: Wrench,
  decision: GitBranch,
  validation: Check,
  transformation: RefreshCw,
  parallel: Zap,
  loop: RefreshCw,
  human: Users,
  final: AlertCircle,
  initial: Play
};

export const EnhancedAgentNode = memo<NodeProps<EnhancedAgentNodeData>>(({ id, data, selected }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [localData, setLocalData] = useState({
    name: data.name || 'Unnamed State',
    description: data.description || '',
    agent_role: data.agent_role || '',
    tools: data.tools || [],
    transitions: data.transitions || {},
    retry_count: data.retry_count || 0,
    timeout: data.timeout || 60
  });

  const [editingTransition, setEditingTransition] = useState<string | null>(null);
  const [newTransitionEvent, setNewTransitionEvent] = useState('');
  const [newTransitionTarget, setNewTransitionTarget] = useState('');

  const nameInputRef = useRef<HTMLInputElement>(null);

  const nodeColor = NODE_COLORS[data.type] || NODE_COLORS.default;
  const NodeIcon = NODE_ICONS[data.type] || null;

  useEffect(() => {
    if (isEditing && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = useCallback(() => {
    if (data.onUpdate) {
      data.onUpdate(id, localData);
    }
    setIsEditing(false);
  }, [id, localData, data]);

  const handleCancel = useCallback(() => {
    setLocalData({
      name: data.name || 'Unnamed State',
      description: data.description || '',
      agent_role: data.agent_role || '',
      tools: data.tools || [],
      transitions: data.transitions || {},
      retry_count: data.retry_count || 0,
      timeout: data.timeout || 60
    });
    setIsEditing(false);
  }, [data]);

  const addTool = useCallback((tool: string) => {
    if (!localData.tools.includes(tool)) {
      setLocalData(prev => ({
        ...prev,
        tools: [...prev.tools, tool]
      }));
    }
  }, [localData.tools]);

  const removeTool = useCallback((tool: string) => {
    setLocalData(prev => ({
      ...prev,
      tools: prev.tools.filter(t => t !== tool)
    }));
  }, []);

  const addTransition = useCallback(() => {
    if (newTransitionEvent && newTransitionTarget) {
      setLocalData(prev => ({
        ...prev,
        transitions: {
          ...prev.transitions,
          [newTransitionEvent]: newTransitionTarget
        }
      }));
      setNewTransitionEvent('');
      setNewTransitionTarget('');
    }
  }, [newTransitionEvent, newTransitionTarget]);

  const removeTransition = useCallback((event: string) => {
    setLocalData(prev => {
      const newTransitions = { ...prev.transitions };
      delete newTransitions[event];
      return {
        ...prev,
        transitions: newTransitions
      };
    });
  }, []);

  const handleExecute = useCallback(() => {
    if (data.onExecute) {
      data.onExecute(id);
    }
  }, [id, data]);

  return (
    <div
      className={`
        bg-white dark:bg-gray-900 rounded-lg shadow-lg border-2
        transition-all duration-200 relative
        ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
        ${data.isActive ? 'animate-pulse' : ''}
        ${data.isError ? 'border-red-500' : ''}
      `}
      style={{
        borderColor: data.isError ? '#EF4444' : nodeColor,
        minWidth: '320px',
        backgroundColor: data.isCompleted ? `${nodeColor}10` : undefined
      }}
    >
      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !border-2 !border-white"
        style={{ background: '#9CA3AF', top: -6 }}
      />

      {/* Main source handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="source"
        className="!w-3 !h-3 !border-2 !border-white"
        style={{ background: '#10B981', bottom: -6 }}
      />

      {/* Decision handles */}
      {data.type === 'decision' && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="success"
            className="!w-3 !h-3 !border-2 !border-white"
            style={{ background: '#10B981', right: -6, top: '35%' }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="failure"
            className="!w-3 !h-3 !border-2 !border-white"
            style={{ background: '#EF4444', right: -6, top: '65%' }}
          />
        </>
      )}

      {/* Validation handles */}
      {data.type === 'validation' && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="validated"
            className="!w-3 !h-3 !border-2 !border-white"
            style={{ background: '#10B981', right: -6, top: '35%' }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="invalid"
            className="!w-3 !h-3 !border-2 !border-white"
            style={{ background: '#F59E0B', right: -6, top: '65%' }}
          />
        </>
      )}

      {/* Header */}
      <div
        className="px-3 py-2 rounded-t-lg flex items-center justify-between cursor-move"
        style={{ backgroundColor: `${nodeColor}15` }}
      >
        <div className="flex items-center gap-2 flex-1">
          <div className="flex items-center justify-center w-6 h-6">
            {typeof NodeIcon === 'string' ? (
              <span className="text-lg">{NodeIcon}</span>
            ) : NodeIcon ? (
              <NodeIcon size={16} style={{ color: nodeColor }} />
            ) : null}
          </div>

          {isEditing ? (
            <input
              ref={nameInputRef}
              value={localData.name}
              onChange={(e) => setLocalData(prev => ({ ...prev, name: e.target.value }))}
              className="bg-white dark:bg-gray-800 px-2 py-1 rounded border text-sm font-medium flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') handleCancel();
              }}
            />
          ) : (
            <span className="font-medium text-sm truncate flex-1" title={data.name}>
              {data.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {!isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              >
                <Edit3 size={14} />
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              >
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSave}
                className="p-1 hover:bg-green-100 dark:hover:bg-green-900 rounded"
              >
                <Check size={14} className="text-green-600" />
              </button>
              <button
                onClick={handleCancel}
                className="p-1 hover:bg-red-100 dark:hover:bg-red-900 rounded"
              >
                <X size={14} className="text-red-600" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2">
        {/* Type and Role */}
        <div className="flex items-center gap-2">
          <span
            className="px-2 py-1 rounded text-xs font-medium text-white"
            style={{ backgroundColor: nodeColor }}
          >
            {data.type.toUpperCase()}
          </span>

          {data.agent_role && (
            <span className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <Users size={12} />
              {data.agent_role}
            </span>
          )}
        </div>

        {/* Description */}
        {(data.description || isEditing) && (
          <div>
            {isEditing ? (
              <textarea
                value={localData.description}
                onChange={(e) => setLocalData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Add description or prompt..."
                className="w-full px-2 py-1 text-xs border rounded resize-none"
                rows={3}
              />
            ) : (
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {data.description}
              </p>
            )}
          </div>
        )}

        {/* Tools */}
        {(data.tools && data.tools.length > 0) || isEditing ? (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <Wrench size={12} />
                Tools ({localData.tools.length})
              </span>
              {isEditing && (
                <input
                  type="text"
                  placeholder="Add tool..."
                  className="text-xs px-2 py-0.5 border rounded"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value) {
                      addTool(e.currentTarget.value);
                      e.currentTarget.value = '';
                    }
                  }}
                />
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {localData.tools.map(tool => (
                <span
                  key={tool}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs"
                >
                  {tool}
                  {isEditing && (
                    <button
                      onClick={() => removeTool(tool)}
                      className="hover:text-red-500"
                    >
                      <X size={10} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* Expanded content */}
        {isExpanded && (
          <div className="pt-2 mt-2 border-t space-y-2">
            {/* Agent Role */}
            {isEditing && (
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Agent Role
                </label>
                <input
                  value={localData.agent_role}
                  onChange={(e) => setLocalData(prev => ({ ...prev, agent_role: e.target.value }))}
                  placeholder="e.g., Analyst, Validator..."
                  className="w-full mt-1 px-2 py-1 text-xs border rounded"
                />
              </div>
            )}

            {/* Transitions */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
                  <GitBranch size={12} />
                  Transitions
                </span>
              </div>
              {Object.entries(localData.transitions).map(([event, target]) => (
                <div key={event} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-gray-400">{event}</span>
                  <span className="text-gray-800 dark:text-gray-200">→ {target}</span>
                  {isEditing && (
                    <button
                      onClick={() => removeTransition(event)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}

              {isEditing && (
                <div className="flex gap-1 mt-1">
                  <input
                    value={newTransitionEvent}
                    onChange={(e) => setNewTransitionEvent(e.target.value)}
                    placeholder="Event"
                    className="flex-1 px-1 py-0.5 text-xs border rounded"
                  />
                  <input
                    value={newTransitionTarget}
                    onChange={(e) => setNewTransitionTarget(e.target.value)}
                    placeholder="Target"
                    className="flex-1 px-1 py-0.5 text-xs border rounded"
                  />
                  <button
                    onClick={addTransition}
                    className="px-2 py-0.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Add
                  </button>
                </div>
              )}
            </div>

            {/* Settings */}
            {isEditing && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Timeout (s)
                  </label>
                  <input
                    type="number"
                    value={localData.timeout}
                    onChange={(e) => setLocalData(prev => ({ ...prev, timeout: parseInt(e.target.value) || 60 }))}
                    className="w-full mt-1 px-2 py-1 text-xs border rounded"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Retries
                  </label>
                  <input
                    type="number"
                    value={localData.retry_count}
                    onChange={(e) => setLocalData(prev => ({ ...prev, retry_count: parseInt(e.target.value) || 0 }))}
                    className="w-full mt-1 px-2 py-1 text-xs border rounded"
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              {data.onExecute && (
                <button
                  onClick={handleExecute}
                  className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 flex items-center gap-1"
                >
                  <Play size={12} />
                  Execute
                </button>
              )}
              {data.onDuplicate && (
                <button
                  onClick={() => data.onDuplicate!(id)}
                  className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 flex items-center gap-1"
                >
                  <Copy size={12} />
                  Duplicate
                </button>
              )}
              {data.onDelete && (
                <button
                  onClick={() => data.onDelete!(id)}
                  className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 flex items-center gap-1"
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status Indicators */}
      {data.isActive && (
        <div className="absolute -top-2 -right-2 w-4 h-4 bg-green-500 rounded-full animate-pulse" />
      )}
      {data.isError && (
        <div className="absolute -top-2 -right-2">
          <AlertCircle size={16} className="text-red-500" />
        </div>
      )}
      {data.isCompleted && (
        <div className="absolute -top-2 -left-2 w-4 h-4 bg-blue-500 rounded-full">
          <Check size={12} className="text-white" />
        </div>
      )}
    </div>
  );
});

EnhancedAgentNode.displayName = 'EnhancedAgentNode';