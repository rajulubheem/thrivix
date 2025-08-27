#!/bin/bash

# Setup script for local development

set -e

echo "🔧 Setting up Strands AI Agent Platform for development"

# Check Python version
if ! python3 --version | grep -E "3\.(9|10|11|12)" &> /dev/null; then
    echo "❌ Python 3.9+ is required"
    exit 1
fi

# Check Node.js version
if ! node --version | grep -E "v(18|19|20)" &> /dev/null; then
    echo "❌ Node.js 18+ is required"
    exit 1
fi

# Setup backend
echo "📦 Setting up backend..."
cd backend

# Create virtual environment
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Create .env if not exists
if [ ! -f ".env" ]; then
    cp ../.env.production .env
    echo "⚠️  Created backend/.env - Please add your API keys"
fi

# Setup frontend
echo "📦 Setting up frontend..."
cd ../frontend

# Install dependencies
npm install

# Create .env if not exists
if [ ! -f ".env" ]; then
    echo "REACT_APP_API_URL=http://localhost:8000" > .env
fi

# Create necessary directories
cd ..
mkdir -p data sessions logs

echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Add your API keys to backend/.env:"
echo "   - OPENAI_API_KEY"
echo "   - TAVILY_API_KEY"
echo ""
echo "2. Start the backend:"
echo "   cd backend && source venv/bin/activate && python main.py"
echo ""
echo "3. Start the frontend (in a new terminal):"
echo "   cd frontend && npm start"
echo ""
echo "The application will be available at http://localhost:3000"