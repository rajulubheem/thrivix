import React, { useState } from 'react';
import { 
  Search, Globe, Code, Database, FileText, Terminal,
  Shield, Clock, Calculator, Package, Wrench, Info,
  CheckCircle, XCircle, AlertTriangle, Zap
} from 'lucide-react';

interface Tool {
  name: string;
  category: string;
  description: string;
  usage: string;
  risk: 'low' | 'medium' | 'high';
  dependencies?: string[];
  example?: string;
}

const toolCatalog: Tool[] = [
  // File Operations
  {
    name: 'file_read',
    category: 'File Operations',
    description: 'Read contents of files from the filesystem',
    usage: 'Use for accessing configuration files, data files, or source code',
    risk: 'low',
    example: 'Reading config.json, analyzing source files'
  },
  {
    name: 'file_write',
    category: 'File Operations',
    description: 'Write or create files on the filesystem',
    usage: 'Use for saving results, creating reports, or generating code',
    risk: 'medium',
    dependencies: ['file_read'],
    example: 'Saving analysis results, creating documentation'
  },
  {
    name: 'editor',
    category: 'File Operations',
    description: 'Advanced file editing with syntax awareness',
    usage: 'Use for modifying code files with proper formatting',
    risk: 'medium',
    dependencies: ['file_read', 'file_write'],
    example: 'Refactoring code, fixing bugs'
  },
  
  // Web & Search
  {
    name: 'tavily_search',
    category: 'Web & Search',
    description: 'Advanced web search using Tavily API',
    usage: 'Use for researching topics, finding documentation, gathering information',
    risk: 'low',
    example: 'Researching best practices, finding API documentation'
  },
  {
    name: 'web_search',
    category: 'Web & Search',
    description: 'General web search across multiple sources',
    usage: 'Use for broad information gathering and fact-checking',
    risk: 'low',
    example: 'Finding tutorials, checking latest updates'
  },
  {
    name: 'http_request',
    category: 'Web & Search',
    description: 'Make HTTP requests to APIs and websites',
    usage: 'Use for API integration, webhook calls, data fetching',
    risk: 'medium',
    example: 'Calling REST APIs, fetching JSON data'
  },
  
  // Code & Execution
  {
    name: 'python_repl',
    category: 'Code & Execution',
    description: 'Execute Python code in a sandboxed environment',
    usage: 'Use for data analysis, calculations, prototyping',
    risk: 'high',
    example: 'Running data analysis scripts, testing algorithms'
  },
  {
    name: 'shell',
    category: 'Code & Execution',
    description: 'Execute shell commands',
    usage: 'Use for system operations, running scripts, process management',
    risk: 'high',
    dependencies: ['python_repl'],
    example: 'Running build scripts, managing processes'
  },
  {
    name: 'calculator',
    category: 'Code & Execution',
    description: 'Perform mathematical calculations',
    usage: 'Use for quick calculations, formula evaluation',
    risk: 'low',
    example: 'Computing statistics, financial calculations'
  },
  
  // System & Data
  {
    name: 'current_time',
    category: 'System & Data',
    description: 'Get current date and time information',
    usage: 'Use for timestamping, scheduling, time-based logic',
    risk: 'low',
    example: 'Adding timestamps to logs, scheduling tasks'
  },
  {
    name: 'environment',
    category: 'System & Data',
    description: 'Access environment variables and system configuration',
    usage: 'Use for configuration management, system integration',
    risk: 'low',
    example: 'Reading API keys, checking system settings'
  },
  {
    name: 'system_info',
    category: 'System & Data',
    description: 'Get detailed system information',
    usage: 'Use for compatibility checks, resource monitoring',
    risk: 'low',
    example: 'Checking OS version, available resources'
  },
  {
    name: 'database',
    category: 'System & Data',
    description: 'Interact with databases',
    usage: 'Use for data persistence, queries, transactions',
    risk: 'high',
    dependencies: ['environment'],
    example: 'Storing results, querying data, managing records'
  },
  
  // Utilities
  {
    name: 'think',
    category: 'Utilities',
    description: 'Internal reasoning and planning tool',
    usage: 'Use for complex problem solving and strategy planning',
    risk: 'low',
    example: 'Breaking down complex tasks, planning approach'
  },
  {
    name: 'batch',
    category: 'Utilities',
    description: 'Execute multiple operations in batch',
    usage: 'Use for bulk operations, parallel processing',
    risk: 'medium',
    example: 'Processing multiple files, bulk API calls'
  },
  {
    name: 'sleep',
    category: 'Utilities',
    description: 'Add delays between operations',
    usage: 'Use for rate limiting, timing control',
    risk: 'low',
    example: 'API rate limiting, sequential operations'
  }
];

const categoryIcons: Record<string, any> = {
  'File Operations': FileText,
  'Web & Search': Globe,
  'Code & Execution': Code,
  'System & Data': Database,
  'Utilities': Wrench
};

const riskColors = {
  low: 'green',
  medium: 'amber',
  high: 'red'
};

interface ToolCatalogProps {
  selectedTools: string[];
  onToggleTool: (toolName: string) => void;
  enabledTools: Set<string>;
}

export default function ToolCatalog({ selectedTools, onToggleTool, enabledTools }: ToolCatalogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<string | null>(null);

  const filteredTools = toolCatalog.filter(tool => {
    const matchesSearch = tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || tool.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = Array.from(new Set(toolCatalog.map(t => t.category)));

  const getRecommendedTools = (currentTools: string[]) => {
    const recommendations = new Set<string>();
    
    currentTools.forEach(toolName => {
      const tool = toolCatalog.find(t => t.name === toolName);
      if (tool?.dependencies) {
        tool.dependencies.forEach(dep => recommendations.add(dep));
      }
    });
    
    // Add complementary tools
    if (currentTools.includes('file_read') && !currentTools.includes('file_write')) {
      recommendations.add('file_write');
    }
    if (currentTools.includes('python_repl') && !currentTools.includes('calculator')) {
      recommendations.add('calculator');
    }
    if (currentTools.includes('web_search') && !currentTools.includes('tavily_search')) {
      recommendations.add('tavily_search');
    }
    
    return Array.from(recommendations).filter(r => !currentTools.includes(r));
  };

  const recommendedTools = getRecommendedTools(selectedTools);

  return (
    <div className="space-y-4">
      {/* Search and Filter */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={selectedCategory || ''}
          onChange={(e) => setSelectedCategory(e.target.value || null)}
          className="px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
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
              const tool = toolCatalog.find(t => t.name === toolName);
              if (!tool) return null;
              return (
                <button
                  key={toolName}
                  onClick={() => onToggleTool(toolName)}
                  className="px-3 py-1 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/50 rounded-lg text-sm text-blue-300 transition-colors"
                >
                  + {toolName}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tool Grid */}
      <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto">
        {filteredTools.map(tool => {
          const CategoryIcon = categoryIcons[tool.category] || Wrench;
          const isSelected = selectedTools.includes(tool.name);
          const isEnabled = enabledTools.has(tool.name);
          const RiskIcon = tool.risk === 'high' ? AlertTriangle : 
                          tool.risk === 'medium' ? AlertTriangle : 
                          Shield;
          
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
                  <div className={`p-2 rounded-lg ${
                    isSelected ? 'bg-blue-600/30' : 'bg-slate-700/50'
                  }`}>
                    <CategoryIcon className="h-4 w-4 text-slate-400" />
                  </div>
                  
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
                          {tool.risk} risk
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
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowDetails(showDetails === tool.name ? null : tool.name)}
                    className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors"
                  >
                    <Info className="h-3.5 w-3.5 text-slate-500" />
                  </button>
                  
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
                      <XCircle className="h-4 w-4 text-slate-500" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tool Presets */}
      <div className="pt-3 border-t border-slate-700/50">
        <div className="text-xs font-medium text-slate-400 mb-2">Quick Presets</div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              ['tavily_search', 'web_search', 'file_write'].forEach(t => {
                if (!selectedTools.includes(t) && enabledTools.has(t)) {
                  onToggleTool(t);
                }
              });
            }}
            className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/50 rounded-lg text-sm text-purple-300 transition-colors"
          >
            🔍 Research Kit
          </button>
          <button
            onClick={() => {
              ['python_repl', 'file_read', 'file_write', 'editor'].forEach(t => {
                if (!selectedTools.includes(t) && enabledTools.has(t)) {
                  onToggleTool(t);
                }
              });
            }}
            className="px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 border border-green-500/50 rounded-lg text-sm text-green-300 transition-colors"
          >
            💻 Development Suite
          </button>
          <button
            onClick={() => {
              ['python_repl', 'calculator', 'database', 'file_write'].forEach(t => {
                if (!selectedTools.includes(t) && enabledTools.has(t)) {
                  onToggleTool(t);
                }
              });
            }}
            className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/50 rounded-lg text-sm text-amber-300 transition-colors"
          >
            📊 Data Analysis Pack
          </button>
        </div>
      </div>
    </div>
  );
}