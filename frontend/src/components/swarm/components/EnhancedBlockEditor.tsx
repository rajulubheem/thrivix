import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Settings,
  Code,
  Zap,
  ChevronDown,
  ChevronUp,
  Trash2,
  Copy,
  Edit3,
  Check,
  X,
  Link,
  Unlink,
  GitBranch,
  Wrench,
  Users,
  AlertCircle,
  Info
} from 'lucide-react';
import { Handle, Position, type NodeProps } from 'reactflow';

interface EnhancedBlockData {
  type: string;
  name: string;
  description?: string;
  agent_role?: string;
  tools?: string[];
  transitions?: Record<string, string>;
  conditions?: any;
  retry_count?: number;
  timeout?: number;
  onUpdate?: (updates: any) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  isActive?: boolean;
  isError?: boolean;
  isWide?: boolean;
  availableTools?: string[];
  availableAgents?: string[];
}

const BLOCK_TYPES = {
  analysis: { color: '#3B82F6', icon: '🔍', label: 'Analysis' },
  tool_call: { color: '#10B981', icon: '🔧', label: 'Tool Call' },
  decision: { color: '#F59E0B', icon: '🎯', label: 'Decision' },
  validation: { color: '#8B5CF6', icon: '✓', label: 'Validation' },
  transformation: { color: '#EC4899', icon: '🔄', label: 'Transform' },
  aggregation: { color: '#06B6D4', icon: '📊', label: 'Aggregate' },
  parallel: { color: '#84CC16', icon: '⚡', label: 'Parallel' },
  loop: { color: '#F97316', icon: '🔁', label: 'Loop' },
  human: { color: '#6366F1', icon: '👤', label: 'Human Input' },
  final: { color: '#EF4444', icon: '🏁', label: 'Final' }
};

const TRANSITION_TYPES = ['success', 'failure', 'retry', 'timeout', 'validated', 'invalid', 'partial_success'];

export const EnhancedBlockEditor: React.FC<NodeProps<EnhancedBlockData>> = ({
  id,
  data,
  selected
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editedName, setEditedName] = useState(data.name);
  const [editedDescription, setEditedDescription] = useState(data.description || '');
  const [selectedTools, setSelectedTools] = useState<string[]>(data.tools || []);
  const [transitions, setTransitions] = useState(data.transitions || {});
  const [agentRole, setAgentRole] = useState(data.agent_role || '');
  const [showToolPicker, setShowToolPicker] = useState(false);
  const [showTransitions, setShowTransitions] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const blockType = BLOCK_TYPES[data.type as keyof typeof BLOCK_TYPES] || BLOCK_TYPES.analysis;

  // Auto-focus when editing starts
  useEffect(() => {
    if (isEditing && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = useCallback(() => {
    if (data.onUpdate) {
      data.onUpdate({
        name: editedName,
        description: editedDescription,
        tools: selectedTools,
        transitions,
        agent_role: agentRole
      });
    }
    setIsEditing(false);
  }, [editedName, editedDescription, selectedTools, transitions, agentRole, data]);

  const handleCancel = useCallback(() => {
    setEditedName(data.name);
    setEditedDescription(data.description || '');
    setSelectedTools(data.tools || []);
    setTransitions(data.transitions || {});
    setAgentRole(data.agent_role || '');
    setIsEditing(false);
  }, [data]);

  const toggleTool = useCallback((tool: string) => {
    setSelectedTools(prev =>
      prev.includes(tool)
        ? prev.filter(t => t !== tool)
        : [...prev, tool]
    );
  }, []);

  const addTransition = useCallback((event: string, target: string) => {
    setTransitions((prev: Record<string, string>) => ({ ...prev, [event]: target }));
  }, []);

  const removeTransition = useCallback((event: string) => {
    setTransitions((prev: Record<string, string>) => {
      const newTransitions = { ...prev };
      delete newTransitions[event];
      return newTransitions;
    });
  }, []);

  return (
    <div
      className={`
        relative bg-white dark:bg-gray-800 rounded-lg shadow-lg border-2
        transition-all duration-200
        ${selected ? 'border-blue-500 shadow-xl' : 'border-gray-200 dark:border-gray-700'}
        ${data.isActive ? 'ring-2 ring-blue-400 ring-opacity-50' : ''}
        ${data.isError ? 'border-red-500' : ''}
        ${data.isWide ? 'w-96' : 'w-80'}
        min-h-[120px]
      `}
    >
      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white"
        style={{ top: -6 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source"
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-white"
        style={{ bottom: -6 }}
      />
      {data.type === 'decision' && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
            style={{ right: -6, top: '30%' }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            className="!w-3 !h-3 !bg-red-500 !border-2 !border-white"
            style={{ right: -6, top: '70%' }}
          />
        </>
      )}

      {/* Header */}
      <div
        className={`
          px-3 py-2 rounded-t-lg flex items-center justify-between
          cursor-move
        `}
        style={{ backgroundColor: `${blockType.color}20` }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{blockType.icon}</span>
          {isEditing ? (
            <input
              ref={nameInputRef}
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              className="bg-transparent border-b border-gray-400 outline-none font-medium"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') handleCancel();
              }}
            />
          ) : (
            <span className="font-medium text-gray-800 dark:text-gray-200">
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
                title="Edit"
              >
                <Edit3 size={14} />
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                title="Expand"
              >
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSave}
                className="p-1 hover:bg-green-200 rounded"
                title="Save"
              >
                <Check size={14} className="text-green-600" />
              </button>
              <button
                onClick={handleCancel}
                className="p-1 hover:bg-red-200 rounded"
                title="Cancel"
              >
                <X size={14} className="text-red-600" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        {/* Type Badge */}
        <div className="flex items-center gap-2">
          <span
            className="px-2 py-1 rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: blockType.color }}
          >
            {blockType.label}
          </span>
          {data.agent_role && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Users size={12} />
              {data.agent_role}
            </span>
          )}
        </div>

        {/* Description */}
        {(data.description || isEditing) && (
          <div className="mt-2">
            {isEditing ? (
              <textarea
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                placeholder="Add description..."
                className="w-full p-2 border rounded text-sm resize-none"
                rows={2}
              />
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {data.description}
              </p>
            )}
          </div>
        )}

        {/* Tools Section */}
        {(data.type === 'tool_call' || selectedTools.length > 0) && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <Wrench size={12} />
                Tools
              </span>
              {isEditing && (
                <button
                  onClick={() => setShowToolPicker(!showToolPicker)}
                  className="text-xs text-blue-500 hover:underline"
                >
                  {showToolPicker ? 'Hide' : 'Select'}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {selectedTools.map(tool => (
                <span
                  key={tool}
                  className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs flex items-center gap-1"
                >
                  {tool}
                  {isEditing && (
                    <button
                      onClick={() => toggleTool(tool)}
                      className="hover:text-red-500"
                    >
                      <X size={10} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {showToolPicker && isEditing && data.availableTools && (
              <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded max-h-32 overflow-y-auto">
                <div className="grid grid-cols-2 gap-1">
                  {data.availableTools.map((tool: string) => (
                    <button
                      key={tool}
                      onClick={() => toggleTool(tool)}
                      className={`
                        px-2 py-1 text-xs rounded text-left hover:bg-gray-200 dark:hover:bg-gray-700
                        ${selectedTools.includes(tool) ? 'bg-blue-200 dark:bg-blue-800' : ''}
                      `}
                    >
                      {tool}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Expanded Content */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t space-y-3">
            {/* Agent Role */}
            {isEditing && (
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
                  <Users size={12} />
                  Agent Role
                </label>
                <input
                  value={agentRole}
                  onChange={(e) => setAgentRole(e.target.value)}
                  placeholder="e.g., Data Analyst, Validator..."
                  className="w-full mt-1 p-2 border rounded text-sm"
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
                {isEditing && (
                  <button
                    onClick={() => setShowTransitions(!showTransitions)}
                    className="text-xs text-blue-500 hover:underline"
                  >
                    {showTransitions ? 'Hide' : 'Configure'}
                  </button>
                )}
              </div>
              {Object.entries(transitions).map(([event, target]) => (
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
              {showTransitions && isEditing && (
                <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded">
                  <div className="grid grid-cols-2 gap-2">
                    {TRANSITION_TYPES.map(event => (
                      <button
                        key={event}
                        onClick={() => addTransition(event, 'next_state')}
                        disabled={!!transitions[event]}
                        className={`
                          px-2 py-1 text-xs rounded
                          ${transitions[event]
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-white hover:bg-blue-100 dark:bg-gray-800 dark:hover:bg-blue-900'}
                        `}
                      >
                        + {event}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Timeout: {data.timeout || 60}s</span>
              <span>Retries: {data.retry_count || 0}</span>
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions Bar */}
      {selected && !isEditing && (
        <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-1 bg-white dark:bg-gray-800 rounded-full shadow-lg px-2 py-1">
          <button
            onClick={data.onDuplicate}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            title="Duplicate"
          >
            <Copy size={12} />
          </button>
          <button
            onClick={data.onDelete}
            className="p-1 hover:bg-red-200 dark:hover:bg-red-700 rounded"
            title="Delete"
          >
            <Trash2 size={12} className="text-red-500" />
          </button>
        </div>
      )}

      {/* Status Indicators */}
      {data.isActive && (
        <div className="absolute -top-2 -right-2 w-4 h-4 bg-green-500 rounded-full animate-pulse" />
      )}
      {data.isError && (
        <div className="absolute -top-2 -right-2">
          <AlertCircle size={16} className="text-red-500" />
        </div>
      )}
    </div>
  );
};