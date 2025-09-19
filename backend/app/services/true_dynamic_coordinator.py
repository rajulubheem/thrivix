"""
True Dynamic Coordinator: Creates agents dynamically based on task requirements
No predefined agent types - completely flexible agent creation
Properly handles async execution and event streaming
"""

import asyncio
import json
import time
import logging
from typing import AsyncIterator, Dict, Any, Optional, List, Union
from dataclasses import dataclass

from strands import Agent, tool
from strands.models.openai import OpenAIModel
import os
from strands.session.file_session_manager import FileSessionManager

from app.services.agent_runtime import AgentRuntime, AgentContext
from app.services.event_hub import TokenFrame, ControlFrame, ControlType, get_event_hub

logger = logging.getLogger(__name__)


@dataclass
class PlannedAgent:
    """Represents an agent that has been planned but not yet executed"""
    agent_id: str
    name: str
    role: str
    task: str
    system_prompt: str
    model: str = "gpt-4o-mini"
    temperature: float = 0.7
    depends_on: List[str] = None
    tools: List[Dict[str, str]] = None
    
    def __post_init__(self):
        if self.depends_on is None:
            self.depends_on = []
        if self.tools is None:
            self.tools = []


class TrueDynamicCoordinator(AgentRuntime):
    """
    Coordinator that truly dynamically creates agents based on task analysis
    No predefined agent types - creates exactly what's needed for each task
    """
    
    def __init__(
        self,
        agent_id: str,
        name: str = "Dynamic Task Coordinator",
        model: str = "gpt-4o-mini",
        session_id: Optional[str] = None
    ):
        super().__init__(agent_id, name, model)
        self.session_id = session_id or agent_id
        self.session_manager = FileSessionManager(
            session_id=self.session_id,
            storage_dir="./sessions"
        )
        self.planned_agents: List[PlannedAgent] = []
        self.executed_agents: Dict[str, Any] = {}
        self.shared_state = {"agents_created": [], "results": {}}
        self._agent_counter = 0
        self._initialize_coordinator()
    
    def _initialize_coordinator(self):
        """Initialize coordinator with planning-only tools"""
        
        @tool
        async def plan_specialist_agent(
            name: str,
            role: str,
            task: str,
            system_prompt: str,
            model: str = "gpt-4o-mini",
            temperature: float = 0.7,
            depends_on: List[str] = None
        ) -> str:
            """
            Plan a specialist agent with any role and capabilities
            
            Args:
                name: Agent name (e.g., "Market Research Expert")
                role: Agent's role/specialty
                task: Specific task for this agent
                system_prompt: Full system prompt defining agent's behavior
                model: LLM model to use
                temperature: Creativity level (0.0-1.0)
                depends_on: List of agent names this depends on
            """
            agent_id = f"agent_{self._agent_counter:03d}"
            self._agent_counter += 1
            
            planned = PlannedAgent(
                agent_id=agent_id,
                name=name,
                role=role,
                task=task,
                system_prompt=system_prompt,
                model=model,
                temperature=temperature,
                depends_on=depends_on or []
            )
            
            self.planned_agents.append(planned)
            logger.info(f"Planned agent: {name} ({agent_id}) - {role}")
            
            return f"Planned agent '{name}' with role '{role}'. Will execute after planning phase."
        
        @tool
        async def plan_agent_with_tools(
            name: str,
            role: str,
            task: str,
            system_prompt: str,
            tool_descriptions: List[Dict[str, str]],
            model: str = "gpt-4o-mini"
        ) -> str:
            """
            Plan an agent with custom tools/capabilities
            
            Args:
                name: Agent name
                role: Agent's role
                task: Task to perform
                system_prompt: System prompt
                tool_descriptions: List of tool descriptions
                model: Model to use
            """
            agent_id = f"agent_{self._agent_counter:03d}"
            self._agent_counter += 1
            
            # Add tools to system prompt
            tools_prompt = "\n\nYou have the following capabilities:\n"
            for tool_desc in tool_descriptions:
                tools_prompt += f"- {tool_desc['name']}: {tool_desc['description']}\n"
            
            full_system_prompt = system_prompt + tools_prompt
            
            planned = PlannedAgent(
                agent_id=agent_id,
                name=name,
                role=role,
                task=task,
                system_prompt=full_system_prompt,
                model=model,
                tools=tool_descriptions
            )
            
            self.planned_agents.append(planned)
            logger.info(f"Planned tool-enabled agent: {name} ({agent_id})")
            
            return f"Planned tool-enabled agent '{name}' with {len(tool_descriptions)} tools."
        
        @tool
        async def get_execution_plan() -> str:
            """Get the current execution plan"""
            if not self.planned_agents:
                return "No agents planned yet."
            plan = []
            for agent in self.planned_agents:
                plan.append({
                    "name": agent.name,
                    "role": agent.role,
                    "task": agent.task,
                    "depends_on": agent.depends_on
                })
            return json.dumps(plan, indent=2)
        
        # Create the main coordinator
        openai_model = OpenAIModel(model_id=self.model)
        
        self.coordinator = Agent(
            name=self.name,
            system_prompt="""You are a task coordinator that plans specialized agents.

Your role:
1. Analyze the task to identify needed expertise
2. Plan appropriate specialist agents using the tools
3. Set dependencies between agents when needed

Use these tools:
- plan_specialist_agent: Plan an agent with a specific role
- get_execution_plan: Review your planned agents

Keep agent plans simple and focused. After planning, say "Planning complete".
The agents will be executed automatically.""",
            model=openai_model,
            tools=[
                plan_specialist_agent,
                plan_agent_with_tools,
                get_execution_plan
            ],
            session_manager=self.session_manager
        )
        
        logger.info(f"Initialized true dynamic coordinator: {self.agent_id}")
    
    async def _execute_planned_agent(
        self, 
        planned: PlannedAgent,
        context: AgentContext
    ):
        """Execute a planned agent and stream its execution"""
        
        # Emit agent started event
        yield ControlFrame(
            exec_id=context.exec_id,
            type=ControlType.AGENT_STARTED,
            agent_id=planned.agent_id,
            payload={
                "name": planned.name,
                "role": planned.role,
                "parent": self.agent_id
            }
        )
        
        # Get context from dependencies
        context_text = ""
        if planned.depends_on:
            for dep_name in planned.depends_on:
                if dep_name in self.executed_agents:
                    context_text += f"\n{dep_name} results:\n{self.executed_agents[dep_name]}\n"
        
        # Build prompt
        full_prompt = f"Task: {planned.task}"
        if context_text:
            full_prompt = f"Context from previous agents:{context_text}\n\n{full_prompt}"
        
        # Create the agent
        openai_model = OpenAIModel(model_id=planned.model)
        
        # Create unique session for this sub-agent
        sub_agent_session = FileSessionManager(
            session_id=f"{self.session_id}_{planned.agent_id}",
            storage_dir="./sessions"
        )
        
        agent = Agent(
            name=planned.name,
            system_prompt=planned.system_prompt,
            model=openai_model,
            session_manager=sub_agent_session
        )
        
        logger.info(f"Executing agent {planned.name} ({planned.agent_id})")
        
        # Stream the agent's execution
        result_text = ""
        try:
            async for event in agent.stream_async(full_prompt):
                if "data" in event:
                    text_chunk = event["data"]
                    if text_chunk:
                        result_text += text_chunk
                        # Stream text from sub-agent
                        yield TokenFrame(
                            exec_id=context.exec_id,
                            agent_id=planned.agent_id,
                            seq=self._next_seq(),
                            text=text_chunk,
                            ts=time.time(),
                            final=False
                        )
        except Exception as e:
            logger.error(f"Error executing agent {planned.name}: {e}")
            error_msg = f"\n⚠️ Error: {str(e)}\n"
            result_text = error_msg
            yield TokenFrame(
                exec_id=context.exec_id,
                agent_id=planned.agent_id,
                seq=self._next_seq(),
                text=error_msg,
                ts=time.time(),
                final=False
            )
        
        # Final token for sub-agent
        yield TokenFrame(
            exec_id=context.exec_id,
            agent_id=planned.agent_id,
            seq=self._next_seq(),
            text="",
            ts=time.time(),
            final=True
        )
        
        # Store result
        self.executed_agents[planned.name] = result_text
        
        # Emit agent completed event
        yield ControlFrame(
            exec_id=context.exec_id,
            type=ControlType.AGENT_COMPLETED,
            agent_id=planned.agent_id,
            payload={
                "name": planned.name,
                "result": result_text[:200] + "..." if len(result_text) > 200 else result_text
            }
        )
    
    async def stream(
        self,
        context: AgentContext
    ) -> AsyncIterator[Union[TokenFrame, ControlFrame]]:
        """Stream execution with dynamic agent spawning"""
        
        # Emit coordinator started
        yield ControlFrame(
            exec_id=context.exec_id,
            type=ControlType.AGENT_STARTED,
            agent_id=self.agent_id,
            payload={
                "name": self.name,
                "role": "dynamic_coordinator",
                "task": context.task,
                "model": self.model
            }
        )
        
        try:
            # Phase 1: Planning
            prompt = f"""Analyze this task and plan the necessary specialist agents to accomplish it:

Task: {context.task}

Think step by step:
1. What expertise is needed?
2. What agents should be created?
3. What order should they work in?
4. How should they share information?

Plan all the agents needed, then say "Planning complete" when done."""
            
            if context.parent_result:
                prompt += f"\n\nContext: {context.parent_result}"
            
            # Stream planning phase
            planning_response = ""
            try:
                async for event in self.coordinator.stream_async(prompt):
                    if "data" in event:
                        text_chunk = event["data"]
                        if text_chunk:
                            planning_response += text_chunk
                            yield TokenFrame(
                                exec_id=context.exec_id,
                                agent_id=self.agent_id,
                                seq=self._next_seq(),
                                text=text_chunk,
                                ts=time.time(),
                                final=False
                            )
            except Exception as e:
                logger.error(f"Error during planning phase: {e}")
                error_msg = f"\n\n⚠️ Error during planning: {str(e)}\n"
                yield TokenFrame(
                    exec_id=context.exec_id,
                    agent_id=self.agent_id,
                    seq=self._next_seq(),
                    text=error_msg,
                    ts=time.time(),
                    final=False
                )
                # Continue with any agents that were planned before the error
                planning_response += error_msg
            
            # Final token for planning phase
            yield TokenFrame(
                exec_id=context.exec_id,
                agent_id=self.agent_id,
                seq=self._next_seq(),
                text="",
                ts=time.time(),
                final=True
            )
            
            # Phase 2: Execution
            if self.planned_agents:
                # Emit execution starting
                yield TokenFrame(
                    exec_id=context.exec_id,
                    agent_id=self.agent_id,
                    seq=self._next_seq(),
                    text=f"\n\n🚀 Executing {len(self.planned_agents)} planned agents...\n\n",
                    ts=time.time(),
                    final=False
                )
                
                # Execute planned agents in order
                for planned in self.planned_agents:
                    # Check if dependencies are met
                    deps_met = all(
                        dep in self.executed_agents 
                        for dep in planned.depends_on
                    )
                    
                    if deps_met:
                        # Execute the agent and stream its output
                        async for frame in self._execute_planned_agent(planned, context):
                            yield frame
                    else:
                        logger.warning(f"Dependencies not met for {planned.name}")
            
            # Final summary
            summary = f"\n\n✅ Execution complete. {len(self.executed_agents)} agents executed successfully.\n"
            yield TokenFrame(
                exec_id=context.exec_id,
                agent_id=self.agent_id,
                seq=self._next_seq(),
                text=summary,
                ts=time.time(),
                final=True
            )
            
            # Emit completion
            yield ControlFrame(
                exec_id=context.exec_id,
                type=ControlType.AGENT_COMPLETED,
                agent_id=self.agent_id,
                payload={
                    "result": planning_response + summary,
                    "agents_planned": len(self.planned_agents),
                    "agents_executed": len(self.executed_agents),
                    "agent_names": list(self.executed_agents.keys())
                }
            )
            
        except Exception as e:
            logger.error(f"Dynamic coordinator {self.agent_id} error: {e}")
            
            yield ControlFrame(
                exec_id=context.exec_id,
                type=ControlType.ERROR,
                agent_id=self.agent_id,
                payload={
                    "error": str(e),
                    "type": type(e).__name__
                }
            )