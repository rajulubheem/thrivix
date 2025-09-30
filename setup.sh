#!/bin/bash
#
# Thrivix Quick Setup Script
# This script sets up both backend and frontend for Thrivix
#

set -e

echo "=================================================="
echo "  Thrivix - Multi-Agent Workflow Platform Setup  "
echo "=================================================="
echo ""

# Check Python version
echo "Checking Python version..."
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.11 or higher."
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
REQUIRED_VERSION="3.11"
if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo "❌ Python $REQUIRED_VERSION+ is required. You have $PYTHON_VERSION"
    exit 1
fi
echo "✅ Python $PYTHON_VERSION detected"

# Check Node.js version
echo "Checking Node.js version..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18 or higher."
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ is required. You have version $NODE_VERSION"
    exit 1
fi
echo "✅ Node.js $(node --version) detected"

echo ""
echo "=================================================="
echo "  Step 1: Backend Setup"
echo "=================================================="
echo ""

# Backend setup
cd backend

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
    echo "✅ Virtual environment created"
else
    echo "✅ Virtual environment already exists"
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing Python dependencies (this may take a few minutes)..."
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
echo "✅ Python dependencies installed"

# Check for .env file
if [ ! -f ".env" ]; then
    if [ -f ".env.template" ]; then
        echo ""
        echo "⚠️  No .env file found. Copying from .env.template..."
        cp .env.template .env
        echo "✅ .env file created"
        echo ""
        echo "🔑 IMPORTANT: Please edit backend/.env and add your API keys:"
        echo "   - OPENAI_API_KEY=your_key_here"
        echo "   - TAVILY_API_KEY=your_key_here"
        echo ""
    else
        echo "❌ No .env.template found. Please create a .env file manually."
        exit 1
    fi
else
    echo "✅ .env file exists"
fi

cd ..

echo ""
echo "=================================================="
echo "  Step 2: Frontend Setup"
echo "=================================================="
echo ""

# Frontend setup
cd frontend

# Install npm dependencies
echo "Installing frontend dependencies (this may take a few minutes)..."
npm install --silent
echo "✅ Frontend dependencies installed"

# Create lib/utils.ts if missing
if [ ! -f "src/lib/utils.ts" ]; then
    echo "Creating missing utils file..."
    mkdir -p src/lib
    cat > src/lib/utils.ts << 'EOF'
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
EOF
    echo "✅ Utils file created"
fi

cd ..

echo ""
echo "=================================================="
echo "  ✅ Setup Complete!"
echo "=================================================="
echo ""
echo "To start the application:"
echo ""
echo "Terminal 1 - Backend:"
echo "  cd backend"
echo "  source venv/bin/activate"
echo "  uvicorn app.main:app --reload --port 8000"
echo ""
echo "Terminal 2 - Frontend:"
echo "  cd frontend"
echo "  npm start"
echo ""
echo "Then open http://localhost:3000 in your browser"
echo ""
echo "📚 For more information, see README.md"
echo ""