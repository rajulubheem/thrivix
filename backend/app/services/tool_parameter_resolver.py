"""
Two-Phase Tool Parameter Resolution System
Phase 1: AI plans with tool names only
Phase 2: AI fills parameters for selected tools
"""

import logging
from typing import Dict, List, Any, Optional
import json
from app.services.strands_tool_definitions import STRANDS_TOOL_SCHEMAS

logger = logging.getLogger(__name__)


class ToolParameterResolver:
    """Resolves and validates tool parameters in a two-phase approach"""

    def __init__(self):
        self.tool_schemas = STRANDS_TOOL_SCHEMAS

    def get_tool_catalog(self) -> List[Dict[str, str]]:
        """
        Get lightweight tool catalog for AI planning
        Returns only name and brief description, not full schemas
        """
        catalog = []
        for tool_name, schema in self.tool_schemas.items():
            catalog.append({
                "name": tool_name,
                "description": schema.get("description", "")[:100]  # Brief description only
            })
        return catalog

    def get_tool_names_only(self) -> List[str]:
        """Get just the list of available tool names"""
        return list(self.tool_schemas.keys())

    def extract_used_tools(self, state_machine: Dict[str, Any]) -> List[str]:
        """Extract which tools are actually used in the workflow"""
        used_tools = set()
        for state in state_machine.get("states", []):
            if state.get("type") == "tool_call" and state.get("tools"):
                for tool in state.get("tools", []):
                    if tool in self.tool_schemas:
                        used_tools.add(tool)
        return list(used_tools)

    def get_schemas_for_tools(self, tool_names: List[str]) -> Dict[str, Any]:
        """Get schemas for specific tools only"""
        schemas = {}
        for tool_name in tool_names:
            if tool_name in self.tool_schemas:
                schemas[tool_name] = self.tool_schemas[tool_name]
        return schemas

    async def resolve_parameters(self, state_machine: Dict[str, Any], task: str) -> Dict[str, Any]:
        """
        Phase 2: Resolve parameters for tools used in the workflow
        """
        # Extract which tools are actually used
        used_tools = self.extract_used_tools(state_machine)

        if not used_tools:
            return state_machine  # No tools to resolve

        # Get schemas for only the used tools
        tool_schemas = self.get_schemas_for_tools(used_tools)

        # Build parameter resolution prompt
        parameters_by_state = await self._query_ai_for_parameters(
            state_machine,
            tool_schemas,
            task
        )

        # Update state machine with resolved parameters
        for state in state_machine.get("states", []):
            state_id = state.get("id")
            if state_id in parameters_by_state:
                state["tool_parameters"] = parameters_by_state[state_id]

        return state_machine

    async def _query_ai_for_parameters(
        self,
        state_machine: Dict[str, Any],
        tool_schemas: Dict[str, Any],
        task: str
    ) -> Dict[str, Dict[str, Any]]:
        """
        Query AI to fill parameters for specific tools
        """
        # Build a focused prompt with only relevant tool schemas
        prompt = self._build_parameter_prompt(state_machine, tool_schemas, task)

        # Use AI to fill parameters
        try:
            import os
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                logger.warning("No API key, using defaults")
                return self._generate_default_parameters(state_machine, tool_schemas)

            from strands.models.openai import OpenAIModel
            from strands import Agent

            model = OpenAIModel(
                client_args={"api_key": api_key},
                model_id="gpt-4o-mini",
                params={"temperature": 0.2, "max_tokens": 2000}
            )

            agent = Agent(
                name="parameter_resolver",
                system_prompt=(
                    "You are an intelligent parameter filler. Your job is to fill tool parameters with ACTUAL, "
                    "REAL values extracted from the task description.\n\n"
                    "CRITICAL RULES:\n"
                    "1. NEVER use ${USER_INPUT} or any placeholder syntax\n"
                    "2. Extract the actual topic/subject from the task and use it directly\n"
                    "3. Be specific and detailed based on what the user asked for\n\n"
                    "Examples:\n"
                    "- Task: 'research satellite communication' → query: 'satellite communication systems protocols'\n"
                    "- Task: 'analyze AI agents' → query: 'artificial intelligence autonomous agents multi-agent systems'\n"
                    "- Task: 'build trading bot' → query: 'cryptocurrency trading bot algorithms strategies'\n\n"
                    "For file names, use descriptive names based on the task:\n"
                    "- 'satellite communication' → 'satellite_communication_analysis.md'\n"
                    "- 'AI agents' → 'ai_agents_research.md'\n\n"
                    "For code, write actual functional code relevant to the task, not placeholders.\n\n"
                    "Return ONLY valid JSON with filled parameter values."
                ),
                model=model
            )

            response = agent(prompt)
            response_text = str(response)

            # Parse JSON response
            json_start = response_text.find('{')
            json_end = response_text.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                return json.loads(response_text[json_start:json_end])

        except Exception as e:
            logger.error(f"Failed to resolve parameters via AI: {e}")

        return self._generate_default_parameters(state_machine, tool_schemas)

    def _build_parameter_prompt(
        self,
        state_machine: Dict[str, Any],
        tool_schemas: Dict[str, Any],
        task: str
    ) -> str:
        """Build focused prompt for parameter resolution"""

        # Extract relevant states that need parameters
        tool_states = []
        for state in state_machine.get("states", []):
            if state.get("type") == "tool_call" and state.get("tools"):
                tool_states.append({
                    "id": state["id"],
                    "name": state.get("name", ""),
                    "description": state.get("description", ""),
                    "tools": state.get("tools", [])
                })

        return f"""Task: {task}

You are filling in tool parameters for a workflow that will execute this task.
The user has asked for: {task}

CRITICAL RULES:
1. ALWAYS fill in REAL, ACTUAL values based on the task
2. NEVER use ${{USER_INPUT}} or placeholders
3. Extract the actual subject/topic from the task and use it

Tool-using states in the workflow:
{json.dumps(tool_states, indent=2)}

Tool schemas (required parameters only):
{json.dumps(tool_schemas, indent=2)}

Based on the task "{task}", fill in the parameters:

Examples:
- If task mentions "satellite communication mission", then:
  * tavily_search query: "satellite communication systems mission planning protocols"
  * file_write path: "satellite_mission_analysis.md"
  * file_write content: "# Satellite Communication Mission Analysis\\n\\n## Overview\\n..."
  * python_repl code: actual code for satellite orbit calculations or communication analysis

- If task mentions "AI agents", then:
  * tavily_search query: "AI agents autonomous systems multi-agent coordination"
  * file_write path: "ai_agents_research.md"
  * python_repl code: actual agent simulation or coordination code

Return JSON mapping state IDs to their tool parameters:
{{
    "state_id": {{
        "tool_name": {{
            "parameter": "ACTUAL VALUE extracted from '{task}'"
        }}
    }}
}}"""

    def _generate_default_parameters(
        self,
        state_machine: Dict[str, Any],
        tool_schemas: Dict[str, Any]
    ) -> Dict[str, Dict[str, Any]]:
        """Generate default parameters as fallback - still avoid placeholders"""
        params_by_state = {}

        # Try to extract context from the state machine itself
        task_hints = []
        for state in state_machine.get("states", []):
            if state.get("description"):
                task_hints.append(state["description"])
            if state.get("name"):
                task_hints.append(state["name"])

        # Create a generic topic from hints
        topic_words = []
        for hint in task_hints[:5]:  # Use first 5 hints
            words = hint.lower().split()
            for word in words:
                if word not in ["the", "a", "an", "of", "to", "from", "for", "with", "is", "are", "and", "or"]:
                    topic_words.append(word)

        main_topic = " ".join(topic_words[:3]) if topic_words else "research"

        for state in state_machine.get("states", []):
            if state.get("type") == "tool_call" and state.get("tools"):
                state_id = state["id"]
                params_by_state[state_id] = {}

                for tool_name in state.get("tools", []):
                    if tool_name in tool_schemas:
                        schema = tool_schemas[tool_name]
                        tool_params = {}

                        # Fill required parameters with actual values based on context
                        for param in schema.get("parameters", {}).get("properties", {}):
                            param_schema = schema["parameters"]["properties"][param]
                            if param in schema.get("parameters", {}).get("required", []):
                                # Generate actual values, not placeholders
                                if param_schema.get("type") == "string":
                                    if "query" in param:
                                        tool_params[param] = main_topic
                                    elif "file" in param or "path" in param:
                                        tool_params[param] = f"{main_topic.replace(' ', '_')}_output.md"
                                    elif "url" in param:
                                        tool_params[param] = "https://api.example.com/data"
                                    elif "content" in param:
                                        tool_params[param] = f"# {main_topic.title()} Analysis\n\n## Overview\n\nAnalysis results will be documented here.\n"
                                    elif "code" in param:
                                        tool_params[param] = f"# {main_topic.title()} Analysis\nprint('Analyzing {main_topic}...')\n# TODO: Implementation"
                                    else:
                                        tool_params[param] = main_topic
                                elif param_schema.get("type") == "number":
                                    tool_params[param] = param_schema.get("default", 5)
                                elif param_schema.get("type") == "boolean":
                                    tool_params[param] = param_schema.get("default", False)

                        params_by_state[state_id][tool_name] = tool_params

        return params_by_state

    def validate_parameters(
        self,
        tool_name: str,
        parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Validate parameters against tool schema
        Returns: {"valid": bool, "errors": [...], "missing": [...]}
        """
        if tool_name not in self.tool_schemas:
            return {"valid": False, "errors": [f"Unknown tool: {tool_name}"]}

        schema = self.tool_schemas[tool_name]
        param_schema = schema.get("parameters", {})
        required = param_schema.get("required", [])
        properties = param_schema.get("properties", {})

        errors = []
        missing = []

        # Check required parameters
        for req_param in required:
            if req_param not in parameters:
                missing.append(req_param)
            elif parameters[req_param] is None or parameters[req_param] == "":
                missing.append(req_param)

        # Validate parameter types
        for param_name, param_value in parameters.items():
            if param_name in properties:
                expected_type = properties[param_name].get("type")

                # Skip validation for placeholders
                if isinstance(param_value, str) and param_value.startswith("${"):
                    continue

                # Basic type checking
                if expected_type == "string" and not isinstance(param_value, str):
                    errors.append(f"{param_name} should be string, got {type(param_value).__name__}")
                elif expected_type == "number" and not isinstance(param_value, (int, float)):
                    errors.append(f"{param_name} should be number, got {type(param_value).__name__}")
                elif expected_type == "boolean" and not isinstance(param_value, bool):
                    errors.append(f"{param_name} should be boolean, got {type(param_value).__name__}")
                elif expected_type == "object" and not isinstance(param_value, dict):
                    errors.append(f"{param_name} should be object, got {type(param_value).__name__}")
                elif expected_type == "array" and not isinstance(param_value, list):
                    errors.append(f"{param_name} should be array, got {type(param_value).__name__}")
            else:
                # Parameter not in schema
                errors.append(f"Unknown parameter: {param_name}")

        return {
            "valid": len(errors) == 0 and len(missing) == 0,
            "errors": errors,
            "missing": missing
        }


# Export singleton
tool_parameter_resolver = ToolParameterResolver()