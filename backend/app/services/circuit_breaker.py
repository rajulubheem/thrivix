"""
Circuit Breaker Pattern for Agent Execution Control
"""
import time
import asyncio
from enum import Enum
from typing import Optional, Callable, Any
import logging

logger = logging.getLogger(__name__)

class CircuitState(Enum):
    CLOSED = "CLOSED"      # Normal operation
    OPEN = "OPEN"          # Circuit tripped, blocking execution
    HALF_OPEN = "HALF_OPEN"  # Testing if service recovered

class CircuitBreaker:
    """Circuit breaker to prevent runaway agent executions"""
    
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: int = 60,
        expected_exception: type = Exception
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception
        
        self.failure_count = 0
        self.last_failure_time: Optional[float] = None
        self.state = CircuitState.CLOSED
        
    def __call__(self, func: Callable) -> Callable:
        """Decorator to wrap functions with circuit breaker"""
        async def wrapper(*args, **kwargs):
            if self.state == CircuitState.OPEN:
                if self._should_attempt_reset():
                    self.state = CircuitState.HALF_OPEN
                    logger.info("🔄 Circuit breaker entering HALF_OPEN state")
                else:
                    raise Exception(f"Circuit breaker is OPEN - too many failures (last: {self.last_failure_time})")
            
            try:
                result = await func(*args, **kwargs) if asyncio.iscoroutinefunction(func) else func(*args, **kwargs)
                self._on_success()
                return result
            except self.expected_exception as e:
                self._on_failure()
                raise e
        return wrapper
    
    def _should_attempt_reset(self) -> bool:
        """Check if enough time has passed to attempt recovery"""
        return (
            self.last_failure_time is not None and
            time.time() - self.last_failure_time >= self.recovery_timeout
        )
    
    def _on_success(self):
        """Reset circuit breaker on successful execution"""
        if self.state == CircuitState.HALF_OPEN:
            logger.info("✅ Circuit breaker recovered - resetting to CLOSED")
        self.failure_count = 0
        self.state = CircuitState.CLOSED
        self.last_failure_time = None
    
    def _on_failure(self):
        """Handle failure - increment counter and potentially open circuit"""
        self.failure_count += 1
        self.last_failure_time = time.time()
        
        if self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN
            logger.error(f"🚨 Circuit breaker OPEN after {self.failure_count} failures")
        else:
            logger.warning(f"⚠️ Circuit breaker failure {self.failure_count}/{self.failure_threshold}")
    
    def force_open(self):
        """Manually open the circuit breaker"""
        self.state = CircuitState.OPEN
        self.last_failure_time = time.time()
        logger.warning("🚨 Circuit breaker manually OPENED")
    
    def reset(self):
        """Reset circuit breaker to closed state"""
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time = None
        logger.info("🔄 Circuit breaker manually reset")
    
    @property
    def is_open(self) -> bool:
        return self.state == CircuitState.OPEN
    
    @property
    def status(self) -> dict:
        return {
            "state": self.state.value,
            "failure_count": self.failure_count,
            "last_failure_time": self.last_failure_time,
            "threshold": self.failure_threshold
        }