"""
CoordinatorMemory - thin wrapper over Strands agent.state for coordinator-owned plan/state.
All state is stored in the coordinator agent's state so it participates in the Strands session
and survives continuation. This wrapper avoids leaking implementation details.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from datetime import datetime
import structlog

from app.services.strands_session_service import get_strands_session_service

logger = structlog.get_logger()


class CoordinatorMemory:
    KEY = "coordinator_plan"

    def __init__(self, session_id: str):
        self.session_id = session_id
        self._svc = get_strands_session_service()

    def _coordinator(self):
        # Coordinator agent uses name "coordinator" to get session_id-based agent_id
        return self._svc.get_or_create_agent(
            session_id=self.session_id,
            agent_name="coordinator",
            system_prompt="Coordinator state manager",
            tools=[],
            model_config={"model_id": "gpt-4o-mini", "temperature": 0.0, "max_tokens": 64},
            force_new=False
        )

    def get(self) -> Dict[str, Any]:
        try:
            agent = self._coordinator()
            data = agent.state.get(self.KEY) or {}
            if not isinstance(data, dict):
                return {}
            return data
        except Exception:
            return {}

    def set(self, data: Dict[str, Any]) -> None:
        agent = self._coordinator()
        agent.state.set(self.KEY, data)

    # Convenience helpers
    def seed_plan(self, steps: List[Dict[str, Any]]) -> None:
        data = {
            "plan": {
                "steps": steps,
                "cursor": 0,
                "total": len(steps)
            },
            "baton": {
                "current_agent": steps[0]["agent"] if steps else None,
                "next_step_id": steps[0]["id"] if steps else None
            },
            "outputs": {},
            "handoffs": []
        }
        self.set(data)

    def advance(self, output: str, agent: str, step_id: str) -> Dict[str, Any]:
        state = self.get()
        plan = state.get("plan", {})
        cursor = int(plan.get("cursor", 0))
        steps = plan.get("steps", [])
        # Save output
        if "outputs" not in state:
            state["outputs"] = {}
        state["outputs"][step_id] = {
            "agent": agent,
            "content": output,
            "ts": datetime.utcnow().isoformat()
        }
        # Advance cursor
        cursor += 1
        plan["cursor"] = cursor
        state["plan"] = plan
        # Update baton and record handoff
        next_agent = None
        next_step_id = None
        if cursor < len(steps):
            next_agent = steps[cursor]["agent"]
            next_step_id = steps[cursor]["id"]
            state.setdefault("handoffs", []).append({
                "from": agent,
                "to": next_agent,
                "reason": f"advance to step {cursor+1}",
                "stepId": next_step_id,
                "timestamp": datetime.utcnow().isoformat()
            })
        state["baton"] = {"current_agent": next_agent, "next_step_id": next_step_id}
        self.set(state)
        return state

