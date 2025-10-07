import React from 'react';

export type ExecutionMode = 'dynamic' | 'neural' | 'parallel' | 'sequential';

interface ExecutionControlBarProps {
  executionMode: ExecutionMode;
  task: string;
  isRunning: boolean;
  onExecutionModeChange: (mode: ExecutionMode) => void;
  onTaskChange: (task: string) => void;
  onStartExecution: () => void;
  onStopExecution: () => void;
  onToggleAIChat?: () => void;
}

export const ExecutionControlBar: React.FC<ExecutionControlBarProps> = ({
  executionMode,
  task,
  isRunning,
  onExecutionModeChange,
  onTaskChange,
  onStartExecution,
  onStopExecution,
  onToggleAIChat,
}) => {
  return (
    <div className="command-bar">
      <select
        className="mode-select"
        value={executionMode}
        onChange={(e) => onExecutionModeChange(e.target.value as ExecutionMode)}
        disabled={isRunning}
      >
        <option value="dynamic">Dynamic</option>
        <option value="neural">Neural</option>
        <option value="parallel">Parallel</option>
        <option value="sequential">Sequential</option>
      </select>

      <input
        className="task-input"
        value={task}
        onChange={(e) => onTaskChange(e.target.value)}
        placeholder="Describe your task (will auto-plan workflow if canvas is empty)..."
        disabled={isRunning}
        title="Enter your task. If canvas is empty, Execute will auto-plan and run a workflow. For iterative building, use AI Assistant."
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isRunning && task.trim()) {
            onStartExecution();
          }
        }}
      />

      {onToggleAIChat && (
        <button
          className="ai-chat-btn"
          onClick={onToggleAIChat}
          title="Open AI Assistant to build, modify, or enhance your workflow using natural language"
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '15px',
            fontWeight: 600,
            marginRight: '8px',
            boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.4)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)';
          }}
        >
          🤖 AI Workflow Builder
        </button>
      )}

      <button
        className={`execute-btn ${isRunning ? 'stop' : ''}`}
        onClick={isRunning ? onStopExecution : onStartExecution}
        disabled={!isRunning && !task.trim()}
      >
        {isRunning ? '⏹ Stop' : '▶ Execute'}
      </button>
    </div>
  );
};