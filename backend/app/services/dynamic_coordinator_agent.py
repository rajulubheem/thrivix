"""
Dynamic Coordinator Agent: Main agent that spawns sub-agents dynamically
Uses Strands agents-as-tools pattern with shared session management
"""

import asyncio
import json
import time
import logging
from typing import AsyncIterator, Dict, Any, Optional, List, Union
from dataclasses import dataclass

from strands import Agent, tool
from strands.session.file_session_manager import FileSessionManager

from app.services.agent_runtime import AgentRuntime, AgentContext
from app.services.event_hub import TokenFrame, ControlFrame, ControlType, get_event_hub

logger = logging.getLogger(__name__)


@dataclass
class SubAgentSpec:
    """Specification for a sub-agent to be spawned"""
    name: str
    role: str
    task: str
    model: str = "gpt-4o-mini"
    temperature: float = 0.7


class DynamicCoordinatorAgent(AgentRuntime):
    """
    Main coordinator agent that dynamically spawns sub-agents
    Uses shared session for state management
    """
    
    def __init__(
        self,
        agent_id: str,
        name: str = "Task Coordinator",
        model: str = "gpt-4o-mini",
        session_id: Optional[str] = None
    ):
        super().__init__(agent_id, name, model)
        self.session_id = session_id or agent_id
        self.session_manager = FileSessionManager(
            session_id=self.session_id,
            storage_dir="./sessions"
        )
        self.shared_state = {}
        self.sub_agents = {}
        self._initialize_coordinator()
    
    def _initialize_coordinator(self):
        """Initialize the coordinator agent with dynamic spawning capabilities"""
        
        # Create tools for spawning different types of sub-agents
        @tool
        async def spawn_research_agent(task: str, context: str = "") -> str:
            """Spawn a research specialist sub-agent"""
            agent = Agent(
                name="Research Specialist",
                system_prompt="""You are a research specialist. Gather comprehensive information, 
                analyze sources, and provide detailed insights. Be thorough and accurate.""",
                model="gpt-4o-mini",
                temperature=0.3,
                session_manager=self.session_manager  # Shared session
            )
            
            prompt = f"Task: {task}\n\nContext: {context}" if context else task
            result = await agent.run_async(prompt)
            
            # Store result in shared state
            self.shared_state["research_results"] = result
            return result
        
        @tool
        async def spawn_analysis_agent(data: str, task: str) -> str:
            """Spawn an analysis specialist sub-agent"""
            agent = Agent(
                name="Analysis Specialist",
                system_prompt="""You are an analysis specialist. Process data, identify patterns, 
                and provide actionable insights. Be analytical and precise.""",
                model="gpt-4o-mini",
                temperature=0.5,
                session_manager=self.session_manager  # Shared session
            )
            
            prompt = f"Analyze this data: {data}\n\nTask: {task}"
            result = await agent.run_async(prompt)
            
            # Store result in shared state
            self.shared_state["analysis_results"] = result
            return result
        
        @tool
        async def spawn_developer_agent(requirements: str, context: str = "") -> str:
            """Spawn a development specialist sub-agent"""
            agent = Agent(
                name="Development Specialist",
                system_prompt="""You are a development specialist. Create implementations, 
                write code, and build solutions. Be practical and efficient.""",
                model="gpt-4o-mini",
                temperature=0.5,
                session_manager=self.session_manager  # Shared session
            )
            
            prompt = f"Requirements: {requirements}\n\nContext: {context}" if context else requirements
            result = await agent.run_async(prompt)
            
            # Store result in shared state
            self.shared_state["development_results"] = result
            return result
        
        @tool
        async def spawn_writer_agent(content_brief: str, style: str = "professional") -> str:
            """Spawn a content writer sub-agent"""
            agent = Agent(
                name="Content Writer",
                system_prompt=f"""You are a content writer. Create clear, engaging content 
                in a {style} style. Be creative yet informative.""",
                model="gpt-4o-mini",
                temperature=0.7,
                session_manager=self.session_manager  # Shared session
            )
            
            result = await agent.run_async(content_brief)
            
            # Store result in shared state
            self.shared_state["written_content"] = result
            return result
        
        @tool
        async def spawn_qa_agent(work_to_review: str, criteria: str = "quality") -> str:
            """Spawn a QA specialist sub-agent"""
            agent = Agent(
                name="QA Specialist",
                system_prompt="""You are a QA specialist. Review work for quality, 
                identify issues, and ensure high standards. Be thorough and critical.""",
                model="gpt-4o-mini",
                temperature=0.2,
                session_manager=self.session_manager  # Shared session
            )
            
            prompt = f"Review this work: {work_to_review}\n\nCriteria: {criteria}"
            result = await agent.run_async(prompt)
            
            # Store result in shared state
            self.shared_state["qa_results"] = result
            return result
        
        @tool
        async def get_shared_state(key: str = None) -> str:
            """Get information from shared state between agents"""
            if key:
                return json.dumps(self.shared_state.get(key, "No data found for key: " + key))
            return json.dumps(self.shared_state)
        
        # Create the main coordinator agent
        self.coordinator = Agent(
            name=self.name,
            system_prompt="""You are a task coordinator. Your role is to:
            1. Analyze the given task
            2. Break it down into subtasks
            3. Spawn appropriate specialist agents to handle each subtask
            4. Coordinate their work and share context between them
            5. Synthesize the final result
            
            You have tools to spawn different specialist agents:
            - spawn_research_agent: For gathering information
            - spawn_analysis_agent: For analyzing data
            - spawn_developer_agent: For implementation tasks
            - spawn_writer_agent: For content creation
            - spawn_qa_agent: For quality assurance
            - get_shared_state: To access results from previous agents
            
            Always think step by step about what agents are needed.
            Share context between agents using the shared state.
            Ensure each agent has the information it needs from previous agents.""",
            model=self.model,
            tools=[
                spawn_research_agent,
                spawn_analysis_agent,
                spawn_developer_agent,
                spawn_writer_agent,
                spawn_qa_agent,
                get_shared_state
            ],
            temperature=0.5,
            session_manager=self.session_manager
        )
        
        logger.info(f"Initialized coordinator agent: {self.agent_id}")
    
    async def stream(
        self,
        context: AgentContext
    ) -> AsyncIterator[Union[TokenFrame, ControlFrame]]:
        """Stream execution with dynamic agent spawning"""
        
        # Emit coordinator started event
        yield ControlFrame(
            exec_id=context.exec_id,
            type=ControlType.AGENT_STARTED,
            agent_id=self.agent_id,
            payload={
                "name": self.name,
                "role": "coordinator",
                "task": context.task,
                "model": self.model
            }
        )
        
        try:
            # Build prompt with context
            prompt = self._build_prompt(context)
            
            # Track output
            full_response = ""
            tool_calls = []
            
            # Stream from coordinator agent
            async for event in self.coordinator.stream_async(prompt):
                
                # Handle text generation
                if "data" in event:
                    text_chunk = event["data"]
                    if text_chunk:
                        full_response += text_chunk
                        
                        # Emit token frame
                        yield TokenFrame(
                            exec_id=context.exec_id,
                            agent_id=self.agent_id,
                            seq=self._next_seq(),
                            text=text_chunk,
                            ts=time.time(),
                            final=False
                        )
                
                # Handle tool usage (sub-agent spawning)
                elif "current_tool_use" in event:
                    tool_use = event["current_tool_use"]
                    if tool_use.get("name"):
                        tool_name = tool_use["name"]
                        tool_calls.append(tool_name)
                        
                        # Emit control frame for sub-agent spawning
                        yield ControlFrame(
                            exec_id=context.exec_id,
                            type="sub_agent_spawned",
                            agent_id=self.agent_id,
                            payload={
                                "tool": tool_name,
                                "sub_agent": tool_name.replace("spawn_", "").replace("_agent", ""),
                                "input": tool_use.get("input", {})
                            }
                        )
                        
                        # Simulate sub-agent working (will show in UI)
                        sub_agent_name = tool_name.replace("spawn_", "").replace("_agent", "").title()
                        yield ControlFrame(
                            exec_id=context.exec_id,
                            type=ControlType.AGENT_STARTED,
                            agent_id=f"{self.agent_id}_sub_{len(tool_calls)}",
                            payload={
                                "name": f"{sub_agent_name} Sub-Agent",
                                "parent": self.agent_id
                            }
                        )
                        
                        # Small delay to show sub-agent working
                        await asyncio.sleep(0.5)
                        
                        # Mark sub-agent completed
                        yield ControlFrame(
                            exec_id=context.exec_id,
                            type=ControlType.AGENT_COMPLETED,
                            agent_id=f"{self.agent_id}_sub_{len(tool_calls)}",
                            payload={
                                "result": tool_use.get("result", "")
                            }
                        )
            
            # Emit final token
            yield TokenFrame(
                exec_id=context.exec_id,
                agent_id=self.agent_id,
                seq=self._next_seq(),
                text="",
                ts=time.time(),
                final=True
            )
            
            # Emit completion event
            yield ControlFrame(
                exec_id=context.exec_id,
                type=ControlType.AGENT_COMPLETED,
                agent_id=self.agent_id,
                payload={
                    "result": full_response,
                    "sub_agents_spawned": len(tool_calls),
                    "tools_used": tool_calls,
                    "shared_state_keys": list(self.shared_state.keys())
                }
            )
            
        except Exception as e:
            logger.error(f"Coordinator {self.agent_id} error: {e}")
            
            yield ControlFrame(
                exec_id=context.exec_id,
                type=ControlType.ERROR,
                agent_id=self.agent_id,
                payload={
                    "error": str(e),
                    "type": type(e).__name__
                }
            )
    
    def _build_prompt(self, context: AgentContext) -> str:
        """Build prompt with context"""
        prompt_parts = [f"Task: {context.task}"]
        
        if context.parent_result:
            prompt_parts.append(f"\nPrevious context: {context.parent_result}")
        
        if context.metadata:
            for key, value in context.metadata.items():
                prompt_parts.append(f"\n{key}: {value}")
        
        return "\n".join(prompt_parts)