import React from "react";
import "./AgentIterationDisplay.css";

interface AgentIterationProps {
  agentName: string;
  iteration: number;
  maxIterations: number;
  status: "reasoning" | "using_tools" | "completing" | "finished";
  tools?: string[];
  timestamp: Date;
}

const AgentIterationDisplay: React.FC<AgentIterationProps> = ({
  agentName,
  iteration,
  maxIterations,
  status,
  tools = [],
  timestamp,
}) => {
  const getStatusIcon = () => {
    switch (status) {
      case "reasoning":
        return "🧠";
      case "using_tools":
        return "🔧";
      case "completing":
        return "✅";
      case "finished":
        return "🎯";
      default:
        return "🔄";
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "reasoning":
        return "Analyzing & Reasoning";
      case "using_tools":
        return "Using Tools";
      case "completing":
        return "Finalizing Work";
      case "finished":
        return "Iteration Complete";
      default:
        return "Processing";
    }
  };

  const getProgressPercentage = () => {
    return (iteration / maxIterations) * 100;
  };

  return (
    <div className="agent-iteration-display">
      <div className="iteration-header">
        <div className="agent-info">
          <span className="agent-name">{agentName}</span>
          <span className="iteration-badge">
            Iteration {iteration}/{maxIterations}
          </span>
        </div>
        <div className="iteration-status">
          <span className="status-icon">{getStatusIcon()}</span>
          <span className="status-text">{getStatusText()}</span>
        </div>
      </div>

      <div className="iteration-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${getProgressPercentage()}%` }}
          />
        </div>
        <span className="progress-text">
          {Math.round(getProgressPercentage())}% Complete
        </span>
      </div>

      {tools.length > 0 && (
        <div className="tools-used">
          <span className="tools-label">Tools:</span>
          <div className="tools-list">
            {tools.map((tool, index) => (
              <span key={index} className="tool-tag">
                🔧 {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="iteration-meta">
        <span className="timestamp">{timestamp.toLocaleTimeString()}</span>
      </div>
    </div>
  );
};

export default AgentIterationDisplay;
