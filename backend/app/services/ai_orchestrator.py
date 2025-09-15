"""
AI Orchestrator for Dynamic Agent Generation
Analyzes tasks and creates optimal agent configurations with appropriate tools
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import json
from openai import AsyncOpenAI
import structlog
from app.schemas.swarm import AgentConfig
from app.config import settings
from app.tools.strands_tool_registry import get_dynamic_tools
from app.services.unified_tool_service import get_unified_tools

logger = structlog.get_logger()


class TaskAnalysis(BaseModel):
    """Task analysis result"""
    task_type: str  # e.g., "development", "research", "analysis", "creative"
    complexity: str  # "simple", "moderate", "complex"
    domains: List[str]  # e.g., ["web", "api", "database", "ml"]
    required_capabilities: List[str]  # e.g., ["code_generation", "file_operations", "web_search"]
    suggested_workflow: str  # e.g., "sequential", "parallel", "hierarchical"
    estimated_agents: int


class AgentTemplate(BaseModel):
    """Dynamic agent template"""
    name: str
    role: str
    capabilities: List[str]
    tools: List[str]
    system_prompt: str
    model: str = "gpt-4o-mini"


class AIOrchestrator:
    """
    AI Orchestrator that analyzes tasks and dynamically generates optimal agent configurations
    """
    
    def __init__(self):
        self.client = None
        self._initialized = False
        self.tool_registry = None
        self.capability_tools = {}  # Will be populated dynamically
        
        # Model selection based on task complexity
        self.complexity_models = {
            "simple": "gpt-4o-mini",
            "moderate": "gpt-4o",
            "complex": "gpt-4o"
        }
    
    async def _ensure_initialized(self):
        """Ensure orchestrator is initialized with unified tools"""
        if not self._initialized:
            self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            
            # Initialize unified tool service (primary source)
            self.unified_service = await get_unified_tools()
            
            # Keep tool registry for compatibility
            self.tool_registry = await get_dynamic_tools()
            
            # Build capability mappings from unified service
            await self._build_capability_mappings()
            
            self._initialized = True
    
    async def _build_capability_mappings(self):
        """Build capability to tool mappings from unified service - ONLY ENABLED TOOLS"""
        # Get all available tools from unified service
        all_tools = self.unified_service.get_all_tools(enabled_only=True)
        
        # Build capability mappings from unified service
        self.capability_tools = {}
        for tool in all_tools:
            tool_name = tool["name"]
            category = tool.get("category", "utilities")
            
            # Map category to capabilities
            if category not in self.capability_tools:
                self.capability_tools[category] = []
            if tool_name not in self.capability_tools[category]:
                self.capability_tools[category].append(tool_name)
            
            # Also map by traditional capability names for compatibility
            capability_mapping = {
                "file_operations": "file_operations",
                "web_search": "web_search",
                "memory": "memory",
                "calculator": "calculator",
                "code": "code_generation",
                "communication": "communication"
            }
            
            if category in capability_mapping:
                alt_cap = capability_mapping[category]
                if alt_cap not in self.capability_tools:
                    self.capability_tools[alt_cap] = []
                if tool_name not in self.capability_tools[alt_cap]:
                    self.capability_tools[alt_cap].append(tool_name)
        
        logger.info(f"Built capability mappings for {len(self.capability_tools)} capabilities (enabled tools only)")
        logger.info(f"Available capabilities: {list(self.capability_tools.keys())}")
    
    async def cleanup(self):
        """Cleanup resources"""
        # Note: AsyncOpenAI doesn't have a close method, just reset the reference
        self.client = None
        self._initialized = False
    
    async def analyze_task(self, task: str) -> TaskAnalysis:
        """
        Analyze the task to understand requirements and complexity
        """
        await self._ensure_initialized()
        prompt = f"""
        Analyze this task and provide a structured analysis:
        Task: {task}
        
        Provide your analysis in JSON format with:
        - task_type: Main category (development/research/analysis/creative/automation)
        - complexity: simple/moderate/complex
        - domains: List of technical domains involved
        - required_capabilities: List of capabilities needed (from: {list(self.capability_tools.keys())})
        - suggested_workflow: sequential/parallel/hierarchical
        - estimated_agents: Number of agents needed (2-8)
        
        Be specific and accurate in your analysis.
        """
        
        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a task analysis expert. Analyze tasks and determine optimal agent configurations."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.3
            )
            
            analysis_data = json.loads(response.choices[0].message.content)
            return TaskAnalysis(**analysis_data)
            
        except Exception as e:
            logger.error(f"Task analysis failed: {e}")
            # Return default analysis
            return TaskAnalysis(
                task_type="development",
                complexity="moderate",
                domains=["general"],
                required_capabilities=["code_generation", "file_operations"],
                suggested_workflow="sequential",
                estimated_agents=3
            )
    
    async def generate_agents(self, task: str, analysis: TaskAnalysis, execution_mode: str = "auto") -> List[AgentConfig]:
        """
        Generate dynamic agent configurations based on task analysis
        """
        await self._ensure_initialized()
        
        # Determine if we should generate parallel agents
        use_parallel = execution_mode == "parallel" or (
            execution_mode == "auto" and analysis.suggested_workflow == "parallel"
        )
        logger.info(f"🎯 Orchestrator generating agents with execution_mode={execution_mode}, use_parallel={use_parallel}, analysis.suggested_workflow={analysis.suggested_workflow}")
        
        workflow_instructions = ""
        if use_parallel:
            workflow_instructions = """
        CRITICAL: Generate INDEPENDENT agents that can work IN PARALLEL:
        - Each agent should handle a SEPARATE part of the task
        - Agents should NOT depend on each other's output
        - Do NOT use phrases like "continue from", "based on previous", "using results from"
        - Each agent should work on their assigned subtask INDEPENDENTLY
        - Only a final synthesizer/coordinator (if needed) should depend on others
        """
        else:
            workflow_instructions = """
        Generate agents that work SEQUENTIALLY:
        - Agents can build on each other's work
        - Use handoffs and context passing between agents
        - Each agent can use results from previous agents
        """
        
        prompt = f"""
        IMPORTANT: Create {analysis.estimated_agents} UNIQUE agents SPECIFICALLY for this exact task:
        Task: "{task}"
        Execution Mode: {execution_mode.upper()}
        
        {workflow_instructions}
        
        DO NOT use generic agent templates or predefined roles.
        Each agent must be uniquely designed for THIS SPECIFIC TASK: "{task}"
        
        Task Analysis:
        - Type: {analysis.task_type}
        - Complexity: {analysis.complexity}
        - Domains: {', '.join(analysis.domains)}
        - Required Capabilities: {', '.join(analysis.required_capabilities)}
        - Workflow: {analysis.suggested_workflow}
        
        Available tools (dynamically discovered):
        {json.dumps(self.capability_tools, indent=2)}
        
        IMPORTANT: These are REAL tools that can be executed.
        Agents should use the exact tool names provided.
        
        CRITICAL INSTRUCTIONS FOR WEB SEARCH TASKS:
        - For ANY task requiring web search, news, or current information, use "tavily_search" tool
        - This is a REAL tool that performs actual web searches - agents should use [TOOL: tavily_search] format
        - DO NOT have agents create Python files to simulate searches
        
        Generate agents in JSON format with:
        - name: Unique identifier specific to this task (snake_case, include task context)
        - role: Specific role for accomplishing "{task}"
        - capabilities: List of required capabilities
        - tools: Specific tools from the available tools (choose wisely based on task)
        - system_prompt: Detailed prompt specifically for "{task}" - not generic
        
        Requirements:
        1. Agent names should reflect the specific task (e.g., for "analyze stock data": stock_data_collector, market_trend_analyzer, etc.)
        2. System prompts must mention the specific task "{task}" and provide task-specific instructions
        3. Tool selection should be optimal for the specific task requirements
        4. Each agent should have a unique contribution to completing "{task}"
        5. {"Agents should work INDEPENDENTLY on separate subtasks" if use_parallel else "Agents should collaborate in a logical sequence for this specific task"}
        
        Return as JSON array of agents uniquely designed for: {task}
        """
        
        try:
            logger.info(f"Generating agents with prompt length: {len(prompt)} chars")
            response = await self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are an expert in multi-agent system design. Create optimal agent configurations."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.5
            )
            
            agents_data = json.loads(response.choices[0].message.content)
            if "agents" in agents_data:
                agents_data = agents_data["agents"]
            elif not isinstance(agents_data, list):
                agents_data = [agents_data]
            
            # Convert to AgentConfig objects
            agents = []
            for agent_data in agents_data:
                # Get REAL tools from unified service based on capabilities
                agent_capabilities = agent_data.get("capabilities", [])
                
                # Get actual tools for this agent from unified service
                real_tools = self.unified_service.get_tools_for_agent(
                    agent_data["name"],
                    agent_capabilities
                )
                
                # Tools are already filtered by unified service
                final_tools = real_tools  # Already limited by unified service
                
                logger.info(f"Agent {agent_data['name']} assigned tools: {final_tools}")
                
                # Get tool prompt info from unified service
                tool_prompt = self.unified_service.get_tool_prompt_info(final_tools)
                
                # Combine with agent's base prompt
                base_prompt = agent_data.get("system_prompt", f"You are {agent_data['name']}. {agent_data.get('role', '')}")
                enhanced_prompt = f"{base_prompt}\n{tool_prompt}"
                
                agent = AgentConfig(
                    name=agent_data["name"],
                    description=agent_data.get("role", ""),
                    system_prompt=enhanced_prompt,
                    tools=final_tools,
                    model=self.complexity_models.get(analysis.complexity, "gpt-4o-mini"),
                    max_iterations=5 if analysis.complexity == "complex" else 3
                )
                agents.append(agent)
            
            logger.info(f"Generated {len(agents)} agents for task: {task}")
            return agents
            
        except Exception as e:
            logger.error(f"Agent generation failed: {e}")
            # Return default agents
            return self._get_default_agents(analysis)
    
    # This method is now deprecated - using unified service's get_tool_prompt_info instead
    def _enhance_prompt_with_tools(self, base_prompt: str, tools: List[str]) -> str:
        """DEPRECATED: Use unified_service.get_tool_prompt_info instead"""
        return self.unified_service.get_tool_prompt_info(tools)
    
    def _get_default_agents(self, analysis: TaskAnalysis) -> List[AgentConfig]:
        """
        Get default agent configuration as fallback
        """
        if analysis.task_type == "development":
            return [
                AgentConfig(
                    name="architect",
                    description="Design the solution architecture",
                    system_prompt="You are a solution architect. Analyze requirements and design the system architecture for the user's task. Keep outputs concise and actionable.",
                    tools=["diagram", "file_write"],  # Use real, registered tools
                    model=self.complexity_models[analysis.complexity]
                ),
                AgentConfig(
                    name="developer",
                    description="Implement the solution",
                    system_prompt="You are a developer. Implement the requested app by writing the necessary code and using file_write to provide ready-to-save files. Avoid executing code; focus on producing high-quality source content.",
                    tools=["file_write", "file_read"],
                    model=self.complexity_models[analysis.complexity]
                ),
                AgentConfig(
                    name="tester",
                    description="Test and validate the solution",
                    system_prompt="You are QA. Validate outputs by reading files and suggesting fixes. If issues found, clearly describe them.",
                    tools=["file_read"],  # Keep to existing tools to avoid missing handlers
                    model="gpt-4o-mini"
                )
            ]
        elif analysis.task_type == "research":
            # Get actual available tools from unified service
            search_tools = self.unified_service.get_tools_for_agent("researcher", ["web_search"])
            file_tools = self.unified_service.get_tools_for_agent("researcher", ["file_operations"])
            
            return [
                AgentConfig(
                    name="researcher",
                    description="Conduct research and gather information",
                    system_prompt="You are a researcher. Gather and analyze information from various sources.",
                    tools=search_tools + file_tools[:1],  # Include search tools and file_read
                    model=self.complexity_models[analysis.complexity]
                ),
                AgentConfig(
                    name="analyst",
                    description="Analyze and synthesize findings",
                    system_prompt="You are an analyst. Synthesize research findings into actionable insights and write a concise report.",
                    tools=["file_write", "file_read"],  # Use file_write for markdown output
                    model=self.complexity_models[analysis.complexity]
                )
            ]
        else:
            # Generic configuration
            return [
                AgentConfig(
                    name="coordinator",
                    description="Coordinate and plan the task",
                    system_prompt="You are a coordinator. Break down the task and plan the approach.",
                    tools=["diagram"],  # Prefer an existing tool
                    model="gpt-4o-mini"
                ),
                AgentConfig(
                    name="executor",
                    description="Build the main deliverables",
                    system_prompt="You are an executor. Produce complete source files for the solution using file_write; do not execute code.",
                    tools=["file_write", "file_read"],
                    model=self.complexity_models[analysis.complexity]
                ),
                AgentConfig(
                    name="reviewer",
                    description="Review and finalize",
                    system_prompt="You are a reviewer. Review the work and ensure quality.",
                    tools=["file_read", "file_write"],
                    model="gpt-4o-mini"
                )
            ]
    
    async def orchestrate(self, task: str, user_preferences: Optional[Dict[str, Any]] = None, execution_mode: str = "auto") -> Dict[str, Any]:
        """
        Main orchestration method that analyzes task and generates optimal agent configuration
        """
        await self._ensure_initialized()
        logger.info(f"Orchestrating task: {task} with execution_mode: {execution_mode}")
        
        # Analyze the task
        analysis = await self.analyze_task(task)
        logger.info(f"Task analysis complete: {analysis.model_dump()}")
        
        # Generate agents with execution mode
        agents = await self.generate_agents(task, analysis, execution_mode)
        logger.info(f"Generated {len(agents)} agents for {execution_mode} execution")
        
        # Apply user preferences if provided
        if user_preferences:
            agents = self._apply_user_preferences(agents, user_preferences)
        
        return {
            "task": task,
            "analysis": analysis.model_dump(),
            "agents": [agent.model_dump() for agent in agents],
            "workflow": analysis.suggested_workflow,
            "estimated_complexity": analysis.complexity
        }
    
    def _apply_user_preferences(self, agents: List[AgentConfig], preferences: Dict[str, Any]) -> List[AgentConfig]:
        """
        Apply user preferences to agent configuration
        """
        # Apply model preferences
        if "preferred_model" in preferences:
            for agent in agents:
                agent.model = preferences["preferred_model"]
        
        # Apply tool restrictions
        if "excluded_tools" in preferences:
            excluded = set(preferences["excluded_tools"])
            for agent in agents:
                agent.tools = [t for t in agent.tools if t not in excluded]
        
        # Apply agent count limit
        if "max_agents" in preferences:
            max_agents = preferences["max_agents"]
            if len(agents) > max_agents:
                agents = agents[:max_agents]
        
        return agents
