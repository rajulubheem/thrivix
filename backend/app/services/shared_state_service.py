"""
Shared State Service built on Strands agent.state
Provides per-session shared_context and simple namespace reads/writes
"""
from __future__ import annotations

from typing import Any, Dict, Optional
from datetime import datetime
import json
from pathlib import Path
import structlog

from app.services.strands_session_service import get_strands_session_service

logger = structlog.get_logger()


DEFAULT_SHARED_CONTEXT = {
    "task_history": [],
    "agent_outputs": {},
    "current_goal": ""
}


class SharedStateService:
    def __init__(self) -> None:
        self.strands = get_strands_session_service()

    def _metadata_path(self, session_id: str) -> Path:
        base = Path(self.strands.storage_dir) / f"session_{session_id}"
        base.mkdir(parents=True, exist_ok=True)
        return base / "metadata.json"

    def _load_metadata(self, session_id: str) -> Dict[str, Any]:
        path = self._metadata_path(session_id)
        if path.exists():
            try:
                return json.loads(path.read_text())
            except Exception:
                return {}
        return {}

    def _save_metadata(self, session_id: str, data: Dict[str, Any]) -> None:
        path = self._metadata_path(session_id)
        data["updated_at"] = datetime.utcnow().isoformat()
        try:
            path.write_text(json.dumps(data, indent=2))
        except Exception as e:
            logger.error(f"Failed saving metadata for shared state: {e}")

    def _get_any_agent(self, session_id: str):
        agents = self.strands.get_all_agents(session_id)
        if agents:
            return next(iter(agents.values()))
        return None

    # ----- Shared Context -----
    def ensure_initialized(self, session_id: str) -> Dict[str, Any]:
        """Ensure shared_context exists; return current context."""
        agent = self._get_any_agent(session_id)
        shared = None
        if agent:
            try:
                shared = agent.state.get("shared_context")
            except Exception:
                shared = None

        if not shared:
            # Try metadata fallback
            meta = self._load_metadata(session_id)
            shared = (meta.get("shared_state", {}).get("shared_context")
                      if meta.get("shared_state") else None)

        if not shared:
            shared = DEFAULT_SHARED_CONTEXT.copy()

        # Write back to agent.state for canonical storage
        if agent:
            try:
                agent.state.set("shared_context", shared)
            except Exception as e:
                logger.warning(f"Could not set shared_context on agent.state: {e}")

        # Also mirror in metadata for robustness
        meta = self._load_metadata(session_id)
        if "shared_state" not in meta:
            meta["shared_state"] = {}
        meta["shared_state"]["shared_context"] = shared
        self._save_metadata(session_id, meta)
        return shared

    def get_shared_context(self, session_id: str) -> Dict[str, Any]:
        return self.ensure_initialized(session_id)

    def set_shared_context(self, session_id: str, updates: Dict[str, Any], merge: bool = True) -> Dict[str, Any]:
        ctx = self.ensure_initialized(session_id)
        if merge:
            ctx = {**ctx, **updates}
        else:
            ctx = updates

        agent = self._get_any_agent(session_id)
        if agent:
            try:
                agent.state.set("shared_context", ctx)
            except Exception as e:
                logger.warning(f"Failed to update shared_context on agent.state: {e}")

        meta = self._load_metadata(session_id)
        if "shared_state" not in meta:
            meta["shared_state"] = {}
        meta["shared_state"]["shared_context"] = ctx
        self._save_metadata(session_id, meta)
        return ctx

    # ----- Convenience helpers -----
    def append_task_history(self, session_id: str, task: str) -> None:
        ctx = self.ensure_initialized(session_id)
        history = list(ctx.get("task_history", []))
        history.append({"task": task, "timestamp": datetime.utcnow().isoformat()})
        self.set_shared_context(session_id, {"task_history": history})

    def set_current_goal(self, session_id: str, goal: str) -> None:
        self.set_shared_context(session_id, {"current_goal": goal})

    def set_agent_output(self, session_id: str, agent_name: str, output: str) -> None:
        ctx = self.ensure_initialized(session_id)
        outputs = dict(ctx.get("agent_outputs", {}))
        outputs[agent_name] = output
        self.set_shared_context(session_id, {"agent_outputs": outputs})

    def get_agent_outputs(self, session_id: str) -> Dict[str, str]:
        ctx = self.ensure_initialized(session_id)
        return dict(ctx.get("agent_outputs", {}))

    def get_all(self, session_id: str) -> Dict[str, Any]:
        """Return a snapshot of shared state and known namespaces (metadata)."""
        ctx = self.ensure_initialized(session_id)
        meta = self._load_metadata(session_id)
        return {
            "shared_context": ctx,
            "namespaces": meta.get("namespaces", {})
        }

    # ----- Namespaces (arbitrary keys on agent.state) -----
    def set_namespace(self, session_id: str, key: str, value: Any) -> None:
        agent = self._get_any_agent(session_id)
        if agent:
            try:
                agent.state.set(key, value)
            except Exception as e:
                logger.warning(f"Failed to set namespace {key} on agent.state: {e}")
        # Mirror to metadata
        meta = self._load_metadata(session_id)
        if "namespaces" not in meta:
            meta["namespaces"] = {}
        meta["namespaces"][key] = value
        self._save_metadata(session_id, meta)

    def get_namespace(self, session_id: str, key: str, default: Optional[Any] = None) -> Any:
        agent = self._get_any_agent(session_id)
        if agent:
            try:
                val = agent.state.get(key)
                if val is not None:
                    return val
            except Exception:
                pass
        meta = self._load_metadata(session_id)
        return meta.get("namespaces", {}).get(key, default)
