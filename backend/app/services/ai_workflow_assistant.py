"""
AI Workflow Assistant - Conversational Workflow Builder
Allows users to build workflows through natural language conversation.
AI can add/remove/modify nodes in real-time on the canvas.
"""

import asyncio
import json
import logging
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
from enum import Enum
import os

try:
    from openai import AsyncOpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    AsyncOpenAI = None

from app.services.tool_parameter_resolver import tool_parameter_resolver
from app.services.event_hub import get_event_hub, ControlFrame
from app.services.strands_session_service import StrandsSessionService

logger = logging.getLogger(__name__)


class NodeOperation(Enum):
    """Types of node operations AI can perform"""
    ADD_NODE = "add_node"
    REMOVE_NODE = "remove_node"
    MODIFY_NODE = "modify_node"
    CONNECT_NODES = "connect_nodes"
    DISCONNECT_NODES = "disconnect_nodes"
    CLEAR_ALL = "clear_all"


@dataclass
class WorkflowMessage:
    """A message in the workflow conversation"""
    role: str  # 'user' or 'assistant'
    content: str
    operations: List[Dict[str, Any]] = field(default_factory=list)  # Node operations to perform


@dataclass
class WorkflowSession:
    """A conversational workflow building session"""
    session_id: str
    task: str
    messages: List[WorkflowMessage] = field(default_factory=list)
    current_nodes: List[Dict[str, Any]] = field(default_factory=list)
    current_edges: List[Dict[str, Any]] = field(default_factory=list)
    available_tools: List[str] = field(default_factory=list)


class AIWorkflowAssistant:
    """
    AI assistant that helps users build workflows through conversation.
    Generates node operations that update the canvas in real-time.
    """

    def __init__(self):
        # Use in-memory sessions for now (could migrate to StrandsSessionService later)
        self.sessions: Dict[str, WorkflowSession] = {}
        self.hub = get_event_hub()

        # Initialize Strands session service for proper session management
        self.strands_session_service = StrandsSessionService(storage_dir="./ai_workflow_sessions")

        if OPENAI_AVAILABLE:
            api_key = os.getenv("OPENAI_API_KEY")
            self.client = AsyncOpenAI(api_key=api_key) if api_key else None
        else:
            self.client = None

    def _clean_json_content(self, content: str) -> str:
        """Clean and extract JSON from AI response"""
        json_content = content.strip()

        # Remove markdown code blocks if present
        if "```json" in json_content:
            json_content = json_content.split("```json")[1].split("```")[0].strip()
        elif "```" in json_content:
            json_content = json_content.split("```")[1].split("```")[0].strip()

        # Clean up common JSON issues
        json_content = json_content.replace(',}', '}').replace(',]', ']')

        # Try to find JSON if there's extra text
        if not json_content.startswith('{'):
            start = json_content.find('{')
            end = json_content.rfind('}')
            if start != -1 and end != -1:
                json_content = json_content[start:end+1]

        return json_content

    def list_sessions(self) -> List[Dict[str, Any]]:
        """List all active sessions"""
        return [
            {
                "session_id": sid,
                "task": session.task,
                "nodes_count": len(session.current_nodes),
                "messages_count": len(session.messages)
            }
            for sid, session in self.sessions.items()
        ]

    def get_session(self, session_id: str) -> Optional[WorkflowSession]:
        """Get existing session if it exists"""
        return self.sessions.get(session_id)

    def delete_session(self, session_id: str) -> bool:
        """Delete a session"""
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"Deleted session {session_id}")
            return True
        return False

    async def start_session(
        self,
        session_id: str,
        task: str,
        available_tools: Optional[List[str]] = None,
        reuse_existing: bool = False
    ) -> Dict[str, Any]:
        """
        Start a new workflow building session.
        AI analyzes the task and proposes initial workflow structure.

        Args:
            session_id: Unique session identifier
            task: Description of workflow to build
            available_tools: List of available tools (auto-detected if None)
            reuse_existing: If True and session exists, return existing session instead of creating new one
        """

        # Check if session already exists
        logger.info(f"start_session called: session_id={session_id}, reuse_existing={reuse_existing}")
        logger.info(f"Current sessions in memory: {list(self.sessions.keys())}")

        if session_id in self.sessions:
            logger.info(f"Session {session_id} EXISTS in memory")
            if reuse_existing:
                logger.info(f"♻️ Reusing existing session {session_id}")
                session = self.sessions[session_id]
                return {
                    "session_id": session_id,
                    "message": f"Continuing existing workflow session. Current workflow has {len(session.current_nodes)} nodes.",
                    "operations": [],
                    "nodes": session.current_nodes,
                    "edges": session.current_edges,
                    "reused": True
                }
            else:
                logger.warning(f"Session {session_id} already exists, overwriting")
        else:
            logger.info(f"Session {session_id} does NOT exist, creating new")

        # Get available tools
        if available_tools is None:
            available_tools = tool_parameter_resolver.get_tool_names_only()

        # Create session
        session = WorkflowSession(
            session_id=session_id,
            task=task,
            available_tools=available_tools
        )
        self.sessions[session_id] = session

        # Get or create conversation manager from Strands session service
        conversation_manager = self.strands_session_service.get_or_create_conversation_manager(session_id)
        logger.info(f"✅ Using SlidingWindowConversationManager for session {session_id}")

        # AI analyzes task and generates initial workflow
        ai_response = await self._generate_initial_workflow(session)

        # Update session
        session.messages.append(WorkflowMessage(
            role="assistant",
            content=ai_response["message"],
            operations=ai_response.get("operations", [])
        ))

        # Update current state
        self._apply_operations(session, ai_response.get("operations", []))

        return {
            "session_id": session_id,
            "message": ai_response["message"],
            "operations": ai_response.get("operations", []),
            "nodes": session.current_nodes,
            "edges": session.current_edges
        }

    async def send_message(
        self,
        session_id: str,
        user_message: str,
        current_canvas_state: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Handle user message and generate AI response with node operations.
        """
        session = self.sessions.get(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Update session with current canvas state if provided
        if current_canvas_state:
            session.current_nodes = current_canvas_state.get("nodes", session.current_nodes)
            session.current_edges = current_canvas_state.get("edges", session.current_edges)
            logger.debug(f"Canvas state: {len(session.current_nodes)} nodes, {len(session.current_edges)} edges")

        # Add user message
        session.messages.append(WorkflowMessage(
            role="user",
            content=user_message
        ))

        # AI generates response and operations
        ai_response = await self._generate_response(session, user_message)

        # Fix node IDs - AI often generates semantic IDs, we need actual canvas IDs
        operations = ai_response.get("operations", [])
        operations = self._fix_node_ids(operations, session.current_nodes)

        # Update session
        session.messages.append(WorkflowMessage(
            role="assistant",
            content=ai_response["message"],
            operations=operations
        ))

        # Apply operations to current state
        self._apply_operations(session, operations)

        return {
            "session_id": session_id,
            "message": ai_response["message"],
            "operations": operations,
            "nodes": session.current_nodes,
            "edges": session.current_edges
        }

    async def _generate_initial_workflow(self, session: WorkflowSession) -> Dict[str, Any]:
        """
        AI analyzes the task and generates initial workflow structure.
        Returns message and node operations.
        """

        if not self.client:
            return self._fallback_initial_workflow(session)

        tools_text = ", ".join(f'"{t}"' for t in session.available_tools[:30])

        prompt = f"""You are an AI workflow architect helping a user build a multi-agent workflow on a visual canvas.

User's task: {session.task}

Available tools: [{tools_text}]

Your job:
1. Analyze the task deeply and design an intelligent, production-ready workflow
2. Create 3-7 nodes with clear responsibilities and proper error handling
3. Use appropriate node types: analysis (planning/thinking), tool_call (actions), decision (branching), parallel (concurrent tasks), final (completion)
4. Assign relevant tools from the available list to tool_call nodes
5. Connect nodes with success/failure paths for robust error handling
6. Explain your design decisions conversationally

Return JSON with this EXACT format:
{{
    "message": "Hi! I'll help you build a workflow for [task]. I'm creating [X] nodes to handle this...",
    "operations": [
        {{
            "type": "add_node",
            "node": {{
                "id": "start",
                "name": "Initialize",
                "type": "analysis",
                "description": "Start the workflow",
                "agent_role": "Coordinator",
                "tools": [],
                "position": {{"x": 100, "y": 100}}
            }}
        }},
        {{
            "type": "connect_nodes",
            "source": "start",
            "target": "next_node",
            "event": "success"
        }}
    ]
}}

Node types: analysis, tool_call, decision, parallel, final
Always include a "start" node and "final_success" node.
Position nodes in a left-to-right flow (x increases by 300 for each node).
Be conversational and helpful in your message.

CRITICAL: Output ONLY valid JSON. NO trailing commas. NO markdown. NO explanations outside JSON."""

        try:
            # Stream the response token by token
            stream = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                stream=True
            )

            content = ""
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    token = chunk.choices[0].delta.content
                    content += token

                    # Publish streaming tokens to WebSocket
                    await self.hub.publish_control(ControlFrame(
                        exec_id=session.session_id,
                        type="ai_assistant_token",
                        payload={"token": token}
                    ))

            # Clean and parse JSON
            json_content = self._clean_json_content(content)
            result = json.loads(json_content)

            return {
                "message": result.get("message", "Let me help you build this workflow."),
                "operations": result.get("operations", [])
            }

        except Exception as e:
            logger.error(f"Error in AI initial workflow generation: {e}")
            logger.error(f"Raw content: {content[:500]}")
            return self._fallback_initial_workflow(session)

    async def _generate_response(self, session: WorkflowSession, user_message: str) -> Dict[str, Any]:
        """
        AI generates response to user message with node operations.
        """

        if not self.client:
            return self._fallback_response(session, user_message)

        tools_text = ", ".join(f'"{t}"' for t in session.available_tools[:30])

        # Build conversation history (last 8 messages, excluding the current user message)
        conversation_context = ""
        if len(session.messages) > 1:
            conversation_context = "\n\nConversation history:\n"
            # Exclude the last message (current user message that was just added)
            history_messages = session.messages[-9:-1] if len(session.messages) > 9 else session.messages[:-1]
            for msg in history_messages:  # Last 8 messages before the current one
                role = "User" if msg.role == "user" else "Assistant"
                conversation_context += f"{role}: {msg.content}\n"

        # Build detailed current state
        current_state = {
            "node_count": len(session.current_nodes),
            "nodes": [{"id": n["id"], "name": n["name"], "type": n["type"]} for n in session.current_nodes],
            "edges": [{"from": e["source"], "to": e["target"], "event": e.get("event", "success")} for e in session.current_edges]
        }

        # Show current nodes clearly
        nodes_text = "\n".join([f'- "{n["name"]}"' for n in current_state['nodes']])
        if not nodes_text:
            nodes_text = "(no nodes yet)"

        prompt = f"""Modify a workflow.

CURRENT NODES:
{nodes_text}

USER REQUEST: {user_message}

When modifying an existing node, use node_id = the exact node name from the list above.
When adding a new node, create a descriptive snake_case id.

Return JSON with this EXACT format:
{{
    "message": "Your conversational response explaining what you're doing",
    "operations": [
        {{
            "type": "add_node",
            "node": {{
                "id": "unique_id",
                "name": "Node Name",
                "type": "analysis|tool_call|decision|parallel|final",
                "description": "What this node does",
                "agent_role": "Role name",
                "tools": ["tool1"],
                "position": {{"x": 400, "y": 100}}
            }}
        }},
        {{
            "type": "modify_node",
            "node_id": "existing_node_id",
            "updates": {{"description": "new description", "tools": ["new_tool"]}}
        }},
        {{
            "type": "remove_node",
            "node_id": "node_to_remove"
        }},
        {{
            "type": "connect_nodes",
            "source": "source_id",
            "target": "target_id",
            "event": "success|failure"
        }}
    ]
}}

Operation types:
- add_node: Create a new node with proper connections
- modify_node: Update existing node properties (name, description, tools, etc.)
- remove_node: Delete a node (remember to reconnect the workflow!)
- connect_nodes: Add an edge between nodes (event: "success" or "failure")
- disconnect_nodes: Remove an edge
- clear_all: Remove all nodes and edges
- auto_layout: Reorganize nodes for better spacing and clarity

Be conversational and explain your design decisions.
Only include operations if the user asks for changes.

CRITICAL: Output ONLY valid JSON. NO trailing commas. NO markdown. NO explanations outside JSON.
If no changes needed, return empty operations array: "operations": []"""

        try:
            # Use system + user messages for clarity
            messages = [
                {"role": "system", "content": "You generate JSON operations for workflows. When the user says 'modify X', use modify_node with node_id=name of X. When user says 'add', use add_node. Use node names as IDs."},
                {"role": "user", "content": prompt}
            ]

            # Stream the response token by token
            stream = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                temperature=0.3,
                stream=True
            )

            content = ""
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    token = chunk.choices[0].delta.content
                    content += token

                    # Publish streaming tokens to WebSocket
                    await self.hub.publish_control(ControlFrame(
                        exec_id=session.session_id,
                        type="ai_assistant_token",
                        payload={"token": token}
                    ))

            # Clean and parse JSON
            json_content = self._clean_json_content(content)
            result = json.loads(json_content)

            ops = result.get('operations', [])
            if ops:
                logger.info(f"AI generated {len(ops)} operations: {', '.join([op.get('type', 'unknown') for op in ops])}")
                logger.info(f"First operation: {ops[0]}")

            return {
                "message": result.get("message", "Updated the workflow."),
                "operations": result.get("operations", [])
            }

        except Exception as e:
            logger.error(f"Error generating AI response: {e}")
            logger.error(f"Raw content: {content[:500]}")
            return self._fallback_response(session, user_message)

    def _fix_node_ids(self, operations: List[Dict[str, Any]], current_nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        AI generates random IDs. We match them to real node IDs.
        Strategy: If only 1 node, use it. Otherwise, try fuzzy matching. If that fails, ignore the operation.
        """
        if not operations or not current_nodes:
            return operations

        # Single node: always use it
        if len(current_nodes) == 1:
            the_id = current_nodes[0]['id']
            for op in operations:
                if op.get('type') in ['modify_node', 'remove_node']:
                    op['node_id'] = the_id
                    logger.info(f"Single node fix: using '{the_id}'")
            return operations

        # Multiple nodes: build comprehensive lookup
        lookup = {}
        for node in current_nodes:
            node_id = node.get('id', '')
            name = node.get('name', '')

            # Map actual ID
            lookup[node_id] = node_id
            # Map full name
            lookup[name] = node_id
            # Map lowercase name
            lookup[name.lower()] = node_id
            # Map no-space version
            lookup[name.replace(' ', '').lower()] = node_id
            # Map snake_case version
            lookup[name.replace(' ', '_').lower()] = node_id

        # Fix operations
        for op in operations:
            if op.get('type') in ['modify_node', 'remove_node']:
                ai_ref = op.get('node_id', '')
                if ai_ref in lookup:
                    op['node_id'] = lookup[ai_ref]
                elif ai_ref.lower() in lookup:
                    op['node_id'] = lookup[ai_ref.lower()]
                else:
                    logger.warning(f"Cannot resolve '{ai_ref}' - operation may fail")

        return operations

    def _apply_operations(self, session: WorkflowSession, operations: List[Dict[str, Any]]):
        """Apply node operations to session's current state"""
        if not operations:
            return

        for op in operations:
            if not isinstance(op, dict) or 'type' not in op:
                logger.warning(f"Invalid operation format: {op}")
                continue
            op_type = op.get("type")

            if op_type == "add_node":
                node = op.get("node")
                if not node:
                    logger.warning("add_node operation missing 'node' data")
                    continue
                if not node.get("id"):
                    logger.warning(f"Node missing ID: {node}")
                    continue
                # Don't add if already exists
                if not any(n.get("id") == node["id"] for n in session.current_nodes):
                    session.current_nodes.append(node)
                else:
                    logger.debug(f"Node {node['id']} already exists, skipping")

            elif op_type == "remove_node":
                node_id = op.get("node_id")
                if not node_id:
                    logger.warning("remove_node operation missing node_id")
                    continue
                # Check if node exists
                if not any(n.get("id") == node_id for n in session.current_nodes):
                    logger.warning(f"Cannot remove - node '{node_id}' not found in canvas")
                    continue
                session.current_nodes = [n for n in session.current_nodes if n["id"] != node_id]
                # Also remove connected edges
                session.current_edges = [
                    e for e in session.current_edges
                    if e.get("source") != node_id and e.get("target") != node_id
                ]

            elif op_type == "modify_node":
                node_id = op.get("node_id")
                if not node_id:
                    logger.warning("modify_node operation missing node_id")
                    continue
                updates = op.get("updates", {})
                # Check if node exists
                node_found = False
                for node in session.current_nodes:
                    if node["id"] == node_id:
                        node.update(updates)
                        node_found = True
                        break
                if not node_found:
                    logger.warning(f"Cannot modify - node '{node_id}' not found in canvas")

            elif op_type == "connect_nodes":
                edge = {
                    "source": op.get("source"),
                    "target": op.get("target"),
                    "event": op.get("event", "success")
                }
                # Don't add if already exists
                if not any(
                    e["source"] == edge["source"] and
                    e["target"] == edge["target"] and
                    e["event"] == edge["event"]
                    for e in session.current_edges
                ):
                    session.current_edges.append(edge)

            elif op_type == "disconnect_nodes":
                source = op.get("source")
                target = op.get("target")
                session.current_edges = [
                    e for e in session.current_edges
                    if not (e.get("source") == source and e.get("target") == target)
                ]

            elif op_type == "clear_all":
                session.current_nodes = []
                session.current_edges = []

    def _fallback_initial_workflow(self, session: WorkflowSession) -> Dict[str, Any]:
        """Fallback when AI is unavailable"""
        return {
            "message": f"I'll help you build a workflow for: '{session.task}'. Let me start with a basic structure.",
            "operations": [
                {
                    "type": "add_node",
                    "node": {
                        "id": "start",
                        "name": "Initialize",
                        "type": "analysis",
                        "description": f"Start: {session.task}",
                        "agent_role": "Coordinator",
                        "tools": [],
                        "position": {"x": 100, "y": 200}
                    }
                },
                {
                    "type": "add_node",
                    "node": {
                        "id": "execute",
                        "name": "Execute Task",
                        "type": "tool_call",
                        "description": session.task,
                        "agent_role": "Executor",
                        "tools": session.available_tools[:3] if session.available_tools else [],
                        "position": {"x": 400, "y": 200}
                    }
                },
                {
                    "type": "add_node",
                    "node": {
                        "id": "final_success",
                        "name": "Complete",
                        "type": "final",
                        "description": "Workflow completed",
                        "agent_role": "Final",
                        "tools": [],
                        "position": {"x": 700, "y": 200}
                    }
                },
                {
                    "type": "connect_nodes",
                    "source": "start",
                    "target": "execute",
                    "event": "success"
                },
                {
                    "type": "connect_nodes",
                    "source": "execute",
                    "target": "final_success",
                    "event": "success"
                }
            ]
        }

    def _fallback_response(self, session: WorkflowSession, user_message: str) -> Dict[str, Any]:
        """Fallback response when AI is unavailable"""
        return {
            "message": "I understand. Let me know what specific changes you'd like to make to the workflow.",
            "operations": []
        }

    def get_session(self, session_id: str) -> Optional[WorkflowSession]:
        """Get session by ID"""
        return self.sessions.get(session_id)

    def clear_session(self, session_id: str):
        """Clear a session"""
        self.sessions.pop(session_id, None)


# Global instance
ai_workflow_assistant = AIWorkflowAssistant()
