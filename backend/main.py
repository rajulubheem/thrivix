#!/usr/bin/env python3
"""
Main entry point for Thrivix backend server
Run with: python main.py or uvicorn app.main:app
"""

import uvicorn
from app.main import app
from app.config import Settings

settings = Settings()

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True if settings.DEBUG else False,
        log_level="info"
    )