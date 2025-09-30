#!/bin/bash
#
# Start Thrivix in Production Mode
#

set -e

echo "🚀 Starting Thrivix in production mode..."
echo ""

# Check if frontend build exists
if [ ! -d "frontend/build" ]; then
    echo "❌ Frontend build not found. Please run ./deploy.sh first"
    exit 1
fi

# Check if production env exists
if [ ! -f "backend/.env.production" ]; then
    echo "❌ backend/.env.production not found. Please run ./deploy.sh first"
    exit 1
fi

# Activate virtual environment
cd backend
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found. Please run ./setup.sh first"
    exit 1
fi

source venv/bin/activate

# Load production environment
export $(cat .env.production | grep -v '^#' | xargs)

# Create logs directory
mkdir -p ../logs

echo "✅ Starting server on http://0.0.0.0:8000"
echo "✅ Serving frontend from /frontend/build"
echo "✅ API available at /api/v1"
echo "✅ Logs: logs/production.log"
echo ""
echo "📋 To view logs: ./view-logs.sh"
echo "🛑 To stop: lsof -ti:8000 | xargs kill -9"
echo ""

# Start uvicorn in production mode with logging
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4 2>&1 | tee ../logs/production.log