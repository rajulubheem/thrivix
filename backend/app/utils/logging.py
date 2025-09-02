import logging
import sys
import structlog
from typing import Any


def setup_logging() -> None:
    """Setup structured logging"""
    import os
    
    # Set log level based on environment
    log_level = logging.DEBUG if os.getenv("DEBUG", "false").lower() == "true" else logging.INFO
    
    # Configure stdlib logging with conditional file output
    handlers = [logging.StreamHandler(sys.stdout)]  # Console output
    
    # Only add file logging in development or when explicitly requested
    if os.getenv("LOG_TO_FILE", "false").lower() == "true" or os.getenv("DEBUG", "false").lower() == "true":
        handlers.append(logging.FileHandler("backend.log", mode='a'))
    
    logging.basicConfig(
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        level=log_level,
        handlers=handlers
    )

    # Configure structlog
    structlog.configure(
        processors=[
            # Stdlib log filtering
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.StackInfoRenderer(),
            structlog.dev.set_exc_info,
            # JSON formatting for production
            structlog.processors.JSONRenderer()
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=False,
    )