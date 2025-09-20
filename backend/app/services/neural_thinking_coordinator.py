"""
Neural Thinking Coordinator: True agentic system with neural-like thought processes
Agents think, collaborate, reflect, and self-organize like neurons in a network
"""

import asyncio
import json
import time
import logging
from typing import AsyncIterator, Dict, Any, Optional, List, Union, Set
from dataclasses import dataclass, field
from enum import Enum
import random

from strands import Agent, tool
from strands.models.openai import OpenAIModel
import os
from strands.session.file_session_manager import FileSessionManager

from app.services.agent_runtime import AgentRuntime, AgentContext
from app.services.event_hub import TokenFrame, ControlFrame, ControlType, get_event_hub

logger = logging.getLogger(__name__)


class ThoughtType(Enum):
    """Types of thoughts agents can have"""
    OBSERVATION = "observation"      # What I see/understand
    HYPOTHESIS = "hypothesis"        # What I think might work
    QUESTION = "question"           # What I need to know
    INSIGHT = "insight"             # What I discovered
    CONCERN = "concern"             # What worries me
    SUGGESTION = "suggestion"       # What we should try
    REFLECTION = "reflection"       # What I learned
    CONSENSUS = "consensus"         # What we agreed on


@dataclass
class Thought:
    """A single thought from an agent"""
    agent_id: str
    agent_name: str
    thought_type: ThoughtType
    content: str
    confidence: float  # 0.0 to 1.0
    timestamp: float
    references: List[str] = field(default_factory=list)  # Other thoughts this builds on
    
    def to_dict(self):
        return {
            "agent": self.agent_name,
            "type": self.thought_type.value,
            "content": self.content,
            "confidence": self.confidence,
            "references": self.references
        }


@dataclass
class NeuralAgent:
    """An agent that thinks and collaborates"""
    agent_id: str
    name: str
    personality: str  # e.g., "analytical", "creative", "critical", "supportive"
    expertise: str    # What this agent is good at
    curiosity: float  # How likely to explore new ideas (0.0-1.0)
    confidence: float # Current confidence level
    thoughts: List[Thought] = field(default_factory=list)
    connections: Set[str] = field(default_factory=set)  # Other agents this one listens to
    activation: float = 0.0  # Neural activation level
    last_thought_time: float = 0.0
    
    def should_think(self, shared_memory: List[Thought]) -> bool:
        """Decide if this agent should contribute a thought"""
        # More likely to think if:
        # 1. High activation
        # 2. Recent relevant thoughts in shared memory
        # 3. Haven't thought recently
        # 4. High curiosity
        
        time_since_last = time.time() - self.last_thought_time
        if time_since_last < 1.0:  # Reduced cooldown to 1 second
            return False
            
        # First few rounds: everyone should contribute
        if len(shared_memory) < 5:
            return random.random() < 0.8  # 80% chance in early rounds
            
        # Check for relevant recent thoughts
        recent_thoughts = [t for t in shared_memory[-10:] if t.agent_id != self.agent_id]
        
        # If no one else has thought recently, be more likely to think
        if not recent_thoughts:
            return random.random() < (0.5 + self.curiosity * 0.3)
            
        # Activation threshold with randomness
        threshold = 0.2 * (1 - self.curiosity)  # Lower threshold
        return self.activation > threshold or random.random() < self.curiosity * 0.3


class NeuralThinkingCoordinator(AgentRuntime):
    """
    A true neural thinking system where agents:
    1. Share a collective memory of thoughts
    2. Think asynchronously and build on each other's ideas  
    3. Self-organize and form dynamic connections
    4. Reach consensus through emergent collaboration
    """
    
    def __init__(
        self,
        agent_id: str,
        name: str = "Neural Thinking Network",
        model: str = "gpt-4o-mini",
        session_id: Optional[str] = None
    ):
        super().__init__(agent_id, name, model)
        self.session_id = session_id or agent_id
        self.session_manager = FileSessionManager(
            session_id=self.session_id,
            storage_dir="./sessions"
        )
        
        # Neural network state
        self.neural_agents: Dict[str, NeuralAgent] = {}
        self.shared_memory: List[Thought] = []  # Collective thoughts
        self.thought_graph: Dict[str, List[str]] = {}  # Thought connections
        self.consensus_topics: Dict[str, List[Thought]] = {}  # Grouped thoughts
        self.activation_waves: List[Dict[str, float]] = []  # History of activations
        
        self._agent_counter = 0
        self._thought_counter = 0
        self._thinking_active = False
        self._consensus_reached = False
        self._sequence = 0  # For token sequence numbering
        
    def _next_seq(self) -> int:
        """Get next sequence number"""
        self._sequence += 1
        return self._sequence
        
    def _spawn_initial_thinkers(self, task: str) -> List[NeuralAgent]:
        """Create diverse initial thinking agents based on the task"""
        
        # Diverse personality types for different thinking styles
        agent_templates = [
            {
                "personality": "analytical",
                "expertise": "breaking down complex problems into components",
                "curiosity": 0.6,
                "prompt_addon": "You excel at systematic analysis and logical reasoning."
            },
            {
                "personality": "creative", 
                "expertise": "finding innovative and unconventional solutions",
                "curiosity": 0.9,
                "prompt_addon": "You think outside the box and love exploring novel ideas."
            },
            {
                "personality": "critical",
                "expertise": "identifying potential issues and risks",
                "curiosity": 0.4,
                "prompt_addon": "You're skeptical and good at spotting flaws in reasoning."
            },
            {
                "personality": "integrative",
                "expertise": "connecting disparate ideas and finding patterns",
                "curiosity": 0.7,
                "prompt_addon": "You excel at synthesis and seeing the big picture."
            },
            {
                "personality": "practical",
                "expertise": "focusing on implementation and real-world application",
                "curiosity": 0.5,
                "prompt_addon": "You focus on what's achievable and how to make it work."
            }
        ]
        
        agents = []
        for template in agent_templates:
            agent_id = f"neural_{self._agent_counter:03d}"
            self._agent_counter += 1
            
            agent = NeuralAgent(
                agent_id=agent_id,
                name=f"{template['personality'].capitalize()} Thinker",
                personality=template['personality'],
                expertise=template['expertise'],
                curiosity=template['curiosity'],
                confidence=0.5,
                activation=random.uniform(0.5, 0.9)  # Higher initial activation
            )
            
            # Create connections (each agent connects to 2-3 others)
            if agents and len(agents) >= 2:
                # Only create connections if we have at least 2 existing agents
                max_connections = min(3, len(agents))
                num_connections = random.randint(1, max_connections)
                connected_agents = random.sample(agents, num_connections)
                for other in connected_agents:
                    agent.connections.add(other.agent_id)
                    other.connections.add(agent_id)  # Bidirectional
            elif agents and len(agents) == 1:
                # If only one other agent exists, connect to it
                other = agents[0]
                agent.connections.add(other.agent_id)
                other.connections.add(agent_id)
            
            agents.append(agent)
            self.neural_agents[agent_id] = agent
            
        return agents
    
    def _calculate_activation(self, agent: NeuralAgent, recent_thoughts: List[Thought]) -> float:
        """Calculate neural activation based on recent thoughts and connections"""
        
        activation = agent.activation * 0.9  # Less decay
        
        # Base activation boost for participation
        if len(recent_thoughts) > 0:
            activation += 0.1
        
        # Boost from connected agents' recent thoughts
        for thought in recent_thoughts[-10:]:
            if thought.agent_id in agent.connections:
                activation += 0.2 * thought.confidence
                
            # Extra boost if thought mentions agent's expertise
            if agent.expertise and any(word in thought.content.lower() for word in agent.expertise.lower().split()):
                activation += 0.15
        
        # Ensure minimum activation
        activation = max(0.3, activation)  # Minimum activation level
        
        # Normalize
        return min(1.0, activation)
    
    def _propagate_activation(self):
        """Propagate activation through the neural network"""
        
        new_activations = {}
        for agent_id, agent in self.neural_agents.items():
            # Get thoughts from connected agents
            connected_thoughts = [
                t for t in self.shared_memory[-20:]
                if t.agent_id in agent.connections
            ]
            
            new_activations[agent_id] = self._calculate_activation(agent, connected_thoughts)
        
        # Apply new activations
        for agent_id, activation in new_activations.items():
            self.neural_agents[agent_id].activation = activation
            
        # Record wave
        self.activation_waves.append(new_activations)
    
    async def _agent_think(
        self, 
        agent: NeuralAgent,
        task: str,
        context: AgentContext
    ) -> Optional[Thought]:
        """Let an agent think and contribute to shared memory"""
        
        # Build context from recent thoughts
        recent_thoughts = self.shared_memory[-15:]
        thought_context = "\n".join([
            f"[{t.agent_name}] ({t.thought_type.value}): {t.content}"
            for t in recent_thoughts
        ])
        
        # Personality-specific prompting
        personality_prompts = {
            "analytical": "Analyze the situation systematically. What patterns do you see?",
            "creative": "Think creatively. What unconventional approaches might work?",
            "critical": "Be critical. What could go wrong? What are we missing?",
            "integrative": "Connect the dots. How do these ideas relate to each other?",
            "practical": "Be practical. How would we actually implement this?"
        }
        
        prompt = f"""You are a {agent.personality} thinker with expertise in {agent.expertise}.

Task: {task}

Recent thoughts from the network:
{thought_context if thought_context else "No thoughts yet - you're thinking first!"}

{personality_prompts.get(agent.personality, "")}

Based on your personality and the discussion so far, contribute ONE thought.
It could be an observation, hypothesis, question, insight, concern, or suggestion.

Respond in this format:
THOUGHT_TYPE: [observation/hypothesis/question/insight/concern/suggestion]
CONFIDENCE: [0.0-1.0]
CONTENT: [your actual thought]
REFERENCES: [optional: which recent thoughts this builds on]"""

        try:
            # Create a thinking agent with unique session
            openai_model = OpenAIModel(
                model_id=self.model,
                temperature=0.7 + (agent.curiosity * 0.2)  # More curious = more creative
            )
            
            # Create unique session for this thinking instance
            agent_session = FileSessionManager(
                session_id=f"{self.session_id}_{agent.agent_id}_{int(time.time() * 1000)}",
                storage_dir="./sessions"
            )
            
            thinking_agent = Agent(
                name=agent.name,
                system_prompt=f"You are {agent.name}. {agent.expertise}",
                model=openai_model,
                session_manager=agent_session
            )
            
            # Get the thought
            response = ""
            async for event in thinking_agent.stream_async(prompt):
                if "data" in event:
                    response += event["data"]
            
            # Parse response
            thought_type = ThoughtType.OBSERVATION  # default
            confidence = 0.5
            content = response
            references = []
            
            for line in response.split('\n'):
                if line.startswith('THOUGHT_TYPE:'):
                    type_str = line.split(':', 1)[1].strip().lower()
                    for t in ThoughtType:
                        if t.value in type_str:
                            thought_type = t
                            break
                elif line.startswith('CONFIDENCE:'):
                    try:
                        confidence = float(line.split(':', 1)[1].strip())
                    except:
                        confidence = 0.5
                elif line.startswith('CONTENT:'):
                    content = line.split(':', 1)[1].strip()
                elif line.startswith('REFERENCES:'):
                    ref_str = line.split(':', 1)[1].strip()
                    if ref_str and ref_str != 'none':
                        references = [r.strip() for r in ref_str.split(',')]
            
            thought = Thought(
                agent_id=agent.agent_id,
                agent_name=agent.name,
                thought_type=thought_type,
                content=content,
                confidence=confidence,
                timestamp=time.time(),
                references=references
            )
            
            agent.thoughts.append(thought)
            agent.last_thought_time = time.time()
            agent.confidence = confidence
            
            return thought
            
        except Exception as e:
            logger.error(f"Agent {agent.name} thinking error: {e}")
            return None
    
    def _detect_consensus(self) -> Optional[Dict[str, Any]]:
        """Detect if agents have reached consensus on key topics"""
        
        if len(self.shared_memory) < 10:
            return None
            
        recent_thoughts = self.shared_memory[-20:]
        
        # Group thoughts by topic similarity
        topics = {}
        for thought in recent_thoughts:
            # Simple topic extraction (in real system, use embeddings)
            key_words = thought.content.lower().split()[:5]
            topic_key = " ".join(key_words[:3])
            
            if topic_key not in topics:
                topics[topic_key] = []
            topics[topic_key].append(thought)
        
        # Check for consensus (multiple agents agreeing)
        consensus_items = []
        for topic, thoughts in topics.items():
            unique_agents = set(t.agent_id for t in thoughts)
            if len(unique_agents) >= 3:  # At least 3 agents discussing same topic
                avg_confidence = sum(t.confidence for t in thoughts) / len(thoughts)
                if avg_confidence > 0.6:  # Reasonable confidence
                    consensus_items.append({
                        "topic": topic,
                        "thoughts": [t.to_dict() for t in thoughts],
                        "confidence": avg_confidence,
                        "agent_count": len(unique_agents)
                    })
        
        if consensus_items:
            return {
                "reached": True,
                "items": consensus_items,
                "total_thoughts": len(self.shared_memory)
            }
        
        return None
    
    async def stream(
        self,
        context: AgentContext
    ) -> AsyncIterator[Union[TokenFrame, ControlFrame]]:
        """Stream the neural thinking process"""
        
        # Start the network
        yield ControlFrame(
            exec_id=context.exec_id,
            type=ControlType.AGENT_STARTED,
            agent_id=self.agent_id,
            payload={
                "name": self.name,
                "role": "neural_network",
                "task": context.task,
                "mode": "thinking"
            }
        )
        
        # Initial message
        yield TokenFrame(
            exec_id=context.exec_id,
            agent_id=self.agent_id,
            seq=self._next_seq(),
            text="🧠 Initializing Neural Thinking Network...\n\n",
            ts=time.time(),
            final=False
        )
        
        # Spawn initial thinkers
        agents = self._spawn_initial_thinkers(context.task)
        
        yield TokenFrame(
            exec_id=context.exec_id,
            agent_id=self.agent_id,
            seq=self._next_seq(),
            text=f"✨ Spawned {len(agents)} neural agents with diverse thinking styles:\n",
            ts=time.time(),
            final=False
        )
        
        for agent in agents:
            yield TokenFrame(
                exec_id=context.exec_id,
                agent_id=self.agent_id,
                seq=self._next_seq(),
                text=f"  • {agent.name}: {agent.expertise}\n",
                ts=time.time(),
                final=False
            )
            
            # Emit spawn event for visualization
            yield ControlFrame(
                exec_id=context.exec_id,
                type="agent_spawned",
                agent_id=agent.agent_id,
                payload={
                    "id": agent.agent_id,
                    "name": agent.name,
                    "role": agent.personality,
                    "parent": self.agent_id,
                    "activation": agent.activation,
                    "connections": list(agent.connections)
                }
            )
        
        yield TokenFrame(
            exec_id=context.exec_id,
            agent_id=self.agent_id,
            seq=self._next_seq(),
            text="\n🔄 Starting collaborative thinking process...\n\n",
            ts=time.time(),
            final=False
        )
        
        # THINKING LOOP
        self._thinking_active = True
        thinking_rounds = 0
        max_rounds = 15
        max_thoughts = 50
        
        while self._thinking_active and thinking_rounds < max_rounds and len(self.shared_memory) < max_thoughts:
            thinking_rounds += 1
            
            yield TokenFrame(
                exec_id=context.exec_id,
                agent_id=self.agent_id,
                seq=self._next_seq(),
                text=f"\n--- Thinking Round {thinking_rounds} ---\n",
                ts=time.time(),
                final=False
            )
            
            # Propagate activation through network
            self._propagate_activation()
            
            # Let agents think based on activation
            round_thoughts = []
            thinking_agents = []
            
            for agent in self.neural_agents.values():
                # Limit how many times each agent can think
                if len([t for t in self.shared_memory if t.agent_id == agent.agent_id]) < 10:
                    if agent.should_think(self.shared_memory):
                        thinking_agents.append(agent)
            
            # Parallel thinking (but limit concurrency)
            if thinking_agents:
                # Think in small batches for better coherence
                batch_size = min(2, len(thinking_agents))  # Reduced batch size
                selected_thinkers = random.sample(thinking_agents, min(batch_size, len(thinking_agents)))
                
                think_tasks = [
                    self._agent_think(agent, context.task, context)
                    for agent in selected_thinkers
                ]
                
                thoughts = await asyncio.gather(*think_tasks)
                
                for thought in thoughts:
                    if thought:
                        self.shared_memory.append(thought)
                        round_thoughts.append(thought)
                        
                        # Stream the thought
                        yield TokenFrame(
                            exec_id=context.exec_id,
                            agent_id=self.agent_id,
                            seq=self._next_seq(),
                            text=f"\n💭 [{thought.agent_name}] {thought.thought_type.value.upper()}:\n",
                            ts=time.time(),
                            final=False
                        )
                        
                        yield TokenFrame(
                            exec_id=context.exec_id,
                            agent_id=self.agent_id,
                            seq=self._next_seq(),
                            text=f"   {thought.content}\n",
                            ts=time.time(),
                            final=False
                        )
                        
                        yield TokenFrame(
                            exec_id=context.exec_id,
                            agent_id=self.agent_id,
                            seq=self._next_seq(),
                            text=f"   (confidence: {thought.confidence:.2f})\n",
                            ts=time.time(),
                            final=False
                        )
                        
                        # Emit thought event for visualization
                        yield ControlFrame(
                            exec_id=context.exec_id,
                            type="neural_thought",
                            agent_id=thought.agent_id,
                            payload={
                                "thought": thought.to_dict(),
                                "activation": self.neural_agents[thought.agent_id].activation
                            }
                        )
            
            # Check for consensus
            consensus = self._detect_consensus()
            if consensus:
                self._consensus_reached = True
                yield TokenFrame(
                    exec_id=context.exec_id,
                    agent_id=self.agent_id,
                    seq=self._next_seq(),
                    text=f"\n🎯 Consensus emerging on {len(consensus['items'])} topics!\n",
                    ts=time.time(),
                    final=False
                )
                
                # Emit consensus event
                yield ControlFrame(
                    exec_id=context.exec_id,
                    type="consensus_reached",
                    agent_id=self.agent_id,
                    payload=consensus
                )
                
                if consensus["items"][0]["confidence"] > 0.75:
                    self._thinking_active = False
            
            # Brief pause between rounds
            await asyncio.sleep(0.2)  # Shorter pause for faster thinking
        
        # Summarize the thinking process
        yield TokenFrame(
            exec_id=context.exec_id,
            agent_id=self.agent_id,
            seq=self._next_seq(),
            text=f"\n\n✅ Neural thinking complete!\n",
            ts=time.time(),
            final=False
        )
        
        yield TokenFrame(
            exec_id=context.exec_id,
            agent_id=self.agent_id,
            seq=self._next_seq(),
            text=f"📊 Statistics:\n",
            ts=time.time(),
            final=False
        )
        
        yield TokenFrame(
            exec_id=context.exec_id,
            agent_id=self.agent_id,
            seq=self._next_seq(),
            text=f"  • Total thoughts: {len(self.shared_memory)}\n",
            ts=time.time(),
            final=False
        )
        
        yield TokenFrame(
            exec_id=context.exec_id,
            agent_id=self.agent_id,
            seq=self._next_seq(),
            text=f"  • Thinking rounds: {thinking_rounds}\n",
            ts=time.time(),
            final=False
        )
        
        yield TokenFrame(
            exec_id=context.exec_id,
            agent_id=self.agent_id,
            seq=self._next_seq(),
            text=f"  • Active agents: {len([a for a in self.neural_agents.values() if a.thoughts])}\n",
            ts=time.time(),
            final=False
        )
        
        if consensus:
            yield TokenFrame(
                exec_id=context.exec_id,
                agent_id=self.agent_id,
                seq=self._next_seq(),
                text=f"  • Consensus topics: {len(consensus['items'])}\n",
                ts=time.time(),
                final=False
            )
        
        # Show thought distribution
        thought_types = {}
        for thought in self.shared_memory:
            thought_types[thought.thought_type.value] = thought_types.get(thought.thought_type.value, 0) + 1
        
        yield TokenFrame(
            exec_id=context.exec_id,
            agent_id=self.agent_id,
            seq=self._next_seq(),
            text=f"\n📈 Thought Distribution:\n",
            ts=time.time(),
            final=False
        )
        
        for thought_type, count in thought_types.items():
            yield TokenFrame(
                exec_id=context.exec_id,
                agent_id=self.agent_id,
                seq=self._next_seq(),
                text=f"  • {thought_type}: {count}\n",
                ts=time.time(),
                final=False
            )
        
        # Final token
        yield TokenFrame(
            exec_id=context.exec_id,
            agent_id=self.agent_id,
            seq=self._next_seq(),
            text="",
            ts=time.time(),
            final=True
        )
        
        # Completion event
        yield ControlFrame(
            exec_id=context.exec_id,
            type=ControlType.AGENT_COMPLETED,
            agent_id=self.agent_id,
            payload={
                "thoughts": len(self.shared_memory),
                "consensus": self._consensus_reached,
                "rounds": thinking_rounds
            }
        )