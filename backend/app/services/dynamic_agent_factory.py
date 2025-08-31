"""
Dynamic Agent Factory for Event-Driven Swarm
"""
import uuid
import logging
from typing import Dict, List, Optional
from app.services.event_aware_agent import EventAwareAgent, AgentCapabilities
from app.services.event_bus import event_bus, SwarmEvent

logger = logging.getLogger(__name__)

class DynamicAgentFactory:
    """Create agents on-the-fly based on needs"""
    
    def __init__(self):
        self.agent_templates = {
            "analyzer": {
                "system_prompt": """You are an intelligent task analyzer in a multi-agent swarm system. Your role is to understand tasks and provide comprehensive analysis.

Your responsibilities:
1. Analyze the given task thoroughly
2. Provide clear, actionable insights
3. Make intelligent decisions about next steps
4. Complete tasks that only require analysis

IMPORTANT: You have AI-powered decision making. After completing your analysis, the system will intelligently determine what agents (if any) are needed next based on your output. You don't need to explicitly request other agents - just focus on providing the best possible analysis.

For simple tasks that only require analysis, provide a complete response and indicate the task is finished.
For complex tasks, provide your analysis and let the system determine what specialist work is needed.""",
                "tools": [],
                "skills": ["analysis", "planning", "task_breakdown", "decision_making"],
                "listens_to": ["task.started", "analysis.needed"],
                "emits": ["task.analyzed", "task.complete", "agent.needed"]
            },
            "researcher": {
                "system_prompt": "You are a research specialist. Find information, analyze sources, and provide comprehensive research.",
                "tools": ["web_search", "arxiv", "wikipedia"],
                "skills": ["research", "information_gathering", "fact_checking"],
                "listens_to": ["research.needed", "agent.needed", "clarification.needed"],
                "emits": ["research.complete", "agent.needed"]
            },
            "developer": {
                "system_prompt": "You are a senior developer. Write clean, efficient code and solve technical problems.",
                "tools": ["code_interpreter", "file_editor"],
                "skills": ["coding", "debugging", "architecture", "testing"],
                "listens_to": ["code.needed", "bug.found", "agent.needed"],
                "emits": ["code.complete", "test.needed", "review.needed"]
            },
            "writer": {
                "system_prompt": "You are a content writer. Create clear, engaging content based on research and requirements.",
                "tools": ["file_editor"],
                "skills": ["writing", "editing", "documentation"],
                "listens_to": ["content.needed", "documentation.needed", "agent.needed"],
                "emits": ["content.complete", "review.needed"]
            },
            "reviewer": {
                "system_prompt": "You review and provide feedback on work. Ensure quality and suggest improvements.",
                "tools": [],
                "skills": ["review", "quality_assurance", "feedback"],
                "listens_to": ["review.needed", "agent.needed"],
                "emits": ["review.complete", "revision.needed"]
            },
            "coordinator": {
                "system_prompt": "You coordinate between agents and ensure smooth task execution.",
                "tools": [],
                "skills": ["coordination", "orchestration", "planning"],
                "listens_to": ["coordination.needed", "conflict.detected"],
                "emits": ["agent.needed", "handoff.requested", "task.complete"]
            }
        }
        
        self.active_agents: Dict[str, EventAwareAgent] = {}
        self.spawned_count = 0
        
        # Register factory event handlers
        self._register_handlers()
    
    def _register_handlers(self):
        """Register event handlers for agent management"""
        event_bus.on("agent.needed", self._handle_agent_needed)
        event_bus.on("specialist.needed", self._handle_specialist_needed)
        event_bus.on("task.complete", self._cleanup_agents)
    
    async def _handle_agent_needed(self, event):
        """Handle request for a new agent"""
        role = event.data.get("role")
        reason = event.data.get("reason", "")
        context = event.data.get("context", "")
        
        logger.info(f"📋 Agent needed: {role} - {reason}")
        
        # Check if we already have this type of agent
        for agent in self.active_agents.values():
            if agent.role == role and agent.state == "idle":
                logger.info(f"Found idle agent: {agent.name}")
                # Trigger the agent with the context
                await agent.activate(SwarmEvent(
                    type="agent.needed",
                    data={"task": context, "role": role, "reason": reason},
                    source=event.source
                ))
                return
        
        # Spawn new agent
        agent = await self.spawn_agent(role, {"context": context})
        if agent:
            # Activate the new agent with the context as task
            await agent.activate(SwarmEvent(
                type="agent.needed",
                data={"task": context, "role": role, "reason": reason},
                source=event.source
            ))
    
    async def _handle_specialist_needed(self, event):
        """Handle request for a specialist agent"""
        specialty = event.data.get("specialty")
        agent = await self.spawn_specialist(specialty)
        if agent:
            await agent.activate(event)
    
    async def spawn_agent(self, role: str, context: dict = None) -> Optional[EventAwareAgent]:
        """Create a new agent with specific role"""
        template = self.agent_templates.get(role)
        
        if not template:
            logger.warning(f"No template for role: {role}")
            # Create generic agent
            template = self._create_generic_template(role)
        
        # Create unique name
        agent_name = f"{role}_{self.spawned_count:03d}"
        self.spawned_count += 1
        
        # Create capabilities
        capabilities = AgentCapabilities(
            skills=template.get("skills", []),
            tools=template.get("tools", []),
            listens_to=template.get("listens_to", []),
            emits=template.get("emits", [])
        )
        
        # Create agent
        agent = EventAwareAgent(
            name=agent_name,
            role=role,
            system_prompt=template["system_prompt"],
            capabilities=capabilities
        )
        
        # Add to active agents
        self.active_agents[agent_name] = agent
        
        # Announce agent creation
        await event_bus.emit(
            "agent.spawned",
            {
                "agent": agent_name,
                "role": role,
                "capabilities": {
                    "skills": capabilities.skills,
                    "tools": capabilities.tools
                }
            },
            source="factory"
        )
        
        logger.info(f"✨ Spawned agent: {agent_name} ({role})")
        return agent
    
    async def spawn_specialist(self, specialty: str) -> Optional[EventAwareAgent]:
        """Create a specialist agent for specific need"""
        # Determine role based on specialty
        role_mapping = {
            "python": "developer",
            "javascript": "developer",
            "research": "researcher",
            "writing": "writer",
            "analysis": "analyzer",
            "review": "reviewer"
        }
        
        role = role_mapping.get(specialty.lower(), "coordinator")
        return await self.spawn_agent(role, {"specialty": specialty})
    
    def _create_generic_template(self, role: str) -> dict:
        """Create a generic agent template"""
        return {
            "system_prompt": f"You are a {role} specialist. Help with tasks related to {role}.",
            "tools": [],
            "skills": [role],
            "listens_to": [f"{role}.needed", "agent.needed"],
            "emits": [f"{role}.complete"]
        }
    
    async def analyze_task_needs(self, task: str) -> List[str]:
        """Analyze task to determine which agents are needed"""
        # For now, simple keyword-based analysis
        # In production, this would use LLM to analyze
        
        needed_roles = ["analyzer"]  # Always start with analyzer
        
        task_lower = task.lower()
        
        if any(word in task_lower for word in ["research", "find", "search", "information"]):
            needed_roles.append("researcher")
        
        if any(word in task_lower for word in ["code", "program", "implement", "develop", "app", "script"]):
            needed_roles.append("developer")
        
        if any(word in task_lower for word in ["write", "content", "article", "document"]):
            needed_roles.append("writer")
        
        if any(word in task_lower for word in ["review", "check", "quality", "feedback"]):
            needed_roles.append("reviewer")
        
        return needed_roles
    
    async def _cleanup_agents(self, event):
        """Clean up agents when task is complete"""
        logger.info("🧹 Cleaning up agents")
        for agent in self.active_agents.values():
            agent.cleanup()
        self.active_agents.clear()
        self.spawned_count = 0
    
    def get_active_agents(self) -> Dict[str, dict]:
        """Get information about active agents"""
        return {
            name: {
                "role": agent.role,
                "state": agent.state,
                "current_task": agent.current_task
            }
            for name, agent in self.active_agents.items()
        }
    
    def get_agent(self, name: str) -> Optional[EventAwareAgent]:
        """Get specific agent by name"""
        return self.active_agents.get(name)