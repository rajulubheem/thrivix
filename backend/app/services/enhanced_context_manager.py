"""
Enhanced Context Manager for Goal-Oriented Workflow Execution
Provides intelligent context management to maintain coherence across workflow states
"""

import logging
from typing import Dict, List, Any, Optional, Set, Tuple
from dataclasses import dataclass, field
import json
import re

logger = logging.getLogger(__name__)


@dataclass
class MissionContext:
    """Represents the overall mission/goal context for a workflow"""
    overall_goal: str
    success_criteria: List[str] = field(default_factory=list)
    current_phase: str = "initialization"  # initialization|research|planning|execution|validation|completion
    key_findings: Dict[str, Any] = field(default_factory=dict)
    decisions_made: List[Dict[str, Any]] = field(default_factory=list)
    constraints: List[str] = field(default_factory=list)
    progress: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            'overall_goal': self.overall_goal,
            'success_criteria': self.success_criteria,
            'current_phase': self.current_phase,
            'key_findings': self.key_findings,
            'decisions_made': self.decisions_made,
            'constraints': self.constraints,
            'progress': self.progress
        }


class EnhancedContextManager:
    """Manages context flow and goal coherence across workflow states"""

    def __init__(self):
        self.state_dependencies: Dict[str, Dict[str, List[str]]] = {}
        self.relevance_threshold = 0.7

    def extract_mission_from_task(self, task: str) -> MissionContext:
        """Extract mission context from the initial task description"""
        mission = MissionContext(overall_goal=task)

        # Extract success criteria if mentioned
        criteria_patterns = [
            r"must\s+(?:ensure|achieve|complete|produce):\s*([^.]+)",
            r"success\s+criteria:\s*([^.]+)",
            r"requirements?:\s*([^.]+)"
        ]

        for pattern in criteria_patterns:
            matches = re.findall(pattern, task, re.IGNORECASE)
            for match in matches:
                # Split by common delimiters
                criteria = re.split(r'[,;\n•\-\d\.]', match)
                mission.success_criteria.extend([c.strip() for c in criteria if c.strip()])

        # Extract constraints if mentioned
        constraint_patterns = [
            r"(?:must\s+not|should\s+not|avoid):\s*([^.]+)",
            r"constraints?:\s*([^.]+)",
            r"limitations?:\s*([^.]+)"
        ]

        for pattern in constraint_patterns:
            matches = re.findall(pattern, task, re.IGNORECASE)
            for match in matches:
                constraints = re.split(r'[,;\n•\-]', match)
                mission.constraints.extend([c.strip() for c in constraints if c.strip()])

        # Determine initial phase based on task keywords
        if any(word in task.lower() for word in ['research', 'find', 'discover', 'investigate']):
            mission.current_phase = 'research'
        elif any(word in task.lower() for word in ['plan', 'design', 'architect', 'structure']):
            mission.current_phase = 'planning'
        elif any(word in task.lower() for word in ['build', 'create', 'implement', 'develop']):
            mission.current_phase = 'execution'

        return mission

    def determine_phase_from_state(self, state: Dict[str, Any], current_phase: str) -> str:
        """Determine the workflow phase based on the current state"""
        state_type = state.get('type', '')
        state_name = state.get('name', '').lower()
        state_id = state.get('id', '').lower()

        # Phase detection based on state characteristics
        phase_indicators = {
            'initialization': ['init', 'setup', 'prepare', 'config'],
            'research': ['research', 'gather', 'collect', 'search', 'find', 'discover'],
            'planning': ['plan', 'design', 'architect', 'structure', 'strategy'],
            'execution': ['execute', 'implement', 'build', 'create', 'run', 'perform'],
            'validation': ['validate', 'verify', 'test', 'check', 'review', 'assess'],
            'completion': ['final', 'complete', 'deliver', 'report', 'summary']
        }

        for phase, indicators in phase_indicators.items():
            if any(indicator in state_name or indicator in state_id for indicator in indicators):
                return phase

        return current_phase  # Keep current if no match

    def map_state_dependencies(self, states: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> Dict[str, Dict[str, List[str]]]:
        """Map dependencies between states based on edges and logical relationships"""
        dependencies = {}

        # Build direct dependencies from edges
        for state in states:
            state_id = state['id']
            dependencies[state_id] = {
                'depends_on': [],
                'provides_to': [],
                'related_to': []
            }

        # Map direct connections
        for edge in edges:
            source = edge.get('source')
            target = edge.get('target')
            if source and target:
                if source in dependencies:
                    dependencies[source]['provides_to'].append(target)
                if target in dependencies:
                    dependencies[target]['depends_on'].append(source)

        # Infer logical relationships based on state types and names
        for i, state1 in enumerate(states):
            for state2 in states[i+1:]:
                if self._are_states_related(state1, state2):
                    dependencies[state1['id']]['related_to'].append(state2['id'])
                    dependencies[state2['id']]['related_to'].append(state1['id'])

        return dependencies

    def _are_states_related(self, state1: Dict[str, Any], state2: Dict[str, Any]) -> bool:
        """Determine if two states are logically related"""
        # Check for common tool usage
        tools1 = set(state1.get('tools', []))
        tools2 = set(state2.get('tools', []))
        if tools1 and tools2 and tools1.intersection(tools2):
            return True

        # Check for naming patterns suggesting relationship
        name1 = state1.get('name', '').lower()
        name2 = state2.get('name', '').lower()

        # Related pairs
        related_patterns = [
            ('gather', 'validate'),
            ('research', 'analysis'),
            ('plan', 'execute'),
            ('implement', 'test'),
            ('create', 'review')
        ]

        for pattern1, pattern2 in related_patterns:
            if (pattern1 in name1 and pattern2 in name2) or \
               (pattern2 in name1 and pattern1 in name2):
                return True

        return False

    def get_relevant_context(self, current_state: Dict[str, Any],
                            all_results: Dict[str, Any],
                            dependencies: Dict[str, Dict[str, List[str]]],
                            max_context_size: int = 2000) -> Dict[str, Any]:
        """Select the most relevant context for the current state"""
        state_id = current_state['id']
        relevant_context = {}

        # Priority 1: Direct dependencies
        if state_id in dependencies:
            for dep_id in dependencies[state_id]['depends_on']:
                if dep_id in all_results:
                    relevant_context[dep_id] = all_results[dep_id]

        # Priority 2: Related states
        if state_id in dependencies:
            for rel_id in dependencies[state_id]['related_to']:
                if rel_id in all_results and rel_id not in relevant_context:
                    relevant_context[rel_id] = all_results[rel_id]

        # Priority 3: States with key findings
        for result_id, result in all_results.items():
            if result_id not in relevant_context:
                if self._has_key_findings(result):
                    relevant_context[result_id] = result

        # Truncate if needed while preserving most important
        return self._truncate_context(relevant_context, max_context_size)

    def _has_key_findings(self, result: Any) -> bool:
        """Check if a result contains key findings"""
        if not result:
            return False

        result_str = str(result).lower()
        key_indicators = [
            'found', 'discovered', 'identified', 'determined',
            'conclusion', 'result', 'output', 'success', 'failure',
            'important', 'critical', 'key', 'main'
        ]

        return any(indicator in result_str for indicator in key_indicators)

    def _truncate_context(self, context: Dict[str, Any], max_size: int) -> Dict[str, Any]:
        """Intelligently truncate context to fit size limit"""
        # Calculate current size
        current_size = sum(len(str(k) + str(v)) for k, v in context.items())

        if current_size <= max_size:
            return context

        # Prioritize and truncate
        truncated = {}
        remaining_size = max_size

        for key, value in context.items():
            value_str = str(value)
            key_str = str(key)
            entry_size = len(key_str) + len(value_str) + 10  # Buffer for formatting

            if entry_size <= remaining_size:
                truncated[key] = value
                remaining_size -= entry_size
            elif remaining_size > 100:  # Minimum useful size
                # Truncate this entry to fit
                available = remaining_size - len(key_str) - 20
                if available > 50:
                    truncated[key] = value_str[:available] + "..."
                    remaining_size = 0
                    break

        return truncated

    def extract_key_findings(self, state_id: str, result: str) -> Dict[str, Any]:
        """Extract key findings from a state's result"""
        findings = {}

        # Look for structured data
        json_pattern = r'\{[^{}]*\}'
        json_matches = re.findall(json_pattern, result)
        for match in json_matches:
            try:
                data = json.loads(match)
                if isinstance(data, dict):
                    findings.update(data)
            except json.JSONDecodeError:
                pass

        # Extract lists
        list_pattern = r'(?:^|\n)\s*[-•]\s*(.+?)(?:\n|$)'
        list_items = re.findall(list_pattern, result, re.MULTILINE)
        if list_items:
            findings[f'{state_id}_items'] = list_items

        # Extract key-value pairs
        kv_pattern = r'(\w+):\s*([^:\n]+?)(?:\n|$)'
        kv_matches = re.findall(kv_pattern, result)
        for key, value in kv_matches:
            findings[key.lower()] = value.strip()

        return findings

    def calculate_progress(self, mission: MissionContext, results: Dict[str, Any]) -> float:
        """Calculate progress toward the mission goal"""
        if not mission.success_criteria:
            # Estimate based on phase
            phase_progress = {
                'initialization': 0.1,
                'research': 0.3,
                'planning': 0.5,
                'execution': 0.7,
                'validation': 0.9,
                'completion': 1.0
            }
            return phase_progress.get(mission.current_phase, 0.5)

        # Check criteria completion
        completed = 0
        for criterion in mission.success_criteria:
            if self._is_criterion_met(criterion, results):
                completed += 1

        return completed / len(mission.success_criteria)

    def _is_criterion_met(self, criterion: str, results: Dict[str, Any]) -> bool:
        """Check if a success criterion has been met"""
        criterion_lower = criterion.lower()

        # Check if criterion keywords appear in results
        for result in results.values():
            if not result:
                continue
            result_str = str(result).lower()

            # Simple keyword matching (can be enhanced with NLP)
            criterion_words = set(criterion_lower.split())
            result_words = set(result_str.split())

            # If significant overlap, consider met
            overlap = criterion_words.intersection(result_words)
            if len(overlap) >= len(criterion_words) * 0.5:
                return True

            # Check for completion indicators
            if any(word in result_str for word in ['completed', 'done', 'finished', 'achieved']):
                if any(word in criterion_lower for word in result_str.split()[:20]):
                    return True

        return False

    def build_enhanced_context(self, state: Dict[str, Any],
                               mission: MissionContext,
                               relevant_context: Dict[str, Any]) -> str:
        """Build an enhanced context string for the agent prompt"""

        # Format mission context
        mission_str = f"""
=== MISSION CONTEXT ===
Overall Goal: {mission.overall_goal}
Current Phase: {mission.current_phase}
Progress: {mission.progress:.0%}
"""

        if mission.success_criteria:
            mission_str += f"\nSuccess Criteria:\n"
            for criterion in mission.success_criteria:
                mission_str += f"  • {criterion}\n"

        if mission.constraints:
            mission_str += f"\nConstraints to Respect:\n"
            for constraint in mission.constraints:
                mission_str += f"  • {constraint}\n"

        if mission.key_findings:
            mission_str += f"\nKey Findings So Far:\n"
            for key, value in list(mission.key_findings.items())[:5]:  # Limit to top 5
                mission_str += f"  • {key}: {str(value)[:100]}\n"

        # Format relevant context
        context_str = "\n=== RELEVANT CONTEXT FROM PREVIOUS WORK ===\n"
        for state_id, result in relevant_context.items():
            context_str += f"\n{state_id}:\n{str(result)[:300]}\n"

        # Add role-specific guidance
        role_str = f"""
=== YOUR ROLE IN THE MISSION ===
You are: {state.get('agent_role', 'an agent')}
Your specific task: {state.get('description', state.get('task', ''))}

How your work contributes to the goal:
- You are in the {mission.current_phase} phase
- Your output will directly impact the next steps
- Focus on advancing toward: {mission.overall_goal}
"""

        return mission_str + context_str + role_str

    def update_mission_from_result(self, mission: MissionContext,
                                  state_id: str,
                                  result: Any) -> MissionContext:
        """Update mission context based on state execution result"""

        # Extract and add key findings
        new_findings = self.extract_key_findings(state_id, str(result))
        mission.key_findings.update(new_findings)

        # Check for decisions made
        if 'decision' in state_id.lower() or 'choice' in str(result).lower():
            mission.decisions_made.append({
                'state': state_id,
                'decision': str(result)[:200]
            })

        # Update progress
        # This would be called with all results to properly calculate
        # mission.progress = self.calculate_progress(mission, all_results)

        return mission


# Singleton instance
enhanced_context_manager = EnhancedContextManager()