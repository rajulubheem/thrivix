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
}

export const ExecutionControlBar: React.FC<ExecutionControlBarProps> = ({
  executionMode,
  task,
  isRunning,
  onExecutionModeChange,
  onTaskChange,
  onStartExecution,
  onStopExecution,
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
        placeholder="Enter your task..."
        disabled={isRunning}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isRunning && task.trim()) {
            onStartExecution();
          }
        }}
      />

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