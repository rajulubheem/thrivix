import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Save,
  Upload,
  Download,
  Plus,
  Trash2,
  Settings,
  Eye,
  EyeOff,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2
} from 'lucide-react';

interface WorkflowToolbarProps {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onExecute: () => void;
  onPause: () => void;
  onReset: () => void;
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onAddNode: () => void;
  onClearWorkflow: () => void;
  isExecuting: boolean;
  isChatVisible: boolean;
  onToggleChat: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  selectedNodeId?: string | null;
  onDeleteNode?: () => void;
  onSettings?: () => void;
}

const WorkflowToolbar: React.FC<WorkflowToolbarProps> = ({
  isDarkMode,
  onToggleDarkMode,
  onExecute,
  onPause,
  onReset,
  onSave,
  onLoad,
  onExport,
  onAddNode,
  onClearWorkflow,
  isExecuting,
  isChatVisible,
  onToggleChat,
  isFullscreen = false,
  onToggleFullscreen,
  selectedNodeId,
  onDeleteNode,
  onSettings,
}) => {
  const toolbarStyle: React.CSSProperties = {
    position: 'absolute',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(10px)',
    borderRadius: '16px',
    padding: '12px 16px',
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    boxShadow: isDarkMode
      ? '0 4px 20px rgba(0, 0, 0, 0.4)'
      : '0 4px 20px rgba(0, 0, 0, 0.1)',
    border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
    zIndex: 1000,
  };

  const buttonStyle = (isActive = false): React.CSSProperties => ({
    padding: '8px',
    borderRadius: '8px',
    backgroundColor: isActive
      ? isDarkMode ? '#3b82f6' : '#3b82f6'
      : 'transparent',
    color: isActive
      ? '#ffffff'
      : isDarkMode ? '#cbd5e1' : '#64748b',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
    transition: 'all 0.2s ease',
  });

  const separatorStyle: React.CSSProperties = {
    width: '1px',
    height: '24px',
    backgroundColor: isDarkMode ? '#475569' : '#e2e8f0',
    margin: '0 4px',
  };

  return (
    <div style={toolbarStyle}>
      {/* Execution Controls */}
      <button
        style={buttonStyle(isExecuting)}
        onClick={isExecuting ? onPause : onExecute}
        title={isExecuting ? 'Pause Execution' : 'Execute Workflow'}
      >
        {isExecuting ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <button
        style={buttonStyle()}
        onClick={onReset}
        title="Reset Workflow"
      >
        <RotateCcw size={18} />
      </button>

      <div style={separatorStyle} />

      {/* File Operations */}
      <button
        style={buttonStyle()}
        onClick={onSave}
        title="Save Workflow"
      >
        <Save size={18} />
      </button>
      <button
        style={buttonStyle()}
        onClick={onLoad}
        title="Load Workflow"
      >
        <Upload size={18} />
      </button>
      <button
        style={buttonStyle()}
        onClick={onExport}
        title="Export Workflow"
      >
        <Download size={18} />
      </button>

      <div style={separatorStyle} />

      {/* Node Operations */}
      <button
        style={buttonStyle()}
        onClick={onAddNode}
        title="Add Node"
      >
        <Plus size={18} />
      </button>
      {selectedNodeId && (
        <button
          style={buttonStyle()}
          onClick={onDeleteNode}
          title="Delete Selected Node"
        >
          <Trash2 size={18} />
        </button>
      )}
      <button
        style={buttonStyle()}
        onClick={onClearWorkflow}
        title="Clear Workflow"
      >
        <Trash2 size={18} />
      </button>

      <div style={separatorStyle} />

      {/* View Controls */}
      <button
        style={buttonStyle(isChatVisible)}
        onClick={onToggleChat}
        title={isChatVisible ? 'Hide Chat' : 'Show Chat'}
      >
        {isChatVisible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>

      {onToggleFullscreen && (
        <button
          style={buttonStyle()}
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      )}

      <div style={separatorStyle} />

      {/* Settings */}
      {onSettings && (
        <button
          style={buttonStyle()}
          onClick={onSettings}
          title="Settings"
        >
          <Settings size={18} />
        </button>
      )}

      {/* Theme Toggle */}
      <button
        style={buttonStyle()}
        onClick={onToggleDarkMode}
        title={isDarkMode ? 'Light Mode' : 'Dark Mode'}
      >
        {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </div>
  );
};

export default WorkflowToolbar;