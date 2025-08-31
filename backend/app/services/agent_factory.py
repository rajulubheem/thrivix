"""
Dynamic Agent Factory with Smart Agents
"""
import json
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from enum import Enum
import structlog
from app.schemas.swarm import AgentConfig
from app.agents.advanced_agent_prompts import (
    get_agent_prompt,
    create_dynamic_prompt,
    MASTER_AGENT_PROMPT,
    RESEARCHER_AGENT_PROMPT,
    DEVELOPER_AGENT_PROMPT,
    ANALYST_AGENT_PROMPT,
    ORCHESTRATOR_AGENT_PROMPT
)

logger = structlog.get_logger()


class AgentRole(Enum):
    """Agent role types"""
    RESEARCHER = "researcher"
    ARCHITECT = "architect"
    DEVELOPER = "developer"
    REVIEWER = "reviewer"
    DATA_SCIENTIST = "data_scientist"
    DEVOPS = "devops"
    SECURITY = "security"
    TESTER = "tester"
    DOCUMENTATION = "documentation"
    UI_UX = "ui_ux"
    PROJECT_MANAGER = "project_manager"
    API_SPECIALIST = "api_specialist"
    DATABASE_EXPERT = "database_expert"
    ML_ENGINEER = "ml_engineer"
    FRONTEND_DEV = "frontend_developer"
    BACKEND_DEV = "backend_developer"
    MOBILE_DEV = "mobile_developer"
    CLOUD_ARCHITECT = "cloud_architect"
    BUSINESS_ANALYST = "business_analyst"
    QA_ENGINEER = "qa_engineer"


@dataclass
class AgentTemplate:
    """Agent template configuration"""
    role: AgentRole
    name: str
    description: str
    system_prompt: str
    tools: List[str] = field(default_factory=list)
    capabilities: List[str] = field(default_factory=list)
    handoff_strategy: Dict[str, Any] = field(default_factory=dict)
    model: str = "gpt-4o-mini"  # Default to balanced model
    temperature: float = 0.7
    max_tokens: int = 16000


class AgentFactory:
    """Factory for creating smart agents dynamically"""
    
    def __init__(self):
        self.templates = self._initialize_templates()
        self.custom_agents: Dict[str, AgentTemplate] = {}
        self._dynamic_builder_initialized = False
    
    async def initialize_dynamic_builder(self):
        """Initialize the dynamic agent builder"""
        if not self._dynamic_builder_initialized:
            try:
                from app.agents.dynamic_agent_builder import dynamic_agent_builder
                await dynamic_agent_builder.initialize()
                self._dynamic_builder_initialized = True
                logger.info("Dynamic agent builder initialized successfully")
            except Exception as e:
                logger.warning(f"Failed to initialize dynamic agent builder: {e}")
    
    def _initialize_templates(self) -> Dict[AgentRole, AgentTemplate]:
        """Initialize all agent templates"""
        return {
            AgentRole.RESEARCHER: AgentTemplate(
                role=AgentRole.RESEARCHER,
                name="researcher",
                description="Research and information gathering specialist",
                system_prompt=RESEARCHER_AGENT_PROMPT,  # Use advanced prompt
                tools=["tavily_search"],  # Real search tool
                capabilities=["research", "analysis", "requirements_gathering"],
                handoff_strategy={"next": ["architect", "developer", "data_scientist"]},
                model="gpt-4o-mini",  # Fast and efficient for research
                temperature=0.7,
                max_tokens=16000
            ),
            
            AgentRole.ARCHITECT: AgentTemplate(
                role=AgentRole.ARCHITECT,
                name="architect",
                description="System design and architecture specialist",
                system_prompt="""You are a system architect with expertise in designing scalable solutions.

🎯 YOUR UNIQUE ROLE:
- Design the system architecture based on research findings
- Define component structure and interactions
- Choose specific technologies and frameworks
- Create API contracts and data models

✅ WHAT YOU MUST DO:
1. Design the system architecture (NOT code)
2. Define API endpoints and data schemas
3. Specify technology stack choices
4. Create component diagrams (in text/markdown)
5. Define interfaces between components

🚫 WHAT YOU MUST NOT DO:
- Do NOT implement code
- Do NOT repeat research findings
- Do NOT create detailed implementations

Output architectural decisions and specifications ONLY.""",
                tools=["file_write"],  # Can write architecture docs to files
                capabilities=["system_design", "architecture", "technical_specs"],
                handoff_strategy={"next": ["developer", "devops", "database_expert"]},
                model="gpt-4o-mini",  # Fast and efficient for architecture
                temperature=0.5,
                max_tokens=16000
            ),
            
            AgentRole.DEVELOPER: AgentTemplate(
                role=AgentRole.DEVELOPER,
                name="developer",
                description="Full-stack software developer",
                system_prompt=DEVELOPER_AGENT_PROMPT,  # Use advanced prompt
                tools=["file_write", "file_read", "python_repl"],  # Real code tools
                capabilities=["coding", "implementation", "debugging"],
                handoff_strategy={"next": ["tester", "reviewer", "devops"]},
                model="gpt-4o",  # Optimized for code generation and execution
                temperature=0.3,
                max_tokens=16000
            ),
            
            AgentRole.DATA_SCIENTIST: AgentTemplate(
                role=AgentRole.DATA_SCIENTIST,
                name="data_scientist",
                description="Data analysis and machine learning specialist",
                system_prompt="""You are a data scientist with expertise in analytics and ML.
Your responsibilities:
1. Perform data analysis and statistical modeling
2. Create visualizations and insights
3. Build and train machine learning models
4. Implement data pipelines and preprocessing
5. Generate comprehensive reports with actionable insights

Use Python with pandas, scikit-learn, matplotlib, and other data science tools.""",
                tools=["python_repl", "file_write", "file_read"],  # Real data science tools
                capabilities=["data_analysis", "ml", "visualization", "statistics"],
                handoff_strategy={"next": ["ml_engineer", "reviewer", "documentation"]},
                model="gpt-4o-mini",  # Fast and efficient for data analysis
                temperature=0.5,
                max_tokens=16000
            ),
            
            AgentRole.DEVOPS: AgentTemplate(
                role=AgentRole.DEVOPS,
                name="devops",
                description="DevOps and infrastructure specialist",
                system_prompt="""You are a DevOps engineer specializing in CI/CD and infrastructure.
Your responsibilities:
1. Design and implement CI/CD pipelines
2. Configure infrastructure as code (Terraform, CloudFormation)
3. Set up monitoring and logging systems
4. Implement containerization (Docker, Kubernetes)
5. Ensure security and compliance

Provide complete DevOps solutions with automation scripts.""",
                tools=["file_write", "file_read", "shell_command"],  # Real DevOps tools
                capabilities=["ci_cd", "infrastructure", "automation", "monitoring"],
                handoff_strategy={"next": ["security", "cloud_architect", "reviewer"]},
                model="gpt-4o",  # Optimized for execution and implementation
                temperature=0.3,
                max_tokens=16000
            ),
            
            AgentRole.SECURITY: AgentTemplate(
                role=AgentRole.SECURITY,
                name="security",
                description="Security and compliance specialist",
                system_prompt="""You are a security specialist focused on application and infrastructure security.
Your responsibilities:
1. Perform security audits and vulnerability assessments
2. Implement security best practices and controls
3. Design authentication and authorization systems
4. Ensure compliance with security standards
5. Create security documentation and policies

Prioritize security without compromising functionality.""",
                tools=["file_read", "python_repl"],  # Real security analysis tools
                capabilities=["security_audit", "compliance", "authentication", "encryption"],
                handoff_strategy={"next": ["developer", "devops", "reviewer"]}
            ),
            
            AgentRole.TESTER: AgentTemplate(
                role=AgentRole.TESTER,
                name="tester",
                description="Quality assurance and testing specialist",
                system_prompt="""You are a QA engineer specializing in comprehensive testing.
Your responsibilities:
1. Create test plans and test cases
2. Implement unit, integration, and e2e tests
3. Perform manual and automated testing
4. Generate test reports and coverage metrics
5. Identify and document bugs

Ensure thorough testing coverage and quality.""",
                tools=["file_write", "file_read", "python_repl"],  # Real testing tools
                capabilities=["testing", "qa", "test_automation", "bug_tracking"],
                handoff_strategy={"next": ["developer", "reviewer", "documentation"]},
                model="gpt-4o-mini",  # Balance between thoroughness and speed
                temperature=0.5,
                max_tokens=16000
            ),
            
            AgentRole.REVIEWER: AgentTemplate(
                role=AgentRole.REVIEWER,
                name="reviewer",
                description="Code review and final synthesis specialist",
                system_prompt="""You are a senior reviewer with expertise in code quality and synthesis.

🎯 YOUR UNIQUE ROLE:
- FINAL agent in most workflows - synthesize and polish
- Review the complete solution from all agents
- Provide a cohesive summary of what was built
- Identify any gaps or improvements needed

✅ WHAT YOU MUST DO:
1. Summarize what was accomplished by all agents
2. List all generated files/components
3. Provide setup/usage instructions
4. Identify any remaining tasks or improvements
5. Create a final, polished summary

🚫 WHAT YOU MUST NOT DO:
- Do NOT reimplement code
- Do NOT repeat all previous outputs
- Do NOT generate new features

Output a FINAL SUMMARY with clear next steps.""",
                tools=["file_read"],  # Real review tools
                capabilities=["code_review", "quality_assurance", "synthesis", "reporting"],
                handoff_strategy={"next": []},  # Usually final agent
                model="gpt-4o-mini",  # Balance between analysis and speed
                temperature=0.5,
                max_tokens=16000
            ),
            
            AgentRole.UI_UX: AgentTemplate(
                role=AgentRole.UI_UX,
                name="ui_ux",
                description="User interface and experience designer",
                system_prompt="""You are a UI/UX designer focused on creating intuitive interfaces.
Your responsibilities:
1. Design user interfaces and user flows
2. Create wireframes and mockups
3. Implement responsive designs
4. Ensure accessibility and usability
5. Generate CSS and component libraries

Create beautiful, functional, and user-friendly designs.""",
                tools=["file_write"],  # Real UI/UX tools
                capabilities=["ui_design", "ux", "prototyping", "accessibility"],
                handoff_strategy={"next": ["frontend_dev", "developer", "tester"]}
            ),
            
            AgentRole.DOCUMENTATION: AgentTemplate(
                role=AgentRole.DOCUMENTATION,
                name="documentation",
                description="Technical documentation specialist",
                system_prompt="""You are a documentation specialist focused on creating clear technical documentation.
Your responsibilities:
1. Write comprehensive technical documentation
2. Create API documentation and user guides
3. Document code with clear comments and docstrings
4. Generate README files and setup instructions
5. Create tutorials and examples

Ensure documentation is clear, complete, and user-friendly.""",
                tools=["file_write"],  # Real documentation tools
                capabilities=["technical_writing", "documentation", "tutorials", "api_docs"],
                handoff_strategy={"next": ["developer", "reviewer"]}
            ),
            
            AgentRole.API_SPECIALIST: AgentTemplate(
                role=AgentRole.API_SPECIALIST,
                name="api_specialist",
                description="REST API implementation specialist",
                system_prompt="""You are an API implementation specialist focused on building complete REST APIs.

🎯 YOUR UNIQUE ROLE:
- IMPLEMENT the complete API based on architecture from previous agents
- Generate ALL necessary code files
- Focus on working, executable code

✅ WHAT YOU MUST DO:
1. Create complete server.js/app.js with Express setup
2. Implement ALL CRUD endpoints (CREATE, READ, UPDATE, DELETE)
3. Add data models/schemas (MongoDB/Sequelize)
4. Include middleware (auth, validation, error handling)
5. Generate package.json with all dependencies
6. Create .env.example for configuration

🚫 WHAT YOU MUST NOT DO:
- Do NOT just describe the API
- Do NOT repeat architecture discussions
- Do NOT leave placeholders - implement everything

Generate MULTIPLE code blocks, one for EACH file:
```javascript
// server.js - complete server setup
```
```javascript
// models/Todo.js - data model
```
```json
// package.json - dependencies
```""",
                tools=["file_write", "file_read"],  # Real API tools
                capabilities=["api_design", "rest", "graphql", "integration"],
                handoff_strategy={"next": ["backend_dev", "database_expert", "tester"]},
                model="gpt-4o",  # Optimized for API implementation
                temperature=0.3,
                max_tokens=16000
            ),
            
            AgentRole.DATABASE_EXPERT: AgentTemplate(
                role=AgentRole.DATABASE_EXPERT,
                name="database_expert",
                description="Database design and optimization specialist",
                system_prompt="""You are a database expert specializing in data modeling and optimization.
Your responsibilities:
1. Design database schemas and relationships
2. Optimize queries and indexes
3. Implement data migrations
4. Set up replication and backups
5. Ensure data integrity and performance

Support both SQL and NoSQL databases.""",
                tools=["file_write", "python_repl"],  # Real database tools
                capabilities=["database_design", "sql", "nosql", "optimization"],
                handoff_strategy={"next": ["backend_dev", "developer", "devops"]}
            ),
            
            AgentRole.ML_ENGINEER: AgentTemplate(
                role=AgentRole.ML_ENGINEER,
                name="ml_engineer",
                description="Machine learning engineering specialist",
                system_prompt="""You are an ML engineer focused on production ML systems.
Your responsibilities:
1. Build and deploy ML models
2. Create ML pipelines and workflows
3. Implement model monitoring and versioning
4. Optimize model performance
5. Design feature engineering pipelines

Focus on production-ready ML solutions.""",
                tools=["python_repl", "file_write", "file_read"],  # Real ML tools
                capabilities=["ml_ops", "model_deployment", "feature_engineering"],
                handoff_strategy={"next": ["data_scientist", "devops", "reviewer"]},
                model="o1-mini",  # Best for complex ML reasoning
                temperature=0.5,
                max_tokens=16000
            ),
            
            AgentRole.FRONTEND_DEV: AgentTemplate(
                role=AgentRole.FRONTEND_DEV,
                name="frontend_developer",
                description="Frontend development specialist",
                system_prompt="""You are a frontend developer specializing in modern web frameworks.
Your responsibilities:
1. Build responsive web applications
2. Implement React/Vue/Angular components
3. Manage state and routing
4. Optimize performance and SEO
5. Ensure cross-browser compatibility

Create complete, working frontend applications.""",
                tools=["file_write", "file_read"],  # Real frontend tools
                capabilities=["react", "vue", "angular", "frontend"],
                handoff_strategy={"next": ["ui_ux", "backend_dev", "tester"]},
                model="gpt-4o",  # Optimized for frontend code generation
                temperature=0.3,
                max_tokens=16000
            ),
            
            AgentRole.BACKEND_DEV: AgentTemplate(
                role=AgentRole.BACKEND_DEV,
                name="backend_developer",
                description="Backend development specialist",
                system_prompt="""You are a backend developer specializing in server-side development.
Your responsibilities:
1. Build scalable backend services
2. Implement business logic and workflows
3. Design microservices architecture
4. Handle authentication and authorization
5. Optimize performance and caching

Generate complete backend solutions with all dependencies.""",
                tools=["file_write", "file_read", "python_repl"],  # Real backend tools
                capabilities=["nodejs", "python", "java", "microservices"],
                handoff_strategy={"next": ["database_expert", "api_specialist", "devops"]},
                model="gpt-4o",  # Optimized for backend implementation
                temperature=0.3,
                max_tokens=16000
            ),
            
            AgentRole.CLOUD_ARCHITECT: AgentTemplate(
                role=AgentRole.CLOUD_ARCHITECT,
                name="cloud_architect",
                description="Cloud infrastructure architect",
                system_prompt="""You are a cloud architect specializing in AWS/Azure/GCP.
Your responsibilities:
1. Design cloud-native architectures
2. Implement serverless solutions
3. Configure cloud services and resources
4. Optimize cost and performance
5. Ensure high availability and disaster recovery

Provide infrastructure as code and deployment scripts.""",
                tools=["file_write"],  # Real cloud tools
                capabilities=["aws", "azure", "gcp", "serverless"],
                handoff_strategy={"next": ["devops", "security", "developer"]}
            ),
            
            AgentRole.PROJECT_MANAGER: AgentTemplate(
                role=AgentRole.PROJECT_MANAGER,
                name="project_manager",
                description="Project coordination and management",
                system_prompt="""You are a project manager coordinating development efforts.
Your responsibilities:
1. Create project plans and timelines
2. Define tasks and milestones
3. Coordinate between team members
4. Track progress and deliverables
5. Manage risks and dependencies

Ensure smooth project execution and delivery.""",
                tools=[],  # PM doesn't need tools, just coordination
                capabilities=["planning", "coordination", "risk_management"],
                handoff_strategy={"next": ["researcher", "architect", "business_analyst"]}
            ),
            
            AgentRole.BUSINESS_ANALYST: AgentTemplate(
                role=AgentRole.BUSINESS_ANALYST,
                name="business_analyst",
                description="Business analysis and requirements specialist",
                system_prompt="""You are a business analyst focusing on requirements and process optimization.
Your responsibilities:
1. Analyze business requirements and processes
2. Create user stories and acceptance criteria
3. Define business logic and workflows
4. Identify process improvements
5. Bridge technical and business teams

Ensure solutions align with business objectives.""",
                tools=[],  # Business analyst uses analysis, not tools
                capabilities=["requirements_analysis", "process_modeling", "user_stories"],
                handoff_strategy={"next": ["project_manager", "architect", "developer"]}
            ),
            
            AgentRole.QA_ENGINEER: AgentTemplate(
                role=AgentRole.QA_ENGINEER,
                name="qa_engineer",
                description="Quality assurance engineering specialist",
                system_prompt="""You are a QA engineer ensuring software quality and reliability.
Your responsibilities:
1. Design comprehensive test strategies
2. Implement automated test frameworks
3. Perform regression and performance testing
4. Track and manage defects
5. Ensure quality standards compliance

Focus on preventing defects and ensuring quality.""",
                tools=["file_write", "file_read", "python_repl"],  # Real QA tools
                capabilities=["qa_automation", "performance_testing", "defect_management"],
                handoff_strategy={"next": ["developer", "tester", "reviewer"]}
            )
        }
    
    def create_agent(self, role, **kwargs) -> AgentConfig:
        """Create an agent from a template with advanced prompts"""
        # Handle both string and AgentRole enum
        if isinstance(role, str):
            # Try to find matching role by value
            role_enum = None
            for agent_role in AgentRole:
                if agent_role.value == role.lower():
                    role_enum = agent_role
                    break
            
            if not role_enum:
                # Try partial match or common aliases
                role_map = {
                    "research": AgentRole.RESEARCHER,
                    "researcher": AgentRole.RESEARCHER,
                    "architect": AgentRole.ARCHITECT,
                    "developer": AgentRole.DEVELOPER,
                    "dev": AgentRole.DEVELOPER,
                    "reviewer": AgentRole.REVIEWER,
                    "review": AgentRole.REVIEWER,
                    "tester": AgentRole.TESTER,
                    "test": AgentRole.TESTER,
                    "qa": AgentRole.QA_ENGINEER,
                    "documentation": AgentRole.DOCUMENTATION,
                    "docs": AgentRole.DOCUMENTATION,
                    "documenter": AgentRole.DOCUMENTATION,
                    "ui": AgentRole.UI_UX,
                    "ux": AgentRole.UI_UX,
                    "frontend": AgentRole.FRONTEND_DEV,
                    "backend": AgentRole.BACKEND_DEV,
                    "api": AgentRole.API_SPECIALIST,
                    "database": AgentRole.DATABASE_EXPERT,
                    "db": AgentRole.DATABASE_EXPERT,
                    "cloud": AgentRole.CLOUD_ARCHITECT,
                    "devops": AgentRole.DEVOPS,
                    "security": AgentRole.SECURITY,
                    "ml": AgentRole.ML_ENGINEER,
                    "data": AgentRole.DATA_SCIENTIST,
                    "pm": AgentRole.PROJECT_MANAGER,
                    "manager": AgentRole.PROJECT_MANAGER,
                    "business": AgentRole.BUSINESS_ANALYST,
                    "analyst": AgentRole.BUSINESS_ANALYST,
                    "mobile": AgentRole.MOBILE_DEV
                }
                role_enum = role_map.get(role.lower())
                
            if not role_enum:
                logger.warning(f"Unknown agent role: {role}, using RESEARCHER as default")
                role_enum = AgentRole.RESEARCHER
            
            role = role_enum
        
        template = self.templates.get(role)
        if not template:
            raise ValueError(f"Unknown agent role: {role}")
        
        # Override template values with kwargs
        name = kwargs.get("name", template.name)
        tools = kwargs.get("tools", template.tools)
        description = kwargs.get("description", template.description)
        task_context = kwargs.get("task_context", "")
        previous_work = kwargs.get("previous_work", [])
        
        # Use advanced prompt system if no custom prompt provided
        if "system_prompt" not in kwargs:
            # Map agent roles to advanced prompt types
            prompt_map = {
                AgentRole.RESEARCHER: "researcher",
                AgentRole.DEVELOPER: "developer",
                AgentRole.DATA_SCIENTIST: "analyst",
                AgentRole.PROJECT_MANAGER: "orchestrator",
                AgentRole.ARCHITECT: "master",
                AgentRole.REVIEWER: "master"
            }
            
            prompt_type = prompt_map.get(role, "master")
            
            # If we have task context or previous work, create dynamic prompt
            if task_context or previous_work:
                system_prompt = create_dynamic_prompt(
                    task=task_context,
                    available_tools=tools,
                    previous_work=previous_work
                )
            else:
                # Use role-specific advanced prompt
                system_prompt = get_agent_prompt(prompt_type, task_context)
        else:
            system_prompt = kwargs.get("system_prompt", template.system_prompt)
        
        # Create agent with all necessary attributes including model settings
        agent = AgentConfig(
            name=name,
            description=description,
            system_prompt=system_prompt,
            tools=tools,
            model=template.model,
            temperature=template.temperature,
            max_tokens=template.max_tokens
        )
        
        logger.info(f"Created agent: {name} with model: {template.model} and advanced prompts")
        
        return agent
    
    def create_custom_agent(self, config: Dict[str, Any]) -> AgentConfig:
        """Create a custom agent from configuration with advanced prompts"""
        name = config.get("name", "custom_agent")
        description = config.get("description", "Custom agent")
        tools = config.get("tools", [])
        
        # Use advanced prompt if no custom prompt provided
        if "system_prompt" not in config:
            # Create dynamic prompt with task context
            task_context = f"You are {name}, specialized in {description}."
            system_prompt = create_dynamic_prompt(
                task=task_context,
                available_tools=tools,
                previous_work=[]
            )
        else:
            system_prompt = config.get("system_prompt", MASTER_AGENT_PROMPT)
        
        return AgentConfig(
            name=name,
            description=description,
            system_prompt=system_prompt,
            tools=tools,
            model=config.get("model", "gpt-4o-mini"),
            temperature=config.get("temperature", 0.7),
            max_tokens=config.get("max_tokens", 16000)
        )
    
    def get_agents_for_task(self, task: str, available_tools: List[str] = None, max_agents: int = 10) -> List[AgentConfig]:
        """Select appropriate agents based on task analysis - with clear progression"""
        task_lower = task.lower()
        agents = []
        
        # Task-based agent selection logic with clear role progression
        if any(word in task_lower for word in ["search", "research", "find", "look up", "current", "news", "latest", "stock", "tsla", "tesla", "market", "price"]):
            # Use proper Strands news agents
            from app.agents.strands_news_agents import create_news_swarm_agents
            
            # Use provided tools or get from settings
            if available_tools is None:
                # Default to basic search tool if not provided
                available_tools = ["tavily_search"]
            
            # Create appropriate agents for the task
            agent_configs = create_news_swarm_agents(task, available_tools)
            agents = [self.create_agent_from_config(config) for config in agent_configs]
            
            logger.info(f"Created news swarm with {len(agents)} agents: {[a.name for a in agents]}")
        
        elif any(word in task_lower for word in ["api", "rest", "endpoint", "backend", "todo"]):
            # Clear progression: Research -> Design -> Implement -> Review
            agents = [
                self.create_agent(AgentRole.RESEARCHER),     # Analyze requirements
                self.create_agent(AgentRole.ARCHITECT),      # Design API structure
                self.create_agent(AgentRole.API_SPECIALIST), # Implement the API
                self.create_agent(AgentRole.REVIEWER)        # Final review and summary
            ]
            
            # Log the selected agents with their names
            logger.info(f"Selected agents for API task: {[a.name for a in agents]}")
            
            # Ensure no duplicates
            seen = set()
            unique_agents = []
            for agent in agents:
                if agent.name not in seen:
                    seen.add(agent.name)
                    unique_agents.append(agent)
            agents = unique_agents
        
        elif any(word in task_lower for word in ["data", "analysis", "visualization", "ml", "machine learning"]):
            agents.extend([
                self.create_agent(AgentRole.DATA_SCIENTIST),
                self.create_agent(AgentRole.ML_ENGINEER),
                self.create_agent(AgentRole.REVIEWER)
            ])
        
        elif any(word in task_lower for word in ["frontend", "ui", "react", "vue", "angular"]):
            agents.extend([
                self.create_agent(AgentRole.UI_UX),
                self.create_agent(AgentRole.FRONTEND_DEV),
                self.create_agent(AgentRole.TESTER)
            ])
        
        elif any(word in task_lower for word in ["devops", "ci/cd", "deployment", "infrastructure"]):
            agents.extend([
                self.create_agent(AgentRole.DEVOPS),
                self.create_agent(AgentRole.CLOUD_ARCHITECT),
                self.create_agent(AgentRole.SECURITY)
            ])
        
        elif any(word in task_lower for word in ["security", "authentication", "authorization"]):
            agents.extend([
                self.create_agent(AgentRole.SECURITY),
                self.create_agent(AgentRole.BACKEND_DEV),
                self.create_agent(AgentRole.TESTER)
            ])
        
        elif any(word in task_lower for word in ["full stack", "application", "webapp"]):
            agents.extend([
                self.create_agent(AgentRole.ARCHITECT),
                self.create_agent(AgentRole.FRONTEND_DEV),
                self.create_agent(AgentRole.BACKEND_DEV),
                self.create_agent(AgentRole.DATABASE_EXPERT),
                self.create_agent(AgentRole.TESTER)
            ])
        
        else:
            # Use dynamic task analyzer for truly dynamic agent creation
            try:
                from app.agents.dynamic_task_analyzer import task_analyzer
                
                # Analyze task and create agents dynamically
                agent_configs = task_analyzer.analyze_task(task, max_agents)
                
                for config in agent_configs:
                    # Create agent from dynamic config
                    agent = self.create_custom_agent({
                        "name": config["name"],
                        "description": config["description"],
                        "system_prompt": f"You are {config['name']}, specialized in {config['description']}. Focus on your specific role in the task.",
                        "tools": [t for t in config["tools"] if t in (available_tools or [])] if available_tools else config["tools"]
                    })
                    agents.append(agent)
                
                logger.info(f"Dynamically created {len(agents)} agents based on task analysis")
            except Exception as e:
                logger.warning(f"Dynamic analysis failed: {e}, using default agents")
                # Fallback to default agents
                agents.extend([
                    self.create_agent(AgentRole.RESEARCHER),
                    self.create_agent(AgentRole.ARCHITECT),
                self.create_agent(AgentRole.DEVELOPER),
                self.create_agent(AgentRole.REVIEWER)
            ])
        
        logger.info(f"Selected {len(agents)} agents for task", agents=[a.name for a in agents])
        return agents
    
    def get_available_roles(self) -> List[str]:
        """Get list of available agent roles"""
        return [role.value for role in AgentRole]
    
    def get_agent_template(self, role: AgentRole) -> Optional[AgentTemplate]:
        """Get agent template by role"""
        return self.templates.get(role)
    
    def create_agent_from_config(self, config: Dict[str, Any]) -> AgentConfig:
        """Create agent from configuration dict"""
        return AgentConfig(
            name=config.get("name"),
            description=config.get("description"),
            system_prompt=config.get("system_prompt"),
            tools=config.get("tools", []),
            model=config.get("model", "gpt-4o-mini"),
            temperature=config.get("temperature", 0.7),
            max_tokens=config.get("max_tokens", 16000)
        )