import React from 'react';
import {
  Bot, Brain, Search, Code, Database, Shield,
  Zap, CheckCircle, AlertCircle, Settings,
  Copy, TestTube, Trash2, ChevronRight,
  Sparkles, Globe, FileText, Terminal
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from '../../contexts/ThemeContext';

interface AgentCardProps {
  agent: {
    id: string;
    name: string;
    role: string;
    description: string;
    model: string;
    tools: string[];
    temperature: number;
    auto_approve?: boolean;
    dirty?: boolean;
  };
  isSelected: boolean;
  onClick: () => void;
  onRemove: () => void;
  onClone: () => void;
  onTest: () => void;
}

const roleIcons: Record<string, any> = {
  'Researcher': Search,
  'Developer': Code,
  'Analyst': Brain,
  'Reviewer': Shield,
  'Data Ingestor': Database,
  'Reporter': FileText,
  'Planner': Sparkles,
  'Coder': Terminal,
  'QA': TestTube,
  'Specialist': Bot
};

const modelBadges: Record<string, { color: string; icon: string; speed: string }> = {
  'gpt-4o': { color: 'purple', icon: '🚀', speed: 'Fast' },
  'gpt-4o-mini': { color: 'blue', icon: '⚡', speed: 'Very Fast' },
  'gpt-4': { color: 'green', icon: '🧠', speed: 'Powerful' },
  'gpt-3.5-turbo': { color: 'amber', icon: '💨', speed: 'Instant' }
};

const toolCategories: Record<string, { icon: any; color: string }> = {
  'file': { icon: FileText, color: 'blue' },
  'web': { icon: Globe, color: 'green' },
  'search': { icon: Search, color: 'purple' },
  'python': { icon: Code, color: 'yellow' },
  'shell': { icon: Terminal, color: 'red' },
  'database': { icon: Database, color: 'indigo' }
};

export default function AgentCard({ agent, isSelected, onClick, onRemove, onClone, onTest }: AgentCardProps) {
  const { isDark } = useTheme();
  const RoleIcon = roleIcons[agent.role] || Bot;
  const modelInfo = modelBadges[agent.model] || modelBadges['gpt-4o-mini'];
  
  // Categorize tools
  const categorizedTools = agent.tools.reduce((acc, tool) => {
    const category = Object.keys(toolCategories).find(cat => tool.toLowerCase().includes(cat)) || 'other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(tool);
    return acc;
  }, {} as Record<string, string[]>);

  // Calculate agent readiness
  const readiness = {
    hasTools: agent.tools.length > 0,
    hasDescription: agent.description && agent.description.length > 20,
    hasValidModel: !!modelBadges[agent.model],
    isConfigured: agent.tools.length > 0 && agent.description
  };

  const readinessScore = Object.values(readiness).filter(Boolean).length;
  const readinessLevel = readinessScore === 4 ? 'ready' : readinessScore >= 2 ? 'partial' : 'incomplete';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative group cursor-pointer transition-all duration-200 ${
        isSelected 
          ? 'ring-2 ring-blue-500 shadow-lg scale-[1.02]' 
          : 'hover:shadow-md'
      }`}
      onClick={onClick}
    >
      <div className={`p-4 rounded-xl border-2 backdrop-blur-lg transition-all ${
        isSelected
          ? 'bg-blue-600/10 border-blue-500 shadow-xl scale-[1.02]'
          : isDark
            ? 'bg-slate-900/50 border-slate-700/50 hover:bg-slate-900/70'
            : 'bg-gradient-to-br from-white to-blue-50 border-blue-200 hover:border-blue-400 hover:shadow-lg'
      }`}>
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-lg ${
              isSelected ? 'bg-blue-600/20' : isDark ? 'bg-slate-800/50' : 'bg-gradient-to-br from-blue-100 to-purple-100'
            }`}>
              <RoleIcon className={`h-5 w-5 ${
                isSelected ? 'text-blue-500' : isDark ? 'text-slate-400' : 'text-blue-600'
              }`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white">{agent.name}</h3>
                {agent.dirty && (
                  <span className="px-1.5 py-0.5 bg-amber-600/20 rounded text-xs text-amber-400">
                    unsaved
                  </span>
                )}
              </div>
              <p className={`text-sm mt-0.5 font-medium ${isDark ? 'text-slate-400' : 'text-blue-700'}`}>{agent.role}</p>
            </div>
          </div>
          
          {/* Quick Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTest();
              }}
              className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700/50' : 'hover:bg-gray-200'}`}
              title="Test Agent"
            >
              <TestTube className={`h-3.5 w-3.5 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClone();
              }}
              className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700/50' : 'hover:bg-gray-200'}`}
              title="Clone Agent"
            >
              <Copy className={`h-3.5 w-3.5 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="p-1.5 hover:bg-red-600/20 rounded-lg transition-colors"
              title="Remove Agent"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-400" />
            </button>
          </div>
        </div>

        {/* Description */}
        <p className={`text-xs mb-3 line-clamp-2 font-medium ${isDark ? 'text-slate-500' : 'text-gray-700'}`}>
          {agent.description || 'No description provided'}
        </p>

        {/* Model & Temperature */}
        <div className="flex items-center gap-2 mb-3">
          <div className={`flex items-center gap-1.5 px-2 py-1 bg-${modelInfo.color}-600/20 rounded-lg`}>
            <span className="text-sm">{modelInfo.icon}</span>
            <span className="text-xs font-medium text-white">{agent.model}</span>
            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>• {modelInfo.speed}</span>
          </div>
          <div className={`px-2 py-1 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-gradient-to-r from-orange-100 to-yellow-100 border border-orange-200'}`}>
            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Temp: {agent.temperature.toFixed(1)}</span>
          </div>
          {agent.auto_approve && (
            <div className="px-2 py-1 bg-green-600/20 rounded-lg">
              <span className="text-xs text-green-400">Auto</span>
            </div>
          )}
        </div>

        {/* Tools Summary */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
              Tools ({agent.tools.length})
            </span>
            {agent.tools.length > 3 && (
              <ChevronRight className={`h-3 w-3 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
            )}
          </div>
          
          {agent.tools.length === 0 ? (
            <div className={`text-xs italic ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>No tools configured</div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {Object.entries(categorizedTools).slice(0, 3).map(([category, tools]) => {
                const CategoryIcon = toolCategories[category]?.icon || Zap;
                const color = toolCategories[category]?.color || 'slate';
                return tools.slice(0, 2).map((tool, idx) => (
                  <div
                    key={`${category}-${idx}`}
                    className={`flex items-center gap-1 px-2 py-0.5 bg-${color}-600/20 rounded text-xs`}
                  >
                    <CategoryIcon className="h-3 w-3" />
                    <span className={isDark ? 'text-slate-300' : 'text-gray-700'}>{tool}</span>
                  </div>
                ));
              })}
              {agent.tools.length > 3 && (
                <div className={`px-2 py-0.5 rounded text-xs ${isDark ? 'bg-slate-700/50 text-slate-400' : 'bg-gray-200 text-gray-600'}`}>
                  +{agent.tools.length - 3} more
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status Indicator */}
        <div className={`mt-3 pt-3 border-t ${isDark ? 'border-slate-700/50' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {readinessLevel === 'ready' ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  <span className="text-xs text-green-400">Ready to run</span>
                </>
              ) : readinessLevel === 'partial' ? (
                <>
                  <AlertCircle className="h-4 w-4 text-amber-400" />
                  <span className="text-xs text-amber-400">Needs configuration</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  <span className="text-xs text-red-400">Incomplete setup</span>
                </>
              )}
            </div>
            <Settings className={`h-3.5 w-3.5 ${isDark ? 'text-slate-500' : 'text-gray-500'}`} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}