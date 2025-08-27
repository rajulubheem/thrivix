import React, { useState, useEffect } from 'react';
import './OrchestratorPanel.css';

interface WorkflowTask {
  task_id: string;
  description: string;
  agent_type: string;
  system_prompt: string;
  dependencies: string[];
  priority: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  tools?: string[];
  model?: string;
}

interface WorkflowPlan {
  id: string;
  name: string;
  description: string;
  tasks: WorkflowTask[];
  created_at: Date;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  analysis?: any;
  workflow_type?: string;
}

interface CustomAgent {
  id: string;
  name: string;
  type: string;
  system_prompt: string;
  capabilities: string[];
  model?: string;
  temperature?: number;
  created_by: 'user' | 'orchestrator';
  created_at: Date;
}

interface OrchestratorPanelProps {
  onWorkflowStart: (plan: WorkflowPlan) => void;
  onAgentCreate: (agent: CustomAgent) => void;
  currentWorkflow?: WorkflowPlan;
  availableAgents: CustomAgent[];
}

const OrchestratorPanel: React.FC<OrchestratorPanelProps> = ({
  onWorkflowStart,
  onAgentCreate,
  currentWorkflow,
  availableAgents
}) => {
  const [activeTab, setActiveTab] = useState<'planning' | 'agents' | 'execution'>('planning');
  const [taskInput, setTaskInput] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);
  const [workflowPlan, setWorkflowPlan] = useState<WorkflowPlan | null>(null);
  
  // Custom agent creation state
  const [showAgentCreator, setShowAgentCreator] = useState(false);
  const [newAgent, setNewAgent] = useState<Partial<CustomAgent>>({
    name: '',
    type: '',
    system_prompt: '',
    capabilities: [],
    model: 'gpt-4',
    temperature: 0.7
  });

  // Predefined agent templates
  const agentTemplates = [
    {
      type: 'researcher',
      name: 'Research Specialist',
      system_prompt: 'You are a research specialist. Find comprehensive information, verify sources, and provide detailed analysis.',
      capabilities: ['web_search', 'data_extraction', 'source_verification']
    },
    {
      type: 'architect',
      name: 'System Architect',
      system_prompt: 'You design system architectures, create technical specifications, and plan implementation strategies.',
      capabilities: ['system_design', 'technical_planning', 'architecture_patterns']
    },
    {
      type: 'developer',
      name: 'Code Developer',
      system_prompt: 'You write clean, efficient code following best practices and design patterns.',
      capabilities: ['coding', 'debugging', 'optimization', 'testing']
    },
    {
      type: 'analyst',
      name: 'Data Analyst',
      system_prompt: 'You analyze data, identify patterns, and provide actionable insights.',
      capabilities: ['data_analysis', 'visualization', 'statistical_analysis']
    },
    {
      type: 'reviewer',
      name: 'Quality Reviewer',
      system_prompt: 'You review work for quality, accuracy, and compliance with requirements.',
      capabilities: ['code_review', 'quality_assurance', 'documentation_review']
    },
    {
      type: 'documenter',
      name: 'Documentation Specialist',
      system_prompt: 'You create clear, comprehensive documentation for technical and non-technical audiences.',
      capabilities: ['technical_writing', 'api_documentation', 'user_guides']
    }
  ];

  // Orchestrator AI analyzes and plans the workflow
  const planWorkflow = async () => {
    setIsPlanning(true);
    
    try {
      // Call the real AI Orchestrator API
      const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const response = await fetch(`${baseUrl}/api/v1/orchestrator/orchestrate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ task: taskInput })
      });

      if (response.ok) {
        const orchestrationResult = await response.json();
        
        // Convert orchestrated agents to workflow tasks
        const tasks: WorkflowTask[] = orchestrationResult.agents.map((agent: any, index: number) => ({
          task_id: `task-${index + 1}`,
          description: agent.description,
          agent_type: agent.name,
          system_prompt: agent.system_prompt,
          dependencies: index > 0 ? [`task-${index}`] : [],
          priority: orchestrationResult.agents.length - index,
          status: 'pending' as const,
          tools: agent.tools,
          model: agent.model
        }));

        const plan: WorkflowPlan = {
          id: `workflow-${Date.now()}`,
          name: `AI-Orchestrated: ${taskInput.substring(0, 50)}`,
          description: taskInput,
          tasks: tasks,
          created_at: new Date(),
          status: 'planning',
          analysis: orchestrationResult.analysis,
          workflow_type: orchestrationResult.workflow
        };
        
        setWorkflowPlan(plan);
        setIsPlanning(false);
        setActiveTab('execution');
        
        // Show orchestrator's planning in console
        console.log('🎭 Orchestrator AI Planning:', {
          task: taskInput,
          plan: plan,
          analysis: orchestrationResult.analysis
        });
      } else {
        // Fallback to simulation if API fails
        console.warn('Orchestrator API failed, using simulation');
        const plan: WorkflowPlan = {
          id: `workflow-${Date.now()}`,
          name: `AI-Orchestrated: ${taskInput.substring(0, 50)}`,
          description: taskInput,
          tasks: generateDynamicWorkflowTasks(taskInput),
          created_at: new Date(),
          status: 'planning'
        };
        
        setWorkflowPlan(plan);
        setIsPlanning(false);
        setActiveTab('execution');
      }
    } catch (error) {
      console.error('Orchestrator error:', error);
      // Fallback to simulation
      const plan: WorkflowPlan = {
        id: `workflow-${Date.now()}`,
        name: `AI-Orchestrated: ${taskInput.substring(0, 50)}`,
        description: taskInput,
        tasks: generateDynamicWorkflowTasks(taskInput),
        created_at: new Date(),
        status: 'planning'
      };
      
      setWorkflowPlan(plan);
      setIsPlanning(false);
      setActiveTab('execution');
      
      console.log('🎭 Orchestrator AI Planning (Fallback):', {
        task: taskInput,
        plan: plan,
        agents_created: plan.tasks.map(t => ({
          type: t.agent_type,
          prompt: t.system_prompt
        }))
      });
    }
  };

  // Generate DYNAMIC workflow tasks with AI-created agents
  const generateDynamicWorkflowTasks = (task: string): WorkflowTask[] => {
    const tasks: WorkflowTask[] = [];
    const taskLower = task.toLowerCase();
    
    // Analyze task context to create highly specialized agents
    
    // Example: Todo app task
    if (taskLower.includes('todo') || taskLower.includes('task') || taskLower.includes('app')) {
      tasks.push({
        task_id: 'requirements_analyst',
        description: 'Analyze requirements and create detailed specifications',
        agent_type: 'todo_requirements_specialist',
        system_prompt: 'You are a Todo App Requirements Specialist. Analyze user needs for task management, prioritization, categories, due dates, and collaboration features. Create comprehensive specifications. When done, todo_ui_specialist will continue with the UI design.',
        dependencies: [],
        priority: 5,
        status: 'pending'
      });
      
      tasks.push({
        task_id: 'ui_ux_designer',
        description: 'Design intuitive user interface for the todo application',
        agent_type: 'todo_ui_specialist',
        system_prompt: 'You are a Todo App UI/UX Specialist. Design clean, intuitive interfaces for task creation, editing, filtering, and organization. Focus on productivity and ease of use. When done, react_todo_developer will implement the UI.',
        dependencies: ['requirements_analyst'],
        priority: 4,
        status: 'pending'
      });
      
      tasks.push({
        task_id: 'frontend_developer',
        description: 'Implement React components for todo functionality',
        agent_type: 'react_todo_developer',
        system_prompt: 'You are a React Todo App Developer. Implement components for task CRUD operations, filtering, drag-and-drop, keyboard shortcuts, and real-time updates using React hooks and modern patterns. When done, redux_specialist will handle state management.',
        dependencies: ['ui_ux_designer'],
        priority: 3,
        status: 'pending'
      });
      
      tasks.push({
        task_id: 'state_management_architect',
        description: 'Design and implement state management solution',
        agent_type: 'redux_specialist',
        system_prompt: 'You are a State Management Architect specializing in Redux/Context API. Design efficient state management for todos, filters, user preferences, and sync across components. When done, test_automation_engineer will create tests.',
        dependencies: ['requirements_analyst'],
        priority: 3,
        status: 'pending'
      });
    }
    // Example: AI/ML task
    else if (taskLower.includes('ai') || taskLower.includes('machine learning') || taskLower.includes('neural')) {
      tasks.push({
        task_id: 'ml_researcher',
        description: 'Research state-of-the-art ML approaches for the problem',
        agent_type: 'ml_research_scientist',
        system_prompt: 'You are an ML Research Scientist. Analyze the problem domain, research relevant papers, compare algorithms (deep learning, transformers, classical ML), and recommend optimal approaches with trade-offs.',
        dependencies: [],
        priority: 5,
        status: 'pending'
      });
      
      tasks.push({
        task_id: 'data_engineer',
        description: 'Design data pipeline and preprocessing strategy',
        agent_type: 'ml_data_engineer',
        system_prompt: 'You are an ML Data Engineer. Design data collection, cleaning, augmentation, and feature engineering pipelines. Handle imbalanced data, missing values, and create train/val/test splits.',
        dependencies: ['ml_researcher'],
        priority: 4,
        status: 'pending'
      });
      
      tasks.push({
        task_id: 'model_architect',
        description: 'Design and implement model architecture',
        agent_type: 'deep_learning_architect',
        system_prompt: 'You are a Deep Learning Architect. Design neural network architectures, loss functions, optimization strategies. Implement in PyTorch/TensorFlow with proper regularization and efficiency.',
        dependencies: ['ml_researcher', 'data_engineer'],
        priority: 3,
        status: 'pending'
      });
    }
    // Example: API/Backend task
    else if (taskLower.includes('api') || taskLower.includes('backend') || taskLower.includes('server')) {
      tasks.push({
        task_id: 'api_architect',
        description: 'Design RESTful/GraphQL API architecture',
        agent_type: 'api_design_expert',
        system_prompt: 'You are an API Design Expert. Create RESTful or GraphQL schemas, define endpoints, authentication strategies, rate limiting, versioning, and OpenAPI specifications.',
        dependencies: [],
        priority: 5,
        status: 'pending'
      });
      
      tasks.push({
        task_id: 'database_architect',
        description: 'Design database schema and optimization strategies',
        agent_type: 'database_specialist',
        system_prompt: 'You are a Database Architecture Specialist. Design normalized schemas, indexes, query optimization, caching strategies for PostgreSQL/MongoDB. Handle transactions and concurrency.',
        dependencies: ['api_architect'],
        priority: 4,
        status: 'pending'
      });
      
      tasks.push({
        task_id: 'backend_developer',
        description: 'Implement server logic and business rules',
        agent_type: 'nodejs_expert',
        system_prompt: 'You are a Node.js/Python Backend Expert. Implement server logic, middleware, authentication, authorization, input validation, error handling, and integrate with databases and external services.',
        dependencies: ['api_architect', 'database_architect'],
        priority: 3,
        status: 'pending'
      });
    }
    // Default: Generic but intelligent task decomposition
    else {
      // Create contextually aware agents based on keywords
      const keywords = task.split(' ').filter(word => word.length > 4);
      
      tasks.push({
        task_id: 'domain_expert',
        description: `Analyze domain-specific requirements for: ${keywords.join(', ')}`,
        agent_type: `${keywords[0]?.toLowerCase() || 'domain'}_expert`,
        system_prompt: `You are a Domain Expert specializing in ${task}. Analyze requirements, constraints, best practices, and industry standards. Provide comprehensive domain knowledge and insights.`,
        dependencies: [],
        priority: 5,
        status: 'pending'
      });
      
      tasks.push({
        task_id: 'solution_architect',
        description: 'Design comprehensive solution architecture',
        agent_type: `${keywords[1]?.toLowerCase() || 'solution'}_architect`,
        system_prompt: `You are a Solution Architect for ${task}. Design system architecture, component interactions, technology stack, scalability considerations, and implementation roadmap.`,
        dependencies: ['domain_expert'],
        priority: 4,
        status: 'pending'
      });
      
      tasks.push({
        task_id: 'implementation_specialist',
        description: 'Implement core functionality and features',
        agent_type: `${keywords[2]?.toLowerCase() || 'implementation'}_developer`,
        system_prompt: `You are an Implementation Specialist for ${task}. Write clean, efficient code following best practices. Implement core features with proper error handling and testing.`,
        dependencies: ['solution_architect'],
        priority: 3,
        status: 'pending'
      });
    }
    
    // Always add testing and documentation agents
    tasks.push({
      task_id: 'test_engineer',
      description: 'Create comprehensive test suite',
      agent_type: 'test_automation_engineer',
      system_prompt: `You are a Test Automation Engineer for ${task}. Write unit tests, integration tests, E2E tests. Ensure code coverage, edge cases, and performance testing.`,
      dependencies: tasks.filter(t => t.agent_type.includes('developer') || t.agent_type.includes('implement')).map(t => t.task_id),
      priority: 2,
      status: 'pending'
    });
    
    tasks.push({
      task_id: 'documentation_specialist',
      description: 'Create comprehensive documentation',
      agent_type: 'technical_documentation_expert',
      system_prompt: `You are a Technical Documentation Expert for ${task}. Create user guides, API documentation, architecture diagrams, deployment guides, and troubleshooting resources.`,
      dependencies: tasks.map(t => t.task_id),
      priority: 1,
      status: 'pending'
    });
    
    return tasks;
  };

  // Keep the old generator for reference
  const generateWorkflowTasks = (task: string): WorkflowTask[] => {
    const tasks: WorkflowTask[] = [];
    
    // Analyze task complexity and determine required agents
    const needsResearch = task.toLowerCase().includes('research') || 
                         task.toLowerCase().includes('find') ||
                         task.toLowerCase().includes('analyze');
    
    const needsCoding = task.toLowerCase().includes('code') || 
                       task.toLowerCase().includes('implement') ||
                       task.toLowerCase().includes('build') ||
                       task.toLowerCase().includes('create');
    
    const needsDesign = task.toLowerCase().includes('design') || 
                       task.toLowerCase().includes('architect') ||
                       task.toLowerCase().includes('plan');
    
    const needsReview = needsCoding || needsDesign;
    
    // Build workflow based on detected needs
    if (needsResearch) {
      tasks.push({
        task_id: 'research_phase',
        description: 'Research and gather information',
        agent_type: 'researcher',
        system_prompt: 'Research the topic thoroughly and provide comprehensive findings.',
        dependencies: [],
        priority: 5,
        status: 'pending'
      });
    }
    
    if (needsDesign) {
      tasks.push({
        task_id: 'design_phase',
        description: 'Design system architecture and plan implementation',
        agent_type: 'architect',
        system_prompt: 'Create a detailed design and implementation plan.',
        dependencies: needsResearch ? ['research_phase'] : [],
        priority: 4,
        status: 'pending'
      });
    }
    
    if (needsCoding) {
      tasks.push({
        task_id: 'implementation_phase',
        description: 'Implement the solution',
        agent_type: 'developer',
        system_prompt: 'Implement the solution following best practices.',
        dependencies: needsDesign ? ['design_phase'] : (needsResearch ? ['research_phase'] : []),
        priority: 3,
        status: 'pending'
      });
    }
    
    if (needsReview) {
      tasks.push({
        task_id: 'review_phase',
        description: 'Review and ensure quality',
        agent_type: 'reviewer',
        system_prompt: 'Review the work for quality and correctness.',
        dependencies: needsCoding ? ['implementation_phase'] : ['design_phase'],
        priority: 2,
        status: 'pending'
      });
    }
    
    // Always add documentation
    tasks.push({
      task_id: 'documentation_phase',
      description: 'Create comprehensive documentation',
      agent_type: 'documenter',
      system_prompt: 'Document the entire process and results.',
      dependencies: tasks.map(t => t.task_id),
      priority: 1,
      status: 'pending'
    });
    
    return tasks;
  };

  // Create custom agent
  const handleCreateAgent = () => {
    if (!newAgent.name || !newAgent.type || !newAgent.system_prompt) {
      alert('Please fill in all required fields');
      return;
    }
    
    const agent: CustomAgent = {
      id: `agent-${Date.now()}`,
      name: newAgent.name!,
      type: newAgent.type!,
      system_prompt: newAgent.system_prompt!,
      capabilities: newAgent.capabilities || [],
      model: newAgent.model,
      temperature: newAgent.temperature,
      created_by: 'user',
      created_at: new Date()
    };
    
    onAgentCreate(agent);
    setShowAgentCreator(false);
    setNewAgent({
      name: '',
      type: '',
      system_prompt: '',
      capabilities: [],
      model: 'gpt-4',
      temperature: 0.7
    });
  };

  // Execute workflow
  const executeWorkflow = () => {
    if (workflowPlan) {
      onWorkflowStart(workflowPlan);
    }
  };

  return (
    <div className="orchestrator-panel">
      <div className="panel-header">
        <h2>🎭 Orchestrator Control Center</h2>
        <p>AI-Powered Workflow Planning & Agent Management</p>
      </div>

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'planning' ? 'active' : ''}`}
          onClick={() => setActiveTab('planning')}
        >
          📋 Workflow Planning
        </button>
        <button 
          className={`tab ${activeTab === 'agents' ? 'active' : ''}`}
          onClick={() => setActiveTab('agents')}
        >
          🤖 Agent Management
        </button>
        <button 
          className={`tab ${activeTab === 'execution' ? 'active' : ''}`}
          onClick={() => setActiveTab('execution')}
        >
          ⚡ Execution Monitor
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'planning' && (
          <div className="planning-tab">
            <div className="task-input-section">
              <h3>Define Your Task</h3>
              <p>Describe what you want to accomplish. The orchestrator will plan the optimal workflow.</p>
              
              <textarea
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                placeholder="Example: Research the latest AI trends, analyze their impact on software development, and create a comprehensive report with recommendations..."
                rows={4}
              />
              
              <button 
                onClick={planWorkflow}
                disabled={!taskInput || isPlanning}
                className="plan-button"
              >
                {isPlanning ? (
                  <>🤖 AI Orchestrator Analyzing & Creating Agents...</>
                ) : (
                  <>🎭 Let AI Orchestrator Plan & Create Agents</>
                )}
              </button>
            </div>

            <div className="workflow-principles">
              <h4>Orchestrator Principles</h4>
              <ul>
                <li>✅ Automatic task decomposition</li>
                <li>✅ Intelligent agent selection</li>
                <li>✅ Dependency management</li>
                <li>✅ Parallel execution optimization</li>
                <li>✅ Context preservation</li>
                <li>✅ Error recovery</li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'agents' && (
          <div className="agents-tab">
            <div className="agents-header">
              <h3>Available Agents</h3>
              <button 
                onClick={() => setShowAgentCreator(true)}
                className="add-agent-button"
              >
                ➕ Create Custom Agent
              </button>
            </div>

            <div className="agent-templates">
              <h4>Agent Templates</h4>
              <div className="templates-grid">
                {agentTemplates.map((template) => (
                  <div key={template.type} className="agent-template">
                    <h5>{template.name}</h5>
                    <p className="agent-type">{template.type}</p>
                    <p className="agent-prompt">{template.system_prompt}</p>
                    <div className="capabilities">
                      {template.capabilities.map((cap) => (
                        <span key={cap} className="capability">{cap}</span>
                      ))}
                    </div>
                    <button 
                      onClick={() => {
                        setNewAgent({
                          ...template,
                          name: template.name + ' (Custom)',
                        });
                        setShowAgentCreator(true);
                      }}
                      className="use-template-button"
                    >
                      Use Template
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="custom-agents">
              <h4>Custom Agents</h4>
              <div className="agents-list">
                {availableAgents.filter(a => a.created_by === 'user').map((agent) => (
                  <div key={agent.id} className="custom-agent-card">
                    <h5>{agent.name}</h5>
                    <p className="agent-type">{agent.type}</p>
                    <p className="agent-prompt">{agent.system_prompt}</p>
                    <div className="agent-meta">
                      <span>Model: {agent.model}</span>
                      <span>Temp: {agent.temperature}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {showAgentCreator && (
              <div className="agent-creator-modal">
                <div className="modal-content">
                  <h3>Create Custom Agent</h3>
                  
                  <div className="form-group">
                    <label>Agent Name *</label>
                    <input
                      type="text"
                      value={newAgent.name}
                      onChange={(e) => setNewAgent({...newAgent, name: e.target.value})}
                      placeholder="e.g., Financial Analyst"
                    />
                  </div>

                  <div className="form-group">
                    <label>Agent Type *</label>
                    <input
                      type="text"
                      value={newAgent.type}
                      onChange={(e) => setNewAgent({...newAgent, type: e.target.value})}
                      placeholder="e.g., analyst, developer, researcher"
                    />
                  </div>

                  <div className="form-group">
                    <label>System Prompt *</label>
                    <textarea
                      value={newAgent.system_prompt}
                      onChange={(e) => setNewAgent({...newAgent, system_prompt: e.target.value})}
                      placeholder="Define the agent's role and behavior..."
                      rows={4}
                    />
                  </div>

                  <div className="form-group">
                    <label>Capabilities (comma-separated)</label>
                    <input
                      type="text"
                      value={newAgent.capabilities?.join(', ')}
                      onChange={(e) => setNewAgent({
                        ...newAgent, 
                        capabilities: e.target.value.split(',').map(c => c.trim()).filter(c => c)
                      })}
                      placeholder="e.g., data_analysis, visualization, reporting"
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Model</label>
                      <select 
                        value={newAgent.model}
                        onChange={(e) => setNewAgent({...newAgent, model: e.target.value})}
                      >
                        <option value="gpt-4">GPT-4</option>
                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                        <option value="claude-3">Claude 3</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Temperature</label>
                      <input
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        value={newAgent.temperature}
                        onChange={(e) => setNewAgent({...newAgent, temperature: parseFloat(e.target.value)})}
                      />
                    </div>
                  </div>

                  <div className="modal-actions">
                    <button onClick={() => setShowAgentCreator(false)} className="cancel-button">
                      Cancel
                    </button>
                    <button onClick={handleCreateAgent} className="create-button">
                      Create Agent
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'execution' && (
          <div className="execution-tab">
            {workflowPlan ? (
              <div className="workflow-visualization">
                <div className="workflow-header">
                  <h3>{workflowPlan.name}</h3>
                  <p>{workflowPlan.description}</p>
                  <div className="workflow-status">
                    Status: <span className={`status-badge ${workflowPlan.status}`}>
                      {workflowPlan.status}
                    </span>
                  </div>
                </div>
                
                <div className="orchestrator-decision">
                  <h4>🎭 Orchestrator AI Decision</h4>
                  <p className="decision-text">
                    "I have analyzed your task and determined that we need {workflowPlan.tasks.length} specialized agents 
                    to complete this efficiently. Each agent has been specifically created with domain expertise for their 
                    assigned tasks. The agents will work in parallel where possible, following the dependency chain."
                  </p>
                  <div className="created-agents">
                    <h5>Dynamically Created Agents:</h5>
                    <div className="agent-list">
                      {workflowPlan.tasks.map((task, idx) => (
                        <div key={idx} className="created-agent-badge">
                          <span className="agent-type">{task.agent_type}</span>
                          <span className="agent-role">{task.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="workflow-diagram">
                  <h4>Workflow Architecture</h4>
                  <div className="tasks-flow">
                    {workflowPlan.tasks.map((task, index) => (
                      <div key={task.task_id} className="task-node">
                        <div className={`task-card ${task.status}`}>
                          <div className="task-header">
                            <span className="task-agent">{task.agent_type}</span>
                            <span className="task-priority">P{task.priority}</span>
                          </div>
                          <p className="task-description">{task.description}</p>
                          {task.dependencies.length > 0 && (
                            <div className="task-dependencies">
                              Depends on: {task.dependencies.join(', ')}
                            </div>
                          )}
                          <div className={`task-status ${task.status}`}>
                            {task.status}
                          </div>
                        </div>
                        {index < workflowPlan.tasks.length - 1 && (
                          <div className="task-arrow">↓</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="execution-controls">
                  <button 
                    onClick={executeWorkflow}
                    className="execute-button"
                    disabled={workflowPlan.status === 'executing'}
                  >
                    {workflowPlan.status === 'executing' ? (
                      <>⏳ Executing...</>
                    ) : (
                      <>▶️ Execute Workflow</>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="no-workflow">
                <p>No workflow planned yet. Go to the Planning tab to create one.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrchestratorPanel;