"""
State Machine to Unified Tools Adapter
Converts AI-generated state machine blocks to enhanced tool blocks with execution capabilities
"""

import logging
from typing import Dict, List, Any, Optional, Set, Tuple
from app.services.dynamic_tool_wrapper import StrandsToolRegistry
from app.services.strands_tool_definitions import STRANDS_TOOL_SCHEMAS
from app.api.v1.endpoints.unified_tools import get_tool_icon, get_category_color

logger = logging.getLogger(__name__)


class StateMachineToUnifiedAdapter:
    """
    Converts AI state machine blocks to unified tool blocks
    that are compatible with the frontend enhanced execution system
    """

    def __init__(self):
        self.registry = StrandsToolRegistry()
        self.tools_cache = {}
        self._load_tools()

    def _load_tools(self):
        """Load available tools from registry"""
        try:
            self.tools_cache = self.registry.get_available_tools()
        except Exception as e:
            logger.warning(f"Could not load tools from registry: {e}")
            self.tools_cache = {}

    def convert_state_to_enhanced_block(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert a state machine state to an enhanced block format
        compatible with the unified tool system
        """
        state_type = state.get("type", "analysis")

        # For tool_call states, use tool block
        if state_type == "tool_call" and state.get("tools"):
            return self._create_tool_block(state)

        # For other states, use professional block format
        block_type = "professional"  # Use professional blocks for better UI

        # Base block structure for non-tool blocks
        enhanced_block = {
            "id": state.get("id"),
            "type": block_type,
            "position": state.get("position", {"x": 0, "y": 0}),
            "data": {
                "type": self._map_state_type(state_type),
                "name": state.get("name", ""),
                "label": state.get("name", ""),
                "description": state.get("description", ""),
                "agent_role": state.get("agent_role", ""),
                "status": "pending",
                "isDarkMode": False,
                "transitions": state.get("transitions", {}),
                "edges": [],
                "enabled": True,
                "advancedMode": False,
                "isWide": False,
                "tools": state.get("tools", []),
                "isCompleted": state_type == "final" and "success" in state.get("name", "").lower(),
                "isError": state_type == "final" and "failure" in state.get("name", "").lower(),
                "nodeType": self._map_state_type(state_type)
            }
        }

        # Add state-specific styling
        if state_type == "decision":
            enhanced_block["data"]["color"] = "#F59E0B"
            enhanced_block["data"]["icon"] = "UserCheck"
        elif state_type == "parallel":
            enhanced_block["data"]["color"] = "#8B5CF6"
            enhanced_block["data"]["icon"] = "GitBranch"
        elif state_type == "final":
            enhanced_block["data"]["color"] = "#10B981" if "success" in state.get("name", "").lower() else "#EF4444"
            enhanced_block["data"]["icon"] = "CheckCircle" if "success" in state.get("name", "").lower() else "XCircle"

        return enhanced_block

    def _create_tool_block(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """Create an enhanced tool block with execution capabilities"""
        tool_name = state.get("tools", [])[0] if state.get("tools") else None

        if not tool_name:
            # Fallback to regular block if no tool
            return self.convert_state_to_enhanced_block({**state, "type": "analysis"})

        # Get tool information
        tool_info = self._get_tool_info(tool_name)

        # First check if AI provided tool_parameters for this tool
        ai_provided_params = {}
        if state.get("tool_parameters") and tool_name in state.get("tool_parameters", {}):
            ai_provided_params = state["tool_parameters"][tool_name]
            logger.info(f"Using AI-provided parameters for {tool_name}: {ai_provided_params}")

        # If AI provided parameters, use them; otherwise fall back to heuristics
        if ai_provided_params:
            prefilled_params = ai_provided_params
        else:
            # Fallback: Prefill parameters using state/context heuristics
            prefilled_params = self._prefill_tool_parameters(tool_name, state, context={})

        # Create tool block with execution capabilities
        return {
            "id": state.get("id"),
            "type": "tool",  # Use 'tool' type for tool blocks
            "position": state.get("position", {"x": 0, "y": 0}),
            "data": {
                "type": "tool",
                "name": state.get("name", ""),
                "label": state.get("name", ""),
                "description": state.get("description", ""),
                "agent_role": state.get("agent_role", ""),
                "status": "pending",
                "isDarkMode": False,
                "transitions": state.get("transitions", {}),
                "edges": [],
                "enabled": True,
                "advancedMode": False,
                "isWide": False,
                "nodeType": "tool_call",
                # Tool-specific fields
                "toolName": tool_name,
                "tools": [tool_name],
                "toolSchema": tool_info["schema"],
                "parameters": prefilled_params,
                "executionResult": None,
                "executionError": None,
                "category": tool_info["category"],
                "icon": tool_info["icon"],
                "color": tool_info["color"],
                "available_in_agents": tool_info["available_in_agents"],
                "available_in_ui": tool_info["available_in_ui"],
                "display_name": tool_info["display_name"],
                # Execution capability flags
                "hasExecutionCapability": True,
                "onExecuteTool": "unified",  # Flag for frontend to use unified execution
                "isExecuting": False,
                "isCompleted": False,
                "isError": False
            }
        }

    def convert_state_machine_to_workflow(self, state_machine: Dict[str, Any], context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Convert entire state machine to workflow format with enhanced blocks
        """
        states = state_machine.get("states", [])
        edges = state_machine.get("edges", [])

        # FIRST: Validate and fix the state machine
        states, edges = self._validate_and_fix_state_machine(states, edges)
        logger.debug("After validation - moving to simplification")

        # Simplify complex workflows by removing redundant monitoring/validation loops
        edges = self._simplify_edges(edges, states)
        logger.debug("After simplification - moving to position calculation")
        context = context or {}

        # ALWAYS recalculate positions for better layout, ignore AI-provided positions
        position_map = self._calculate_positions(states, edges)
        logger.debug(f"Position map calculated with {len(position_map)} positions")

        # Convert states to enhanced blocks
        enhanced_blocks = []
        for state in states:
            # Force use recalculated position, ignore any position from AI
            state_id = state.get("id")
            calculated_pos = position_map.get(state_id, {"x": 100, "y": 100})

            # Override any existing position with calculated one
            state["position"] = calculated_pos

            enhanced_block = self.convert_state_to_enhanced_block(state)

            # Ensure the enhanced block uses the calculated position
            enhanced_block["position"] = calculated_pos

            # Apply prefilling for tool blocks with provided context
            if enhanced_block.get("type") == "tool":
                tool_name = enhanced_block.get("data", {}).get("toolName")
                if tool_name:
                    # Check if AI provided parameters first
                    if state.get("tool_parameters") and tool_name in state.get("tool_parameters", {}):
                        enhanced_block["data"]["parameters"] = state["tool_parameters"][tool_name]
                        logger.info(f"Using AI-provided parameters for {tool_name} in workflow")
                    else:
                        # Fallback to heuristic prefilling
                        enhanced_block["data"]["parameters"] = self._prefill_tool_parameters(tool_name, state, context)
            enhanced_blocks.append(enhanced_block)

        # Convert edges to React Flow format
        flow_edges = []
        for edge in edges:
            flow_edge = {
                "id": f"{edge['source']}-{edge['target']}",
                "source": edge["source"],
                "target": edge["target"],
                "sourceHandle": edge.get("event", "success"),
                "targetHandle": None,
                "type": "smoothstep",
                "animated": edge.get("event") == "retry",
                "label": edge.get("event", ""),
                "data": {
                    "event": edge.get("event", "success")
                }
            }
            flow_edges.append(flow_edge)

        return {
            "name": state_machine.get("name", "AI Generated Workflow"),
            "initial_state": state_machine.get("initial_state"),
            "blocks": enhanced_blocks,
            "edges": flow_edges,
            "metadata": {
                "generated_by": "ai_state_machine",
                "enhanced": True,
                "unified_tools": True
            }
        }

    def _map_state_type(self, state_type: str) -> str:
        """Map state machine types to node types"""
        type_map = {
            "analysis": "analysis",
            "tool_call": "tool_call",
            "decision": "decision",
            "parallel": "parallel",
            "final": "final"
        }
        return type_map.get(state_type, "analysis")

    def _get_tool_info(self, tool_name: str) -> Dict[str, Any]:
        """Get tool information including schema and metadata"""
        # Try to get from STRANDS_TOOL_SCHEMAS first
        schema = STRANDS_TOOL_SCHEMAS.get(tool_name, {})

        # Get additional info from registry
        tool_info = self.tools_cache.get(tool_name, {})

        # Build complete tool info
        return {
            "schema": {
                "name": tool_name,
                "display_name": tool_name.replace("_", " ").title(),
                "description": schema.get("description", tool_info.get("description", "")),
                "parameters": self._convert_parameters(schema.get("parameters", {})),
                "examples": schema.get("examples", []),
                "category": tool_info.get("category", "general"),
                "icon": get_tool_icon(tool_name),
                "color": get_category_color(tool_info.get("category", "general")),
                "available_in_agents": True,
                "available_in_ui": tool_name in STRANDS_TOOL_SCHEMAS
            },
            "category": tool_info.get("category", "general"),
            "icon": get_tool_icon(tool_name),
            "color": get_category_color(tool_info.get("category", "general")),
            "display_name": tool_name.replace("_", " ").title(),
            "available_in_agents": True,
            "available_in_ui": tool_name in STRANDS_TOOL_SCHEMAS
        }

    def _convert_parameters(self, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Convert parameter schema to frontend format"""
        if not params:
            return []

        properties = params.get("properties", {})
        required = params.get("required", [])

        converted = []
        for name, prop in properties.items():
            converted.append({
                "name": name,
                "type": self._map_json_type(prop.get("type", "string")),
                "description": prop.get("description", ""),
                "required": name in required,
                "default": prop.get("default"),
                "enum": prop.get("enum"),
                "placeholder": prop.get("description", "")
            })

        return converted

    def _map_json_type(self, json_type: str) -> str:
        """Map JSON schema types to frontend parameter types"""
        type_map = {
            "string": "string",
            "integer": "number",
            "number": "number",
            "boolean": "boolean",
            "object": "object",
            "array": "array"
        }
        return type_map.get(json_type, "string")

    def _calculate_positions(self, states: List[Dict], edges: List[Dict]) -> Dict[str, Dict[str, float]]:
        """Enhanced hierarchical layout with better spacing and flow detection"""
        logger.info(f"_calculate_positions: Starting with {len(states)} states, {len(edges) if edges else 0} edges")
        positions: Dict[str, Dict[str, float]] = {}

        if not states:
            logger.warning("_calculate_positions: No states provided")
            return positions

        # Build adjacency maps
        logger.info("_calculate_positions: Building adjacency maps")
        graph: Dict[str, List[str]] = {s["id"]: [] for s in states if s.get("id")}
        reverse_graph: Dict[str, List[str]] = {s["id"]: [] for s in states if s.get("id")}

        edge_count = 0
        for e in edges or []:
            src = e.get("source")
            tgt = e.get("target")
            if src in graph and tgt in graph:
                graph[src].append(tgt)
                if tgt not in reverse_graph:
                    reverse_graph[tgt] = []
                reverse_graph[tgt].append(src)
                edge_count += 1

        logger.info(f"_calculate_positions: Processed {edge_count} valid edges")

        # Find roots (nodes with no incoming edges from valid sources)
        incoming = {e.get("target") for e in (edges or [])
                   if e.get("target") and e.get("source") in graph}
        roots = [s["id"] for s in states if s.get("id") and s["id"] not in incoming]

        # If no clear root, use initialization or first node
        if not roots and states:
            for s in states:
                sid = s.get("id", "")
                if "init" in sid.lower() or s.get("type") == "analysis":
                    roots = [sid]
                    break
            if not roots:
                roots = [states[0].get("id")]

        # Detect final nodes (type=final or no outgoing edges)
        final_nodes = {s["id"] for s in states
                      if s.get("id") and (s.get("type") == "final"
                      or not graph.get(s["id"], []))}

        # Modified topological sort using BFS for better level assignment
        levels: Dict[str, int] = {}
        visited: Set[str] = set()

        # Track visited pairs to prevent infinite loops
        visited_pairs: Set[Tuple[str, int]] = set()

        logger.info(f"_calculate_positions: Starting BFS from {len(roots)} root nodes: {roots}")

        # BFS from roots to assign minimum level
        queue = [(root, 0) for root in roots]
        iterations = 0
        max_iterations = len(states) * 3  # Reduced safety limit - 3x states should be enough

        while queue and iterations < max_iterations:
            iterations += 1
            if iterations % 10 == 0:
                logger.debug(f"_calculate_positions: BFS iteration {iterations}, queue size: {len(queue)}")

            node, level = queue.pop(0)

            # Skip if we've seen this exact node-level pair
            if (node, level) in visited_pairs:
                continue
            visited_pairs.add((node, level))

            if node not in graph:
                continue

            # Only update if we found a longer path
            if node not in levels or levels[node] < level:
                levels[node] = level

                # Add children to queue, but prevent cycles
                for child in graph.get(node, []):
                    # Don't revisit nodes at a higher level (prevents cycles)
                    if child in levels and levels[child] >= level + 1:
                        continue  # Skip - would create a cycle or redundant path

                    # Only add if not already visited at this level
                    if child in graph and (child, level + 1) not in visited_pairs:
                        queue.append((child, level + 1))

        if iterations >= max_iterations:
            logger.warning(f"_calculate_positions: BFS stopped at max iterations ({max_iterations}). Complex graph detected.")
            logger.info(f"_calculate_positions: Processed {len(levels)} nodes successfully")

        # Handle disconnected nodes
        logger.info("_calculate_positions: Handling disconnected nodes")
        for state in states:
            node_id = state.get("id")
            if node_id and node_id not in levels:
                # Try to position based on type
                if state.get("type") == "final":
                    # Place final nodes at the end
                    max_level = max(levels.values()) if levels else 0
                    levels[node_id] = max_level + 1
                else:
                    # Place disconnected nodes based on their relationships
                    # Check if they reference other nodes
                    connected = False
                    for edge in edges:
                        if edge.get("source") == node_id:
                            target_level = levels.get(edge.get("target"))
                            if target_level is not None:
                                levels[node_id] = max(0, target_level - 1)
                                connected = True
                                break
                        elif edge.get("target") == node_id:
                            source_level = levels.get(edge.get("source"))
                            if source_level is not None:
                                levels[node_id] = source_level + 1
                                connected = True
                                break

                    if not connected:
                        # Place at level 0 if completely disconnected
                        levels[node_id] = 0

        # Group nodes by level
        logger.info(f"_calculate_positions: Grouping {len(levels)} nodes by level")
        level_groups: Dict[int, List[str]] = {}
        for node, level in levels.items():
            level_groups.setdefault(level, []).append(node)
        logger.info(f"_calculate_positions: Created {len(level_groups)} level groups")

        # Sort nodes within each level by type and name
        for level_num in sorted(level_groups.keys()):
            nodes = level_groups[level_num]

            def node_sort_key(nid):
                state = next((s for s in states if s.get("id") == nid), {})
                type_order = {
                    "analysis": 0,
                    "tool_call": 1,
                    "decision": 2,
                    "parallel": 3,
                    "final": 4
                }
                return (type_order.get(state.get("type", ""), 5), state.get("name", ""))

            level_groups[level_num] = sorted(nodes, key=node_sort_key)

        # Dynamic spacing based on workflow complexity
        num_levels = len(level_groups)
        num_states = len(states)

        # Much more generous spacing for clarity
        if num_states > 30:
            x_spacing = 800  # Very wide spacing for complex workflows
            y_spacing = 300  # Good vertical separation
        elif num_states > 20:
            x_spacing = 700
            y_spacing = 350
        else:
            x_spacing = 650  # Even simple workflows get good spacing
            y_spacing = 400

        start_x = 300  # Move starting point further right
        start_y = 200  # Move starting point lower

        # Calculate canvas center dynamically
        canvas_center_y = 600  # Higher center point for better distribution

        # Position nodes by level with grid layout for crowded levels
        logger.info("_calculate_positions: Positioning nodes by level")
        for level_num in sorted(level_groups.keys()):
            node_ids = level_groups[level_num]
            base_x = start_x + level_num * x_spacing
            num_nodes = len(node_ids)

            if num_nodes == 1:
                # Single node - center it
                positions[node_ids[0]] = {"x": base_x, "y": canvas_center_y}
            elif num_nodes <= 4:
                # Small number of nodes - vertical stack with good spacing
                total_height = (num_nodes - 1) * y_spacing
                level_start_y = canvas_center_y - total_height / 2

                for i, node_id in enumerate(node_ids):
                    state = next((s for s in states if s.get("id") == node_id), {})

                    # Add offset for visual grouping
                    y_offset = 0
                    if state.get("type") == "decision":
                        y_offset = -30  # Move decisions slightly up
                    elif state.get("type") == "parallel":
                        y_offset = 30  # Move parallel slightly down

                    positions[node_id] = {
                        "x": base_x,
                        "y": level_start_y + i * y_spacing + y_offset
                    }
            else:
                # Many nodes - use grid layout with multiple columns
                max_per_column = 3  # Fewer nodes per column for better visibility
                num_columns = (num_nodes + max_per_column - 1) // max_per_column
                column_spacing = 120  # Wider spacing between columns within same level

                for i, node_id in enumerate(node_ids):
                    column = i // max_per_column
                    row = i % max_per_column

                    # Calculate x position with column offset - stagger columns
                    x = base_x + column * column_spacing
                    if column % 2 == 1:
                        x += 40  # Stagger odd columns

                    # Calculate y position for this column
                    nodes_in_column = min(max_per_column, num_nodes - column * max_per_column)
                    column_height = (nodes_in_column - 1) * y_spacing
                    column_start_y = canvas_center_y - column_height / 2
                    y = column_start_y + row * y_spacing

                    state = next((s for s in states if s.get("id") == node_id), {})
                    # Add type-based offset
                    if state.get("type") == "decision":
                        y -= 25
                    elif state.get("type") == "parallel":
                        y += 25

                    positions[node_id] = {"x": x, "y": y}

        # Ensure final nodes are at the rightmost position
        if final_nodes and positions:
            max_x = max((pos["x"] for pos in positions.values()), default=start_x)
            final_x = max_x if max_x > start_x else max_x + x_spacing

            # Vertically distribute final nodes
            final_list = list(final_nodes)
            for i, node_id in enumerate(final_list):
                if node_id in positions:
                    y_pos = canvas_center_y + (i - len(final_list)/2) * y_spacing
                    positions[node_id] = {"x": final_x, "y": y_pos}

        logger.info(f"_calculate_positions: Completed positioning for {len(positions)} nodes")
        return positions

    def _prefill_tool_parameters(self, tool_name: str, state: Dict, context: Dict) -> Dict:
        """Prefill tool parameters from state or context"""
        parameters: Dict[str, Any] = {}

        # First check if parameters were already provided by AI
        if state.get("tool_parameters"):
            # AI already filled parameters in Phase 2
            if tool_name in state["tool_parameters"]:
                parameters = state["tool_parameters"][tool_name].copy()
                return parameters

        # If no AI-filled parameters, use context mapping
        context_params = self._map_context_to_parameters(tool_name, context or {})
        parameters.update(context_params)

        return parameters

    def _extract_search_query(self, text: str) -> str:
        """Extract meaningful search terms from description"""
        import re
        if not text:
            return ""

        # Clean up common AI-generated phrases
        text = text.replace("conduct web using tavily", "")
        text = text.replace("conduct a web search", "")
        text = text.replace("using tavily", "")
        text = text.replace("Execute a search", "")
        text = text.replace("Conduct", "")

        stop_words = {"the", "a", "an", "for", "with", "about", "research", "find", "search", "gather", "web", "using"}

        key_patterns = [
            r'"([^"]+)"',                 # Quoted phrases
            r'(?:about|for|regarding)\s+([^,.]+)',  # Context phrases
            r'(?:on|into)\s+([^,.]+)',   # Topic phrases
            r'(\w+\s+communication\s+\w+)',      # Domain-specific patterns
            r'(\w+\s+agent\s+\w+)',       # Agent patterns
            r'(\w+\s+AI\s+\w+)',          # AI patterns
        ]

        for pattern in key_patterns:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                return m.group(1).strip()

        words = re.findall(r"\b\w+\b", text.lower())
        meaningful = [w for w in words if w not in stop_words and len(w) > 2]
        return " ".join(meaningful[:8])

    def _extract_url(self, text: str) -> Optional[str]:
        import re
        m = re.search(r"https?://[\w\-._~:/?#\[\]@!$&'()*+,;=%]+", text or "")
        return m.group(0) if m else None

    def _generate_initial_code(self, state: Dict) -> str:
        desc = (state.get("description") or state.get("task") or "").strip()
        if not desc:
            return (
                "# Write Python code to accomplish the task\n"
                "print('Hello from python_repl')\n"
            )
        return (
            "# Auto-generated scaffold based on task description\n"
            f"# Task: {desc}\n\n"
            "def main():\n"
            "    # TODO: implement the task logic\n"
            "    pass\n\n"
            "if __name__ == '__main__':\n"
            "    main()\n"
        )

    def _map_context_to_parameters(self, tool_name: str, context: Dict) -> Dict[str, Any]:
        """Map previous outputs to tool parameters."""
        params: Dict[str, Any] = {}
        last_output = (context or {}).get('last_output', {})
        last_tool = last_output.get('tool')
        metadata = last_output.get('metadata', {}) or {}

        if tool_name == 'file_write':
            if last_tool == 'python_repl':
                params['content'] = last_output.get('stdout', '') or last_output.get('data', '')
                params['path'] = 'output.txt'
        elif tool_name == 'http_request':
            urls = metadata.get('urls') or metadata.get('url_list') or []
            if isinstance(urls, list) and urls:
                params['url'] = urls[0]
        elif tool_name == 'python_repl':
            terms = metadata.get('searchTerms') or []
            if terms and 'code' not in params:
                joined = ", ".join(terms[:6])
                params['code'] = (
                    f"# Analyze search terms: {joined}\n"
                    f"print('Search terms:', '{joined}')\n"
                )
        elif tool_name == 'file_read':
            # Prefer last file path seen in context
            path = last_output.get('path') or None
            files = metadata.get('filesPaths') or metadata.get('file_paths') or []
            if not path and isinstance(files, list) and files:
                path = files[0]
            if path:
                params['path'] = path
        elif tool_name == 'shell' or tool_name == 'shell_command':
            # Seed a safe listing command in the relevant directory
            path = last_output.get('path') or None
            files = metadata.get('filesPaths') or metadata.get('file_paths') or []
            if not path and isinstance(files, list) and files:
                path = files[0]
            try:
                import os
                if path:
                    directory = path if os.path.isdir(path) else os.path.dirname(path)
                    if directory:
                        params['command'] = f"ls -la '{directory}'"
                if 'command' not in params:
                    params['command'] = 'pwd'
            except Exception:
                params.setdefault('command', 'pwd')
        elif tool_name == 'file_delete':
            # Use previously referenced file path if available
            path = last_output.get('path') or None
            files = metadata.get('filesPaths') or metadata.get('file_paths') or []
            if not path and isinstance(files, list) and files:
                path = files[0]
            if path:
                params['path'] = path

        return params

    def _validate_and_fix_state_machine(self, states: List[Dict], edges: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
        """
        Validate and fix common issues in AI-generated state machines

        Issues fixed:
        - Remove edges that reference non-existent states
        - Add missing states referenced in edges (like retry_data_collection)
        - Connect orphaned nodes (nodes with no incoming edges)
        - Remove duplicate edges
        """
        # Build set of valid state IDs
        valid_state_ids = {state["id"] for state in states}

        # Find all state IDs referenced in edges
        referenced_ids = set()
        for edge in edges:
            referenced_ids.add(edge["source"])
            referenced_ids.add(edge["target"])

        # Find missing states (referenced but not defined)
        missing_ids = referenced_ids - valid_state_ids

        if missing_ids:
            logger.warning(f"Found edges referencing non-existent states: {missing_ids}")

            # Try to infer missing states from their names
            for missing_id in missing_ids:
                # Create a placeholder state for missing references
                if "retry" in missing_id.lower():
                    # Create a retry state
                    states.append({
                        "id": missing_id,
                        "name": missing_id.replace("_", " ").title(),
                        "type": "analysis",
                        "description": f"Retry operation",
                        "agent_role": "execution agent",
                        "transitions": {}
                    })
                    logger.info(f"Added missing retry state: {missing_id}")
                elif any(keyword in missing_id.lower() for keyword in ["final", "success", "failure"]):
                    # Skip final states - they should exist
                    logger.warning(f"Missing final state {missing_id}, will remove edges to it")
                else:
                    # Generic missing state
                    states.append({
                        "id": missing_id,
                        "name": missing_id.replace("_", " ").title(),
                        "type": "analysis",
                        "description": f"Process {missing_id.replace('_', ' ')}",
                        "agent_role": "workflow agent",
                        "transitions": {}
                    })
                    logger.info(f"Added missing state: {missing_id}")

            # Update valid state IDs
            valid_state_ids = {state["id"] for state in states}

        # Filter out edges with invalid references
        valid_edges = []
        seen_edges = set()

        for edge in edges:
            edge_key = (edge["source"], edge["target"], edge.get("event", "success"))

            # Skip duplicates
            if edge_key in seen_edges:
                continue
            seen_edges.add(edge_key)

            # Only keep edges where both source and target exist
            if edge["source"] in valid_state_ids and edge["target"] in valid_state_ids:
                valid_edges.append(edge)
            else:
                logger.warning(f"Removing invalid edge: {edge['source']} -> {edge['target']} ({edge.get('event', 'success')})")

        # Find orphaned nodes (nodes with no incoming edges except initial/start nodes)
        nodes_with_incoming = {e["target"] for e in valid_edges}
        nodes_with_outgoing = {e["source"] for e in valid_edges}

        orphaned_nodes = []
        for state in states:
            state_id = state["id"]
            # Skip initial nodes and final nodes
            if state_id in ["initialization", "initial_state"] or "final" in state_id.lower():
                continue
            # If node has outgoing edges but no incoming edges, it's orphaned
            if state_id in nodes_with_outgoing and state_id not in nodes_with_incoming:
                orphaned_nodes.append(state_id)
                logger.warning(f"Found orphaned node with no incoming edges: {state_id}")

        # Connect orphaned nodes intelligently
        if orphaned_nodes:
            # Find the most appropriate parent for orphaned nodes
            for orphaned_id in orphaned_nodes:
                orphaned_state = next((s for s in states if s["id"] == orphaned_id), None)
                if not orphaned_state:
                    continue

                # For parallel tool executions, connect to parent parallel node
                if orphaned_state.get("type") == "tool_call":
                    # Find parallel data collection nodes
                    parallel_nodes = [s for s in states if s.get("type") == "parallel" and "collection" in s.get("name", "").lower()]
                    if parallel_nodes:
                        # Connect from parallel node to tool execution
                        valid_edges.append({
                            "source": parallel_nodes[0]["id"],
                            "target": orphaned_id,
                            "event": "execute"
                        })
                        logger.info(f"Connected orphaned tool node {orphaned_id} to parallel node {parallel_nodes[0]['id']}")
                    else:
                        # Connect from planning or research stage
                        planning_nodes = [s for s in states if "planning" in s.get("name", "").lower() or "research" in s.get("name", "").lower()]
                        if planning_nodes:
                            valid_edges.append({
                                "source": planning_nodes[0]["id"],
                                "target": orphaned_id,
                                "event": "execute"
                            })
                            logger.info(f"Connected orphaned tool node {orphaned_id} to planning node {planning_nodes[0]['id']}")

        logger.info(f"Validated state machine: {len(states)} states, {len(valid_edges)} edges")
        logger.debug("Returning from _validate_and_fix_state_machine")

        return states, valid_edges

    def _simplify_edges(self, edges: List[Dict], states: List[Dict]) -> List[Dict]:
        """
        Simplify complex edge patterns that create visual clutter:
        - Remove circular monitoring/validation loops
        - Consolidate multiple paths to same destination
        - Preserve main flow path
        """
        # Build state type map
        state_types = {s["id"]: s.get("type") for s in states}

        # Identify problematic patterns
        simplified = []
        seen_connections = set()

        # Find monitoring and validation nodes (often create loops)
        monitoring_nodes = {s["id"] for s in states
                           if "monitor" in s.get("id", "").lower()
                           or "invariant" in s.get("id", "").lower()
                           or "schema_check" in s.get("id", "").lower()}

        for edge in edges:
            source = edge.get("source")
            target = edge.get("target")
            event = edge.get("event", "")

            # Skip redundant monitoring loops
            if source in monitoring_nodes and target in monitoring_nodes:
                continue

            # Skip back-edges from monitoring to execution
            if source in monitoring_nodes and "execution" in target:
                continue

            # Skip multiple validation paths - keep only primary
            if "validate" in source and "validate" in target:
                continue

            # Create connection key to avoid duplicates
            conn_key = (source, target)
            if conn_key not in seen_connections:
                seen_connections.add(conn_key)
                simplified.append(edge)

        return simplified

    def validate_and_fix_workflow(self, workflow: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate and fix any issues with the converted workflow
        """
        blocks = workflow.get("blocks", [])
        edges = workflow.get("edges", [])

        # Ensure all blocks have required fields
        for block in blocks:
            if "data" not in block:
                block["data"] = {}

            # Ensure tool blocks have execution capability
            if block.get("type") == "toolBlock":
                if "onExecuteTool" not in block["data"]:
                    block["data"]["onExecuteTool"] = "unified"
                if "hasExecutionCapability" not in block["data"]:
                    block["data"]["hasExecutionCapability"] = True

        # Validate edges reference existing blocks
        block_ids = {b["id"] for b in blocks}
        valid_edges = []

        for edge in edges:
            if edge["source"] in block_ids and edge["target"] in block_ids:
                valid_edges.append(edge)
            else:
                logger.warning(f"Removing invalid edge: {edge['source']} -> {edge['target']}")

        workflow["edges"] = valid_edges

        return workflow


# Global instance
state_machine_adapter = StateMachineToUnifiedAdapter()
