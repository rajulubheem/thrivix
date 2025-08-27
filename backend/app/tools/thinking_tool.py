"""Recursive thinking tool for Strands Agent - Simplified version for research.

This module provides functionality for deep analytical thinking through multiple recursive cycles,
enabling sophisticated thought processing and self-reflection capabilities.
"""

import logging
import uuid
from typing import Any, Dict, List, Optional
from strands import Agent, tool

logger = logging.getLogger(__name__)


class ThoughtProcessor:
    def __init__(self):
        self.tool_use_id = str(uuid.uuid4())
    
    def create_thinking_prompt(
        self,
        thought: str,
        cycle: int,
        total_cycles: int,
        thinking_instructions: Optional[str] = None,
    ) -> str:
        """Create a focused prompt for the thinking process."""
        
        # Default thinking instructions for research
        default_instructions = """
You are performing deep analytical thinking. Your task is to:
1. Analyze the given thought/question deeply and systematically
2. Identify key patterns, connections, and implications
3. Consider multiple perspectives and potential contradictions
4. Generate structured insights with clear reasoning
5. Build upon previous cycle's insights to go deeper
"""
        
        instructions = thinking_instructions or default_instructions
        
        prompt = f"""{instructions}

Thinking Cycle: {cycle}/{total_cycles}

Thought to analyze:
{thought}

Provide your deep analysis:
"""
        return prompt.strip()
    
    def process_cycle(
        self,
        thought: str,
        cycle: int,
        total_cycles: int,
        model,
        system_prompt: str,
        thinking_instructions: Optional[str] = None,
        available_tools: List[Any] = None,
    ) -> str:
        """Process a single thinking cycle."""
        
        logger.info(f"🧠 Thinking Cycle {cycle}/{total_cycles}: Processing...")
        
        # Create cycle-specific prompt
        prompt = self.create_thinking_prompt(thought, cycle, total_cycles, thinking_instructions)
        
        # Filter out the think_deeply tool to prevent recursion
        safe_tools = []
        if available_tools:
            for tool in available_tools:
                tool_name = getattr(tool, '__name__', str(tool))
                if 'think' not in tool_name.lower():
                    safe_tools.append(tool)
        
        # Create a nested agent for this thinking cycle
        thinking_agent = Agent(
            model=model,
            messages=[],
            tools=safe_tools,  # Use filtered tools without thinking tool
            system_prompt=system_prompt,
        )
        
        # Run the thinking cycle
        result = thinking_agent(prompt)
        response = str(result)
        
        logger.debug(f"Cycle {cycle} output: {response[:200]}...")
        
        return response.strip()


@tool
def think_deeply(
    thought: str,
    cycle_count: int = 3,
    agent: Optional[Any] = None,
) -> Dict[str, Any]:
    """Deep recursive thinking tool for sophisticated analysis.
    
    This tool implements multi-cycle cognitive analysis that progressively refines thoughts
    through iterative processing. Each cycle builds upon insights from the previous cycle.
    
    Args:
        thought: The thought, question, or topic to analyze deeply
        cycle_count: Number of thinking cycles (1-5, default 3)
        agent: Parent agent (automatically passed by Strands)
    
    Returns:
        Dict with status and deep analysis content
    """
    
    try:
        # Validate cycle count
        cycle_count = min(max(cycle_count, 1), 5)  # Limit to 1-5 cycles
        
        # Get model from parent agent
        model = agent.model if agent else None
        if not model:
            return {
                "status": "error",
                "content": [{"text": "No model available for thinking"}]
            }
        
        # System prompt for thinking agent
        thinking_system_prompt = """You are a deep analytical thinker specializing in research and analysis.
Your role is to:
- Break down complex topics into fundamental components
- Identify patterns, connections, and implications
- Question assumptions and explore alternatives
- Provide structured, evidence-based insights
- Build progressively deeper understanding with each iteration"""
        
        # Special instructions for research thinking
        research_thinking_instructions = """
For research analysis, focus on:
1. **Information Gaps**: What key information is missing? What questions remain unanswered?
2. **Source Credibility**: How reliable are the sources? What biases might exist?
3. **Contradictions**: What conflicting information exists? How can it be reconciled?
4. **Patterns & Trends**: What patterns emerge across multiple sources?
5. **Deeper Implications**: What are the second and third-order effects?
6. **Alternative Perspectives**: What viewpoints haven't been considered?
7. **Actionable Insights**: What concrete conclusions can be drawn?

Use structured reasoning and be explicit about your analytical process.
"""
        
        # Initialize processor
        processor = ThoughtProcessor()
        
        # Process through cycles
        current_thought = thought
        all_responses = []
        
        for cycle in range(1, cycle_count + 1):
            # Get available tools from parent agent (excluding think_deeply)
            available_tools = []
            if agent and hasattr(agent, 'tool_registry'):
                for tool_name, tool_obj in agent.tool_registry.registry.items():
                    if 'think' not in tool_name.lower():
                        available_tools.append(tool_obj)
            
            # Process current cycle
            cycle_response = processor.process_cycle(
                current_thought,
                cycle,
                cycle_count,
                model,
                thinking_system_prompt,
                research_thinking_instructions,
                available_tools,
            )
            
            # Store response
            all_responses.append({
                "cycle": cycle,
                "thought": current_thought,
                "response": cycle_response
            })
            
            # Build next thought based on current insights
            if cycle < cycle_count:
                current_thought = f"""Previous analysis concluded:
{cycle_response}

Now go deeper: What haven't we considered? What assumptions need questioning? 
What connections or implications emerge from this analysis? 
Provide even more profound insights."""
        
        # Combine all cycles into final output
        final_output = "=== DEEP THINKING ANALYSIS ===\n\n"
        for r in all_responses:
            final_output += f"**Thinking Cycle {r['cycle']}/{cycle_count}:**\n"
            final_output += f"{r['response']}\n\n"
            final_output += "---\n\n"
        
        final_output += "=== END OF DEEP ANALYSIS ==="
        
        return {
            "status": "success", 
            "content": [{"text": final_output}]
        }
        
    except Exception as e:
        logger.error(f"Error in think_deeply tool: {str(e)}")
        return {
            "status": "error",
            "content": [{"text": f"Thinking error: {str(e)}"}]
        }