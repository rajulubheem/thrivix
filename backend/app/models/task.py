from enum import Enum
from datetime import datetime
from typing import Optional


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class Task:
    """Simple task model for demo purposes"""
    
    def __init__(
        self,
        user_id: str,
        execution_id: str,
        status: TaskStatus,
        task_input: str,
        result: Optional[str] = None,
        execution_time: Optional[float] = None,
        tokens_used: int = 0,
        created_at: Optional[datetime] = None
    ):
        self.user_id = user_id
        self.execution_id = execution_id
        self.status = status
        self.task_input = task_input
        self.result = result
        self.execution_time = execution_time
        self.tokens_used = tokens_used
        self.created_at = created_at or datetime.utcnow()