import React, { useState, useEffect, useRef } from 'react';
import { GitBranch, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { PlanStep, AgentRole } from '../../types/swarm-v2';
import './PlanDAGView.css';

interface PlanDAGViewProps {
  plan: PlanStep[];
  selectedStep: string | null;
  onSelectStep: (stepId: string | null) => void;
  onEditPlan: (plan: PlanStep[]) => void;
  editable: boolean;
}

interface DAGNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const PlanDAGView: React.FC<PlanDAGViewProps> = ({
  plan,
  selectedStep,
  onSelectStep,
  onEditPlan,
  editable
}) => {
  const [nodes, setNodes] = useState<Map<string, DAGNode>>(new Map());
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate DAG layout
  useEffect(() => {
    const calculateLayout = () => {
      const nodeMap = new Map<string, DAGNode>();
      const levels = calculateLevels(plan);
      
      const nodeWidth = 200;
      const nodeHeight = 80;
      const horizontalSpacing = 250;
      const verticalSpacing = 120;
      
      levels.forEach((level, levelIndex) => {
        const levelWidth = level.length * nodeWidth + (level.length - 1) * 50;
        const startX = (800 - levelWidth) / 2; // Center the level
        
        level.forEach((stepId, nodeIndex) => {
          nodeMap.set(stepId, {
            id: stepId,
            x: startX + nodeIndex * (nodeWidth + 50),
            y: levelIndex * verticalSpacing + 50,
            width: nodeWidth,
            height: nodeHeight
          });
        });
      });
      
      setNodes(nodeMap);
    };

    calculateLayout();
  }, [plan]);

  const calculateLevels = (steps: PlanStep[]): string[][] => {
    const levels: string[][] = [];
    const processed = new Set<string>();
    
    // Find steps with no dependencies (root nodes)
    const roots = steps.filter(s => s.deps.length === 0);
    if (roots.length > 0) {
      levels.push(roots.map(s => s.id));
      roots.forEach(s => processed.add(s.id));
    }
    
    // Build subsequent levels
    while (processed.size < steps.length) {
      const nextLevel: string[] = [];
      
      steps.forEach(step => {
        if (!processed.has(step.id)) {
          // Check if all dependencies are processed
          if (step.deps.every(dep => processed.has(dep))) {
            nextLevel.push(step.id);
          }
        }
      });
      
      if (nextLevel.length === 0) break; // Prevent infinite loop
      
      levels.push(nextLevel);
      nextLevel.forEach(id => processed.add(id));
    }
    
    return levels;
  };

  const getStepById = (id: string): PlanStep | undefined => {
    return plan.find(s => s.id === id);
  };

  const getAgentColor = (agent: AgentRole): string => {
    const colors: Record<AgentRole, string> = {
      orchestrator: '#6366f1',
      researcher: '#10b981',
      planner: '#8b5cf6',
      'tool-runner': '#f59e0b',
      coder: '#06b6d4',
      reviewer: '#ef4444',
      safety: '#dc2626'
    };
    return colors[agent] || '#6b7280';
  };

  const getStatusClass = (status: PlanStep['status']): string => {
    return `node-${status}`;
  };

  const handleEditStep = (stepId: string) => {
    const step = getStepById(stepId);
    if (step && editable) {
      setEditingStep(stepId);
      setEditTitle(step.title);
    }
  };

  const handleSaveEdit = () => {
    if (editingStep && editTitle) {
      const updatedPlan = plan.map(step => 
        step.id === editingStep 
          ? { ...step, title: editTitle }
          : step
      );
      onEditPlan(updatedPlan);
      setEditingStep(null);
      setEditTitle('');
    }
  };

  const handleCancelEdit = () => {
    setEditingStep(null);
    setEditTitle('');
  };

  const handleAddStep = () => {
    if (!editable) return;
    
    const newStep: PlanStep = {
      id: `step-${Date.now()}`,
      title: 'New Step',
      description: 'Description',
      agent: 'orchestrator' as AgentRole,
      deps: [],
      status: 'queued',
      artifacts: []
    };
    
    onEditPlan([...plan, newStep]);
  };

  const handleDeleteStep = (stepId: string) => {
    if (!editable) return;
    
    // Remove the step and update dependencies
    const updatedPlan = plan
      .filter(s => s.id !== stepId)
      .map(step => ({
        ...step,
        deps: step.deps.filter(dep => dep !== stepId)
      }));
    
    onEditPlan(updatedPlan);
  };

  const renderEdge = (fromId: string, toId: string) => {
    const fromNode = nodes.get(fromId);
    const toNode = nodes.get(toId);
    
    if (!fromNode || !toNode) return null;
    
    const x1 = fromNode.x + fromNode.width / 2;
    const y1 = fromNode.y + fromNode.height;
    const x2 = toNode.x + toNode.width / 2;
    const y2 = toNode.y;
    
    // Create a curved path
    const midY = (y1 + y2) / 2;
    const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
    
    return (
      <g key={`edge-${fromId}-${toId}`}>
        <path
          d={path}
          fill="none"
          stroke="#94a3b8"
          strokeWidth="2"
          strokeDasharray="5,5"
          opacity="0.5"
        />
        <circle cx={x2} cy={y2} r="4" fill="#94a3b8" />
      </g>
    );
  };

  return (
    <div className="plan-dag-view" ref={containerRef}>
      {/* Toolbar */}
      {editable && (
        <div className="dag-toolbar">
          <button className="dag-tool-btn" onClick={handleAddStep}>
            <Plus size={16} />
            Add Step
          </button>
        </div>
      )}

      {/* DAG Visualization */}
      <div className="dag-container">
        <svg
          ref={svgRef}
          className="dag-svg"
          viewBox="0 0 800 600"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Render edges */}
          <g className="dag-edges">
            {plan.map(step => 
              step.deps.map(depId => renderEdge(depId, step.id))
            )}
          </g>

          {/* Render nodes */}
          <g className="dag-nodes">
            {plan.map(step => {
              const node = nodes.get(step.id);
              if (!node) return null;

              const isSelected = selectedStep === step.id;
              const isEditing = editingStep === step.id;

              return (
                <g
                  key={step.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className={`dag-node ${getStatusClass(step.status)} ${isSelected ? 'selected' : ''}`}
                  onClick={() => !isEditing && onSelectStep(step.id)}
                >
                  {/* Node background */}
                  <rect
                    width={node.width}
                    height={node.height}
                    rx="8"
                    fill="white"
                    stroke={isSelected ? '#6366f1' : '#e2e8f0'}
                    strokeWidth={isSelected ? 2 : 1}
                  />

                  {/* Agent color indicator */}
                  <rect
                    width="4"
                    height={node.height}
                    rx="2"
                    fill={getAgentColor(step.agent)}
                  />

                  {/* Node content */}
                  {isEditing ? (
                    <foreignObject x="10" y="10" width={node.width - 20} height={node.height - 20}>
                      <div className="node-edit">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          autoFocus
                        />
                        <div className="edit-actions">
                          <button onClick={handleSaveEdit}>
                            <Check size={14} />
                          </button>
                          <button onClick={handleCancelEdit}>
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    </foreignObject>
                  ) : (
                    <>
                      <text x="10" y="25" className="node-title">
                        {step.title}
                      </text>
                      <text x="10" y="45" className="node-agent">
                        {step.agent}
                      </text>
                      {step.estimatedTime && (
                        <text x="10" y="65" className="node-time">
                          ~{step.estimatedTime}s
                        </text>
                      )}
                    </>
                  )}

                  {/* Action buttons */}
                  {editable && !isEditing && (
                    <g className="node-actions">
                      <g
                        transform={`translate(${node.width - 50}, 5)`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditStep(step.id);
                        }}
                      >
                        <rect width="20" height="20" fill="transparent" />
                        <Edit2 size={14} x="3" y="3" />
                      </g>
                      <g
                        transform={`translate(${node.width - 25}, 5)`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteStep(step.id);
                        }}
                      >
                        <rect width="20" height="20" fill="transparent" />
                        <Trash2 size={14} x="3" y="3" />
                      </g>
                    </g>
                  )}

                  {/* Status indicator */}
                  {step.status !== 'queued' && (
                    <circle
                      cx={node.width - 10}
                      cy={node.height - 10}
                      r="6"
                      className={`status-indicator status-${step.status}`}
                    />
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Legend */}
      <div className="dag-legend">
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#e2e8f0' }} />
          <span>Queued</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#3b82f6' }} />
          <span>Running</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#10b981' }} />
          <span>Done</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#ef4444' }} />
          <span>Failed</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#f59e0b' }} />
          <span>Blocked</span>
        </div>
      </div>
    </div>
  );
};

export default PlanDAGView;