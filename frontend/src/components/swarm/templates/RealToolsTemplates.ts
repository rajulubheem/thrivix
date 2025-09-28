// Real-world Workflow Templates using actual available tools
// These templates are designed to work with existing strands-agents-tools

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'simple' | 'medium' | 'complex';
  tags: string[];
  requiredTools: string[];  // Tools that must be available
  optionalTools: string[];  // Tools that enhance functionality if available
  machine: {
    name: string;
    initial_state: string;
    states: any[];
    edges: any[];
  };
}

// Map common tool names to strands-agents-tools equivalents
export const TOOL_MAPPING = {
  // File Operations
  'file_reader': 'file_read',
  'file_writer': 'file_write',
  'text_editor': 'editor',

  // System & Shell
  'shell_executor': 'shell',
  'command_runner': 'shell',
  'environment_manager': 'environment',
  'scheduler': 'cron',

  // Web & Network
  'http_client': 'http_request',
  'api_caller': 'http_request',
  'web_browser': 'browser',
  'web_scraper': 'browser',

  // Code Execution
  'code_runner': 'python_repl',
  'python_executor': 'python_repl',
  'code_interpreter': 'code_interpreter',

  // Data Processing
  'calculator': 'calculator',
  'time_service': 'current_time',

  // AI & ML
  'image_generator': 'generate_image',
  'image_analyzer': 'image_reader',
  'speech_synthesizer': 'speak',

  // Memory & Storage
  'memory_store': 'memory',
  'knowledge_base': 'retrieve',

  // Agents & Workflows
  'agent_runner': 'use_agent',
  'workflow_manager': 'workflow',
  'task_manager': 'journal',

  // AWS Services
  'aws_service': 'use_aws',
  's3_storage': 'use_aws',
  'lambda_function': 'use_aws'
};

export const realWorkflowTemplates: WorkflowTemplate[] = [
  // ============== SIMPLE TEMPLATES ==============
  {
    id: 'data-analysis-simple',
    name: 'Data Analysis Pipeline',
    description: 'Read files, process data, and generate reports',
    category: 'simple',
    tags: ['data', 'analysis', 'files'],
    requiredTools: ['file_read', 'python_repl', 'file_write'],
    optionalTools: ['calculator', 'http_request'],
    machine: {
      name: 'Data Analysis Workflow',
      initial_state: 'read_data',
      states: [
        {
          id: 'read_data',
          name: 'Read Data Files',
          type: 'tool_call',
          description: 'Read input data from files',
          tools: ['file_read'],
          transitions: { success: 'process_data' }
        },
        {
          id: 'process_data',
          name: 'Process Data',
          type: 'tool_call',
          description: 'Run Python code to analyze data',
          tools: ['python_repl'],
          transitions: { success: 'calculate_metrics' }
        },
        {
          id: 'calculate_metrics',
          name: 'Calculate Metrics',
          type: 'tool_call',
          description: 'Perform calculations on processed data',
          tools: ['calculator', 'python_repl'],
          transitions: { success: 'save_results' }
        },
        {
          id: 'save_results',
          name: 'Save Results',
          type: 'tool_call',
          description: 'Write results to output file',
          tools: ['file_write'],
          transitions: { success: 'complete' }
        },
        {
          id: 'complete',
          name: 'Complete',
          type: 'final',
          description: 'Analysis complete'
        }
      ],
      edges: [
        { source: 'read_data', target: 'process_data', event: 'success' },
        { source: 'process_data', target: 'calculate_metrics', event: 'success' },
        { source: 'calculate_metrics', target: 'save_results', event: 'success' },
        { source: 'save_results', target: 'complete', event: 'success' }
      ]
    }
  },

  {
    id: 'web-scraping-simple',
    name: 'Web Data Collection',
    description: 'Scrape web data and save to files',
    category: 'simple',
    tags: ['web', 'scraping', 'data'],
    requiredTools: ['http_request', 'file_write'],
    optionalTools: ['browser', 'python_repl'],
    machine: {
      name: 'Web Scraping Workflow',
      initial_state: 'fetch_webpage',
      states: [
        {
          id: 'fetch_webpage',
          name: 'Fetch Webpage',
          type: 'tool_call',
          description: 'Retrieve webpage content',
          tools: ['http_request', 'browser'],
          transitions: { success: 'extract_data' }
        },
        {
          id: 'extract_data',
          name: 'Extract Data',
          type: 'tool_call',
          description: 'Parse and extract relevant data',
          tools: ['python_repl'],
          transitions: { success: 'validate_data' }
        },
        {
          id: 'validate_data',
          name: 'Validate Data',
          type: 'validation',
          description: 'Check data quality and completeness',
          tools: ['python_repl'],
          transitions: {
            validated: 'save_data',
            invalid: 'fetch_webpage'
          }
        },
        {
          id: 'save_data',
          name: 'Save Data',
          type: 'tool_call',
          description: 'Store extracted data',
          tools: ['file_write'],
          transitions: { success: 'complete' }
        },
        {
          id: 'complete',
          name: 'Complete',
          type: 'final',
          description: 'Scraping complete'
        }
      ],
      edges: [
        { source: 'fetch_webpage', target: 'extract_data', event: 'success' },
        { source: 'extract_data', target: 'validate_data', event: 'success' },
        { source: 'validate_data', target: 'save_data', event: 'validated' },
        { source: 'validate_data', target: 'fetch_webpage', event: 'invalid' },
        { source: 'save_data', target: 'complete', event: 'success' }
      ]
    }
  },

  // ============== MEDIUM COMPLEXITY TEMPLATES ==============
  {
    id: 'automated-testing',
    name: 'Automated Testing Pipeline',
    description: 'Run tests, generate reports, and notify results',
    category: 'medium',
    tags: ['testing', 'automation', 'ci/cd'],
    requiredTools: ['shell', 'file_read', 'file_write', 'python_repl'],
    optionalTools: ['http_request', 'slack'],
    machine: {
      name: 'Testing Pipeline',
      initial_state: 'setup_environment',
      states: [
        {
          id: 'setup_environment',
          name: 'Setup Test Environment',
          type: 'tool_call',
          description: 'Prepare testing environment',
          tools: ['shell', 'environment'],
          transitions: { success: 'run_unit_tests' }
        },
        {
          id: 'run_unit_tests',
          name: 'Run Unit Tests',
          type: 'tool_call',
          description: 'Execute unit test suite',
          tools: ['shell', 'python_repl'],
          transitions: {
            success: 'run_integration_tests',
            failure: 'analyze_failures'
          }
        },
        {
          id: 'run_integration_tests',
          name: 'Run Integration Tests',
          type: 'tool_call',
          description: 'Execute integration tests',
          tools: ['shell', 'python_repl'],
          transitions: {
            success: 'generate_coverage',
            failure: 'analyze_failures'
          }
        },
        {
          id: 'analyze_failures',
          name: 'Analyze Test Failures',
          type: 'analysis',
          description: 'Investigate failed tests',
          tools: ['file_read', 'python_repl'],
          transitions: { success: 'generate_report' }
        },
        {
          id: 'generate_coverage',
          name: 'Generate Coverage Report',
          type: 'tool_call',
          description: 'Create code coverage report',
          tools: ['shell', 'python_repl'],
          transitions: { success: 'generate_report' }
        },
        {
          id: 'generate_report',
          name: 'Generate Test Report',
          type: 'transformation',
          description: 'Create comprehensive test report',
          tools: ['python_repl', 'file_write'],
          transitions: { success: 'notify_results' }
        },
        {
          id: 'notify_results',
          name: 'Notify Results',
          type: 'tool_call',
          description: 'Send test results notification',
          tools: ['http_request', 'slack'],
          transitions: { success: 'cleanup' }
        },
        {
          id: 'cleanup',
          name: 'Cleanup',
          type: 'tool_call',
          description: 'Clean up test artifacts',
          tools: ['shell', 'file_write'],
          transitions: { success: 'complete' }
        },
        {
          id: 'complete',
          name: 'Complete',
          type: 'final',
          description: 'Testing complete'
        }
      ],
      edges: [
        { source: 'setup_environment', target: 'run_unit_tests', event: 'success' },
        { source: 'run_unit_tests', target: 'run_integration_tests', event: 'success' },
        { source: 'run_unit_tests', target: 'analyze_failures', event: 'failure' },
        { source: 'run_integration_tests', target: 'generate_coverage', event: 'success' },
        { source: 'run_integration_tests', target: 'analyze_failures', event: 'failure' },
        { source: 'analyze_failures', target: 'generate_report', event: 'success' },
        { source: 'generate_coverage', target: 'generate_report', event: 'success' },
        { source: 'generate_report', target: 'notify_results', event: 'success' },
        { source: 'notify_results', target: 'cleanup', event: 'success' },
        { source: 'cleanup', target: 'complete', event: 'success' }
      ]
    }
  },

  {
    id: 'content-generation',
    name: 'Multi-Modal Content Creation',
    description: 'Generate text, images, and audio content',
    category: 'medium',
    tags: ['content', 'ai', 'multi-modal'],
    requiredTools: ['use_agent', 'generate_image', 'speak'],
    optionalTools: ['file_write', 'http_request'],
    machine: {
      name: 'Content Generation Pipeline',
      initial_state: 'generate_text',
      states: [
        {
          id: 'generate_text',
          name: 'Generate Text Content',
          type: 'tool_call',
          description: 'Create text content using AI',
          tools: ['use_agent', 'python_repl'],
          transitions: { success: 'review_text' }
        },
        {
          id: 'review_text',
          name: 'Review Text',
          type: 'validation',
          description: 'Validate generated text quality',
          tools: ['python_repl'],
          transitions: {
            validated: 'generate_visuals',
            invalid: 'regenerate_text'
          }
        },
        {
          id: 'regenerate_text',
          name: 'Regenerate Text',
          type: 'tool_call',
          description: 'Regenerate text with improvements',
          tools: ['use_agent'],
          transitions: { success: 'review_text' }
        },
        {
          id: 'generate_visuals',
          name: 'Generate Images',
          type: 'parallel',
          description: 'Create visual content',
          tools: ['generate_image'],
          transitions: { success: 'generate_audio' }
        },
        {
          id: 'generate_audio',
          name: 'Generate Audio',
          type: 'tool_call',
          description: 'Convert text to speech',
          tools: ['speak'],
          transitions: { success: 'package_content' }
        },
        {
          id: 'package_content',
          name: 'Package Content',
          type: 'transformation',
          description: 'Combine all generated content',
          tools: ['file_write', 'python_repl'],
          transitions: { success: 'publish' }
        },
        {
          id: 'publish',
          name: 'Publish Content',
          type: 'tool_call',
          description: 'Publish to target platforms',
          tools: ['http_request', 'file_write'],
          transitions: { success: 'complete' }
        },
        {
          id: 'complete',
          name: 'Complete',
          type: 'final',
          description: 'Content generation complete'
        }
      ],
      edges: [
        { source: 'generate_text', target: 'review_text', event: 'success' },
        { source: 'review_text', target: 'generate_visuals', event: 'validated' },
        { source: 'review_text', target: 'regenerate_text', event: 'invalid' },
        { source: 'regenerate_text', target: 'review_text', event: 'success' },
        { source: 'generate_visuals', target: 'generate_audio', event: 'success' },
        { source: 'generate_audio', target: 'package_content', event: 'success' },
        { source: 'package_content', target: 'publish', event: 'success' },
        { source: 'publish', target: 'complete', event: 'success' }
      ]
    }
  },

  // ============== COMPLEX TEMPLATES ==============
  {
    id: 'ml-data-pipeline',
    name: 'ML Data Processing Pipeline',
    description: 'End-to-end data pipeline for machine learning',
    category: 'complex',
    tags: ['ml', 'data', 'pipeline'],
    requiredTools: ['file_read', 'python_repl', 'file_write', 'shell'],
    optionalTools: ['use_aws', 'http_request', 'memory'],
    machine: {
      name: 'ML Data Pipeline',
      initial_state: 'data_ingestion',
      states: [
        {
          id: 'data_ingestion',
          name: 'Ingest Data',
          type: 'parallel',
          description: 'Load data from multiple sources',
          tools: ['file_read', 'http_request', 'use_aws'],
          transitions: { success: 'data_validation' }
        },
        {
          id: 'data_validation',
          name: 'Validate Data',
          type: 'validation',
          description: 'Check data quality and schema',
          tools: ['python_repl'],
          transitions: {
            validated: 'feature_engineering',
            invalid: 'data_cleaning'
          }
        },
        {
          id: 'data_cleaning',
          name: 'Clean Data',
          type: 'tool_call',
          description: 'Handle missing values and outliers',
          tools: ['python_repl'],
          transitions: { success: 'feature_engineering' }
        },
        {
          id: 'feature_engineering',
          name: 'Engineer Features',
          type: 'transformation',
          description: 'Create and transform features',
          tools: ['python_repl'],
          transitions: { success: 'split_data' }
        },
        {
          id: 'split_data',
          name: 'Split Dataset',
          type: 'tool_call',
          description: 'Create train/validation/test sets',
          tools: ['python_repl'],
          transitions: { success: 'train_model' }
        },
        {
          id: 'train_model',
          name: 'Train Model',
          type: 'loop',
          description: 'Train ML model iteratively',
          tools: ['python_repl', 'shell'],
          transitions: { success: 'evaluate_model' }
        },
        {
          id: 'evaluate_model',
          name: 'Evaluate Model',
          type: 'analysis',
          description: 'Assess model performance',
          tools: ['python_repl', 'calculator'],
          transitions: {
            success: 'save_model',
            failure: 'tune_hyperparameters'
          }
        },
        {
          id: 'tune_hyperparameters',
          name: 'Tune Hyperparameters',
          type: 'loop',
          description: 'Optimize model parameters',
          tools: ['python_repl'],
          transitions: { success: 'train_model' }
        },
        {
          id: 'save_model',
          name: 'Save Model',
          type: 'tool_call',
          description: 'Persist trained model',
          tools: ['file_write', 'use_aws'],
          transitions: { success: 'generate_artifacts' }
        },
        {
          id: 'generate_artifacts',
          name: 'Generate Artifacts',
          type: 'parallel',
          description: 'Create reports and visualizations',
          tools: ['python_repl', 'file_write', 'generate_image'],
          transitions: { success: 'deploy_model' }
        },
        {
          id: 'deploy_model',
          name: 'Deploy Model',
          type: 'tool_call',
          description: 'Deploy to production',
          tools: ['shell', 'use_aws', 'http_request'],
          transitions: { success: 'monitor' }
        },
        {
          id: 'monitor',
          name: 'Monitor Performance',
          type: 'loop',
          description: 'Track model in production',
          tools: ['http_request', 'python_repl', 'memory'],
          transitions: {
            normal: 'monitor',
            drift: 'trigger_retrain'
          }
        },
        {
          id: 'trigger_retrain',
          name: 'Trigger Retraining',
          type: 'decision',
          description: 'Decide on retraining',
          transitions: {
            retrain: 'data_ingestion',
            continue: 'monitor'
          }
        }
      ],
      edges: [
        { source: 'data_ingestion', target: 'data_validation', event: 'success' },
        { source: 'data_validation', target: 'feature_engineering', event: 'validated' },
        { source: 'data_validation', target: 'data_cleaning', event: 'invalid' },
        { source: 'data_cleaning', target: 'feature_engineering', event: 'success' },
        { source: 'feature_engineering', target: 'split_data', event: 'success' },
        { source: 'split_data', target: 'train_model', event: 'success' },
        { source: 'train_model', target: 'evaluate_model', event: 'success' },
        { source: 'evaluate_model', target: 'save_model', event: 'success' },
        { source: 'evaluate_model', target: 'tune_hyperparameters', event: 'failure' },
        { source: 'tune_hyperparameters', target: 'train_model', event: 'success' },
        { source: 'save_model', target: 'generate_artifacts', event: 'success' },
        { source: 'generate_artifacts', target: 'deploy_model', event: 'success' },
        { source: 'deploy_model', target: 'monitor', event: 'success' },
        { source: 'monitor', target: 'monitor', event: 'normal' },
        { source: 'monitor', target: 'trigger_retrain', event: 'drift' },
        { source: 'trigger_retrain', target: 'data_ingestion', event: 'retrain' },
        { source: 'trigger_retrain', target: 'monitor', event: 'continue' }
      ]
    }
  },

  {
    id: 'multi-agent-workflow',
    name: 'Multi-Agent Collaboration',
    description: 'Complex workflow with multiple AI agents',
    category: 'complex',
    tags: ['agents', 'collaboration', 'ai'],
    requiredTools: ['use_agent', 'workflow', 'journal', 'memory'],
    optionalTools: ['graph', 'swarm', 'handoff_to_user'],
    machine: {
      name: 'Multi-Agent System',
      initial_state: 'initialize_agents',
      states: [
        {
          id: 'initialize_agents',
          name: 'Initialize Agents',
          type: 'parallel',
          description: 'Set up multiple specialized agents',
          tools: ['use_agent', 'graph'],
          transitions: { success: 'assign_tasks' }
        },
        {
          id: 'assign_tasks',
          name: 'Assign Tasks',
          type: 'tool_call',
          description: 'Distribute tasks to agents',
          tools: ['journal', 'workflow'],
          transitions: { success: 'execute_tasks' }
        },
        {
          id: 'execute_tasks',
          name: 'Execute Tasks',
          type: 'parallel',
          description: 'Agents work on assigned tasks',
          tools: ['use_agent', 'swarm'],
          transitions: { success: 'coordinate_results' }
        },
        {
          id: 'coordinate_results',
          name: 'Coordinate Results',
          type: 'tool_call',
          description: 'Combine agent outputs',
          tools: ['workflow', 'memory'],
          transitions: { success: 'quality_check' }
        },
        {
          id: 'quality_check',
          name: 'Quality Check',
          type: 'validation',
          description: 'Validate combined results',
          tools: ['use_agent', 'python_repl'],
          transitions: {
            approved: 'finalize',
            revision_needed: 'human_review'
          }
        },
        {
          id: 'human_review',
          name: 'Human Review',
          type: 'human',
          description: 'Request human input',
          tools: ['handoff_to_user'],
          transitions: { success: 'revise_work' }
        },
        {
          id: 'revise_work',
          name: 'Revise Work',
          type: 'tool_call',
          description: 'Agents revise based on feedback',
          tools: ['use_agent', 'journal'],
          transitions: { success: 'coordinate_results' }
        },
        {
          id: 'finalize',
          name: 'Finalize Results',
          type: 'transformation',
          description: 'Prepare final output',
          tools: ['workflow', 'file_write'],
          transitions: { success: 'complete' }
        },
        {
          id: 'complete',
          name: 'Complete',
          type: 'final',
          description: 'Multi-agent task complete'
        }
      ],
      edges: [
        { source: 'initialize_agents', target: 'assign_tasks', event: 'success' },
        { source: 'assign_tasks', target: 'execute_tasks', event: 'success' },
        { source: 'execute_tasks', target: 'coordinate_results', event: 'success' },
        { source: 'coordinate_results', target: 'quality_check', event: 'success' },
        { source: 'quality_check', target: 'finalize', event: 'approved' },
        { source: 'quality_check', target: 'human_review', event: 'revision_needed' },
        { source: 'human_review', target: 'revise_work', event: 'success' },
        { source: 'revise_work', target: 'coordinate_results', event: 'success' },
        { source: 'finalize', target: 'complete', event: 'success' }
      ]
    }
  }
];

// Helper function to validate if required tools are available
export const validateTemplateTools = (
  template: WorkflowTemplate,
  availableTools: string[]
): { isValid: boolean; missing: string[]; optional: string[] } => {
  const missing = template.requiredTools.filter(tool => !availableTools.includes(tool));
  const optional = template.optionalTools.filter(tool => !availableTools.includes(tool));

  return {
    isValid: missing.length === 0,
    missing,
    optional
  };
};

// Helper to get suggested tool installations
export const getSuggestedInstalls = (missingTools: string[]): string[] => {
  const installCommands = new Set<string>();

  missingTools.forEach(tool => {
    // Map tools to their package requirements
    if (['file_read', 'file_write', 'editor', 'shell', 'calculator', 'current_time'].includes(tool)) {
      installCommands.add('pip install strands-agents-tools');
    }
    if (['browser'].includes(tool)) {
      installCommands.add('pip install strands-agents-tools[local_chromium_browser]');
    }
    if (['code_interpreter'].includes(tool)) {
      installCommands.add('pip install strands-agents-tools[agent_core_code_interpreter]');
    }
    if (['memory', 'retrieve'].includes(tool)) {
      installCommands.add('pip install strands-agents-tools[mem0_memory]');
    }
    if (['use_agent', 'workflow', 'graph', 'swarm'].includes(tool)) {
      installCommands.add('pip install strands-agents-tools[a2a_client]');
    }
  });

  return Array.from(installCommands);
};