import React, { useState } from 'react';
import { Play, Pause, StopCircle, Settings, Sliders, Target } from 'lucide-react';
import './AutomationControls.css';

export interface AutomationConfig {
  goal: string;
  mode: 'research' | 'build' | 'test' | 'full';
  maxHandoffs: number;
  maxRuntime: number; // minutes
  maxTokens: number;
  requireApproval: boolean;
  autoScroll: boolean;
}

interface AutomationControlsProps {
  config: AutomationConfig;
  isRunning: boolean;
  onConfigChange: (config: AutomationConfig) => void;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
}

const AutomationControls: React.FC<AutomationControlsProps> = ({
  config,
  isRunning,
  onConfigChange,
  onStart,
  onPause,
  onStop
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  
  const handleChange = (field: keyof AutomationConfig, value: any) => {
    onConfigChange({
      ...config,
      [field]: value
    });
  };
  
  return (
    <div className="automation-controls">
      {/* Header */}
      <div className="controls-header">
        <div className="header-left">
          <Target size={20} />
          <h2>Automation Goal</h2>
        </div>
        <button 
          className="toggle-btn"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <Settings size={16} />
        </button>
      </div>
      
      {/* Goal Input */}
      <div className="goal-section">
        <textarea
          value={config.goal}
          onChange={(e) => handleChange('goal', e.target.value)}
          placeholder="E.g., Research battery tech, design prototype, run tests..."
          rows={3}
          disabled={isRunning}
        />
      </div>
      
      {/* Expanded Controls */}
      {isExpanded && (
        <div className="controls-expanded">
          {/* Mode Selection */}
          <div className="control-group">
            <label>Mode</label>
            <select 
              value={config.mode}
              onChange={(e) => handleChange('mode', e.target.value)}
              disabled={isRunning}
            >
              <option value="research">Research Only</option>
              <option value="build">Build Only</option>
              <option value="test">Test Only</option>
              <option value="full">Full Automation</option>
            </select>
          </div>
          
          {/* Constraints */}
          <div className="constraints-row">
            <div className="control-group">
              <label>Max Handoffs</label>
              <input
                type="number"
                value={config.maxHandoffs}
                onChange={(e) => handleChange('maxHandoffs', parseInt(e.target.value))}
                min={1}
                max={50}
                disabled={isRunning}
              />
            </div>
            
            <div className="control-group">
              <label>Max Runtime (min)</label>
              <input
                type="number"
                value={config.maxRuntime}
                onChange={(e) => handleChange('maxRuntime', parseInt(e.target.value))}
                min={1}
                max={60}
                disabled={isRunning}
              />
            </div>
            
            <div className="control-group">
              <label>Max Tokens</label>
              <input
                type="number"
                value={config.maxTokens}
                onChange={(e) => handleChange('maxTokens', parseInt(e.target.value))}
                min={1000}
                max={100000}
                step={1000}
                disabled={isRunning}
              />
            </div>
          </div>
          
          {/* Options */}
          <div className="options-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.requireApproval}
                onChange={(e) => handleChange('requireApproval', e.target.checked)}
                disabled={isRunning}
              />
              <span>Require approval for risky actions</span>
            </label>
            
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.autoScroll}
                onChange={(e) => handleChange('autoScroll', e.target.checked)}
              />
              <span>Auto-scroll timeline</span>
            </label>
          </div>
        </div>
      )}
      
      {/* Action Buttons */}
      <div className="action-buttons">
        {!isRunning ? (
          <button 
            className="btn btn-primary"
            onClick={onStart}
            disabled={!config.goal.trim()}
          >
            <Play size={16} />
            Start Run
          </button>
        ) : (
          <>
            <button className="btn btn-warning" onClick={onPause}>
              <Pause size={16} />
              Pause
            </button>
            <button className="btn btn-danger" onClick={onStop}>
              <StopCircle size={16} />
              Stop
            </button>
          </>
        )}
      </div>
      
      {/* Quick Stats */}
      {isRunning && (
        <div className="quick-stats">
          <div className="stat-badge mode">
            <Sliders size={12} />
            {config.mode.toUpperCase()}
          </div>
          <div className="stat-badge handoffs">
            Max {config.maxHandoffs} handoffs
          </div>
          <div className="stat-badge runtime">
            Max {config.maxRuntime} min
          </div>
        </div>
      )}
    </div>
  );
};

export default AutomationControls;