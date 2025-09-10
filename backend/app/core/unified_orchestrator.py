"""
Unified Orchestrator - Single source of truth for agent orchestration
Combines enhanced planning, real agent generation, tool allocation, and MCP integration
"""
from typing import Dict, Any, List, Optional, Set
from dataclasses import dataclass, field
from enum import Enum
import structlog
from app.services.unified_tool_service import UnifiedToolService
from app.services.mcp_integration import mcp_service

logger = structlog.get_logger()


class AgentCapability(Enum):
    """Core capabilities that agents can have"""
    FILE_OPERATIONS = "file_operations"
    WEB_SEARCH = "web_search"
    CODE_EXECUTION = "code_execution"
    DATA_ANALYSIS = "data_analysis"
    COMMUNICATION = "communication"
    MEMORY_MANAGEMENT = "memory_management"
    API_INTEGRATION = "api_integration"
    DATABASE_OPERATIONS = "database_operations"
    VISUALIZATION = "visualization"
    DOCUMENTATION = "documentation"
    TESTING = "testing"
    DEPLOYMENT = "deployment"


@dataclass
class AgentProfile:
    """Complete profile for an agent including capabilities and tool access"""
    name: str
    role: str
    description: str
    capabilities: List[AgentCapability]
    primary_tools: List[str]  # Tools the agent specializes in
    secondary_tools: List[str]  # Tools the agent can use if needed
    mcp_tools: List[str]  # MCP tools the agent has access to
    custom_instructions: List[str]  # Detailed instructions for the agent
    knowledge_base: Dict[str, Any]  # Agent-specific knowledge
    max_iterations: int = 10
    temperature: float = 0.7
    model: str = "gpt-4"
    
    def get_all_tools(self) -> List[str]:
        """Get all tools available to this agent"""
        return list(set(self.primary_tools + self.secondary_tools + self.mcp_tools))


@dataclass
class WorkflowStage:
    """A stage in the workflow execution"""
    name: str
    description: str
    agents: List[str]  # Agent names involved in this stage
    dependencies: List[str] = field(default_factory=list)  # Previous stages that must complete
    parallel: bool = True  # Can agents work in parallel
    success_criteria: List[str] = field(default_factory=list)
    estimated_duration: int = 5  # minutes


@dataclass
class UnifiedPlan:
    """Complete execution plan with all details"""
    task: str
    complexity: str
    agents: List[AgentProfile]
    workflow: List[WorkflowStage]
    tool_allocation: Dict[str, List[str]]  # agent_name -> tools
    success_metrics: List[str]
    estimated_duration: int
    parallel_execution: bool = True
    checkpoint_frequency: int = 5  # Save progress every N steps
    fallback_strategy: Optional[str] = None


class UnifiedOrchestrator:
    """
    Single orchestrator that handles everything:
    - Task analysis and complexity assessment
    - Agent generation with proper capabilities
    - Tool allocation (built-in + MCP)
    - Workflow design
    - Custom agent configuration
    """
    
    # Predefined agent templates for common roles
    AGENT_TEMPLATES = {
        "frontend_developer": {
            "capabilities": [AgentCapability.FILE_OPERATIONS, AgentCapability.WEB_SEARCH, 
                           AgentCapability.CODE_EXECUTION, AgentCapability.VISUALIZATION],
            "primary_tools": ["file_read", "file_write", "tavily_search", "code_generator"],
            "knowledge": {"frameworks": ["React", "Vue", "Angular"], "skills": ["UI/UX", "CSS", "JavaScript"]}
        },
        "backend_developer": {
            "capabilities": [AgentCapability.FILE_OPERATIONS, AgentCapability.CODE_EXECUTION,
                           AgentCapability.DATABASE_OPERATIONS, AgentCapability.API_INTEGRATION],
            "primary_tools": ["file_read", "file_write", "python_repl", "database"],
            "knowledge": {"frameworks": ["FastAPI", "Django", "Express"], "skills": ["API Design", "Database", "Security"]}
        },
        "data_analyst": {
            "capabilities": [AgentCapability.DATA_ANALYSIS, AgentCapability.VISUALIZATION,
                           AgentCapability.FILE_OPERATIONS, AgentCapability.DATABASE_OPERATIONS],
            "primary_tools": ["python_repl", "database", "file_read", "file_write"],
            "knowledge": {"tools": ["Pandas", "NumPy", "Matplotlib"], "skills": ["Statistics", "ML", "Visualization"]}
        },
        "devops_engineer": {
            "capabilities": [AgentCapability.DEPLOYMENT, AgentCapability.FILE_OPERATIONS,
                           AgentCapability.CODE_EXECUTION, AgentCapability.API_INTEGRATION],
            "primary_tools": ["python_repl", "file_write", "api_client"],
            "knowledge": {"tools": ["Docker", "Kubernetes", "CI/CD"], "skills": ["Infrastructure", "Automation"]}
        },
        "qa_engineer": {
            "capabilities": [AgentCapability.TESTING, AgentCapability.FILE_OPERATIONS,
                           AgentCapability.CODE_EXECUTION, AgentCapability.DOCUMENTATION],
            "primary_tools": ["validator", "python_repl", "file_read", "file_write"],
            "knowledge": {"tools": ["Pytest", "Jest", "Selenium"], "skills": ["Testing", "Quality Assurance"]}
        },
        "researcher": {
            "capabilities": [AgentCapability.WEB_SEARCH, AgentCapability.DOCUMENTATION,
                           AgentCapability.MEMORY_MANAGEMENT],
            "primary_tools": ["tavily_search", "web_search", "memory_store", "file_write"],
            "knowledge": {"skills": ["Research", "Analysis", "Documentation"]}
        },
        "project_manager": {
            "capabilities": [AgentCapability.COMMUNICATION, AgentCapability.DOCUMENTATION,
                           AgentCapability.MEMORY_MANAGEMENT],
            "primary_tools": ["memory_store", "file_write", "communication"],
            "knowledge": {"skills": ["Planning", "Coordination", "Risk Management"]}
        }
    }
    
    def __init__(self):
        self.tool_service = UnifiedToolService()
        self.mcp_service = mcp_service
        self._initialized = False
    
    async def initialize(self):
        """Initialize the orchestrator with all available tools"""
        if self._initialized:
            return
            
        await self.tool_service.initialize()
        self._initialized = True
        logger.info("✅ Unified Orchestrator initialized")
    
    async def create_unified_plan(
        self,
        task: str,
        context: Optional[Dict[str, Any]] = None,
        custom_agents: Optional[List[Dict[str, Any]]] = None,
        max_agents: int = 10,
        use_mcp_tools: bool = True
    ) -> UnifiedPlan:
        """
        Create a comprehensive execution plan with real agents and proper tool allocation
        """
        await self.initialize()
        
        # Analyze the task
        analysis = await self._analyze_task_deeply(task, context)
        
        # Determine complexity
        complexity = self._assess_complexity(analysis)
        
        # Generate agents based on analysis
        if custom_agents:
            agents = await self._create_custom_agents(custom_agents, analysis)
        else:
            agents = await self._generate_smart_agents(analysis, max_agents, use_mcp_tools)
        
        # Research-first ordering: if WEB_SEARCH is required, move a web_search-capable agent to front
        try:
            requires_web = AgentCapability.WEB_SEARCH in set(analysis.get("required_capabilities", []))
            if requires_web:
                web_agents = [a for a in agents if AgentCapability.WEB_SEARCH in set(a.capabilities or [])]
                non_web = [a for a in agents if AgentCapability.WEB_SEARCH not in set(a.capabilities or [])]
                if web_agents:
                    # Preserve relative order otherwise
                    agents = [web_agents[0]] + non_web + web_agents[1:]
        except Exception:
            pass

        # Design workflow
        workflow = self._design_workflow(agents, analysis)
        
        # Allocate tools to agents
        allowed_tools = []
        tools_catalog: List[Dict[str, Any]] = []
        try:
            if context and isinstance(context.get("allowed_tools"), list):
                allowed_tools = [str(t) for t in context.get("allowed_tools") if t]
            if context and isinstance(context.get("tools_catalog"), list):
                tools_catalog = context.get("tools_catalog")
        except Exception:
            allowed_tools = []
        tool_allocation = self._allocate_tools(
            agents,
            use_mcp_tools,
            allowed_tools,
            tools_catalog=tools_catalog,
            task=task,
            analysis=analysis,
        )
        
        # Define success metrics
        success_metrics = self._define_success_metrics(analysis)
        
        # Create the plan
        plan = UnifiedPlan(
            task=task,
            complexity=complexity,
            agents=agents,
            workflow=workflow,
            tool_allocation=tool_allocation,
            success_metrics=success_metrics,
            estimated_duration=self._estimate_duration(workflow),
            parallel_execution=analysis.get("parallel_possible", True),
            checkpoint_frequency=5,
            fallback_strategy=self._define_fallback_strategy(complexity)
        )
        
        logger.info(f"📋 Created unified plan with {len(agents)} agents and {len(workflow)} workflow stages")
        return plan
    
    async def _analyze_task_deeply(self, task: str, context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Deep analysis of the task to understand requirements"""
        analysis = {
            "original_task": task,
            "domains": [],
            "required_capabilities": [],
            "estimated_steps": [],
            "deliverables": [],
            "technical_requirements": [],
            "parallel_possible": True,
            "requires_human_input": False
        }
        
        # Analyze task for different domains
        task_lower = task.lower()
        
        # Check domains - enhanced with app/application detection
        # For any app/application, we likely need both frontend and backend
        if any(word in task_lower for word in ["app", "application", "system", "platform", "tool", "dashboard", "website"]):
            # Apps typically need both frontend and backend
            if "frontend" not in analysis["domains"]:
                analysis["domains"].append("frontend")
                analysis["required_capabilities"].extend([AgentCapability.FILE_OPERATIONS, AgentCapability.CODE_EXECUTION, AgentCapability.VISUALIZATION])
            if "backend" not in analysis["domains"]:
                analysis["domains"].append("backend")
                analysis["required_capabilities"].extend([AgentCapability.DATABASE_OPERATIONS, AgentCapability.API_INTEGRATION])
        
        # Specific frontend indicators
        if any(word in task_lower for word in ["ui", "frontend", "react", "vue", "angular", "design", "css", "interface", "page", "component"]):
            if "frontend" not in analysis["domains"]:
                analysis["domains"].append("frontend")
                analysis["required_capabilities"].extend([AgentCapability.FILE_OPERATIONS, AgentCapability.VISUALIZATION])
        
        # Specific backend indicators
        if any(word in task_lower for word in ["backend", "api", "server", "database", "endpoint", "crud", "storage", "auth", "rest", "graphql"]):
            if "backend" not in analysis["domains"]:
                analysis["domains"].append("backend")
                analysis["required_capabilities"].extend([AgentCapability.DATABASE_OPERATIONS, AgentCapability.API_INTEGRATION])
        
        if any(word in task_lower for word in ["data", "analysis", "statistics", "ml", "ai"]):
            analysis["domains"].append("data_science")
            analysis["required_capabilities"].extend([AgentCapability.DATA_ANALYSIS, AgentCapability.VISUALIZATION])
        
        if any(word in task_lower for word in ["test", "qa", "quality", "bug", "debug"]):
            analysis["domains"].append("testing")
            analysis["required_capabilities"].append(AgentCapability.TESTING)
        
        if any(word in task_lower for word in ["deploy", "docker", "kubernetes", "ci/cd"]):
            analysis["domains"].append("devops")
            analysis["required_capabilities"].append(AgentCapability.DEPLOYMENT)
        
        if any(word in task_lower for word in ["research", "find", "search", "investigate"]):
            analysis["domains"].append("research")
            analysis["required_capabilities"].append(AgentCapability.WEB_SEARCH)
        
        # Identify deliverables
        if "create" in task_lower or "build" in task_lower:
            analysis["deliverables"].append("New implementation")
        if "fix" in task_lower or "debug" in task_lower:
            analysis["deliverables"].append("Bug fixes")
        if "analyze" in task_lower:
            analysis["deliverables"].append("Analysis report")
        if "document" in task_lower:
            analysis["deliverables"].append("Documentation")
        
        # Remove duplicates
        analysis["required_capabilities"] = list(set(analysis["required_capabilities"]))
        
        return analysis
    
    def _assess_complexity(self, analysis: Dict[str, Any]) -> str:
        """Assess task complexity based on analysis"""
        score = 0
        
        # Domain complexity
        score += len(analysis["domains"]) * 2
        
        # Capability complexity
        score += len(analysis["required_capabilities"])
        
        # Deliverable complexity
        score += len(analysis["deliverables"]) * 1.5
        
        if score <= 3:
            return "simple"
        elif score <= 7:
            return "moderate"
        elif score <= 12:
            return "complex"
        else:
            return "advanced"
    
    async def _generate_smart_agents(
        self, 
        analysis: Dict[str, Any], 
        max_agents: int,
        use_mcp_tools: bool
    ) -> List[AgentProfile]:
        """Generate intelligent agents based on task analysis"""
        agents = []
        
        # Always have a coordinator
        coordinator = AgentProfile(
            name="task_coordinator",
            role="Project Coordinator",
            description="Coordinates all agents and ensures task completion",
            capabilities=[AgentCapability.COMMUNICATION, AgentCapability.MEMORY_MANAGEMENT],
            primary_tools=["memory_store", "memory_recall"],
            secondary_tools=["file_write"],
            mcp_tools=[],
            custom_instructions=[
                "Monitor progress of all agents",
                "Ensure deliverables are met",
                "Coordinate handoffs between agents",
                "Track dependencies and blockers",
                "Maintain project timeline",
                "Document key decisions",
                "Escalate issues when needed",
                "Verify quality standards are met"
            ],
            knowledge_base={"project_management": True, "coordination": True}
        )
        agents.append(coordinator)
        
        # If no domains were detected but it's a creation task, add default developers
        if not analysis["domains"] and any(word in task.lower() for word in ["create", "build", "make", "develop"]):
            analysis["domains"] = ["frontend", "backend"]
            logger.info(f"No specific domains detected for '{task}', adding default frontend and backend")
        
        # Add domain-specific agents
        for domain in analysis["domains"]:
            if len(agents) >= max_agents:
                break
                
            if domain == "frontend":
                agent = self._create_agent_from_template("frontend_developer", use_mcp_tools)
                agents.append(agent)
            
            elif domain == "backend":
                agent = self._create_agent_from_template("backend_developer", use_mcp_tools)
                agents.append(agent)
            
            elif domain == "data_science":
                agent = self._create_agent_from_template("data_analyst", use_mcp_tools)
                agents.append(agent)
            
            elif domain == "testing":
                agent = self._create_agent_from_template("qa_engineer", use_mcp_tools)
                agents.append(agent)
            
            elif domain == "devops":
                agent = self._create_agent_from_template("devops_engineer", use_mcp_tools)
                agents.append(agent)
            
            elif domain == "research":
                agent = self._create_agent_from_template("researcher", use_mcp_tools)
                agents.append(agent)
        
        # Add a reviewer if we have room
        if len(agents) < max_agents and len(agents) > 2:
            reviewer = AgentProfile(
                name="quality_reviewer",
                role="Quality Reviewer",
                description="Reviews all work and ensures quality standards",
                capabilities=[AgentCapability.TESTING, AgentCapability.DOCUMENTATION],
                primary_tools=["validator", "file_read"],
                secondary_tools=["python_repl"],
                mcp_tools=[],
                custom_instructions=[
                    "Review all code for quality and best practices",
                    "Check for security vulnerabilities",
                    "Ensure documentation is complete",
                    "Verify test coverage",
                    "Validate against requirements",
                    "Suggest improvements",
                    "Create quality report",
                    "Sign off on deliverables"
                ],
                knowledge_base={"quality_assurance": True, "best_practices": True}
            )
            agents.append(reviewer)
        
        logger.info(f"Generated {len(agents)} smart agents for task")
        return agents
    
    def _create_agent_from_template(self, template_name: str, use_mcp_tools: bool) -> AgentProfile:
        """Create an agent from a template"""
        template = self.AGENT_TEMPLATES.get(template_name, {})
        
        # Get MCP tools if enabled
        mcp_tools = []
        if use_mcp_tools:
            # Get MCP tools that match agent capabilities
            all_mcp_tools = [name for name in self.tool_service.all_tools.keys() if name.startswith("mcp_")]
            mcp_tools = all_mcp_tools[:3]  # Limit to avoid overload
        
        # Create detailed instructions based on role
        instructions = self._generate_agent_instructions(template_name)
        
        agent = AgentProfile(
            name=template_name,
            role=template_name.replace("_", " ").title(),
            description=f"Specialized {template_name.replace('_', ' ')} with deep expertise",
            capabilities=template.get("capabilities", []),
            primary_tools=template.get("primary_tools", []),
            secondary_tools=["file_read", "file_write"],  # All agents can read/write files
            mcp_tools=mcp_tools,
            custom_instructions=instructions,
            knowledge_base=template.get("knowledge", {})
        )
        
        return agent
    
    def _generate_agent_instructions(self, role: str) -> List[str]:
        """Generate detailed instructions for an agent based on role"""
        base_instructions = [
            f"You are a specialized {role.replace('_', ' ')}",
            "Follow best practices for your domain",
            "Document your work clearly",
            "Collaborate with other agents when needed",
            "Ask for clarification if requirements are unclear",
            "Test your work before marking complete",
            "Use tools efficiently and appropriately",
            "Report progress regularly"
        ]
        
        role_specific = {
            "frontend_developer": [
                "Create responsive and accessible UI components",
                "Follow modern React/Vue/Angular patterns",
                "Optimize for performance and user experience",
                "Ensure cross-browser compatibility",
                "Write clean, maintainable CSS/SCSS",
                "Implement proper state management",
                "Add appropriate error handling",
                "Create reusable components"
            ],
            "backend_developer": [
                "Design RESTful or GraphQL APIs",
                "Implement proper authentication and authorization",
                "Optimize database queries",
                "Handle errors gracefully",
                "Add input validation and sanitization",
                "Implement caching where appropriate",
                "Write unit and integration tests",
                "Document API endpoints"
            ],
            "data_analyst": [
                "Clean and preprocess data properly",
                "Perform exploratory data analysis",
                "Create meaningful visualizations",
                "Apply appropriate statistical methods",
                "Document findings clearly",
                "Validate results",
                "Handle missing data appropriately",
                "Optimize for large datasets"
            ],
            "qa_engineer": [
                "Write comprehensive test cases",
                "Perform unit, integration, and e2e testing",
                "Document bugs clearly with reproduction steps",
                "Verify fixes thoroughly",
                "Check edge cases",
                "Ensure test coverage meets standards",
                "Perform regression testing",
                "Validate against requirements"
            ]
        }
        
        return base_instructions + role_specific.get(role, [])
    
    def _design_workflow(self, agents: List[AgentProfile], analysis: Dict[str, Any]) -> List[WorkflowStage]:
        """Design an efficient workflow for the agents"""
        workflow = []
        
        # Stage 1: Planning and Research
        if any(a.name in ["task_coordinator", "researcher"] for a in agents):
            workflow.append(WorkflowStage(
                name="Planning & Research",
                description="Initial planning and information gathering",
                agents=["task_coordinator", "researcher"] if any(a.name == "researcher" for a in agents) else ["task_coordinator"],
                dependencies=[],
                parallel=True,
                success_criteria=["Requirements understood", "Research complete", "Plan created"]
            ))
        
        # Stage 2: Implementation
        implementation_agents = [a.name for a in agents if "developer" in a.name or "engineer" in a.name]
        if implementation_agents:
            workflow.append(WorkflowStage(
                name="Implementation",
                description="Main development and implementation work",
                agents=implementation_agents,
                dependencies=["Planning & Research"] if workflow else [],
                parallel=True,
                success_criteria=["Code implemented", "Features working", "Tests passing"]
            ))
        
        # Stage 3: Testing
        if any(a.name == "qa_engineer" for a in agents):
            workflow.append(WorkflowStage(
                name="Testing & Validation",
                description="Comprehensive testing and validation",
                agents=["qa_engineer"],
                dependencies=["Implementation"] if "Implementation" in [s.name for s in workflow] else [],
                parallel=False,
                success_criteria=["All tests passing", "No critical bugs", "Performance acceptable"]
            ))
        
        # Stage 4: Review
        if any(a.name == "quality_reviewer" for a in agents):
            workflow.append(WorkflowStage(
                name="Review & Finalization",
                description="Final review and quality assurance",
                agents=["quality_reviewer", "task_coordinator"],
                dependencies=[s.name for s in workflow[:-1]] if workflow else [],
                parallel=False,
                success_criteria=["Quality standards met", "Documentation complete", "Ready for delivery"]
            ))
        
        return workflow
    
    def _allocate_tools(
        self,
        agents: List[AgentProfile],
        use_mcp_tools: bool,
        allowed_tools: Optional[List[str]] = None,
        tools_catalog: Optional[List[Dict[str, Any]]] = None,
        task: Optional[str] = None,
        analysis: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, List[str]]:
        """Allocate tools to agents based on roles, task context, and tool metadata.
        Updates each agent's primary/secondary tools with a prioritized selection.
        """
        allocation = {}
        allowed_set = set([t.strip() for t in (allowed_tools or []) if isinstance(t, str) and t.strip()])
        task_lower = (task or "").lower()
        req_caps = set((analysis or {}).get("required_capabilities", []))

        # Build tool metadata index from catalog and registry
        catalog_index: Dict[str, Dict[str, Any]] = {}
        if tools_catalog:
            for t in tools_catalog:
                name = t.get("name") or t.get("id")
                if name:
                    catalog_index[name] = {
                        "name": name,
                        "description": t.get("description", ""),
                        "category": (t.get("category") or "").lower(),
                        "requires_approval": bool(t.get("requires_approval", False))
                    }
        # Augment with unified tool service data
        for name, info in self.tool_service.all_tools.items():
            if name not in catalog_index:
                catalog_index[name] = {
                    "name": name,
                    "description": info.get("description", ""),
                    "category": str(info.get("category", "")).lower(),
                    "requires_approval": bool(info.get("requires_approval", False))
                }

        # Capability to category preferences
        cap_to_cats = {
            AgentCapability.WEB_SEARCH: {"web_search", "web"},
            AgentCapability.FILE_OPERATIONS: {"file_operations", "file"},
            AgentCapability.CODE_EXECUTION: {"code_execution", "code"},
            AgentCapability.DATA_ANALYSIS: {"data", "calculation"},
            AgentCapability.API_INTEGRATION: {"web_search", "api", "web"},
            AgentCapability.DOCUMENTATION: {"documentation", "utility"},
            AgentCapability.VISUALIZATION: {"documentation"},
            AgentCapability.TESTING: {"testing", "code"},
            AgentCapability.DEPLOYMENT: {"aws", "system"},
            AgentCapability.MEMORY_MANAGEMENT: {"memory", "utility"},
            AgentCapability.COMMUNICATION: {"communication"},
            AgentCapability.DATABASE_OPERATIONS: {"database", "data"},
        }

        def score(tool_name: str, agent: AgentProfile) -> float:
            s = 0.0
            meta = catalog_index.get(tool_name, {})
            cat = meta.get("category", "")
            desc = f"{meta.get('description','')} {tool_name}".lower()

            # Base: agent familiarity
            if tool_name in agent.primary_tools:
                s += 5
            if tool_name in agent.secondary_tools:
                s += 2

            # Capabilities vs categories
            for cap in set(agent.capabilities) | req_caps:
                prefs = cap_to_cats.get(cap, set())
                if cat in prefs:
                    s += 2.5

            # Role/description keywords
            role_text = f"{agent.role} {agent.description}".lower()
            if any(k in role_text for k in ["research", "investigat", "summary", "search"]):
                if any(k in tool_name for k in ["tavily", "web_search", "wikipedia", "fetch_webpage", "extract_links", "rss_fetch", "sitemap"]):
                    s += 2
            if any(k in role_text for k in ["develop", "code", "implement"]):
                if any(k in tool_name for k in ["python_repl", "code_generator", "file_write", "file_read", "code_interpreter"]):
                    s += 2
            if any(k in role_text for k in ["design", "document", "diagram", "doc"]):
                if any(k in tool_name for k in ["diagram", "agent_graph", "journal"]):
                    s += 1.5
            if any(k in role_text for k in ["data", "analy", "stats"]):
                if any(k in tool_name for k in ["calculator", "python_repl", "csv", "json_parse"]):
                    s += 1.5

            # Task keywords influence
            if any(k in task_lower for k in ["crawl", "links", "sitemap"]):
                if any(k in tool_name for k in ["extract_links", "sitemap_fetch", "tavily_crawl"]):
                    s += 1.5
            if any(k in task_lower for k in ["aws", "s3", "lambda", "dynamo"]):
                if "use_aws" in tool_name:
                    s += 2

            # Prefer non-approval for default picks slightly
            if not meta.get("requires_approval", False):
                s += 0.3

            return s

        
        for agent in agents:
            # Get all tools for this agent
            tools = agent.get_all_tools()
            
            # Don't filter - use all tools the agent has
            # The frontend may supply an allowed list to constrain tools
            if allowed_set:
                available_tools = [t for t in tools if t in allowed_set]
            else:
                available_tools = tools.copy()
            
            # Rank by score using metadata and context
            unique_tools = list(set(available_tools))
            scored = [(t, score(t, agent)) for t in unique_tools]
            ranked = [t for t, _ in sorted(scored, key=lambda x: x[1], reverse=True)]

            # Debug: log top-scored tools with categories and scores
            try:
                top_k = scored
                top_k.sort(key=lambda x: x[1], reverse=True)
                top_k = top_k[:8]
                top_info = []
                for t, sc in top_k:
                    meta = catalog_index.get(t, {})
                    cat = meta.get("category", "")
                    top_info.append(f"{t}({cat}):{sc:.2f}")
                logger.info(f"Tool scoring for agent '{agent.name}': " + ", ".join(top_info))
            except Exception:
                pass

            # Ensure core tools per capability
            essentials = []
            if AgentCapability.CODE_EXECUTION in agent.capabilities and "python_repl" in catalog_index:
                essentials.append("python_repl")
            if AgentCapability.FILE_OPERATIONS in agent.capabilities:
                for t in ["file_write", "file_read"]:
                    if t in catalog_index:
                        essentials.append(t)
            if AgentCapability.WEB_SEARCH in agent.capabilities:
                for t in ["tavily_search", "web_search", "fetch_webpage"]:
                    if t in catalog_index:
                        essentials.append(t)

            # Merge essentials with ranked and keep order/uniqueness
            preferred = []
            for t in essentials + ranked:
                if t not in preferred:
                    preferred.append(t)

            # Limit counts
            primary = preferred[:6]
            secondary = preferred[6:12]

            # Update agent profiles so downstream API reflects selection
            agent.primary_tools = primary
            agent.secondary_tools = secondary

            # Log and store allocation
            logger.info(f"Agent {agent.name} allocated tools (primary): {primary}")
            allocation[agent.name] = primary
            
        return allocation
    
    def _define_success_metrics(self, analysis: Dict[str, Any]) -> List[str]:
        """Define measurable success metrics for the task"""
        metrics = []
        
        # Add metrics based on deliverables
        for deliverable in analysis.get("deliverables", []):
            if "implementation" in deliverable.lower():
                metrics.append("Code compiles without errors")
                metrics.append("All features implemented as specified")
            if "bug" in deliverable.lower():
                metrics.append("All identified bugs fixed")
                metrics.append("No regression in existing functionality")
            if "analysis" in deliverable.lower():
                metrics.append("Analysis report generated")
                metrics.append("Key insights identified")
            if "documentation" in deliverable.lower():
                metrics.append("Documentation complete and accurate")
                metrics.append("Examples provided")
        
        # Add general metrics
        metrics.extend([
            "Task completed successfully",
            "Quality standards met",
            "No critical issues remaining"
        ])
        
        return metrics
    
    def _estimate_duration(self, workflow: List[WorkflowStage]) -> int:
        """Estimate total duration based on workflow"""
        total = 0
        for stage in workflow:
            if stage.parallel:
                # Parallel stages take as long as the longest task
                total += stage.estimated_duration
            else:
                # Sequential stages add up
                total += stage.estimated_duration
        return total
    
    def _define_fallback_strategy(self, complexity: str) -> str:
        """Define fallback strategy based on complexity"""
        strategies = {
            "simple": "Retry failed steps up to 3 times",
            "moderate": "Retry with different approach, escalate if needed",
            "complex": "Break down into smaller tasks, add specialized agents",
            "advanced": "Multi-stage retry with checkpoint recovery, human escalation"
        }
        return strategies.get(complexity, "Retry and escalate")
    
    async def _create_custom_agents(
        self, 
        custom_agents: List[Dict[str, Any]], 
        analysis: Dict[str, Any]
    ) -> List[AgentProfile]:
        """Create agents from custom configurations"""
        agents = []
        
        for config in custom_agents:
            # Parse capabilities
            capabilities = []
            for cap in config.get("capabilities", []):
                try:
                    # Handle different formats of capabilities
                    cap_str = cap.upper().replace(" ", "_").replace("-", "_")
                    if hasattr(AgentCapability, cap_str):
                        capabilities.append(AgentCapability[cap_str])
                    else:
                        # Try without modification
                        capabilities.append(AgentCapability[cap])
                except (KeyError, Exception) as e:
                    logger.warning(f"Unknown capability: {cap} - {e}")
                    # Map common capability names to enum values
                    capability_map = {
                        "file_operations": AgentCapability.FILE_OPERATIONS,
                        "web_search": AgentCapability.WEB_SEARCH,
                        "code_execution": AgentCapability.CODE_EXECUTION,
                        "data_analysis": AgentCapability.DATA_ANALYSIS,
                        "communication": AgentCapability.COMMUNICATION,
                        "memory_management": AgentCapability.MEMORY_MANAGEMENT,
                        "api_integration": AgentCapability.API_INTEGRATION,
                        "database_operations": AgentCapability.DATABASE_OPERATIONS,
                        "visualization": AgentCapability.VISUALIZATION,
                        "documentation": AgentCapability.DOCUMENTATION,
                        "testing": AgentCapability.TESTING,
                        "deployment": AgentCapability.DEPLOYMENT
                    }
                    if cap.lower() in capability_map:
                        capabilities.append(capability_map[cap.lower()])
            
            # Get tools - handle both formats (tools array or separated arrays)
            tools = config.get("tools", [])
            primary_tools = config.get("primary_tools", tools[:5] if tools else [])  # First 5 tools as primary
            secondary_tools = config.get("secondary_tools", tools[5:10] if len(tools) > 5 else [])  # Next 5 as secondary
            mcp_tools = config.get("mcp_tools", [])
            
            # Log what tools we're trying to use
            logger.info(f"Agent {config.get('name')} requested tools: {tools}")
            logger.info(f"Available tools in registry: {list(self.tool_service.all_tools.keys())}")
            
            # Don't filter out tools - trust what the frontend sends
            # The frontend already validated these tools exist
            primary_tools = primary_tools if primary_tools else tools[:5] if tools else []
            secondary_tools = secondary_tools if secondary_tools else tools[5:10] if len(tools) > 5 else []
            
            # For MCP tools, check if they start with 'mcp_'
            mcp_tools = [t for t in tools if t.startswith('mcp_')] if not mcp_tools else mcp_tools
            
            agent = AgentProfile(
                name=config.get("name", f"custom_agent_{len(agents)}"),
                role=config.get("role", "Custom Agent"),
                description=config.get("description", "Custom configured agent"),
                capabilities=capabilities,
                primary_tools=primary_tools,
                secondary_tools=secondary_tools,
                mcp_tools=mcp_tools,
                custom_instructions=config.get("instructions", []),
                knowledge_base=config.get("knowledge", {}),
                max_iterations=config.get("max_iterations", 10),
                temperature=config.get("temperature", 0.7),
                model=config.get("model", "gpt-4")
            )
            
            agents.append(agent)
        
        return agents


# Singleton instance
unified_orchestrator = UnifiedOrchestrator()
