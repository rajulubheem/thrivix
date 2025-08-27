#!/bin/bash

# Start backend with the new virtual environment
echo "🚀 Starting Strands AI Backend..."

# Navigate to backend directory
cd /Users/bheemarajulu/project_wksp/strands_ai_agent/backend

# Activate virtual environment
source venv_new/bin/activate

# Set environment variables
export OPENAI_API_KEY=${OPENAI_API_KEY:-"your-openai-api-key-here"}
export REDIS_URL=""  # Disable Redis for now
export SECRET_KEY="your-secret-key-change-this"

# Start the server
echo "📦 Starting FastAPI server..."
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000