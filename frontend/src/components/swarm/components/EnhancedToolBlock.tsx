import React, { useState, useRef, useEffect, memo } from 'react';
import { BlockStatus } from '../../../types/workflow';
import { Handle, Position, type NodeProps, useUpdateNodeInternals } from 'reactflow';
import {
  Settings, ChevronDown, ChevronUp, X, Check, Edit3, Trash2, Copy,
  GitBranch, Users, AlertCircle, Zap, RefreshCw, Play, Wrench,
  Code, BookOpen, Info, Maximize2, Minimize2, MoreVertical,
  Upload, Link, FileText, Database, Terminal, Globe, Calculator,
  Clock, Shield, Folder, Hash, Type, ToggleLeft, ToggleRight,
  Save, ChevronRight, ExternalLink, FolderOpen
} from 'lucide-react';

interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'file';
  description?: string;
  required?: boolean;
  default?: any;
  enum?: string[];
  placeholder?: string;
  value?: any;
}

interface ToolSchema {
  name: string;
  description: string;
  parameters: ToolParameter[];
  examples?: any[];
  icon?: string;
  color?: string;
  category?: string;
}

interface EnhancedToolBlockData {
  type: string;
  name: string;
  description?: string;
  toolName?: string;
  toolSchema?: ToolSchema;
  parameters?: Record<string, any>;
  isActive?: boolean;
  isError?: boolean;
  isCompleted?: boolean;
  enabled?: boolean;
  advancedMode?: boolean;
  isWide?: boolean;
  height?: number;
  isExecuting?: boolean;
  isDimmed?: boolean;
  status?: BlockStatus;
  executionResult?: any;
  executionError?: string;
  onUpdate?: (id: string, updates: any) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onToggleEnabled?: (id: string) => void;
  onToggleAdvanced?: (id: string) => void;
  onToggleWide?: (id: string) => void;
  onExecuteTool?: (id: string, toolName: string, parameters: any) => Promise<any>;
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

// Tool category colors
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

// Get tool examples from backend definitions
const TOOL_EXAMPLES: Record<string, any[]> = {
  'python_repl': [
    { code: "import pandas as pd\ndf = pd.read_csv('data.csv')\nprint(df.head())" },
    { code: "2 + 2" },
  ],
  'file_read': [
    { path: "config.json" },
    { path: "./src/main.py" },
  ],
  'file_write': [
    { path: "output.txt", content: "Hello, world!" },
  ],
  'http_request': [
    { method: "GET", url: "https://api.example.com/data" },
    { method: "POST", url: "https://api.example.com/resource", headers: {"Content-Type": "application/json"}, body: '{"key": "value"}' },
  ],
  'shell': [
    { command: "ls -la" },
    { command: "pwd" },
  ],
  'calculator': [
    { expression: "2 * sin(pi/4) + log(e**2)" },
    { expression: "sqrt(144) + 5**2" },
  ],
  'current_time': [
    { timezone: "US/Pacific" },
    { timezone: "Europe/London" },
  ],
  'tavily_search': [
    { query: "What is artificial intelligence?", search_depth: "advanced" },
    { query: "Latest AI developments", topic: "news", max_results: 10 },
  ],
};

// Parameter input component
const ParameterInput: React.FC<{
  parameter: ToolParameter;
  value: any;
  onChange: (name: string, value: any) => void;
  isDark?: boolean;
}> = ({ parameter, value, onChange, isDark }) => {
  const handleChange = (newValue: any) => {
    onChange(parameter.name, newValue);
  };

  switch (parameter.type) {
    case 'boolean':
      return (
        <button
          onClick={() => handleChange(!value)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded transition-colors
                     ${value ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          {value ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          <span className="text-sm">{value ? 'True' : 'False'}</span>
        </button>
      );

    case 'number':
      return (
        <input
          type="number"
          value={value || ''}
          onChange={(e) => handleChange(parseFloat(e.target.value) || 0)}
          placeholder={parameter.placeholder || parameter.description}
          className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2
                     ${isDark ? 'bg-gray-800 border-gray-700 text-gray-200 focus:ring-blue-500'
                              : 'bg-white border-gray-300 text-gray-800 focus:ring-blue-400'}`}
        />
      );

    case 'file':
      return (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={value || ''}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Enter file path or URL"
            className={`flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2
                       ${isDark ? 'bg-gray-800 border-gray-700 text-gray-200 focus:ring-blue-500'
                                : 'bg-white border-gray-300 text-gray-800 focus:ring-blue-400'}`}
          />
          <button
            className={`p-1.5 rounded hover:bg-opacity-80 transition-colors
                       ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`}
            title="Browse files"
          >
            <FolderOpen size={14} />
          </button>
        </div>
      );

    case 'object':
    case 'array':
      return (
        <textarea
          value={typeof value === 'string' ? value : JSON.stringify(value || {}, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              handleChange(parsed);
            } catch {
              handleChange(e.target.value);
            }
          }}
          placeholder={parameter.placeholder || `Enter JSON ${parameter.type}`}
          rows={3}
          className={`w-full px-2 py-1 text-sm font-mono border rounded resize-none focus:outline-none focus:ring-2
                     ${isDark ? 'bg-gray-800 border-gray-700 text-gray-200 focus:ring-blue-500'
                              : 'bg-white border-gray-300 text-gray-800 focus:ring-blue-400'}`}
        />
      );

    default: // string
      if (parameter.enum && parameter.enum.length > 0) {
        return (
          <select
            value={value || ''}
            onChange={(e) => handleChange(e.target.value)}
            className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2
                       ${isDark ? 'bg-gray-800 border-gray-700 text-gray-200 focus:ring-blue-500'
                                : 'bg-white border-gray-300 text-gray-800 focus:ring-blue-400'}`}
          >
            <option value="">Select {parameter.name}...</option>
            {parameter.enum.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        );
      }

      if (parameter.name.includes('code') || parameter.name.includes('command') || parameter.name.includes('expression')) {
        return (
          <textarea
            value={value || ''}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={parameter.placeholder || parameter.description}
            rows={4}
            className={`w-full px-2 py-1 text-sm font-mono border rounded resize-none focus:outline-none focus:ring-2
                       ${isDark ? 'bg-gray-800 border-gray-700 text-gray-200 focus:ring-blue-500'
                                : 'bg-white border-gray-300 text-gray-800 focus:ring-blue-400'}`}
          />
        );
      }

      return (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={parameter.placeholder || parameter.description}
          className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2
                     ${isDark ? 'bg-gray-800 border-gray-700 text-gray-200 focus:ring-blue-500'
                              : 'bg-white border-gray-300 text-gray-800 focus:ring-blue-400'}`}
        />
      );
  }
};

export const EnhancedToolBlock = memo<NodeProps<EnhancedToolBlockData>>(({
  id,
  data,
  selected,
  dragging
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [localParameters, setLocalParameters] = useState<Record<string, any>>(data.parameters || {});
  const [showMenu, setShowMenu] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [expandedParams, setExpandedParams] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(data.executionResult);
  const [executionError, setExecutionError] = useState<string | undefined>(data.executionError);

  const blockRef = useRef<HTMLDivElement>(null);
  const updateNodeInternals = useUpdateNodeInternals();

  const toolIcon = data.toolName ? TOOL_ICONS[data.toolName] : Wrench;
  const ToolIcon = toolIcon;
  const toolColor = data.toolSchema?.color || CATEGORY_COLORS[data.toolSchema?.category || 'utility'] || '#6B7280';

  // Calculate dynamic height based on content
  useEffect(() => {
    if (blockRef.current && data.onUpdate) {
      const height = blockRef.current.offsetHeight;
      if (height !== data.height) {
        data.onUpdate(id, { height });
        updateNodeInternals(id);
      }
    }
  }, [localParameters, expandedParams, data.isWide, data.advancedMode]);

  // Auto-save parameters
  useEffect(() => {
    const timer = setTimeout(() => {
      if (data.onUpdate && JSON.stringify(localParameters) !== JSON.stringify(data.parameters)) {
        data.onUpdate(id, { parameters: localParameters });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [localParameters, id, data]);

  const handleParameterChange = (name: string, value: any) => {
    setLocalParameters(prev => ({ ...prev, [name]: value }));
  };

  const handleLoadExample = (example: any) => {
    setLocalParameters(example);
    setShowExamples(false);
  };

  const handleExecute = async () => {
    if (data.onExecuteTool && data.toolName) {
      setExecutionResult(null);
      setExecutionError(undefined);
      setShowResults(true);

      try {
        const result = await data.onExecuteTool(id, data.toolName, localParameters);
        if (result) {
          setExecutionResult(result);
        }
      } catch (error: any) {
        setExecutionError(error.message || 'Execution failed');
      }
    }
  };

  // Update results when data changes
  useEffect(() => {
    if (data.executionResult !== undefined) {
      setExecutionResult(data.executionResult);
      setShowResults(true);
    }
    if (data.executionError !== undefined) {
      setExecutionError(data.executionError);
      setShowResults(true);
    }
  }, [data.executionResult, data.executionError]);

  // Determine execution state
  const isRunning = data.status === 'running' || data.isExecuting;
  const isCompleted = data.status === 'completed';
  const isFailed = data.status === 'failed';

  const examples = data.toolName ? TOOL_EXAMPLES[data.toolName] : [];

  return (
    <div
      ref={blockRef}
      className={`
        enhanced-tool-block relative bg-white dark:bg-gray-900 rounded-lg
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
        borderLeft: `6px solid ${isRunning ? '#FCD34D' : isCompleted ? '#10B981' : isFailed ? '#EF4444' : toolColor}`,
        backgroundColor: isRunning ? 'rgba(254, 243, 199, 0.1)' : 'white',
        width: data.isWide ? '500px' : '380px',
        minHeight: '160px',
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

      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 flex-1">
          {ToolIcon && (
            <ToolIcon
              size={18}
              style={{ color: isRunning ? '#FCD34D' : toolColor }}
              className={isRunning ? 'animate-spin' : ''}
            />
          )}
          <div className="flex-1">
            <div className="font-medium text-sm">{data.name || data.toolName || 'Tool Block'}</div>
            {data.toolSchema?.description && (
              <div className="text-xs text-gray-500 truncate">{data.toolSchema.description}</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {examples.length > 0 && (
            <button
              onClick={() => setShowExamples(!showExamples)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              title="Load example"
            >
              <BookOpen size={14} />
            </button>
          )}

          <button
            onClick={() => setExpandedParams(!expandedParams)}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          >
            {expandedParams ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

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

      {/* Examples Dropdown */}
      {showExamples && examples.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 mx-3 bg-white dark:bg-gray-800
                        rounded-lg shadow-lg border border-gray-200 dark:border-gray-700
                        p-2 z-50 max-h-60 overflow-y-auto">
          <div className="text-xs font-medium text-gray-500 mb-2">Examples:</div>
          {examples.map((example, idx) => (
            <button
              key={idx}
              onClick={() => handleLoadExample(example)}
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-100
                         dark:hover:bg-gray-700 rounded mb-1 font-mono"
            >
              {JSON.stringify(example, null, 2).substring(0, 100)}...
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="p-3">
        {/* Tool Badge */}
        {data.toolName && (
          <div className="flex items-center gap-2 mb-3">
            <span
              className="px-2 py-1 text-xs font-medium text-white rounded"
              style={{ backgroundColor: toolColor }}
            >
              {data.toolName.toUpperCase().replace(/_/g, ' ')}
            </span>
            {data.toolSchema?.category && (
              <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 rounded">
                {data.toolSchema.category}
              </span>
            )}
          </div>
        )}

        {/* Parameters Section */}
        {expandedParams && data.toolSchema?.parameters && (
          <div className="space-y-3">
            {data.toolSchema.parameters.map(param => (
              <div key={param.name} className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {param.name}
                    {param.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {param.type && (
                    <span className="text-xs text-gray-400">
                      {param.type}
                    </span>
                  )}
                </div>
                <ParameterInput
                  parameter={param}
                  value={localParameters[param.name]}
                  onChange={handleParameterChange}
                  isDark={false}
                />
                {param.description && (
                  <div className="text-xs text-gray-500">{param.description}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Execute Button */}
        {data.onExecuteTool && (
          <button
            onClick={handleExecute}
            disabled={isRunning || !data.enabled}
            className={`mt-3 w-full px-3 py-1.5 rounded font-medium text-sm transition-colors
                       flex items-center justify-center gap-2
                       ${isRunning ? 'bg-yellow-400 text-yellow-900 cursor-not-allowed' :
                         data.enabled ? 'bg-green-500 hover:bg-green-600 text-white' :
                         'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
          >
            {isRunning ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Executing...
              </>
            ) : (
              <>
                <Play size={14} />
                Execute Tool
              </>
            )}
          </button>
        )}

        {/* Results Section */}
        {showResults && (executionResult || executionError) && (
          <div className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                Execution Results
              </span>
              <button
                onClick={() => setShowResults(false)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Hide
              </button>
            </div>

            {executionError ? (
              <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                <div className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">
                  Error:
                </div>
                <pre className="text-xs text-red-600 dark:text-red-300 whitespace-pre-wrap font-mono overflow-x-auto">
                  {executionError}
                </pre>
              </div>
            ) : executionResult ? (
              <div className="p-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">
                {formatExecutionResult(executionResult, data.toolName)}
              </div>
            ) : null}
          </div>
        )}

        {/* Quick Status Messages */}
        {data.isError && !showResults && (
          <div className="mt-2 px-2 py-1 text-xs bg-red-50 text-red-700 rounded cursor-pointer"
               onClick={() => setShowResults(true)}>
            Error occurred - click to see details
          </div>
        )}
        {isCompleted && !showResults && executionResult && (
          <div className="mt-2 px-2 py-1 text-xs bg-green-50 text-green-700 rounded cursor-pointer"
               onClick={() => setShowResults(true)}>
            Execution completed - click to see results
          </div>
        )}
      </div>

      {/* Status Indicators */}
      {data.isActive && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
      )}
    </div>
  );
});

// Helper function to format execution results based on tool type
function formatExecutionResult(result: any, toolName?: string): React.ReactNode {
  // Handle different result formats
  if (typeof result === 'string') {
    return (
      <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono overflow-x-auto">
        {result}
      </pre>
    );
  }

  // For python_repl, shell, etc. with stdout/stderr
  if (result.stdout !== undefined || result.stderr !== undefined) {
    return (
      <div className="space-y-2">
        {result.stdout && (
          <div>
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Output:
            </div>
            <pre className="text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 p-2 rounded font-mono overflow-x-auto">
              {result.stdout}
            </pre>
          </div>
        )}
        {result.stderr && (
          <div>
            <div className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">
              Errors/Warnings:
            </div>
            <pre className="text-xs text-orange-600 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/20 p-2 rounded font-mono overflow-x-auto">
              {result.stderr}
            </pre>
          </div>
        )}
        {result.returncode !== undefined && (
          <div className="text-xs text-gray-500">
            Exit code: {result.returncode}
          </div>
        )}
      </div>
    );
  }

  // For file operations
  if (result.content !== undefined || result.path !== undefined) {
    return (
      <div className="space-y-2">
        {result.path && (
          <div className="text-xs text-gray-600 dark:text-gray-400">
            <span className="font-medium">Path:</span> {result.path}
          </div>
        )}
        {result.content && (
          <div>
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Content:
            </div>
            <pre className="text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 p-2 rounded font-mono overflow-x-auto max-h-32">
              {result.content.substring(0, 500)}
              {result.content.length > 500 && '\n...(truncated)'}
            </pre>
          </div>
        )}
        {result.bytes_written !== undefined && (
          <div className="text-xs text-green-600 dark:text-green-400">
            ✓ Wrote {result.bytes_written} bytes
          </div>
        )}
      </div>
    );
  }

  // For calculator results
  if (result.expression !== undefined && result.result !== undefined) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-gray-600 dark:text-gray-400">
          <span className="font-medium">Expression:</span> {result.expression}
        </div>
        <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
          <span className="text-gray-600 dark:text-gray-400">Result:</span> {result.result}
        </div>
      </div>
    );
  }

  // For time results
  if (result.time !== undefined || result.formatted !== undefined) {
    return (
      <div className="space-y-1">
        {result.timezone && (
          <div className="text-xs text-gray-600 dark:text-gray-400">
            <span className="font-medium">Timezone:</span> {result.timezone}
          </div>
        )}
        {result.formatted && (
          <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {result.formatted}
          </div>
        )}
        {result.time && (
          <div className="text-xs text-gray-500 font-mono">
            {result.time}
          </div>
        )}
      </div>
    );
  }

  // For HTTP responses
  if (result.status_code !== undefined) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-gray-600 dark:text-gray-400">
          <span className="font-medium">Status:</span>
          <span className={result.status_code < 400 ? 'text-green-600' : 'text-red-600'}>
            {result.status_code}
          </span>
        </div>
        {result.url && (
          <div className="text-xs text-gray-600 dark:text-gray-400">
            <span className="font-medium">URL:</span> {result.url}
          </div>
        )}
        {result.body && (
          <div>
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Response:
            </div>
            <pre className="text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 p-2 rounded font-mono overflow-x-auto max-h-32">
              {result.body}
            </pre>
          </div>
        )}
      </div>
    );
  }

  // For error results
  if (result.error) {
    return (
      <div className="text-xs text-red-600 dark:text-red-400">
        {result.error}
      </div>
    );
  }

  // Default: show as JSON
  return (
    <pre className="text-xs text-gray-700 dark:text-gray-300 font-mono overflow-x-auto">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

EnhancedToolBlock.displayName = 'EnhancedToolBlock';
