import React, { useState } from 'react';
import './AdvancedOrchestratorPanel.css';

interface AdvancedWorkflowTask {
  task_id: string;
  agent_type: string;
  description: string;
  system_prompt: string;
  tools: string[];
  dependencies: string[];
  priority: number;
  shared_memory_keys: string[];
  output_artifacts: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
}

interface AdvancedWorkflowPlan {
  id: string;
  name: string;
  description: string;
  tasks: AdvancedWorkflowTask[];
  shared_memory: Record<string, any>;
  context_flow: Record<string, string[]>;
  created_at: Date;
  status: 'planning' | 'executing' | 'completed' | 'failed';
}

interface AdvancedOrchestratorPanelProps {
  onWorkflowStart: (plan: AdvancedWorkflowPlan) => void;
  currentWorkflow?: AdvancedWorkflowPlan;
}

const AdvancedOrchestratorPanel: React.FC<AdvancedOrchestratorPanelProps> = ({
  onWorkflowStart,
  currentWorkflow
}) => {
  const [taskInput, setTaskInput] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);
  const [workflowPlan, setWorkflowPlan] = useState<AdvancedWorkflowPlan | null>(null);

  // AI ORCHESTRATOR: Analyze user request and generate appropriate agents
  const generateAdvancedWorkflow = (task: string): AdvancedWorkflowTask[] => {
    return analyzeTaskAndGenerateAgents(task);
  };

  // AI ORCHESTRATOR LOGIC: Analyze task complexity and generate appropriate agents
  const analyzeTaskAndGenerateAgents = (task: string): AdvancedWorkflowTask[] => {
    const tasks: AdvancedWorkflowTask[] = [];
    const taskLower = task.toLowerCase();
    
    // STEP 1: Analyze task type and complexity
    const taskAnalysis = {
      isWebApp: /web|app|frontend|backend|fullstack|ui|ux|react|vue|angular|node/.test(taskLower),
      isDataProject: /data|analysis|ml|ai|model|dataset|python|jupyter|analytics/.test(taskLower),
      isInfrastructure: /deploy|docker|cloud|aws|server|infrastructure|kubernetes|terraform/.test(taskLower),
      isDesign: /design|mockup|prototype|wireframe|ui|ux|figma/.test(taskLower),
      isResearch: /research|study|analyze|investigate|report|documentation/.test(taskLower),
      isTechnical: /code|programming|software|system|technical|algorithm/.test(taskLower),
      isMobile: /mobile|ios|android|react native|flutter/.test(taskLower),
      isAPI: /api|rest|graphql|endpoint|microservice/.test(taskLower),
      isDatabase: /database|sql|mongodb|postgres|mysql|redis/.test(taskLower),
      isComplexProject: task.length > 100 || task.split(' ').length > 15,
      keywords: extractKeywords(task)
    };

    // STEP 2: Determine number of agents based on complexity
    let agentCount = 2; // Minimum
    if (taskAnalysis.isComplexProject) agentCount += 3;
    if (taskAnalysis.isWebApp) agentCount += 4;
    if (taskAnalysis.isDataProject) agentCount += 3;
    if (taskAnalysis.isInfrastructure) agentCount += 2;
    if (taskAnalysis.isMobile) agentCount += 2;
    if (taskAnalysis.isAPI) agentCount += 2;
    if (taskAnalysis.isDatabase) agentCount += 1;
    if (taskAnalysis.isDesign) agentCount += 1;
    
    // Cap at reasonable maximum
    agentCount = Math.min(agentCount, 15);

    console.log(`🎭 AI Orchestrator Analysis:`, {
      task: task,
      analysis: taskAnalysis,
      calculatedAgents: agentCount,
      keywords: taskAnalysis.keywords
    });
    
    // STEP 3: Generate agents based on analysis
    if (taskAnalysis.isWebApp) {
      generateWebAppAgents(tasks, task, taskAnalysis);
    } else if (taskAnalysis.isDataProject) {
      generateDataProjectAgents(tasks, task, taskAnalysis);
    } else if (taskAnalysis.isResearch) {
      generateResearchAgents(tasks, task, taskAnalysis);
    } else if (taskAnalysis.isMobile) {
      generateMobileAppAgents(tasks, task, taskAnalysis);
    } else {
      generateGenericAgents(tasks, task, taskAnalysis, agentCount);
    }

    return tasks;
  };

  // Extract keywords for agent specialization
  const extractKeywords = (task: string): string[] => {
    const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'create', 'build', 'make', 'develop'];
    return task.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.includes(word))
      .slice(0, 10);
  };

  // Generate agents for web applications
  const generateWebAppAgents = (tasks: AdvancedWorkflowTask[], task: string, analysis: any) => {
    const projectName = analysis.keywords[0] || 'webapp';
    
    // Requirements Analyst
    tasks.push({
      task_id: 'requirements_analyst',
      agent_type: `${projectName}_requirements_specialist`,
      description: 'Analyze requirements and create detailed specifications',
      system_prompt: `You are a Requirements Analyst for: ${task}
      
STRANDS WORKFLOW:
1. Use http_request to research similar applications and best practices
2. Use file_write to create detailed requirements specification
3. Use agent.state.set() to share requirements with other agents

Create comprehensive requirements.md and functional_spec.json files.`,
      tools: ['http_request', 'file_write', 'memory'],
      dependencies: [],
      priority: 10,
      shared_memory_keys: ['requirements', 'functional_specs', 'user_stories'],
      output_artifacts: ['requirements.md', 'functional_spec.json'],
      status: 'pending'
    });

    // UI/UX Designer  
    tasks.push({
      task_id: 'ui_designer',
      agent_type: `${projectName}_ui_designer`,
      description: 'Design user interface and user experience',
      system_prompt: `You are a UI/UX Designer for: ${task}

STRANDS WORKFLOW:
1. Use agent.state.get('requirements') to understand the needs
2. Use generate_image to create UI mockups
3. Use file_write to create design specifications
4. Use diagram to create user flow diagrams

Create actual mockups and design documentation.`,
      tools: ['generate_image', 'file_write', 'diagram', 'memory'],
      dependencies: ['requirements_analyst'],
      priority: 9,
      shared_memory_keys: ['design_system', 'ui_components', 'user_flows'],
      output_artifacts: ['ui_mockups.png', 'design_system.json', 'user_flows.png'],
      status: 'pending'
    });

    // Frontend Developer
    tasks.push({
      task_id: 'frontend_dev',
      agent_type: `${projectName}_frontend_developer`,
      description: 'Develop frontend user interface',
      system_prompt: `You are a Frontend Developer for: ${task}

STRANDS WORKFLOW:
1. Use file_read to access design specifications
2. Use file_write to create React/HTML/CSS code
3. Use python_repl to generate component structures
4. Use shell to set up project structure

Create working frontend implementation.`,
      tools: ['file_write', 'python_repl', 'shell', 'file_read', 'memory'],
      dependencies: ['ui_designer'],
      priority: 8,
      shared_memory_keys: ['frontend_code', 'component_structure', 'styling_system'],
      output_artifacts: ['src/', 'package.json', 'index.html', 'main.css'],
      status: 'pending'
    });

    // Backend Developer (if complex)
    if (analysis.isComplexProject) {
      tasks.push({
        task_id: 'backend_dev',
        agent_type: `${projectName}_backend_developer`,
        description: 'Develop backend API and database',
        system_prompt: `You are a Backend Developer for: ${task}

STRANDS WORKFLOW:
1. Use file_read to access requirements and frontend specs
2. Use python_repl to develop API endpoints and data models
3. Use file_write to create actual backend code
4. Use shell to set up database and server

Create working backend implementation.`,
        tools: ['python_repl', 'file_write', 'shell', 'file_read', 'memory'],
        dependencies: ['requirements_analyst'],
        priority: 8,
        shared_memory_keys: ['api_specs', 'database_schema', 'backend_architecture'],
        output_artifacts: ['app.py', 'models.py', 'api/', 'database.sql'],
        status: 'pending'
      });
    }

    // DevOps Engineer (if infrastructure needed)
    if (analysis.isInfrastructure) {
      tasks.push({
        task_id: 'devops_engineer',
        agent_type: `${projectName}_devops_engineer`,
        description: 'Setup deployment and infrastructure',
        system_prompt: `You are a DevOps Engineer for: ${task}

STRANDS WORKFLOW:
1. Use file_write to create Docker configurations
2. Use shell to test deployment scripts
3. Use file_write to create CI/CD pipelines

Create deployment-ready infrastructure.`,
        tools: ['file_write', 'shell', 'memory'],
        dependencies: ['backend_dev'],
        priority: 6,
        shared_memory_keys: ['deployment_config', 'infrastructure_specs'],
        output_artifacts: ['Dockerfile', 'docker-compose.yml', '.github/workflows/'],
        status: 'pending'
      });
    }
  };

  // Generate agents for data projects
  const generateDataProjectAgents = (tasks: AdvancedWorkflowTask[], task: string, analysis: any) => {
    const projectName = analysis.keywords[0] || 'data_project';
    
    tasks.push({
      task_id: 'data_analyst',
      agent_type: `${projectName}_data_analyst`,
      description: 'Analyze data requirements and create analysis plan',
      system_prompt: `You are a Data Analyst for: ${task}

STRANDS WORKFLOW:
1. Use http_request to gather relevant datasets
2. Use python_repl for exploratory data analysis
3. Use file_write to create analysis reports
4. Use diagram to create data flow diagrams`,
      tools: ['python_repl', 'http_request', 'file_write', 'diagram', 'calculator', 'memory'],
      dependencies: [],
      priority: 10,
      shared_memory_keys: ['data_sources', 'analysis_plan', 'data_insights'],
      output_artifacts: ['data_analysis.py', 'analysis_report.md', 'data_flow.png'],
      status: 'pending'
    });

    tasks.push({
      task_id: 'ml_engineer',
      agent_type: `${projectName}_ml_engineer`,
      description: 'Develop machine learning models',
      system_prompt: `You are an ML Engineer for: ${task}

STRANDS WORKFLOW:
1. Use agent.state.get() to access data analysis results
2. Use python_repl to develop ML models
3. Use file_write to create model training scripts
4. Use code_interpreter for model evaluation`,
      tools: ['python_repl', 'code_interpreter', 'file_write', 'memory'],
      dependencies: ['data_analyst'],
      priority: 9,
      shared_memory_keys: ['model_architecture', 'training_results', 'model_performance'],
      output_artifacts: ['model.py', 'training.py', 'evaluation.py'],
      status: 'pending'
    });
  };

  // Generate agents for mobile applications
  const generateMobileAppAgents = (tasks: AdvancedWorkflowTask[], task: string, analysis: any) => {
    const appName = analysis.keywords[0] || 'mobile_app';
    
    tasks.push({
      task_id: 'mobile_designer',
      agent_type: `${appName}_mobile_designer`,
      description: 'Design mobile app interface and user experience',
      system_prompt: `You are a Mobile App Designer for: ${task}

STRANDS WORKFLOW:
1. Use generate_image to create mobile UI mockups
2. Use file_write to create design specifications
3. Use diagram to create app flow diagrams`,
      tools: ['generate_image', 'file_write', 'diagram', 'memory'],
      dependencies: [],
      priority: 10,
      shared_memory_keys: ['mobile_design', 'app_flows', 'ui_components'],
      output_artifacts: ['mobile_mockups.png', 'design_spec.md', 'app_flows.png'],
      status: 'pending'
    });

    tasks.push({
      task_id: 'mobile_developer',
      agent_type: `${appName}_mobile_developer`,
      description: 'Develop mobile application code',
      system_prompt: `You are a Mobile App Developer for: ${task}

STRANDS WORKFLOW:
1. Use file_read to access design specifications
2. Use file_write to create mobile app code
3. Use shell to set up mobile project structure`,
      tools: ['file_write', 'shell', 'file_read', 'memory'],
      dependencies: ['mobile_designer'],
      priority: 9,
      shared_memory_keys: ['mobile_code', 'app_structure'],
      output_artifacts: ['App.js', 'components/', 'package.json'],
      status: 'pending'
    });
  };

  // Generate agents for research projects  
  const generateResearchAgents = (tasks: AdvancedWorkflowTask[], task: string, analysis: any) => {
    const researchTopic = analysis.keywords.slice(0, 2).join('_') || 'research';
    
    tasks.push({
      task_id: 'researcher',
      agent_type: `${researchTopic}_researcher`,
      description: 'Conduct comprehensive research on the topic',
      system_prompt: `You are a Researcher for: ${task}

STRANDS WORKFLOW:
1. Use http_request to gather information from multiple sources
2. Use file_write to create detailed research report
3. Use python_repl for any data analysis needed
4. Use generate_image for charts and visualizations`,
      tools: ['http_request', 'file_write', 'python_repl', 'generate_image', 'memory'],
      dependencies: [],
      priority: 10,
      shared_memory_keys: ['research_findings', 'data_analysis', 'recommendations'],
      output_artifacts: ['research_report.md', 'data_analysis.py', 'findings_chart.png'],
      status: 'pending'
    });

    if (analysis.isComplexProject) {
      tasks.push({
        task_id: 'analyst',
        agent_type: `${researchTopic}_analyst`,
        description: 'Analyze research findings and provide insights',
        system_prompt: `You are a Research Analyst for: ${task}

STRANDS WORKFLOW:
1. Use agent.state.get() to access research findings
2. Use python_repl for statistical analysis
3. Use file_write to create analysis summary
4. Use diagram to create insight visualizations`,
        tools: ['python_repl', 'file_write', 'diagram', 'calculator', 'memory'],
        dependencies: ['researcher'],
        priority: 9,
        shared_memory_keys: ['analysis_results', 'insights', 'recommendations'],
        output_artifacts: ['analysis_summary.md', 'insights.py', 'recommendations.png'],
        status: 'pending'
      });
    }
  };

  // Generate generic agents for other types of tasks
  const generateGenericAgents = (tasks: AdvancedWorkflowTask[], task: string, analysis: any, agentCount: number) => {
    const baseType = analysis.keywords[0] || 'task';
    
    for (let i = 0; i < agentCount; i++) {
      const agentPurpose = i === 0 ? 'analyzer' : i === agentCount - 1 ? 'finalizer' : `specialist_${i}`;
      
      tasks.push({
        task_id: `agent_${i + 1}`,
        agent_type: `${baseType}_${agentPurpose}`,
        description: `Handle ${agentPurpose} aspects of: ${task}`,
        system_prompt: `You are a ${agentPurpose} for: ${task}

STRANDS WORKFLOW:
1. Use appropriate tools for your specialization
2. Create relevant files and outputs
3. Share findings through agent.state
4. Coordinate with other agents`,
        tools: ['file_write', 'http_request', 'python_repl', 'memory'],
        dependencies: i > 0 ? [`agent_${i}`] : [],
        priority: 10 - i,
        shared_memory_keys: [`${agentPurpose}_output`, `${agentPurpose}_findings`],
        output_artifacts: [`${agentPurpose}_output.md`, `${agentPurpose}_work.py`],
        status: 'pending'
      });
    }
  };

  // Plan the advanced workflow
  const planAdvancedWorkflow = async () => {
    setIsPlanning(true);
    
    // Simulate AI orchestrator thinking time
    setTimeout(() => {
      const tasks = generateAdvancedWorkflow(taskInput);
      
      const plan: AdvancedWorkflowPlan = {
        id: `workflow-${Date.now()}`,
        name: `AI-Orchestrated: ${taskInput.substring(0, 50)}`,
        description: taskInput,
        tasks: tasks,
        shared_memory: {},
        context_flow: tasks.reduce((acc, task) => {
          acc[task.task_id] = task.shared_memory_keys;
          return acc;
        }, {} as Record<string, string[]>),
        created_at: new Date(),
        status: 'planning'
      };
      
      setWorkflowPlan(plan);
      setIsPlanning(false);
      
      console.log('🚀 AI Orchestrator Generated:', {
        task: taskInput,
        total_agents: tasks.length,
        total_tools: tasks.reduce((acc, t) => acc + t.tools.length, 0),
        shared_memory_keys: Array.from(new Set(tasks.flatMap(t => t.shared_memory_keys))),
        artifacts: tasks.flatMap(t => t.output_artifacts)
      });
    }, 2000);
  };

  return (
    <div className="orchestrator-panel advanced" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="panel-header" style={{ flexShrink: 0 }}>
        <h2>🎭 AI Orchestrator</h2>
        <p>Dynamic agent generation based on your specific request</p>
      </div>

      <div className="task-input-section" style={{ flexShrink: 0 }}>
        <h3>What do you want to build?</h3>
        <p>The AI orchestrator will analyze your request and generate the right number of specialized agents.</p>
        
        <textarea
          value={taskInput}
          onChange={(e) => setTaskInput(e.target.value)}
          placeholder="Example: Create a todo app with React frontend and Python backend, or Build a machine learning model to predict sales, or Design a mobile app for fitness tracking..."
          rows={4}
        />
        
        <button 
          onClick={planAdvancedWorkflow}
          disabled={!taskInput || isPlanning}
          className="plan-button advanced"
        >
          {isPlanning ? (
            <>🎭 AI Orchestrator Analyzing & Generating Agents...</>
          ) : (
            <>🚀 Let AI Orchestrator Plan Your Project</>
          )}
        </button>
      </div>

      {workflowPlan && (
        <>
          <div className="workflow-visualization advanced" style={{ flex: 1, overflowY: 'auto', marginTop: '1rem', marginBottom: '1rem' }}>
            <div className="workflow-header">
              <h3>{workflowPlan.name}</h3>
              <p>{workflowPlan.description}</p>
              <div className="workflow-stats">
                <span>🤖 {workflowPlan.tasks.length} Generated Agents</span>
                <span>🛠️ {workflowPlan.tasks.reduce((acc, t) => acc + t.tools.length, 0)} Tools</span>
                <span>📁 {workflowPlan.tasks.reduce((acc, t) => acc + t.output_artifacts.length, 0)} Files</span>
                <span>🧠 {Object.keys(workflowPlan.context_flow).length} Memory Keys</span>
              </div>
            </div>

            <div className="orchestrator-decision advanced">
              <h4>🎭 AI Orchestrator Decision</h4>
              <p className="decision-text">
                "I analyzed your request and determined that {workflowPlan.tasks.length} specialized agents are needed. 
                Each agent has specific tools and will create real files with shared memory coordination."
              </p>
              
              <div className="analysis-grid">
                <div className="analysis-section">
                  <h5>Generated Specialist Agents:</h5>
                  <div className="agents-list" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                    {workflowPlan.tasks.map((task, idx) => (
                      <div key={idx} className="specialist-agent">
                        <div className="agent-header">
                          <span className="agent-number">{idx + 1}</span>
                          <span className="agent-type">{task.agent_type}</span>
                        </div>
                        <p className="agent-mission">{task.description}</p>
                        <div className="agent-details">
                          <div className="tools">
                            <span className="label">Tools:</span>
                            {task.tools.map((tool, toolIdx) => (
                              <span key={toolIdx} className="tool-badge">{tool}</span>
                            ))}
                          </div>
                          <div className="outputs">
                            <span className="label">Creates:</span>
                            {task.output_artifacts.map((artifact, artIdx) => (
                              <span key={artIdx} className="artifact-badge">{artifact}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="analysis-section">
                  <h5>Agent Coordination:</h5>
                  <div className="memory-flow">
                    {Object.entries(workflowPlan.context_flow).map(([taskId, keys], idx) => (
                      <div key={idx} className="memory-node">
                        <span className="task-name">{taskId}</span>
                        <span className="arrow">→</span>
                        <span className="keys">{keys.join(', ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="execution-controls" style={{ 
            flexShrink: 0, 
            margin: '1rem', 
            padding: '2rem',
            background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.05), rgba(118, 75, 162, 0.05))',
            borderRadius: '16px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            border: '2px dashed rgba(102, 126, 234, 0.3)',
            position: 'relative',
            zIndex: 100
          }}>
            <button 
              onClick={() => {
                console.log('Execute button clicked!', workflowPlan);
                onWorkflowStart(workflowPlan);
              }}
              className="execute-button advanced"
              type="button"
              style={{
                position: 'relative',
                zIndex: 101,
                pointerEvents: 'auto'
              }}
            >
              ⚡ Execute AI-Generated Workflow
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default AdvancedOrchestratorPanel;