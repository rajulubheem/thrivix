import React, { useState } from 'react';
import { 
  Search, Globe, Code, Database, FileText, Terminal,
  Shield, Clock, Calculator, Package, Wrench, Info,
  CheckCircle, XCircle, AlertTriangle, Zap, TestTube,
  Play, Copy, ChevronDown, ChevronUp, BookOpen, Plus
} from 'lucide-react';
import { 
  COMPLETE_TOOL_REGISTRY, 
  TOOL_CATEGORIES, 
  TOOL_PRESETS,
  getToolsByCategory,
  getToolByName,
  getRecommendedTools,
  ToolDefinition 
} from '../../data/toolRegistry';

interface TestModalProps {
  tool: ToolDefinition;
  onClose: () => void;
  onTest: (parameters: any) => Promise<any>;
}

const TestModal: React.FC<TestModalProps> = ({ tool, onClose, onTest }) => {
  const [parameters, setParameters] = useState<string>(
    JSON.stringify(tool.defaultParameters || {}, null, 2)
  );
  const [selectedVariation, setSelectedVariation] = useState<number>(-1);
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      const params = JSON.parse(parameters);
      const result = await onTest(params);
      setTestResult(result);
    } catch (error: any) {
      setTestResult({ error: error.message || 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const applyVariation = (variation: Record<string, any>) => {
    const current = JSON.parse(parameters);
    const updated = { ...current, ...variation };
    setParameters(JSON.stringify(updated, null, 2));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl p-6 max-w-3xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <TestTube className="h-5 w-5 text-purple-400" />
            <h3 className="text-lg font-semibold">Test {tool.name}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 p-3 bg-slate-800/30 rounded-lg">
          <p className="text-sm text-slate-300 mb-2">{tool.description}</p>
          <p className="text-xs text-slate-500">Usage: {tool.usage}</p>
          {tool.example && (
            <p className="text-xs text-slate-500 mt-1">Example: {tool.example}</p>
          )}
        </div>

        {tool.parameterVariations && tool.parameterVariations.length > 0 && (
          <div className="mb-4">
            <label className="text-sm font-medium text-slate-400 mb-2 block">
              Parameter Presets
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setParameters(JSON.stringify(tool.defaultParameters || {}, null, 2));
                  setSelectedVariation(-1);
                }}
                className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                  selectedVariation === -1
                    ? 'bg-blue-600/20 border border-blue-500/50 text-blue-400'
                    : 'bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50'
                }`}
              >
                Default
              </button>
              {tool.parameterVariations.map((variation, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    applyVariation(variation);
                    setSelectedVariation(idx);
                  }}
                  className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                    selectedVariation === idx
                      ? 'bg-blue-600/20 border border-blue-500/50 text-blue-400'
                      : 'bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50'
                  }`}
                >
                  Variation {idx + 1}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="text-sm font-medium text-slate-400 mb-2 block">
            Parameters (JSON)
          </label>
          <textarea
            value={parameters}
            onChange={(e) => setParameters(e.target.value)}
            className="w-full h-32 px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {testResult && (
          <div className="mb-4 p-3 bg-slate-800/50 rounded-lg">
            <div className="text-sm font-medium text-slate-400 mb-2">Result:</div>
            <pre className="text-xs overflow-x-auto whitespace-pre-wrap text-slate-300">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 rounded-lg transition-colors flex items-center gap-2"
          >
            {testing ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                Testing...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run Test
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const categoryIcons: Record<string, any> = {
  'File Operations': FileText,
  'Web & Search': Globe,
  'Code & Execution': Code,
  'Data Analysis': Calculator,
  'AI Tools': Package,
  'Project Management': Wrench,
  'Documentation': FileText,
  'Testing & Utilities': TestTube,
  'Communication': Info,
  'Deployment & API': Zap
};

const riskColors = {
  low: 'green',
  medium: 'amber',
  high: 'red'
};

interface EnhancedToolCatalogProps {
  selectedTools: string[];
  onToggleTool: (toolName: string) => void;
  enabledTools: Set<string>;
}

export default function EnhancedToolCatalog({ 
  selectedTools, 
  onToggleTool, 
  enabledTools 
}: EnhancedToolCatalogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showDetails, setShowDetails] = useState<string | null>(null);
  const [testingTool, setTestingTool] = useState<ToolDefinition | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['Web & Search', 'File Operations'])
  );

  const filteredTools = getToolsByCategory(selectedCategory).filter(tool => {
    const matchesSearch = 
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.usage.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // Group tools by category
  const groupedTools = filteredTools.reduce((acc, tool) => {
    if (!acc[tool.category]) acc[tool.category] = [];
    acc[tool.category].push(tool);
    return acc;
  }, {} as Record<string, ToolDefinition[]>);

  const recommendedTools = getRecommendedTools(selectedTools);

  const handleTestTool = async (toolName: string, parameters: any) => {
    try {
      const response = await fetch('http://localhost:8000/api/v1/tools/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: toolName,
          parameters
        })
      });
      
      if (response.ok) {
        return await response.json();
      } else {
        throw new Error('Test failed');
      }
    } catch (error: any) {
      return { error: error.message || 'Test failed' };
    }
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Header with Stats */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-blue-400" />
          <h2 className="text-lg font-semibold">Tool Catalog</h2>
          <span className="px-2 py-1 bg-blue-600/20 rounded text-xs text-blue-400">
            {COMPLETE_TOOL_REGISTRY.length} Available
          </span>
          <span className="px-2 py-1 bg-green-600/20 rounded text-xs text-green-400">
            {selectedTools.length} Selected
          </span>
        </div>
        <a
          href="https://github.com/strands-agents/tools"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
        >
          <BookOpen className="h-4 w-4" />
          Documentation
        </a>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search tools by name, description, or usage..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Categories ({COMPLETE_TOOL_REGISTRY.length})</option>
          {TOOL_CATEGORIES.map(cat => {
            const count = getToolsByCategory(cat.id).length;
            return (
              <option key={cat.id} value={cat.id}>
                {cat.icon} {cat.name} ({count})
              </option>
            );
          })}
        </select>
      </div>

      {/* Recommendations */}
      {recommendedTools.length > 0 && (
        <div className="p-3 bg-blue-600/10 border border-blue-500/30 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-medium text-blue-400">Recommended Tools</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {recommendedTools.map(toolName => {
              const tool = getToolByName(toolName);
              if (!tool) return null;
              return (
                <button
                  key={toolName}
                  onClick={() => onToggleTool(toolName)}
                  disabled={!enabledTools.has(toolName)}
                  className="px-3 py-1 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/50 rounded-lg text-sm text-blue-300 transition-colors flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" />
                  {tool.icon} {toolName}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tool Categories with Collapsible Sections */}
      <div className="space-y-3 max-h-[500px] overflow-y-auto">
        {Object.entries(groupedTools).length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-8">
            No matching tools found
          </div>
        ) : (
          Object.entries(groupedTools).map(([category, tools]) => {
            const CategoryIcon = categoryIcons[category] || Wrench;
            const isExpanded = expandedCategories.has(category);
            const categoryInfo = TOOL_CATEGORIES.find(c => c.name === category);
            
            return (
              <div key={category} className="border border-slate-700/50 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full px-4 py-3 bg-slate-800/30 hover:bg-slate-800/50 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <CategoryIcon className="h-4 w-4 text-slate-400" />
                    <span className="font-medium">{category}</span>
                    <span className="text-xs text-slate-500">({tools.length} tools)</span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                </button>
                
                {isExpanded && (
                  <div className="p-3 space-y-2">
                    {categoryInfo?.description && (
                      <p className="text-xs text-slate-500 mb-3">{categoryInfo.description}</p>
                    )}
                    {tools.map(tool => {
                      const isSelected = selectedTools.includes(tool.name);
                      const isEnabled = enabledTools.has(tool.name);
                      const RiskIcon = tool.risk === 'high' ? AlertTriangle : Shield;
                      
                      return (
                        <div
                          key={tool.name}
                          className={`p-3 rounded-lg border transition-all ${
                            isSelected 
                              ? 'bg-blue-600/20 border-blue-500/50' 
                              : 'bg-slate-800/30 hover:bg-slate-800/50 border-slate-700/50'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3 flex-1">
                              <span className="text-lg mt-0.5">{tool.icon}</span>
                              
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-medium text-sm">{tool.name}</h4>
                                  {!isEnabled && (
                                    <span className="px-2 py-0.5 bg-slate-700/50 rounded text-xs text-slate-500">
                                      Disabled
                                    </span>
                                  )}
                                  <div className={`flex items-center gap-1 px-2 py-0.5 bg-${riskColors[tool.risk]}-600/20 rounded`}>
                                    <RiskIcon className={`h-3 w-3 text-${riskColors[tool.risk]}-400`} />
                                    <span className={`text-xs text-${riskColors[tool.risk]}-400`}>
                                      {tool.risk}
                                    </span>
                                  </div>
                                </div>
                                
                                <p className="text-xs text-slate-400 mb-2">{tool.description}</p>
                                
                                {showDetails === tool.name && (
                                  <div className="mt-2 p-2 bg-slate-900/50 rounded-lg space-y-2">
                                    <div>
                                      <span className="text-xs font-medium text-slate-500">Usage:</span>
                                      <p className="text-xs text-slate-400 mt-0.5">{tool.usage}</p>
                                    </div>
                                    {tool.example && (
                                      <div>
                                        <span className="text-xs font-medium text-slate-500">Example:</span>
                                        <p className="text-xs text-slate-400 mt-0.5">{tool.example}</p>
                                      </div>
                                    )}
                                    {tool.dependencies && (
                                      <div>
                                        <span className="text-xs font-medium text-slate-500">Works well with:</span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {tool.dependencies.map(dep => (
                                            <span key={dep} className="px-2 py-0.5 bg-slate-800 rounded text-xs">
                                              {dep}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setShowDetails(showDetails === tool.name ? null : tool.name)}
                                className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors"
                                title="Show details"
                              >
                                <Info className="h-3.5 w-3.5 text-slate-500" />
                              </button>
                              
                              {tool.testable && (
                                <button
                                  onClick={() => setTestingTool(tool)}
                                  className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors"
                                  title="Test tool"
                                >
                                  <TestTube className="h-3.5 w-3.5 text-purple-400" />
                                </button>
                              )}
                              
                              <button
                                onClick={() => onToggleTool(tool.name)}
                                disabled={!isEnabled}
                                className={`p-2 rounded-lg transition-colors ${
                                  isSelected 
                                    ? 'bg-blue-600/30 hover:bg-blue-600/40' 
                                    : isEnabled
                                    ? 'bg-slate-700/50 hover:bg-slate-700'
                                    : 'bg-slate-800/30 cursor-not-allowed opacity-50'
                                }`}
                              >
                                {isSelected ? (
                                  <CheckCircle className="h-4 w-4 text-blue-400" />
                                ) : (
                                  <Plus className="h-4 w-4 text-slate-500" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Tool Presets */}
      <div className="pt-3 border-t border-slate-700/50">
        <div className="text-sm font-medium text-slate-400 mb-3">Quick Presets</div>
        <div className="grid grid-cols-3 gap-2">
          {TOOL_PRESETS.map(preset => (
            <button
              key={preset.name}
              onClick={() => {
                preset.tools.forEach(t => {
                  if (!selectedTools.includes(t) && enabledTools.has(t)) {
                    onToggleTool(t);
                  }
                });
              }}
              className="p-3 bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/50 rounded-lg transition-colors text-left"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{preset.icon}</span>
                <span className="text-sm font-medium">{preset.name}</span>
              </div>
              <p className="text-xs text-slate-500">{preset.description}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {preset.tools.slice(0, 3).map(t => (
                  <span key={t} className="px-1.5 py-0.5 bg-slate-700/50 rounded text-xs text-slate-400">
                    {t}
                  </span>
                ))}
                {preset.tools.length > 3 && (
                  <span className="px-1.5 py-0.5 bg-slate-700/50 rounded text-xs text-slate-400">
                    +{preset.tools.length - 3}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
      
      {/* Test Modal */}
      {testingTool && (
        <TestModal
          tool={testingTool}
          onClose={() => setTestingTool(null)}
          onTest={(params) => handleTestTool(testingTool.name, params)}
        />
      )}
    </div>
  );
}