export interface ToolDefinition {
  name: string;
  category: string;
  capabilities: string[];
  description: string;
  usage: string;
  risk: 'low' | 'medium' | 'high';
  dependencies?: string[];
  example?: string;
  defaultParameters?: Record<string, any>;
  parameterVariations?: Record<string, any>[];
  testable: boolean;
  icon?: string;
}

export const COMPLETE_TOOL_REGISTRY: ToolDefinition[] = [
  // Web Search Tools
  {
    name: 'tavily_search',
    category: 'Web & Search',
    capabilities: ['web_search'],
    description: 'Advanced web search using Tavily API with semantic understanding',
    usage: 'Use for researching topics, finding recent information, gathering data',
    risk: 'low',
    example: 'Search for "latest AI breakthroughs 2024"',
    defaultParameters: {
      query: 'latest AI news',
      search_depth: 'basic',
      max_results: 5,
      include_domains: [],
      exclude_domains: []
    },
    parameterVariations: [
      { search_depth: 'advanced', max_results: 10 },
      { include_domains: ['arxiv.org', 'nature.com'] }
    ],
    testable: true,
    icon: '🔍'
  },
  {
    name: 'web_search',
    category: 'Web & Search',
    capabilities: ['web_search'],
    description: 'General web search across multiple search engines',
    usage: 'Use for broad information gathering and cross-referencing',
    risk: 'low',
    defaultParameters: {
      query: 'example search',
      num_results: 10
    },
    testable: true,
    icon: '🌐'
  },
  {
    name: 'tavily_web_search',
    category: 'Web & Search',
    capabilities: ['web_search'],
    description: 'Alternative Tavily search endpoint with enhanced features',
    usage: 'Use when you need more control over search parameters',
    risk: 'low',
    defaultParameters: {
      query: 'test query',
      max_results: 5
    },
    testable: true,
    icon: '🔎'
  },
  {
    name: 'wikipedia_search',
    category: 'Web & Search',
    capabilities: ['web_search'],
    description: 'Search and retrieve Wikipedia articles',
    usage: 'Use for encyclopedic information and factual data',
    risk: 'low',
    defaultParameters: {
      query: 'artificial intelligence',
      lang: 'en',
      limit: 5
    },
    testable: true,
    icon: '📚'
  },
  {
    name: 'fetch_webpage',
    category: 'Web & Search',
    capabilities: ['web_search'],
    description: 'Fetch and parse content from any webpage',
    usage: 'Use to extract text content from specific URLs',
    risk: 'low',
    defaultParameters: {
      url: 'https://example.com',
      convert_to_markdown: true
    },
    testable: true,
    icon: '📄'
  },
  {
    name: 'extract_links',
    category: 'Web & Search',
    capabilities: ['web_search'],
    description: 'Extract all links from a webpage',
    usage: 'Use for crawling, site mapping, or finding related pages',
    risk: 'low',
    defaultParameters: {
      url: 'https://example.com',
      filter_pattern: ''
    },
    testable: true,
    icon: '🔗'
  },
  {
    name: 'rss_fetch',
    category: 'Web & Search',
    capabilities: ['web_search'],
    description: 'Fetch and parse RSS/Atom feeds',
    usage: 'Use for monitoring news feeds, blogs, and updates',
    risk: 'low',
    defaultParameters: {
      url: 'https://example.com/feed.xml',
      max_items: 10
    },
    testable: true,
    icon: '📰'
  },
  {
    name: 'sitemap_fetch',
    category: 'Web & Search',
    capabilities: ['web_search'],
    description: 'Parse and analyze website sitemaps',
    usage: 'Use for understanding site structure and finding all pages',
    risk: 'low',
    defaultParameters: {
      url: 'https://example.com/sitemap.xml'
    },
    testable: true,
    icon: '🗺️'
  },
  {
    name: 'http_request',
    category: 'Web & Search',
    capabilities: ['web_search'],
    description: 'Make HTTP requests to APIs and websites',
    usage: 'Use for API integration, webhooks, and data fetching',
    risk: 'medium',
    defaultParameters: {
      method: 'GET',
      url: 'https://api.github.com/users/github',
      headers: {},
      body: null,
      params: {},
      timeout: 30,
      convert_to_markdown: false
    },
    parameterVariations: [
      { method: 'POST', body: { key: 'value' } },
      { headers: { 'Authorization': 'Bearer token' } }
    ],
    testable: true,
    icon: '🌍'
  },
  {
    name: 'tavily_map',
    category: 'Web & Search',
    capabilities: ['web_search'],
    description: 'Generate location-based search results with maps',
    usage: 'Use for location-specific searches and geographic data',
    risk: 'low',
    defaultParameters: {
      query: 'restaurants near me',
      location: 'San Francisco, CA'
    },
    testable: true,
    icon: '🗺️'
  },
  {
    name: 'tavily_extract',
    category: 'Web & Search',
    capabilities: ['web_search'],
    description: 'Extract structured data from search results',
    usage: 'Use for data mining and information extraction',
    risk: 'low',
    defaultParameters: {
      query: 'company information',
      extract_fields: ['name', 'revenue', 'employees']
    },
    testable: true,
    icon: '📊'
  },
  {
    name: 'tavily_crawl',
    category: 'Web & Search',
    capabilities: ['web_search'],
    description: 'Deep crawl websites for comprehensive data',
    usage: 'Use for in-depth website analysis and content extraction',
    risk: 'medium',
    defaultParameters: {
      url: 'https://example.com',
      max_depth: 2,
      max_pages: 10
    },
    testable: true,
    icon: '🕷️'
  },

  // File Operations
  {
    name: 'file_write',
    category: 'File Operations',
    capabilities: ['file_operations', 'code_generation'],
    description: 'Write or create files on the filesystem',
    usage: 'Use for saving results, creating reports, generating code',
    risk: 'medium',
    dependencies: ['file_read'],
    defaultParameters: {
      path: '/tmp/example.txt',
      content: 'Hello World!\nThis is a test file.',
      mode: 'write',
      encoding: 'utf-8',
      create_dirs: true
    },
    parameterVariations: [
      { mode: 'append', content: '\nAdditional content' },
      { path: '/tmp/data.json', content: '{"key": "value"}' }
    ],
    testable: true,
    icon: '💾'
  },
  {
    name: 'file_read',
    category: 'File Operations',
    capabilities: ['file_operations'],
    description: 'Read contents of files from the filesystem',
    usage: 'Use for loading data, reading configs, analyzing code',
    risk: 'low',
    defaultParameters: {
      path: '/tmp/example.txt',
      encoding: 'utf-8'
    },
    testable: true,
    icon: '📖'
  },
  {
    name: 'list_files',
    category: 'File Operations',
    capabilities: ['file_operations'],
    description: 'List files and directories',
    usage: 'Use for exploring directory structure and finding files',
    risk: 'low',
    defaultParameters: {
      path: '/tmp',
      recursive: false,
      pattern: '*'
    },
    testable: true,
    icon: '📁'
  },
  {
    name: 'delete_file',
    category: 'File Operations',
    capabilities: ['file_operations'],
    description: 'Delete files or directories',
    usage: 'Use for cleanup and file management',
    risk: 'high',
    defaultParameters: {
      path: '/tmp/example.txt',
      recursive: false
    },
    testable: true,
    icon: '🗑️'
  },

  // Code Execution
  {
    name: 'python_repl',
    category: 'Code & Execution',
    capabilities: ['code_execution'],
    description: 'Execute Python code in a sandboxed environment',
    usage: 'Use for data analysis, calculations, prototyping, algorithms',
    risk: 'high',
    defaultParameters: {
      code: 'print("Hello, World!")\nresult = 2 + 2\nprint(f"2 + 2 = {result}")'
    },
    parameterVariations: [
      { code: 'import math\nprint(math.sqrt(16))' },
      { code: 'import pandas as pd\ndf = pd.DataFrame({"A": [1,2,3]})\nprint(df)' }
    ],
    testable: true,
    icon: '🐍'
  },
  {
    name: 'shell',
    category: 'Code & Execution',
    capabilities: ['code_execution'],
    description: 'Execute shell commands',
    usage: 'Use for system operations, file management, process control',
    risk: 'high',
    defaultParameters: {
      command: 'echo "Hello from shell"'
    },
    parameterVariations: [
      { command: 'ls -la /tmp' },
      { command: 'ps aux | head -5' }
    ],
    testable: true,
    icon: '💻'
  },
  {
    name: 'code_interpreter',
    category: 'Code & Execution',
    capabilities: ['code_execution'],
    description: 'Advanced code execution with multiple language support',
    usage: 'Use for complex code execution across different languages',
    risk: 'high',
    defaultParameters: {
      language: 'python',
      code: 'print("Hello")',
      timeout: 30
    },
    testable: true,
    icon: '🖥️'
  },
  {
    name: 'code_generator',
    category: 'Code & Execution',
    capabilities: ['code_generation'],
    description: 'Generate code snippets and boilerplate',
    usage: 'Use for creating code templates and scaffolding',
    risk: 'low',
    defaultParameters: {
      language: 'python',
      description: 'function to calculate fibonacci',
      style: 'clean'
    },
    testable: true,
    icon: '⚙️'
  },

  // Data Analysis
  {
    name: 'calculator',
    category: 'Data Analysis',
    capabilities: ['data_analysis'],
    description: 'Perform mathematical calculations and expressions',
    usage: 'Use for quick math, formula evaluation, numerical analysis',
    risk: 'low',
    defaultParameters: {
      expression: '2 * sin(pi/4) + sqrt(16)',
      mode: 'evaluate',
      precision: 10
    },
    parameterVariations: [
      { mode: 'simplify', expression: 'x^2 + 2*x + 1' },
      { mode: 'solve', expression: 'x^2 - 4 = 0' }
    ],
    testable: true,
    icon: '🧮'
  },
  {
    name: 'json_parse',
    category: 'Data Analysis',
    capabilities: ['data_analysis'],
    description: 'Parse and manipulate JSON data',
    usage: 'Use for working with APIs, config files, structured data',
    risk: 'low',
    defaultParameters: {
      data: '{"key": "value"}',
      path: '$.key',
      operation: 'get'
    },
    testable: true,
    icon: '📋'
  },
  {
    name: 'csv_preview',
    category: 'Data Analysis',
    capabilities: ['data_analysis'],
    description: 'Preview and analyze CSV data',
    usage: 'Use for data exploration, statistics, and validation',
    risk: 'low',
    defaultParameters: {
      path: '/tmp/data.csv',
      rows: 10,
      stats: true
    },
    testable: true,
    icon: '📊'
  },
  {
    name: 'retrieve',
    category: 'Data Analysis',
    capabilities: ['data_analysis', 'ai_tools'],
    description: 'Retrieve and search through stored data',
    usage: 'Use for semantic search and information retrieval',
    risk: 'low',
    defaultParameters: {
      query: 'search term',
      index: 'default',
      limit: 10
    },
    testable: true,
    icon: '🔍'
  },

  // AI Tools
  {
    name: 'think',
    category: 'AI Tools',
    capabilities: ['ai_tools'],
    description: 'Internal reasoning and planning tool',
    usage: 'Use for complex problem solving, breaking down tasks',
    risk: 'low',
    defaultParameters: {
      prompt: 'How should I approach this problem?',
      steps: true
    },
    testable: true,
    icon: '🤔'
  },
  {
    name: 'memory',
    category: 'AI Tools',
    capabilities: ['ai_tools'],
    description: 'Store and retrieve conversation context',
    usage: 'Use for maintaining context across interactions',
    risk: 'low',
    defaultParameters: {
      action: 'store',
      key: 'important_fact',
      value: 'User prefers Python'
    },
    parameterVariations: [
      { action: 'retrieve', key: 'important_fact' },
      { action: 'list' }
    ],
    testable: true,
    icon: '🧠'
  },
  {
    name: 'use_llm',
    category: 'AI Tools',
    capabilities: ['ai_tools'],
    description: 'Call another LLM for specific tasks',
    usage: 'Use for specialized AI tasks or different model capabilities',
    risk: 'medium',
    defaultParameters: {
      prompt: 'Summarize this text',
      model: 'gpt-3.5-turbo',
      temperature: 0.7
    },
    testable: true,
    icon: '🤖'
  },
  {
    name: 'agent_core_memory',
    category: 'AI Tools',
    capabilities: ['ai_tools'],
    description: 'Manage agent core memory and knowledge',
    usage: 'Use for persistent agent memory management',
    risk: 'low',
    defaultParameters: {
      action: 'update',
      memory_type: 'facts',
      content: 'New information'
    },
    testable: true,
    icon: '💭'
  },

  // Project Management
  {
    name: 'task_planner',
    category: 'Project Management',
    capabilities: ['project_management'],
    description: 'Create and manage task plans',
    usage: 'Use for breaking down complex projects into tasks',
    risk: 'low',
    defaultParameters: {
      action: 'create',
      title: 'New Task',
      description: 'Task details',
      priority: 'medium'
    },
    testable: true,
    icon: '📝'
  },
  {
    name: 'agent_todo',
    category: 'Project Management',
    capabilities: ['project_management'],
    description: 'Manage agent todo lists',
    usage: 'Use for tracking agent tasks and progress',
    risk: 'low',
    defaultParameters: {
      action: 'add',
      task: 'Complete analysis',
      due_date: '2024-12-31'
    },
    testable: true,
    icon: '✅'
  },
  {
    name: 'agent_as_tool',
    category: 'Project Management',
    capabilities: ['project_management'],
    description: 'Use another agent as a tool',
    usage: 'Use for delegating specialized tasks to other agents',
    risk: 'medium',
    defaultParameters: {
      agent_name: 'researcher',
      task: 'Find information about...'
    },
    testable: true,
    icon: '👥'
  },
  {
    name: 'agent',
    category: 'Project Management',
    capabilities: ['project_management'],
    description: 'Create and manage sub-agents',
    usage: 'Use for complex multi-agent workflows',
    risk: 'medium',
    defaultParameters: {
      name: 'helper',
      role: 'assistant',
      task: 'Help with...'
    },
    testable: true,
    icon: '🤝'
  },
  {
    name: 'swarm',
    category: 'Project Management',
    capabilities: ['project_management'],
    description: 'Orchestrate multiple agents as a swarm',
    usage: 'Use for complex collaborative agent tasks',
    risk: 'high',
    defaultParameters: {
      agents: ['researcher', 'analyst'],
      task: 'Complex project',
      mode: 'parallel'
    },
    testable: true,
    icon: '🐝'
  },

  // Documentation
  {
    name: 'journal',
    category: 'Documentation',
    capabilities: ['documentation'],
    description: 'Write and manage journal entries',
    usage: 'Use for logging progress, insights, and notes',
    risk: 'low',
    defaultParameters: {
      action: 'write',
      content: 'Today I learned...',
      tags: ['learning', 'progress']
    },
    parameterVariations: [
      { action: 'read', entry_id: 'latest' },
      { action: 'search', query: 'important' }
    ],
    testable: true,
    icon: '📔'
  },
  {
    name: 'diagram',
    category: 'Documentation',
    capabilities: ['documentation'],
    description: 'Create diagrams and visualizations',
    usage: 'Use for creating flowcharts, architecture diagrams',
    risk: 'low',
    defaultParameters: {
      type: 'flowchart',
      title: 'Process Flow',
      nodes: ['Start', 'Process', 'End'],
      edges: [['Start', 'Process'], ['Process', 'End']]
    },
    testable: true,
    icon: '📈'
  },
  {
    name: 'agent_graph',
    category: 'Documentation',
    capabilities: ['documentation'],
    description: 'Visualize agent relationships and workflows',
    usage: 'Use for understanding agent interactions',
    risk: 'low',
    defaultParameters: {
      agents: ['agent1', 'agent2'],
      show_tools: true
    },
    testable: true,
    icon: '🕸️'
  },

  // Testing & Utilities
  {
    name: 'current_time',
    category: 'Testing & Utilities',
    capabilities: ['testing'],
    description: 'Get current date and time',
    usage: 'Use for timestamps, scheduling, time-based logic',
    risk: 'low',
    defaultParameters: {
      timezone: 'US/Pacific',
      format: 'iso'
    },
    parameterVariations: [
      { format: 'unix' },
      { timezone: 'UTC', format: 'human' }
    ],
    testable: true,
    icon: '🕐'
  },
  {
    name: 'sleep',
    category: 'Testing & Utilities',
    capabilities: ['testing'],
    description: 'Pause execution for specified time',
    usage: 'Use for rate limiting, timing control, delays',
    risk: 'low',
    defaultParameters: {
      seconds: 2
    },
    testable: true,
    icon: '⏱️'
  },
  {
    name: 'environment',
    category: 'Testing & Utilities',
    capabilities: ['testing'],
    description: 'Manage environment variables',
    usage: 'Use for configuration, secrets management',
    risk: 'low',
    defaultParameters: {
      action: 'list',
      prefix: '',
      mask_sensitive: true
    },
    parameterVariations: [
      { action: 'get', name: 'PATH' },
      { action: 'set', name: 'MY_VAR', value: 'my_value' }
    ],
    testable: true,
    icon: '🔧'
  },
  {
    name: 'system_info',
    category: 'Testing & Utilities',
    capabilities: ['testing'],
    description: 'Get system information',
    usage: 'Use for compatibility checks, resource monitoring',
    risk: 'low',
    defaultParameters: {
      category: 'all'
    },
    parameterVariations: [
      { category: 'os' },
      { category: 'cpu' },
      { category: 'memory' }
    ],
    testable: true,
    icon: '💻'
  },
  {
    name: 'load_tool',
    category: 'Testing & Utilities',
    capabilities: ['testing'],
    description: 'Dynamically load tools',
    usage: 'Use for loading custom or optional tools',
    risk: 'medium',
    defaultParameters: {
      tool_name: 'custom_tool',
      source: 'local'
    },
    testable: true,
    icon: '🔌'
  },

  // Communication
  {
    name: 'handoff_to_user',
    category: 'Communication',
    capabilities: ['communication'],
    description: 'Hand control back to user for input',
    usage: 'Use when user intervention or decision is needed',
    risk: 'low',
    defaultParameters: {
      message: 'Please review and confirm to proceed.',
      breakout_of_loop: false
    },
    testable: true,
    icon: '🤝'
  },

  // Deployment & API
  {
    name: 'use_aws',
    category: 'Deployment & API',
    capabilities: ['deployment', 'api_interaction'],
    description: 'Interact with AWS services',
    usage: 'Use for cloud operations, deployments, AWS resource management',
    risk: 'high',
    defaultParameters: {
      service: 's3',
      action: 'list_buckets',
      params: {}
    },
    parameterVariations: [
      { service: 'ec2', action: 'describe_instances' },
      { service: 'lambda', action: 'list_functions' }
    ],
    testable: true,
    icon: '☁️'
  }
];

// Tool categories with descriptions
export const TOOL_CATEGORIES = [
  { 
    id: 'web_search', 
    name: 'Web & Search', 
    icon: '🌐',
    description: 'Tools for web searching, crawling, and data extraction'
  },
  { 
    id: 'file_operations', 
    name: 'File Operations', 
    icon: '📁',
    description: 'Tools for reading, writing, and managing files'
  },
  { 
    id: 'code_execution', 
    name: 'Code & Execution', 
    icon: '💻',
    description: 'Tools for running code and scripts'
  },
  { 
    id: 'data_analysis', 
    name: 'Data Analysis', 
    icon: '📊',
    description: 'Tools for data processing and analysis'
  },
  { 
    id: 'ai_tools', 
    name: 'AI Tools', 
    icon: '🤖',
    description: 'AI-powered tools for reasoning and memory'
  },
  { 
    id: 'project_management', 
    name: 'Project Management', 
    icon: '📋',
    description: 'Tools for managing tasks and agents'
  },
  { 
    id: 'documentation', 
    name: 'Documentation', 
    icon: '📝',
    description: 'Tools for creating documentation and diagrams'
  },
  { 
    id: 'testing', 
    name: 'Testing & Utilities', 
    icon: '🧪',
    description: 'Testing, system, and utility tools'
  },
  { 
    id: 'communication', 
    name: 'Communication', 
    icon: '💬',
    description: 'Tools for user interaction'
  },
  { 
    id: 'deployment', 
    name: 'Deployment & API', 
    icon: '🚀',
    description: 'Tools for deployment and API interactions'
  }
];

// Tool presets for common workflows
export const TOOL_PRESETS = [
  {
    name: 'Research Kit',
    icon: '🔍',
    description: 'Essential tools for research tasks',
    tools: ['tavily_search', 'web_search', 'wikipedia_search', 'file_write', 'journal']
  },
  {
    name: 'Development Suite',
    icon: '💻',
    description: 'Complete development environment',
    tools: ['python_repl', 'file_read', 'file_write', 'shell', 'code_generator', 'system_info']
  },
  {
    name: 'Data Analysis Pack',
    icon: '📊',
    description: 'Tools for data processing and analysis',
    tools: ['python_repl', 'calculator', 'csv_preview', 'json_parse', 'file_read', 'file_write']
  },
  {
    name: 'Web Scraping Kit',
    icon: '🕷️',
    description: 'Tools for web scraping and crawling',
    tools: ['fetch_webpage', 'extract_links', 'tavily_crawl', 'sitemap_fetch', 'file_write']
  },
  {
    name: 'Agent Orchestration',
    icon: '🐝',
    description: 'Tools for multi-agent workflows',
    tools: ['agent', 'agent_as_tool', 'swarm', 'task_planner', 'agent_todo', 'agent_graph']
  },
  {
    name: 'Documentation Suite',
    icon: '📚',
    description: 'Tools for creating documentation',
    tools: ['journal', 'diagram', 'file_write', 'agent_graph', 'memory']
  }
];

// Helper function to get tools by category
export function getToolsByCategory(category: string): ToolDefinition[] {
  if (category === 'all') return COMPLETE_TOOL_REGISTRY;
  return COMPLETE_TOOL_REGISTRY.filter(tool => 
    tool.category === category || tool.capabilities.includes(category.toLowerCase())
  );
}

// Helper function to get tool by name
export function getToolByName(name: string): ToolDefinition | undefined {
  return COMPLETE_TOOL_REGISTRY.find(tool => tool.name === name);
}

// Helper function to get recommended tools
export function getRecommendedTools(selectedTools: string[]): string[] {
  const recommendations = new Set<string>();
  
  selectedTools.forEach(toolName => {
    const tool = getToolByName(toolName);
    if (tool?.dependencies) {
      tool.dependencies.forEach(dep => recommendations.add(dep));
    }
  });
  
  // Add complementary tools based on patterns
  if (selectedTools.includes('file_read') && !selectedTools.includes('file_write')) {
    recommendations.add('file_write');
  }
  if (selectedTools.includes('python_repl') && !selectedTools.includes('calculator')) {
    recommendations.add('calculator');
  }
  if (selectedTools.includes('tavily_search') && !selectedTools.includes('file_write')) {
    recommendations.add('file_write');
  }
  if (selectedTools.includes('csv_preview') && !selectedTools.includes('python_repl')) {
    recommendations.add('python_repl');
  }
  
  return Array.from(recommendations).filter(r => !selectedTools.includes(r));
}