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
  // ============== SPEC TO TEST CASE GENERATOR ==============
  {
    id: 'spec-to-test-generator',
    name: 'Spec Document to Test Cases',
    description: 'Upload any specification document and automatically generate comprehensive test cases, edge cases, and QA strategy',
    category: 'medium',
    tags: ['qa', 'testing', 'specification', 'test-cases', 'analysis'],
    requiredTools: ['file_read', 'tavily_search', 'python_repl', 'file_write'],
    optionalTools: ['calculator'],
    machine: {
      name: 'Specification to Test Cases Generator',
      initial_state: 'load_specification',
      states: [
        {
          id: 'load_specification',
          name: 'Load Specification Document',
          type: 'tool_call',
          description: 'Read the specification document (PDF, Word, or text)',
          agent_role: 'Document Reader',
          tools: ['file_read'],
          parameters: {
            path: "{{ user_input: Enter path to specification document }}"
          },
          transitions: { success: 'analyze_specification' }
        },
        {
          id: 'analyze_specification',
          name: 'Analyze Specification',
          type: 'analysis',
          description: 'Extract features, requirements, user flows, and acceptance criteria',
          agent_role: 'Specification Analyst',
          tools: [],
          transitions: { success: 'identify_test_areas' }
        },
        {
          id: 'identify_test_areas',
          name: 'Identify Test Areas',
          type: 'transformation',
          description: 'Break down spec into testable components and modules',
          agent_role: 'Test Architect',
          tools: ['python_repl'],
          transitions: { success: 'research_best_practices' }
        },
        {
          id: 'research_best_practices',
          name: 'Research Testing Standards',
          type: 'tool_call',
          description: 'Search for industry best practices for similar features',
          agent_role: 'QA Research Expert',
          tools: ['tavily_search'],
          transitions: { success: 'parallel_test_generation' }
        },
        {
          id: 'parallel_test_generation',
          name: 'Generate Test Cases in Parallel',
          type: 'parallel',
          description: 'Create different types of test cases simultaneously',
          agent_role: 'Test Generation Coordinator',
          tools: [],
          transitions: { all_completed: 'consolidate_test_cases' }
        },
        {
          id: 'positive_test_cases',
          name: 'Generate Positive Test Cases',
          type: 'transformation',
          description: 'Create happy path and successful scenario tests',
          agent_role: 'Positive Test Designer',
          tools: ['python_repl'],
          transitions: { success: 'return' }
        },
        {
          id: 'negative_test_cases',
          name: 'Generate Negative Test Cases',
          type: 'transformation',
          description: 'Create error handling and failure scenario tests',
          agent_role: 'Negative Test Designer',
          tools: ['python_repl'],
          transitions: { success: 'return' }
        },
        {
          id: 'edge_cases',
          name: 'Generate Edge Cases',
          type: 'transformation',
          description: 'Identify boundary conditions and corner cases',
          agent_role: 'Edge Case Specialist',
          tools: ['python_repl'],
          transitions: { success: 'return' }
        },
        {
          id: 'security_test_cases',
          name: 'Generate Security Tests',
          type: 'tool_call',
          description: 'Create security and vulnerability test cases',
          agent_role: 'Security Test Expert',
          tools: ['tavily_search', 'python_repl'],
          transitions: { success: 'return' }
        },
        {
          id: 'performance_test_cases',
          name: 'Generate Performance Tests',
          type: 'transformation',
          description: 'Create load, stress, and scalability test scenarios',
          agent_role: 'Performance Test Expert',
          tools: ['python_repl'],
          transitions: { success: 'return' }
        },
        {
          id: 'consolidate_test_cases',
          name: 'Consolidate All Test Cases',
          type: 'aggregation',
          description: 'Merge and organize all generated test cases',
          agent_role: 'Test Case Organizer',
          tools: ['python_repl'],
          transitions: { success: 'prioritize_tests' }
        },
        {
          id: 'prioritize_tests',
          name: 'Prioritize Test Cases',
          type: 'analysis',
          description: 'Rank test cases by criticality and risk',
          agent_role: 'Test Priority Analyst',
          tools: ['python_repl', 'calculator'],
          transitions: { success: 'generate_test_data' }
        },
        {
          id: 'generate_test_data',
          name: 'Generate Test Data',
          type: 'tool_call',
          description: 'Create sample data for each test case',
          agent_role: 'Test Data Generator',
          tools: ['python_repl'],
          transitions: { success: 'create_test_matrix' }
        },
        {
          id: 'create_test_matrix',
          name: 'Create Test Coverage Matrix',
          type: 'transformation',
          description: 'Map test cases to requirements for traceability',
          agent_role: 'Coverage Analyst',
          tools: ['python_repl'],
          transitions: { success: 'estimate_effort' }
        },
        {
          id: 'estimate_effort',
          name: 'Estimate Testing Effort',
          type: 'analysis',
          description: 'Calculate time and resources needed for testing',
          agent_role: 'Effort Estimation Expert',
          tools: ['calculator', 'python_repl'],
          transitions: { success: 'generate_suggestions' }
        },
        {
          id: 'generate_suggestions',
          name: 'Generate QA Recommendations',
          type: 'transformation',
          description: 'Create actionable suggestions for QA strategy',
          agent_role: 'QA Strategy Advisor',
          tools: ['python_repl'],
          transitions: { success: 'create_outputs' }
        },
        {
          id: 'create_outputs',
          name: 'Create Test Deliverables',
          type: 'parallel',
          description: 'Generate all test documentation in parallel',
          agent_role: 'Documentation Manager',
          tools: [],
          transitions: { all_completed: 'review_and_finalize' }
        },
        {
          id: 'test_plan_document',
          name: 'Generate Test Plan',
          type: 'tool_call',
          description: 'Create comprehensive test plan document',
          agent_role: 'Test Plan Writer',
          tools: ['python_repl', 'file_write'],
          transitions: { success: 'return' }
        },
        {
          id: 'test_cases_excel',
          name: 'Generate Test Cases Excel',
          type: 'tool_call',
          description: 'Create Excel sheet with all test cases',
          agent_role: 'Excel Generator',
          tools: ['python_repl', 'file_write'],
          transitions: { success: 'return' }
        },
        {
          id: 'test_scripts',
          name: 'Generate Automation Scripts',
          type: 'tool_call',
          description: 'Create sample automation test scripts',
          agent_role: 'Automation Script Writer',
          tools: ['python_repl', 'file_write'],
          transitions: { success: 'return' }
        },
        {
          id: 'risk_analysis',
          name: 'Generate Risk Analysis',
          type: 'tool_call',
          description: 'Create risk assessment document',
          agent_role: 'Risk Analyst',
          tools: ['python_repl', 'file_write'],
          transitions: { success: 'return' }
        },
        {
          id: 'review_and_finalize',
          name: 'Review and Finalize',
          type: 'validation',
          description: 'Final review of all generated test artifacts',
          agent_role: 'QA Reviewer',
          tools: ['python_repl'],
          transitions: {
            validated: 'complete',
            invalid: 'manual_review'
          }
        },
        {
          id: 'manual_review',
          name: 'Manual Review Required',
          type: 'human',
          description: 'QA expert reviews and approves test cases',
          agent_role: 'QA Lead',
          transitions: { success: 'complete' }
        },
        {
          id: 'complete',
          name: 'Test Generation Complete',
          type: 'final',
          description: 'All test cases and documentation generated successfully',
          tools: ['file_write']
        }
      ],
      edges: [
        { source: 'load_specification', target: 'analyze_specification', event: 'success' },
        { source: 'analyze_specification', target: 'identify_test_areas', event: 'success' },
        { source: 'identify_test_areas', target: 'research_best_practices', event: 'success' },
        { source: 'research_best_practices', target: 'parallel_test_generation', event: 'success' },
        { source: 'parallel_test_generation', target: 'consolidate_test_cases', event: 'all_completed' },
        { source: 'positive_test_cases', target: 'return', event: 'success' },
        { source: 'negative_test_cases', target: 'return', event: 'success' },
        { source: 'edge_cases', target: 'return', event: 'success' },
        { source: 'security_test_cases', target: 'return', event: 'success' },
        { source: 'performance_test_cases', target: 'return', event: 'success' },
        { source: 'consolidate_test_cases', target: 'prioritize_tests', event: 'success' },
        { source: 'prioritize_tests', target: 'generate_test_data', event: 'success' },
        { source: 'generate_test_data', target: 'create_test_matrix', event: 'success' },
        { source: 'create_test_matrix', target: 'estimate_effort', event: 'success' },
        { source: 'estimate_effort', target: 'generate_suggestions', event: 'success' },
        { source: 'generate_suggestions', target: 'create_outputs', event: 'success' },
        { source: 'create_outputs', target: 'review_and_finalize', event: 'all_completed' },
        { source: 'test_plan_document', target: 'return', event: 'success' },
        { source: 'test_cases_excel', target: 'return', event: 'success' },
        { source: 'test_scripts', target: 'return', event: 'success' },
        { source: 'risk_analysis', target: 'return', event: 'success' },
        { source: 'review_and_finalize', target: 'complete', event: 'validated' },
        { source: 'review_and_finalize', target: 'manual_review', event: 'invalid' },
        { source: 'manual_review', target: 'complete', event: 'success' }
      ]
    }
  },

  // Previous complex template
  {
    id: 'qa-test-lifecycle-automation',
    name: 'Complete QA Test Lifecycle Automation',
    description: 'Automate entire QA process: from requirements analysis to test execution and reporting',
    category: 'complex',
    tags: ['qa', 'testing', 'automation', 'quality', 'regression'],
    requiredTools: ['tavily_search', 'file_read', 'file_write', 'python_repl'],
    optionalTools: ['calculator', 'current_time', 'http_request'],
    machine: {
      name: 'QA Test Lifecycle Automation',
      initial_state: 'requirements_analysis',
      states: [
        {
          id: 'requirements_analysis',
          name: 'Analyze Requirements',
          type: 'analysis',
          description: 'Extract testable requirements from documentation and user stories',
          agent_role: 'QA Requirements Analyst',
          tools: ['file_read'],
          transitions: { success: 'research_best_practices' }
        },
        {
          id: 'research_best_practices',
          name: 'Research Testing Best Practices',
          type: 'tool_call',
          description: 'Search for latest testing strategies and industry standards',
          agent_role: 'QA Research Specialist',
          tools: ['tavily_search'],
          transitions: { success: 'parallel_test_planning' }
        },
        {
          id: 'parallel_test_planning',
          name: 'Parallel Test Planning',
          type: 'parallel',
          description: 'Create comprehensive test plans across multiple testing types',
          agent_role: 'Test Planning Coordinator',
          tools: [],
          transitions: { all_completed: 'consolidate_test_plans' }
        },
        {
          id: 'functional_test_design',
          name: 'Design Functional Tests',
          type: 'transformation',
          description: 'Create functional test cases with expected results',
          agent_role: 'Functional Test Designer',
          tools: ['python_repl'],
          transitions: { success: 'return' }
        },
        {
          id: 'performance_test_design',
          name: 'Design Performance Tests',
          type: 'transformation',
          description: 'Create load, stress, and scalability test scenarios',
          agent_role: 'Performance Test Engineer',
          tools: ['python_repl', 'calculator'],
          transitions: { success: 'return' }
        },
        {
          id: 'security_test_design',
          name: 'Design Security Tests',
          type: 'tool_call',
          description: 'Research and create security vulnerability test cases',
          agent_role: 'Security Test Specialist',
          tools: ['tavily_search', 'python_repl'],
          transitions: { success: 'return' }
        },
        {
          id: 'api_test_design',
          name: 'Design API Tests',
          type: 'transformation',
          description: 'Create API endpoint test cases and validation rules',
          agent_role: 'API Test Engineer',
          tools: ['python_repl', 'http_request'],
          transitions: { success: 'return' }
        },
        {
          id: 'ui_test_design',
          name: 'Design UI/UX Tests',
          type: 'transformation',
          description: 'Create user interface and experience test scenarios',
          agent_role: 'UI Test Designer',
          tools: ['python_repl'],
          transitions: { success: 'return' }
        },
        {
          id: 'consolidate_test_plans',
          name: 'Consolidate Test Plans',
          type: 'aggregation',
          description: 'Merge all test plans into comprehensive test suite',
          agent_role: 'Test Suite Architect',
          tools: ['python_repl', 'file_write'],
          transitions: { success: 'risk_assessment' }
        },
        {
          id: 'risk_assessment',
          name: 'Assess Testing Risks',
          type: 'decision',
          description: 'Evaluate test coverage and identify risk areas',
          agent_role: 'QA Risk Analyst',
          transitions: {
            high_coverage: 'generate_test_data',
            medium_coverage: 'enhance_test_cases',
            low_coverage: 'expand_test_planning'
          }
        },
        {
          id: 'enhance_test_cases',
          name: 'Enhance Test Coverage',
          type: 'tool_call',
          description: 'Research additional test scenarios for better coverage',
          agent_role: 'Test Coverage Specialist',
          tools: ['tavily_search', 'python_repl'],
          transitions: { success: 'generate_test_data' }
        },
        {
          id: 'expand_test_planning',
          name: 'Expand Test Planning',
          type: 'loop',
          description: 'Iteratively expand test cases for critical areas',
          agent_role: 'Test Expansion Expert',
          max_iterations: 3,
          tools: ['tavily_search', 'python_repl'],
          transitions: { completed: 'generate_test_data' }
        },
        {
          id: 'generate_test_data',
          name: 'Generate Test Data',
          type: 'tool_call',
          description: 'Create realistic test data sets for all scenarios',
          agent_role: 'Test Data Engineer',
          tools: ['python_repl', 'file_write'],
          transitions: { success: 'create_test_scripts' }
        },
        {
          id: 'create_test_scripts',
          name: 'Create Automated Test Scripts',
          type: 'parallel',
          description: 'Generate executable test scripts for different test types',
          agent_role: 'Test Automation Engineer',
          tools: [],
          transitions: { all_completed: 'test_execution_decision' }
        },
        {
          id: 'selenium_scripts',
          name: 'Generate Selenium Scripts',
          type: 'tool_call',
          description: 'Create Selenium WebDriver test scripts',
          agent_role: 'Selenium Expert',
          tools: ['python_repl', 'file_write'],
          transitions: { success: 'return' }
        },
        {
          id: 'api_test_scripts',
          name: 'Generate API Test Scripts',
          type: 'tool_call',
          description: 'Create REST API test scripts with assertions',
          agent_role: 'API Automation Expert',
          tools: ['python_repl', 'file_write'],
          transitions: { success: 'return' }
        },
        {
          id: 'pytest_scripts',
          name: 'Generate PyTest Scripts',
          type: 'tool_call',
          description: 'Create PyTest framework test cases',
          agent_role: 'PyTest Expert',
          tools: ['python_repl', 'file_write'],
          transitions: { success: 'return' }
        },
        {
          id: 'test_execution_decision',
          name: 'Test Execution Strategy',
          type: 'decision',
          description: 'Determine execution strategy based on test suite size',
          agent_role: 'Test Execution Strategist',
          requires_approval: true,
          transitions: {
            full_regression: 'execute_full_suite',
            smoke_test: 'execute_smoke_tests',
            progressive: 'progressive_execution'
          }
        },
        {
          id: 'execute_smoke_tests',
          name: 'Execute Smoke Tests',
          type: 'tool_call',
          description: 'Run critical path smoke tests first',
          agent_role: 'Smoke Test Runner',
          tools: ['python_repl'],
          transitions: { success: 'analyze_initial_results', failure: 'log_failures' }
        },
        {
          id: 'execute_full_suite',
          name: 'Execute Full Test Suite',
          type: 'parallel',
          description: 'Run all test suites in parallel',
          agent_role: 'Test Execution Manager',
          tools: ['python_repl'],
          transitions: { all_completed: 'analyze_results' }
        },
        {
          id: 'progressive_execution',
          name: 'Progressive Test Execution',
          type: 'loop',
          description: 'Execute tests progressively by priority',
          agent_role: 'Progressive Test Runner',
          max_iterations: 5,
          tools: ['python_repl', 'calculator'],
          transitions: { completed: 'analyze_results' }
        },
        {
          id: 'analyze_initial_results',
          name: 'Analyze Initial Results',
          type: 'decision',
          description: 'Evaluate smoke test results',
          agent_role: 'Initial Results Analyst',
          transitions: {
            all_passed: 'execute_full_suite',
            critical_failures: 'halt_testing',
            minor_issues: 'continue_with_caution'
          }
        },
        {
          id: 'continue_with_caution',
          name: 'Continue with Caution',
          type: 'analysis',
          description: 'Proceed with testing while monitoring issues',
          agent_role: 'Cautious Test Manager',
          tools: ['python_repl'],
          transitions: { success: 'progressive_execution' }
        },
        {
          id: 'halt_testing',
          name: 'Halt Testing',
          type: 'human',
          description: 'Critical failures require human intervention',
          agent_role: 'QA Lead',
          transitions: { resolved: 'execute_full_suite', abort: 'generate_failure_report' }
        },
        {
          id: 'log_failures',
          name: 'Log Test Failures',
          type: 'tool_call',
          description: 'Document all test failures with details',
          agent_role: 'Failure Logger',
          tools: ['file_write', 'current_time'],
          transitions: { success: 'analyze_results' }
        },
        {
          id: 'analyze_results',
          name: 'Analyze Test Results',
          type: 'analysis',
          description: 'Comprehensive analysis of all test results',
          agent_role: 'Test Results Analyst',
          tools: ['python_repl', 'calculator'],
          transitions: { success: 'generate_metrics' }
        },
        {
          id: 'generate_metrics',
          name: 'Generate QA Metrics',
          type: 'transformation',
          description: 'Calculate pass rate, coverage, and performance metrics',
          agent_role: 'QA Metrics Specialist',
          tools: ['python_repl', 'calculator'],
          transitions: { success: 'identify_patterns' }
        },
        {
          id: 'identify_patterns',
          name: 'Identify Failure Patterns',
          type: 'analysis',
          description: 'Find patterns in test failures for root cause analysis',
          agent_role: 'Pattern Analysis Expert',
          tools: ['python_repl', 'tavily_search'],
          transitions: { success: 'generate_recommendations' }
        },
        {
          id: 'generate_recommendations',
          name: 'Generate Recommendations',
          type: 'transformation',
          description: 'Create actionable recommendations for development team',
          agent_role: 'QA Advisor',
          tools: ['python_repl'],
          transitions: { success: 'create_reports' }
        },
        {
          id: 'create_reports',
          name: 'Create Comprehensive Reports',
          type: 'parallel',
          description: 'Generate multiple report formats for different stakeholders',
          agent_role: 'Report Generation Manager',
          tools: [],
          transitions: { all_completed: 'distribute_reports' }
        },
        {
          id: 'executive_report',
          name: 'Executive Summary Report',
          type: 'tool_call',
          description: 'High-level report for management with key metrics',
          agent_role: 'Executive Report Writer',
          tools: ['file_write', 'python_repl'],
          transitions: { success: 'return' }
        },
        {
          id: 'technical_report',
          name: 'Technical Detail Report',
          type: 'tool_call',
          description: 'Detailed technical report for developers',
          agent_role: 'Technical Report Writer',
          tools: ['file_write', 'python_repl'],
          transitions: { success: 'return' }
        },
        {
          id: 'test_coverage_report',
          name: 'Test Coverage Report',
          type: 'tool_call',
          description: 'Comprehensive coverage analysis report',
          agent_role: 'Coverage Report Writer',
          tools: ['file_write', 'python_repl', 'calculator'],
          transitions: { success: 'return' }
        },
        {
          id: 'regression_report',
          name: 'Regression Test Report',
          type: 'tool_call',
          description: 'Regression testing results and trends',
          agent_role: 'Regression Report Writer',
          tools: ['file_write', 'python_repl'],
          transitions: { success: 'return' }
        },
        {
          id: 'generate_failure_report',
          name: 'Generate Failure Report',
          type: 'tool_call',
          description: 'Create detailed failure analysis report',
          agent_role: 'Failure Report Specialist',
          tools: ['file_write', 'python_repl'],
          transitions: { success: 'distribute_reports' }
        },
        {
          id: 'distribute_reports',
          name: 'Distribute Reports',
          type: 'tool_call',
          description: 'Save and organize all reports for distribution',
          agent_role: 'Report Distribution Manager',
          tools: ['file_write', 'current_time'],
          transitions: { success: 'update_test_repository' }
        },
        {
          id: 'update_test_repository',
          name: 'Update Test Repository',
          type: 'tool_call',
          description: 'Update test case repository with new tests and results',
          agent_role: 'Repository Manager',
          tools: ['file_write', 'python_repl'],
          transitions: { success: 'final_validation' }
        },
        {
          id: 'final_validation',
          name: 'Final Validation',
          type: 'validation',
          description: 'Validate entire QA process completion',
          agent_role: 'QA Process Validator',
          tools: ['python_repl'],
          transitions: { validated: 'complete', invalid: 'remediation' }
        },
        {
          id: 'remediation',
          name: 'Process Remediation',
          type: 'human',
          description: 'Address any remaining issues before completion',
          agent_role: 'QA Manager',
          transitions: { success: 'complete' }
        },
        {
          id: 'complete',
          name: 'QA Cycle Complete',
          type: 'final',
          description: 'QA lifecycle completed with all deliverables',
          tools: ['file_write', 'current_time']
        }
      ],
      edges: [
        { source: 'requirements_analysis', target: 'research_best_practices', event: 'success' },
        { source: 'research_best_practices', target: 'parallel_test_planning', event: 'success' },
        { source: 'parallel_test_planning', target: 'consolidate_test_plans', event: 'all_completed' },
        { source: 'functional_test_design', target: 'return', event: 'success' },
        { source: 'performance_test_design', target: 'return', event: 'success' },
        { source: 'security_test_design', target: 'return', event: 'success' },
        { source: 'api_test_design', target: 'return', event: 'success' },
        { source: 'ui_test_design', target: 'return', event: 'success' },
        { source: 'consolidate_test_plans', target: 'risk_assessment', event: 'success' },
        { source: 'risk_assessment', target: 'generate_test_data', event: 'high_coverage' },
        { source: 'risk_assessment', target: 'enhance_test_cases', event: 'medium_coverage' },
        { source: 'risk_assessment', target: 'expand_test_planning', event: 'low_coverage' },
        { source: 'enhance_test_cases', target: 'generate_test_data', event: 'success' },
        { source: 'expand_test_planning', target: 'generate_test_data', event: 'completed' },
        { source: 'generate_test_data', target: 'create_test_scripts', event: 'success' },
        { source: 'create_test_scripts', target: 'test_execution_decision', event: 'all_completed' },
        { source: 'selenium_scripts', target: 'return', event: 'success' },
        { source: 'api_test_scripts', target: 'return', event: 'success' },
        { source: 'pytest_scripts', target: 'return', event: 'success' },
        { source: 'test_execution_decision', target: 'execute_full_suite', event: 'full_regression' },
        { source: 'test_execution_decision', target: 'execute_smoke_tests', event: 'smoke_test' },
        { source: 'test_execution_decision', target: 'progressive_execution', event: 'progressive' },
        { source: 'execute_smoke_tests', target: 'analyze_initial_results', event: 'success' },
        { source: 'execute_smoke_tests', target: 'log_failures', event: 'failure' },
        { source: 'execute_full_suite', target: 'analyze_results', event: 'all_completed' },
        { source: 'progressive_execution', target: 'analyze_results', event: 'completed' },
        { source: 'analyze_initial_results', target: 'execute_full_suite', event: 'all_passed' },
        { source: 'analyze_initial_results', target: 'halt_testing', event: 'critical_failures' },
        { source: 'analyze_initial_results', target: 'continue_with_caution', event: 'minor_issues' },
        { source: 'continue_with_caution', target: 'progressive_execution', event: 'success' },
        { source: 'halt_testing', target: 'execute_full_suite', event: 'resolved' },
        { source: 'halt_testing', target: 'generate_failure_report', event: 'abort' },
        { source: 'log_failures', target: 'analyze_results', event: 'success' },
        { source: 'analyze_results', target: 'generate_metrics', event: 'success' },
        { source: 'generate_metrics', target: 'identify_patterns', event: 'success' },
        { source: 'identify_patterns', target: 'generate_recommendations', event: 'success' },
        { source: 'generate_recommendations', target: 'create_reports', event: 'success' },
        { source: 'create_reports', target: 'distribute_reports', event: 'all_completed' },
        { source: 'executive_report', target: 'return', event: 'success' },
        { source: 'technical_report', target: 'return', event: 'success' },
        { source: 'test_coverage_report', target: 'return', event: 'success' },
        { source: 'regression_report', target: 'return', event: 'success' },
        { source: 'generate_failure_report', target: 'distribute_reports', event: 'success' },
        { source: 'distribute_reports', target: 'update_test_repository', event: 'success' },
        { source: 'update_test_repository', target: 'final_validation', event: 'success' },
        { source: 'final_validation', target: 'complete', event: 'validated' },
        { source: 'final_validation', target: 'remediation', event: 'invalid' },
        { source: 'remediation', target: 'complete', event: 'success' }
      ]
    }
  },

  // Keep existing Amazon templates but move them down
  {
    id: 'echo-device-diagnostics',
    name: 'Echo Device Diagnostics',
    description: 'Automated diagnostic and resolution system for Echo/Alexa devices',
    category: 'complex',
    tags: ['amazon', 'echo', 'alexa', 'diagnostics', 'support'],
    requiredTools: ['tavily_search', 'python_repl', 'http_request'],
    optionalTools: ['file_write', 'calculator', 'current_time'],
    machine: {
      name: 'Echo Device Diagnostics',
      initial_state: 'device_intake',
      states: [
        {
          id: 'device_intake',
          name: 'Device Intake',
          type: 'analysis',
          description: 'Analyze customer complaint and extract device information',
          agent_role: 'Support Analyst',
          tools: [],
          transitions: { success: 'parallel_diagnostics' }
        },
        {
          id: 'parallel_diagnostics',
          name: 'Parallel Diagnostics',
          type: 'parallel',
          description: 'Run multiple diagnostic checks simultaneously',
          agent_role: 'Diagnostic Coordinator',
          tools: [],
          transitions: { all_completed: 'issue_classification' }
        },
        {
          id: 'cloud_health_check',
          name: 'Cloud Health Check',
          type: 'tool_call',
          description: 'Check AWS cloud connectivity and account status',
          agent_role: 'Cloud Specialist',
          tools: ['http_request', 'tavily_search'],
          transitions: { success: 'return', failure: 'return' }
        },
        {
          id: 'local_network_scan',
          name: 'Network Scan',
          type: 'tool_call',
          description: 'Analyze WiFi strength and network issues using web search',
          agent_role: 'Network Analyst',
          tools: ['tavily_search', 'python_repl'],
          transitions: { success: 'return', failure: 'return' }
        },
        {
          id: 'voice_history_analysis',
          name: 'Voice History Analysis',
          type: 'analysis',
          description: 'Review last 24 hours of voice commands and responses',
          agent_role: 'Voice Analytics Expert',
          tools: ['tavily_search'],
          transitions: { success: 'return', failure: 'return' }
        },
        {
          id: 'hardware_status_check',
          name: 'Hardware Status Check',
          type: 'tool_call',
          description: 'Research hardware issues and solutions',
          agent_role: 'Hardware Specialist',
          tools: ['tavily_search', 'python_repl'],
          transitions: { success: 'return', failure: 'return' }
        },
        {
          id: 'issue_classification',
          name: 'Issue Classification',
          type: 'decision',
          description: 'Classify issue severity and determine resolution path',
          agent_role: 'Resolution Expert',
          transitions: {
            network_issue: 'network_resolution',
            hardware_failure: 'hardware_resolution',
            software_bug: 'software_resolution',
            user_error: 'user_guidance',
            unknown: 'escalate_to_human'
          }
        },
        {
          id: 'network_resolution',
          name: 'Network Resolution',
          type: 'parallel',
          description: 'Search for and apply network fixes',
          agent_role: 'Network Engineer',
          tools: ['tavily_search', 'python_repl'],
          transitions: { all_completed: 'verify_fix' }
        },
        {
          id: 'hardware_resolution',
          name: 'Hardware Resolution',
          type: 'decision',
          description: 'Determine if remote fix possible or replacement needed',
          agent_role: 'Hardware Engineer',
          requires_approval: true,
          transitions: {
            remote_fixable: 'remote_hardware_fix',
            needs_replacement: 'initiate_rma'
          }
        },
        {
          id: 'software_resolution',
          name: 'Software Resolution',
          type: 'tool_call',
          description: 'Search for firmware updates and fixes',
          agent_role: 'Software Engineer',
          tools: ['tavily_search', 'http_request'],
          transitions: { success: 'verify_fix', failure: 'escalate_to_human' }
        },
        {
          id: 'user_guidance',
          name: 'User Guidance',
          type: 'transformation',
          description: 'Generate personalized troubleshooting guide',
          agent_role: 'Customer Success',
          tools: ['file_write'],
          transitions: { success: 'monitor_resolution' }
        },
        {
          id: 'remote_hardware_fix',
          name: 'Remote Hardware Fix',
          type: 'tool_call',
          description: 'Research and apply remote calibration methods',
          agent_role: 'Remote Support',
          tools: ['tavily_search', 'python_repl'],
          transitions: { success: 'verify_fix', failure: 'initiate_rma' }
        },
        {
          id: 'initiate_rma',
          name: 'Initiate RMA',
          type: 'tool_call',
          description: 'Create RMA documentation and process',
          agent_role: 'RMA Coordinator',
          tools: ['file_write', 'current_time'],
          transitions: { success: 'track_rma' }
        },
        {
          id: 'escalate_to_human',
          name: 'Escalate to Human',
          type: 'human',
          description: 'Complex issue requiring specialist intervention',
          agent_role: 'Level 3 Technical Support',
          transitions: {
            resolved: 'close_ticket',
            needs_engineering: 'engineering_escalation'
          }
        },
        {
          id: 'verify_fix',
          name: 'Verify Fix',
          type: 'validation',
          description: 'Run diagnostic tests to confirm resolution',
          agent_role: 'QA Specialist',
          tools: ['python_repl', 'calculator'],
          transitions: {
            validated: 'close_ticket',
            invalid: 'escalate_to_human'
          }
        },
        {
          id: 'monitor_resolution',
          name: 'Monitor Resolution',
          type: 'analysis',
          description: 'Monitor device for stability',
          agent_role: 'Monitoring Specialist',
          tools: ['current_time'],
          transitions: { success: 'close_ticket' }
        },
        {
          id: 'track_rma',
          name: 'Track RMA',
          type: 'loop',
          description: 'Track replacement device status',
          agent_role: 'Logistics Tracker',
          max_iterations: 10,
          transitions: {
            completed: 'close_ticket',
            timeout: 'escalate_to_human'
          }
        },
        {
          id: 'engineering_escalation',
          name: 'Engineering Escalation',
          type: 'tool_call',
          description: 'Create detailed engineering report',
          agent_role: 'Engineering Liaison',
          tools: ['file_write'],
          transitions: { success: 'close_ticket' }
        },
        {
          id: 'close_ticket',
          name: 'Close Ticket',
          type: 'final',
          description: 'Resolution achieved, document and close',
          tools: ['file_write', 'current_time']
        }
      ],
      edges: [
        { source: 'device_intake', target: 'parallel_diagnostics', event: 'success' },
        { source: 'parallel_diagnostics', target: 'issue_classification', event: 'all_completed' },
        { source: 'issue_classification', target: 'network_resolution', event: 'network_issue' },
        { source: 'issue_classification', target: 'hardware_resolution', event: 'hardware_failure' },
        { source: 'issue_classification', target: 'software_resolution', event: 'software_bug' },
        { source: 'issue_classification', target: 'user_guidance', event: 'user_error' },
        { source: 'issue_classification', target: 'escalate_to_human', event: 'unknown' },
        { source: 'network_resolution', target: 'verify_fix', event: 'all_completed' },
        { source: 'hardware_resolution', target: 'remote_hardware_fix', event: 'remote_fixable' },
        { source: 'hardware_resolution', target: 'initiate_rma', event: 'needs_replacement' },
        { source: 'software_resolution', target: 'verify_fix', event: 'success' },
        { source: 'software_resolution', target: 'escalate_to_human', event: 'failure' },
        { source: 'user_guidance', target: 'monitor_resolution', event: 'success' },
        { source: 'remote_hardware_fix', target: 'verify_fix', event: 'success' },
        { source: 'remote_hardware_fix', target: 'initiate_rma', event: 'failure' },
        { source: 'initiate_rma', target: 'track_rma', event: 'success' },
        { source: 'escalate_to_human', target: 'close_ticket', event: 'resolved' },
        { source: 'escalate_to_human', target: 'engineering_escalation', event: 'needs_engineering' },
        { source: 'verify_fix', target: 'close_ticket', event: 'validated' },
        { source: 'verify_fix', target: 'escalate_to_human', event: 'invalid' },
        { source: 'monitor_resolution', target: 'close_ticket', event: 'success' },
        { source: 'track_rma', target: 'close_ticket', event: 'completed' },
        { source: 'track_rma', target: 'escalate_to_human', event: 'timeout' },
        { source: 'engineering_escalation', target: 'close_ticket', event: 'success' }
      ]
    }
  },

  {
    id: 'smart-home-orchestration',
    name: 'Smart Home Setup & Optimization',
    description: 'Intelligent setup and optimization of complete Alexa smart home ecosystem',
    category: 'complex',
    tags: ['amazon', 'smart-home', 'alexa', 'iot', 'automation'],
    requiredTools: ['tavily_search', 'python_repl', 'file_write', 'http_request'],
    optionalTools: ['calculator', 'current_time'],
    machine: {
      name: 'Smart Home Orchestration',
      initial_state: 'initialize_setup',
      states: [
        {
          id: 'initialize_setup',
          name: 'Initialize Setup',
          type: 'analysis',
          description: 'Analyze home layout and requirements',
          agent_role: 'Setup Coordinator',
          tools: [],
          transitions: { success: 'device_discovery' }
        },
        {
          id: 'device_discovery',
          name: 'Device Discovery',
          type: 'tool_call',
          description: 'Search for compatible smart devices',
          agent_role: 'Device Scanner',
          tools: ['tavily_search', 'python_repl'],
          transitions: { success: 'device_categorization', failure: 'manual_device_entry' }
        },
        {
          id: 'manual_device_entry',
          name: 'Manual Device Entry',
          type: 'human',
          description: 'User manually inputs device information',
          agent_role: 'Setup Assistant',
          transitions: { success: 'device_categorization' }
        },
        {
          id: 'device_categorization',
          name: 'Device Categorization',
          type: 'analysis',
          description: 'Categorize devices by type and compatibility',
          agent_role: 'Device Analyst',
          tools: ['tavily_search'],
          transitions: { success: 'parallel_device_setup' }
        },
        {
          id: 'parallel_device_setup',
          name: 'Parallel Device Setup',
          type: 'parallel',
          description: 'Configure all device categories simultaneously',
          agent_role: 'Setup Manager',
          tools: [],
          transitions: { all_completed: 'routine_generation' }
        },
        {
          id: 'setup_lighting',
          name: 'Setup Lighting',
          type: 'loop',
          description: 'Configure smart lights and switches',
          agent_role: 'Lighting Specialist',
          max_iterations: 20,
          tools: ['tavily_search', 'http_request'],
          transitions: { completed: 'return', failure: 'lighting_fallback' }
        },
        {
          id: 'setup_security',
          name: 'Setup Security',
          type: 'parallel',
          description: 'Configure security devices',
          agent_role: 'Security Expert',
          tools: ['tavily_search', 'http_request'],
          transitions: { all_completed: 'return' }
        },
        {
          id: 'setup_climate',
          name: 'Setup Climate',
          type: 'tool_call',
          description: 'Connect thermostats and sensors',
          agent_role: 'Climate Specialist',
          tools: ['tavily_search', 'http_request'],
          transitions: { success: 'return', failure: 'climate_fallback' }
        },
        {
          id: 'setup_entertainment',
          name: 'Setup Entertainment',
          type: 'tool_call',
          description: 'Configure Fire TV and audio systems',
          agent_role: 'Entertainment Expert',
          tools: ['tavily_search', 'http_request'],
          transitions: { success: 'return', failure: 'return' }
        },
        {
          id: 'setup_appliances',
          name: 'Setup Appliances',
          type: 'tool_call',
          description: 'Connect smart appliances',
          agent_role: 'Appliance Specialist',
          tools: ['tavily_search', 'python_repl'],
          transitions: { success: 'return', failure: 'return' }
        },
        {
          id: 'lighting_fallback',
          name: 'Lighting Fallback',
          type: 'human',
          description: 'Manual intervention for lighting',
          agent_role: 'Smart Home Specialist',
          transitions: { success: 'return' }
        },
        {
          id: 'climate_fallback',
          name: 'Climate Fallback',
          type: 'analysis',
          description: 'Alternative climate setup',
          agent_role: 'Climate Expert',
          transitions: { success: 'return' }
        },
        {
          id: 'routine_generation',
          name: 'Routine Generation',
          type: 'transformation',
          description: 'Generate personalized Alexa routines',
          agent_role: 'Routine Designer',
          tools: ['python_repl', 'file_write'],
          transitions: { success: 'routine_validation' }
        },
        {
          id: 'routine_validation',
          name: 'Routine Validation',
          type: 'decision',
          description: 'Review and approve routines',
          agent_role: 'Validation Expert',
          requires_approval: true,
          transitions: {
            approved: 'room_configuration',
            rejected: 'custom_routine_creation'
          }
        },
        {
          id: 'custom_routine_creation',
          name: 'Custom Routines',
          type: 'human',
          description: 'Create custom routines',
          agent_role: 'Routine Designer',
          transitions: { success: 'room_configuration' }
        },
        {
          id: 'room_configuration',
          name: 'Room Configuration',
          type: 'loop',
          description: 'Assign devices to rooms',
          agent_role: 'Room Organizer',
          max_iterations: 15,
          tools: ['python_repl'],
          transitions: { completed: 'voice_training' }
        },
        {
          id: 'voice_training',
          name: 'Voice Training',
          type: 'parallel',
          description: 'Train Alexa for household voices',
          agent_role: 'Voice Coach',
          tools: [],
          transitions: { all_completed: 'system_test' }
        },
        {
          id: 'system_test',
          name: 'System Test',
          type: 'validation',
          description: 'Test all integrations',
          agent_role: 'QA Engineer',
          tools: ['python_repl', 'calculator'],
          transitions: {
            validated: 'optimization',
            invalid: 'troubleshooting'
          }
        },
        {
          id: 'troubleshooting',
          name: 'Troubleshooting',
          type: 'analysis',
          description: 'Fix integration issues',
          agent_role: 'Troubleshooting Expert',
          tools: ['tavily_search', 'python_repl'],
          transitions: {
            success: 'system_test',
            failure: 'manual_intervention'
          }
        },
        {
          id: 'manual_intervention',
          name: 'Manual Intervention',
          type: 'human',
          description: 'Expert assistance required',
          agent_role: 'Integration Specialist',
          transitions: { success: 'optimization' }
        },
        {
          id: 'optimization',
          name: 'Optimization',
          type: 'tool_call',
          description: 'Optimize performance and efficiency',
          agent_role: 'Optimization Expert',
          tools: ['python_repl', 'calculator'],
          transitions: { success: 'monitoring' }
        },
        {
          id: 'monitoring',
          name: 'Monitoring',
          type: 'loop',
          description: 'Monitor and learn for 7 days',
          agent_role: 'Monitoring Specialist',
          max_iterations: 7,
          tools: ['current_time', 'python_repl'],
          transitions: { completed: 'final_report' }
        },
        {
          id: 'final_report',
          name: 'Final Report',
          type: 'final',
          description: 'Generate setup report',
          tools: ['file_write', 'current_time']
        }
      ],
      edges: [
        { source: 'initialize_setup', target: 'device_discovery', event: 'success' },
        { source: 'device_discovery', target: 'device_categorization', event: 'success' },
        { source: 'device_discovery', target: 'manual_device_entry', event: 'failure' },
        { source: 'manual_device_entry', target: 'device_categorization', event: 'success' },
        { source: 'device_categorization', target: 'parallel_device_setup', event: 'success' },
        { source: 'parallel_device_setup', target: 'routine_generation', event: 'all_completed' },
        { source: 'setup_lighting', target: 'return', event: 'completed' },
        { source: 'setup_lighting', target: 'lighting_fallback', event: 'failure' },
        { source: 'setup_security', target: 'return', event: 'all_completed' },
        { source: 'setup_climate', target: 'return', event: 'success' },
        { source: 'setup_climate', target: 'climate_fallback', event: 'failure' },
        { source: 'setup_entertainment', target: 'return', event: 'success' },
        { source: 'setup_appliances', target: 'return', event: 'success' },
        { source: 'lighting_fallback', target: 'return', event: 'success' },
        { source: 'climate_fallback', target: 'return', event: 'success' },
        { source: 'routine_generation', target: 'routine_validation', event: 'success' },
        { source: 'routine_validation', target: 'room_configuration', event: 'approved' },
        { source: 'routine_validation', target: 'custom_routine_creation', event: 'rejected' },
        { source: 'custom_routine_creation', target: 'room_configuration', event: 'success' },
        { source: 'room_configuration', target: 'voice_training', event: 'completed' },
        { source: 'voice_training', target: 'system_test', event: 'all_completed' },
        { source: 'system_test', target: 'optimization', event: 'validated' },
        { source: 'system_test', target: 'troubleshooting', event: 'invalid' },
        { source: 'troubleshooting', target: 'system_test', event: 'success' },
        { source: 'troubleshooting', target: 'manual_intervention', event: 'failure' },
        { source: 'manual_intervention', target: 'optimization', event: 'success' },
        { source: 'optimization', target: 'monitoring', event: 'success' },
        { source: 'monitoring', target: 'final_report', event: 'completed' }
      ]
    }
  },

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