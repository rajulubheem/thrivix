import React, { useState } from 'react';
import { 
  Play, Pause, StopCircle, Settings, ChevronDown, ChevronRight,
  Clock, DollarSign, Shield, Zap, BookOpen, Save
} from 'lucide-react';
import { Goal, RunCaps, SwarmExecution, Recipe } from '../../types/swarm-v2';
import './ControlPanel.css';

interface ControlPanelProps {
  goalInput: string;
  setGoalInput: (goal: string) => void;
  runCaps: RunCaps;
  setRunCaps: (caps: RunCaps) => void;
  execution: SwarmExecution | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  recipes: Recipe[];
  onRecipeSelect: (recipe: Recipe) => void;
  showSettings: boolean;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  goalInput,
  setGoalInput,
  runCaps,
  setRunCaps,
  execution,
  onStart,
  onPause,
  onResume,
  onStop,
  recipes,
  onRecipeSelect,
  showSettings
}) => {
  const [showRecipes, setShowRecipes] = useState(false);
  const [mode, setMode] = useState<'draft' | 'strict'>('draft');

  const isExecuting = execution?.status === 'running' || execution?.status === 'planning';
  const isPaused = execution?.status === 'paused';
  const canStart = goalInput.trim() && !isExecuting;

  return (
    <div className="control-panel">
      {/* Goal Input Section */}
      <div className="control-section">
        <h3>Goal</h3>
        <textarea
          className="goal-input"
          placeholder="Describe what you want to accomplish..."
          value={goalInput}
          onChange={(e) => setGoalInput(e.target.value)}
          disabled={isExecuting}
          rows={4}
        />
        
        {/* Recipe Templates */}
        <div className="recipe-section">
          <button 
            className="recipe-toggle"
            onClick={() => setShowRecipes(!showRecipes)}
          >
            {showRecipes ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <BookOpen size={16} />
            Recipes
          </button>
          
          {showRecipes && (
            <div className="recipe-list">
              {recipes.map(recipe => (
                <div 
                  key={recipe.id}
                  className="recipe-item"
                  onClick={() => onRecipeSelect(recipe)}
                >
                  <div className="recipe-header">
                    <span className="recipe-name">{recipe.name}</span>
                    {recipe.successRate && (
                      <span className="recipe-success">
                        {Math.round(recipe.successRate * 100)}%
                      </span>
                    )}
                  </div>
                  <p className="recipe-description">{recipe.description}</p>
                  <div className="recipe-meta">
                    <span><Clock size={12} /> {recipe.estimatedTime}s</span>
                    <span><DollarSign size={12} /> ${recipe.estimatedCost}</span>
                    {recipe.usageCount && (
                      <span>Used {recipe.usageCount}x</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Execution Controls */}
      <div className="control-section">
        <h3>Controls</h3>
        <div className="execution-controls">
          {!isExecuting ? (
            <button 
              className="control-btn primary"
              onClick={onStart}
              disabled={!canStart}
            >
              <Play size={20} />
              Run
            </button>
          ) : isPaused ? (
            <>
              <button 
                className="control-btn primary"
                onClick={onResume}
              >
                <Play size={20} />
                Resume
              </button>
              <button 
                className="control-btn danger"
                onClick={onStop}
              >
                <StopCircle size={20} />
                Stop
              </button>
            </>
          ) : (
            <>
              <button 
                className="control-btn warning"
                onClick={onPause}
              >
                <Pause size={20} />
                Pause
              </button>
              <button 
                className="control-btn danger"
                onClick={onStop}
              >
                <StopCircle size={20} />
                Stop
              </button>
            </>
          )}
        </div>

        {/* Mode Selection */}
        <div className="mode-selection">
          <label className="mode-label">
            <input
              type="radio"
              value="draft"
              checked={mode === 'draft'}
              onChange={(e) => setMode(e.target.value as 'draft' | 'strict')}
              disabled={isExecuting}
            />
            <span>Draft Mode</span>
            <small>Faster, less validation</small>
          </label>
          <label className="mode-label">
            <input
              type="radio"
              value="strict"
              checked={mode === 'strict'}
              onChange={(e) => setMode(e.target.value as 'draft' | 'strict')}
              disabled={isExecuting}
            />
            <span>Strict Mode</span>
            <small>Full validation & testing</small>
          </label>
        </div>
      </div>

      {/* Capability Limits */}
      {showSettings && (
        <div className="control-section">
          <h3>Limits & Caps</h3>
          <div className="caps-controls">
            <div className="cap-item">
              <label>
                <Clock size={14} />
                Max Runtime
              </label>
              <div className="cap-input">
                <input
                  type="number"
                  value={runCaps.maxRuntimeSec / 60}
                  onChange={(e) => setRunCaps({
                    ...runCaps,
                    maxRuntimeSec: parseInt(e.target.value) * 60
                  })}
                  disabled={isExecuting}
                  min={1}
                  max={60}
                />
                <span>minutes</span>
              </div>
            </div>

            <div className="cap-item">
              <label>
                <DollarSign size={14} />
                Max Cost
              </label>
              <div className="cap-input">
                <input
                  type="number"
                  value={runCaps.maxCost}
                  onChange={(e) => setRunCaps({
                    ...runCaps,
                    maxCost: parseFloat(e.target.value)
                  })}
                  disabled={isExecuting}
                  min={0.1}
                  max={100}
                  step={0.1}
                />
                <span>USD</span>
              </div>
            </div>

            <div className="cap-item">
              <label>
                <Zap size={14} />
                Max Handoffs
              </label>
              <div className="cap-input">
                <input
                  type="number"
                  value={runCaps.maxHandoffs}
                  onChange={(e) => setRunCaps({
                    ...runCaps,
                    maxHandoffs: parseInt(e.target.value)
                  })}
                  disabled={isExecuting}
                  min={1}
                  max={50}
                />
                <span>handoffs</span>
              </div>
            </div>

            <div className="cap-item">
              <label>
                <Shield size={14} />
                Safety Level
              </label>
              <select
                value={runCaps.safetyLevel}
                onChange={(e) => setRunCaps({
                  ...runCaps,
                  safetyLevel: e.target.value as 'minimal' | 'moderate' | 'strict'
                })}
                disabled={isExecuting}
              >
                <option value="minimal">Minimal</option>
                <option value="moderate">Moderate</option>
                <option value="strict">Strict</option>
              </select>
            </div>

            <div className="cap-item">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={runCaps.requireApprovals}
                  onChange={(e) => setRunCaps({
                    ...runCaps,
                    requireApprovals: e.target.checked
                  })}
                  disabled={isExecuting}
                />
                <span>Require Approvals</span>
              </label>
            </div>
          </div>

          <button className="save-settings">
            <Save size={16} />
            Save as Default
          </button>
        </div>
      )}

      {/* Current Execution Info */}
      {execution && (
        <div className="control-section">
          <h3>Current Execution</h3>
          <div className="execution-info">
            <div className="info-item">
              <span className="info-label">Status</span>
              <span className={`info-value status-${execution.status}`}>
                {execution.status}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Progress</span>
              <span className="info-value">
                {execution.metrics.stepsCompleted}/{execution.metrics.stepsTotal}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Cost</span>
              <span className="info-value">
                ${execution.metrics.totalCost.toFixed(3)}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Handoffs</span>
              <span className="info-value">
                {execution.metrics.totalHandoffs}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ControlPanel;