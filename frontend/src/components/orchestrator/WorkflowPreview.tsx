import React from 'react';
import { 
  ArrowRight, GitBranch, Users, Zap, 
  Play, Pause, CheckCircle, Clock
} from 'lucide-react';
import { motion } from 'framer-motion';

interface Agent {
  id: string;
  name: string;
  role: string;
  tools: string[];
  dependencies?: string[];
}

interface WorkflowPreviewProps {
  agents: Agent[];
  executionMode?: 'sequential' | 'parallel' | 'smart';
}

export default function WorkflowPreview({ agents, executionMode = 'smart' }: WorkflowPreviewProps) {
  // Determine workflow structure
  const analyzeWorkflow = () => {
    const stages: Agent[][] = [];
    const processed = new Set<string>();
    
    // Group agents by dependencies
    const agentsWithNoDeps = agents.filter(a => !a.dependencies || a.dependencies.length === 0);
    if (agentsWithNoDeps.length > 0) {
      stages.push(agentsWithNoDeps);
      agentsWithNoDeps.forEach(a => processed.add(a.id));
    }
    
    // Group remaining agents by dependency levels
    let remaining = agents.filter(a => !processed.has(a.id));
    while (remaining.length > 0) {
      const nextStage = remaining.filter(a => 
        !a.dependencies || a.dependencies.every(dep => processed.has(dep))
      );
      
      if (nextStage.length === 0 && remaining.length > 0) {
        // No dependencies found, add remaining as parallel
        stages.push(remaining);
        break;
      }
      
      if (nextStage.length > 0) {
        stages.push(nextStage);
        nextStage.forEach(a => processed.add(a.id));
      }
      
      remaining = remaining.filter(a => !processed.has(a.id));
    }
    
    return stages;
  };

  const stages = executionMode === 'sequential' 
    ? agents.map(a => [a]) 
    : executionMode === 'parallel'
    ? [agents]
    : analyzeWorkflow();

  const getExecutionTime = (agent: Agent) => {
    // Estimate based on tools
    const baseTime = 2;
    const toolTime = agent.tools.length * 0.5;
    return (baseTime + toolTime).toFixed(1);
  };

  const getTotalTime = () => {
    if (executionMode === 'parallel') {
      return Math.max(...agents.map(a => parseFloat(getExecutionTime(a)))).toFixed(1);
    }
    return agents.reduce((sum, a) => sum + parseFloat(getExecutionTime(a)), 0).toFixed(1);
  };

  return (
    <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <GitBranch className="h-5 w-5 text-blue-400" />
          <h3 className="font-semibold">Workflow Preview</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-800/50 rounded-lg">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs text-slate-400">Est. {getTotalTime()}s</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-blue-600/20 rounded-lg">
            <Zap className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-xs text-blue-400 capitalize">{executionMode} Mode</span>
          </div>
        </div>
      </div>

      {/* Workflow Visualization */}
      <div className="relative">
        <div className="flex items-center gap-4 overflow-x-auto pb-4">
          {stages.map((stage, stageIndex) => (
            <React.Fragment key={stageIndex}>
              {stageIndex > 0 && (
                <div className="flex items-center">
                  <ArrowRight className="h-5 w-5 text-slate-600" />
                </div>
              )}
              
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: stageIndex * 0.1 }}
                className={`flex ${stage.length > 1 ? 'flex-col' : ''} gap-2`}
              >
                {stage.length > 1 && (
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-xs text-amber-400">Parallel</span>
                  </div>
                )}
                
                {stage.map((agent, agentIndex) => (
                  <div
                    key={agent.id}
                    className="relative group"
                  >
                    {stage.length > 1 && agentIndex > 0 && (
                      <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-px h-2 bg-slate-600" />
                    )}
                    
                    <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg hover:bg-slate-800/70 transition-all min-w-[140px]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">{agent.name}</span>
                        <CheckCircle className="h-3.5 w-3.5 text-green-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="text-xs text-slate-400">{agent.role}</div>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex items-center gap-1">
                          <Zap className="h-3 w-3 text-slate-500" />
                          <span className="text-xs text-slate-500">{agent.tools.length} tools</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-500" />
                          <span className="text-xs text-slate-500">{getExecutionTime(agent)}s</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Connection lines for dependencies */}
                    {agent.dependencies && agent.dependencies.length > 0 && (
                      <div className="absolute -left-4 top-1/2 transform -translate-y-1/2 w-4 h-px bg-slate-600" />
                    )}
                  </div>
                ))}
              </motion.div>
            </React.Fragment>
          ))}
        </div>

        {/* Execution Flow Legend */}
        <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Play className="h-3.5 w-3.5 text-green-400" />
              <span className="text-xs text-slate-400">Start</span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs text-slate-400">Sequential</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs text-slate-400">Parallel</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-3.5 w-3.5 text-green-400" />
              <span className="text-xs text-slate-400">Complete</span>
            </div>
          </div>
          
          <div className="text-xs text-slate-500">
            {agents.length} agents • {stages.length} stages
          </div>
        </div>
      </div>

      {/* Optimization Suggestions */}
      {stages.some(s => s.length === 1) && stages.length > 1 && (
        <div className="mt-4 p-3 bg-amber-600/10 border border-amber-500/30 rounded-lg">
          <div className="flex items-start gap-2">
            <Zap className="h-4 w-4 text-amber-400 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-amber-400">Optimization Available</div>
              <div className="text-xs text-slate-400 mt-1">
                Some agents could run in parallel to reduce total execution time.
                Consider reviewing dependencies for better performance.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}