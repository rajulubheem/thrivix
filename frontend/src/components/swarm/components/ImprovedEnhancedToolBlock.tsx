import React, { useState, useRef, useEffect, memo } from 'react';
import { Handle, Position, type NodeProps, useUpdateNodeInternals } from 'reactflow';
import {
  Settings, ChevronDown, ChevronUp, X, Check, Edit3, Trash2, Copy,
  GitBranch, Users, AlertCircle, Zap, RefreshCw, Play, Wrench,
  Code, BookOpen, Info, Maximize2, Minimize2, MoreVertical,
  Upload, Link, FileText, Database, Terminal, Globe, Calculator,
  Clock, Shield, Folder, Hash, Type, ToggleLeft, ToggleRight,
  Save, ChevronRight, ExternalLink, FolderOpen, Download, Eye,
  FileUp, MousePointer, Clipboard
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

interface ImprovedEnhancedToolBlockData {
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
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'needs_input';
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

// Improved Parameter Input Component with file upload
const ImprovedParameterInput: React.FC<{
  parameter: ToolParameter;
  value: any;
  onChange: (name: string, value: any) => void;
  isDark?: boolean;
  toolName?: string;
}> = ({ parameter, value, onChange, isDark, toolName }) => {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (newValue: any) => {
    onChange(parameter.name, newValue);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:8000/api/v1/tools/files/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        handleChange(data.path);
        console.log('File uploaded:', data);
      } else {
        console.error('Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  // Special handling for file_read tool's path parameter
  if (toolName === 'file_read' && parameter.name === 'path') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={value || ''}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Enter file path or upload a file"
            className="flex-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2
                     bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700
                     text-gray-800 dark:text-gray-200 focus:ring-blue-500
                     select-text"
            style={{ userSelect: 'text' }}
          />
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600
                     disabled:bg-gray-400 transition-colors flex items-center gap-1
                     text-sm font-medium"
          >
            {uploading ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload size={14} />
                Upload
              </>
            )}
          </button>
        </div>
        {value && (
          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <FileText size={12} />
            {value}
          </div>
        )}
      </div>
    );
  }

  // Special handling for URL parameters
  if (parameter.name === 'url' || parameter.name.includes('url')) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={value || ''}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={parameter.placeholder || "https://example.com"}
            className="flex-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2
                     bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700
                     text-gray-800 dark:text-gray-200 focus:ring-blue-500
                     select-text"
            style={{ userSelect: 'text' }}
          />
          {value && (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            >
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      </div>
    );
  }

  switch (parameter.type) {
    case 'boolean':
      return (
        <button
          onClick={() => handleChange(!value)}
          className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors
                     ${value ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
        >
          {value ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          <span className="text-sm font-medium">{value ? 'True' : 'False'}</span>
        </button>
      );

    case 'number':
      return (
        <input
          type="number"
          value={value || ''}
          onChange={(e) => handleChange(parseFloat(e.target.value) || 0)}
          placeholder={parameter.placeholder || parameter.description}
          className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2
                   bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700
                   text-gray-800 dark:text-gray-200 focus:ring-blue-500
                   select-text"
          style={{ userSelect: 'text' }}
        />
      );

    case 'object':
    case 'array':
      return (
        <div className="space-y-1">
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
            rows={4}
            className="w-full px-3 py-2 text-sm font-mono border rounded-md resize-none
                     focus:outline-none focus:ring-2 bg-white dark:bg-gray-800
                     border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200
                     focus:ring-blue-500 select-text"
            style={{ userSelect: 'text' }}
          />
          <div className="text-xs text-gray-500">JSON format required</div>
        </div>
      );

    default: // string
      if (parameter.enum && parameter.enum.length > 0) {
        return (
          <select
            value={value || ''}
            onChange={(e) => handleChange(e.target.value)}
            className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2
                     bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700
                     text-gray-800 dark:text-gray-200 focus:ring-blue-500"
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
          <div className="space-y-1">
            <textarea
              value={value || ''}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={parameter.placeholder || parameter.description}
              rows={5}
              className="w-full px-3 py-2 text-sm font-mono border rounded-md resize-vertical
                       focus:outline-none focus:ring-2 bg-white dark:bg-gray-800
                       border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200
                       focus:ring-blue-500 select-text"
              style={{ userSelect: 'text', minHeight: '100px' }}
            />
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{parameter.description}</span>
              <button
                onClick={() => navigator.clipboard.writeText(value || '')}
                className="flex items-center gap-1 px-2 py-1 hover:bg-gray-100
                         dark:hover:bg-gray-700 rounded transition-colors"
              >
                <Clipboard size={12} />
                Copy
              </button>
            </div>
          </div>
        );
      }

      return (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={parameter.placeholder || parameter.description}
          className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2
                   bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700
                   text-gray-800 dark:text-gray-200 focus:ring-blue-500
                   select-text"
          style={{ userSelect: 'text' }}
        />
      );
  }
};

// Result Display Component with better formatting
const ResultDisplay: React.FC<{
  result: any;
  error?: string;
  toolName?: string;
  onClose: () => void;
}> = ({ result, error, toolName, onClose }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = error || (typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <Eye size={14} />
          Execution Results
        </h4>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="px-2 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-700
                     rounded transition-colors flex items-center gap-1"
          >
            {copied ? <Check size={12} /> : <Clipboard size={12} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="max-h-96 overflow-auto rounded-lg bg-gray-50 dark:bg-gray-900 p-3">
        {error ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle size={16} />
              <span className="font-medium">Execution Error</span>
            </div>
            <pre className="text-xs text-red-600 dark:text-red-300 whitespace-pre-wrap
                         font-mono select-text" style={{ userSelect: 'text' }}>
              {error}
            </pre>
          </div>
        ) : (
          <div className="space-y-2">
            {formatResultContent(result, toolName)}
          </div>
        )}
      </div>
    </div>
  );
};

// Enhanced result formatting with file type handling
function formatResultContent(result: any, toolName?: string): React.ReactNode {
  // Handle different file types from file_read
  if (result.type) {
    switch (result.type) {
      case 'image':
        return (
          <div className="space-y-2">
            {result.message && (
              <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                ✓ {result.message}
              </div>
            )}
            <div className="text-xs text-gray-600 dark:text-gray-400">
              Path: {result.path}
            </div>
            <div className="text-xs text-gray-500">
              Size: {(result.size / 1024).toFixed(2)}KB
            </div>
            {result.data && (
              <div className="mt-2 p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                <img
                  src={result.data}
                  alt="Uploaded file"
                  className="max-w-full h-auto rounded shadow-sm"
                  style={{ maxHeight: '400px', objectFit: 'contain' }}
                />
              </div>
            )}
          </div>
        );

      case 'pdf':
        return (
          <div className="space-y-2">
            {result.message && (
              <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                📄 {result.message}
              </div>
            )}
            {result.error && (
              <div className="text-xs text-orange-600 dark:text-orange-400">
                ⚠️ {result.error}
              </div>
            )}
            <div className="text-xs text-gray-600 dark:text-gray-400">
              <div>Path: {result.path}</div>
              <div>Size: {(result.size / 1024).toFixed(2)}KB</div>
              {result.num_pages && <div>Pages: {result.num_pages}</div>}
            </div>
            {result.content && (
              <div className="mt-2">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Extracted Text:
                </div>
                <pre className="text-xs bg-white dark:bg-gray-800 p-3 rounded border
                             border-gray-200 dark:border-gray-700 font-mono select-text
                             overflow-auto max-h-64" style={{ userSelect: 'text' }}>
                  {result.content}
                </pre>
              </div>
            )}
          </div>
        );

      case 'spreadsheet':
        return (
          <div className="space-y-2">
            {result.message && (
              <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                📊 {result.message}
              </div>
            )}
            <div className="text-xs text-gray-600 dark:text-gray-400">
              <div>Format: {result.format?.toUpperCase()}</div>
              {result.shape && <div>Shape: {result.shape[0]} rows × {result.shape[1]} columns</div>}
            </div>
            {result.columns && (
              <div className="text-xs">
                <span className="font-medium">Columns: </span>
                <span className="text-gray-600">{result.columns.join(', ')}</span>
              </div>
            )}
            {result.content && (
              <div className="mt-2">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Preview:
                </div>
                <pre className="text-xs bg-white dark:bg-gray-800 p-3 rounded border
                             border-gray-200 dark:border-gray-700 font-mono select-text
                             overflow-auto max-h-64" style={{ userSelect: 'text' }}>
                  {result.content}
                </pre>
              </div>
            )}
          </div>
        );

      case 'json':
        return (
          <div className="space-y-2">
            {result.message && (
              <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                ✓ {result.message}
              </div>
            )}
            {result.error && (
              <div className="text-xs text-red-600 dark:text-red-400">
                ⚠️ {result.error}
              </div>
            )}
            <div className="text-xs text-gray-600 dark:text-gray-400">
              Size: {(result.size / 1024).toFixed(2)}KB
            </div>
            {result.content && (
              <div className="mt-2">
                <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded border
                             border-gray-700 font-mono select-text overflow-auto max-h-64"
                     style={{ userSelect: 'text' }}>
                  {result.content}
                </pre>
              </div>
            )}
          </div>
        );

      case 'binary':
        return (
          <div className="space-y-2">
            <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">
              ⚠️ Binary File Detected
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">
              <div>{result.message}</div>
              <div>Path: {result.path}</div>
              <div>Size: {(result.size / 1024).toFixed(2)}KB</div>
            </div>
            {result.error && (
              <div className="mt-2 p-2 bg-orange-50 dark:bg-orange-900/20 rounded">
                <div className="text-xs text-orange-700 dark:text-orange-300">
                  {result.error}
                </div>
              </div>
            )}
          </div>
        );

      case 'text':
        return (
          <div className="space-y-2">
            {result.warning && (
              <div className="text-xs text-yellow-600 dark:text-yellow-400">
                ⚠️ {result.warning}
              </div>
            )}
            <div className="text-xs text-gray-600 dark:text-gray-400">
              <div>Encoding: {result.encoding || 'UTF-8'}</div>
              <div>Size: {(result.size / 1024).toFixed(2)}KB</div>
            </div>
            {result.content && (
              <div className="mt-2">
                <pre className="text-xs bg-white dark:bg-gray-800 p-3 rounded border
                             border-gray-200 dark:border-gray-700 font-mono select-text
                             overflow-auto max-h-64" style={{ userSelect: 'text' }}>
                  {result.content}
                </pre>
              </div>
            )}
          </div>
        );
    }
  }

  // Handle standard output formats
  if (typeof result === 'string') {
    return (
      <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap
                   font-mono select-text" style={{ userSelect: 'text' }}>
        {result}
      </pre>
    );
  }

  if (result.stdout !== undefined || result.stderr !== undefined) {
    return (
      <>
        {result.stdout && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400">Output:</div>
            <pre className="text-xs bg-white dark:bg-gray-800 p-3 rounded border
                         border-gray-200 dark:border-gray-700 font-mono select-text
                         overflow-x-auto" style={{ userSelect: 'text' }}>
              {result.stdout}
            </pre>
          </div>
        )}
        {result.stderr && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-orange-600 dark:text-orange-400">
              Warnings/Errors:
            </div>
            <pre className="text-xs bg-orange-50 dark:bg-orange-900/20 p-3 rounded
                         border border-orange-200 dark:border-orange-800 font-mono
                         text-orange-700 dark:text-orange-300 select-text
                         overflow-x-auto" style={{ userSelect: 'text' }}>
              {result.stderr}
            </pre>
          </div>
        )}
      </>
    );
  }

  if (result.content !== undefined) {
    return (
      <div className="space-y-2">
        {result.path && (
          <div className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2">
            <FileText size={12} />
            <span className="font-medium">File:</span>
            <code className="bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded select-text"
                  style={{ userSelect: 'text' }}>
              {result.path}
            </code>
          </div>
        )}
        <div className="space-y-1">
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400">Content:</div>
          <pre className="text-xs bg-white dark:bg-gray-800 p-3 rounded border
                       border-gray-200 dark:border-gray-700 font-mono select-text
                       overflow-auto max-h-64" style={{ userSelect: 'text' }}>
            {result.content}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <pre className="text-xs text-gray-700 dark:text-gray-300 font-mono select-text
                 overflow-x-auto" style={{ userSelect: 'text' }}>
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

export const ImprovedEnhancedToolBlock = memo<NodeProps<ImprovedEnhancedToolBlockData>>(({
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

  const isRunning = data.status === 'running' || data.isExecuting;
  const isCompleted = data.status === 'completed';
  const isFailed = data.status === 'failed';
  const needsInput = data.status === 'needs_input';

  return (
    <div
      ref={blockRef}
      className={`
        enhanced-tool-block bg-white dark:bg-gray-900 rounded-xl
        transition-all duration-300 select-none
        ${selected ? 'ring-2 ring-blue-500 ring-offset-2 shadow-xl' : 'shadow-lg hover:shadow-xl'}
        ${dragging ? 'opacity-50' : ''}
        ${isRunning ? 'animate-pulse' : ''}
        ${!data.enabled ? 'opacity-60' : ''}
        ${needsInput ? 'node-needs-input' : ''}
      `}
      style={{
        borderLeft: `4px solid ${isRunning ? '#FCD34D' : isCompleted ? '#10B981' : isFailed ? '#EF4444' : toolColor}`,
        width: data.isWide ? '600px' : '450px',
        minHeight: '200px',
      }}
      onMouseEnter={() => !isRunning && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {needsInput && (
        <div className="parameter-missing">
          {data.executionError || 'This block needs additional input before it can run.'}
        </div>
      )}
      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white !-top-1.5"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source"
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-white !-bottom-1.5"
      />

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-t-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            {ToolIcon && (
              <div className="p-2 bg-white dark:bg-gray-700 rounded-lg shadow-sm">
                <ToolIcon
                  size={20}
                  style={{ color: isRunning ? '#FCD34D' : toolColor }}
                  className={isRunning ? 'animate-spin' : ''}
                />
              </div>
            )}
            <div className="flex-1">
              <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">
                {data.name || data.toolName || 'Tool Block'}
              </div>
              {data.toolSchema?.description && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {data.toolSchema.description}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setExpandedParams(!expandedParams)}
              className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
            >
              {expandedParams ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <button
              onClick={() => data.onDelete?.(id)}
              className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
            >
              <Trash2 size={16} className="text-red-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {/* Parameters Section */}
        {expandedParams && data.toolSchema?.parameters && (
          <div className="space-y-4 mb-4">
            {data.toolSchema.parameters.map(param => (
              <div key={param.name} className="space-y-2">
                <label className="block">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {param.name}
                    {param.required && <span className="text-red-500 ml-1">*</span>}
                    {param.type && (
                      <span className="ml-2 text-xs text-gray-400">({param.type})</span>
                    )}
                  </span>
                </label>
                <ImprovedParameterInput
                  parameter={param}
                  value={localParameters[param.name]}
                  onChange={handleParameterChange}
                  isDark={false}
                  toolName={data.toolName}
                />
              </div>
            ))}
          </div>
        )}

        {/* Execute Button */}
        <button
          onClick={handleExecute}
          disabled={isRunning || !data.enabled}
          className={`w-full px-4 py-2.5 rounded-lg font-medium text-sm transition-all
                   flex items-center justify-center gap-2
                   ${isRunning ? 'bg-yellow-400 text-yellow-900 cursor-not-allowed' :
                     data.enabled ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md hover:shadow-lg' :
                     'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
        >
          {isRunning ? (
            <>
              <RefreshCw size={16} className="animate-spin" />
              Executing...
            </>
          ) : (
            <>
              <Play size={16} />
              Execute Tool
            </>
          )}
        </button>

        {/* Results Section */}
        {showResults && (executionResult || executionError) && (
          <ResultDisplay
            result={executionResult}
            error={executionError}
            toolName={data.toolName}
            onClose={() => setShowResults(false)}
          />
        )}
      </div>
    </div>
  );
});

ImprovedEnhancedToolBlock.displayName = 'ImprovedEnhancedToolBlock';
