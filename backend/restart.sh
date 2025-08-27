#!/bin/bash
echo "Restarting backend server..."
pkill -f "uvicorn app.main:app"
sleep 2
cd /Users/bheemarajulu/project_wksp/strands_ai_agent/backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000 &
echo "Backend restarted on port 8000"