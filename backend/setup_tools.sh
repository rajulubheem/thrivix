#!/bin/bash

# Setup script for Strands Agents with Tools
echo "🚀 Setting up Strands Agents with Tools..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

echo "📦 Installing required packages..."

# Install core dependencies
pip install --upgrade pip

# Install Strands SDK and Tools
pip install strands
pip install strands-agents-tools

# Install optional dependencies for specific tools
echo "📦 Installing optional tool dependencies..."

# For Tavily search tools
pip install tavily-python

# For AWS tools
pip install boto3

# For data analysis tools
pip install pandas numpy matplotlib

# For image processing
pip install pillow

# Install other requirements
pip install -r requirements_with_tools.txt

echo "🔧 Setting up environment variables..."

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    cat > .env << EOF
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Tavily API (for web search) - Get from https://tavily.com
TAVILY_API_KEY=your_tavily_api_key_here

# AWS Configuration (optional)
AWS_REGION=us-west-2
AWS_PROFILE=default

# Tool Configuration
BYPASS_TOOL_CONSENT=false
STRANDS_TOOL_CONSOLE_MODE=enabled
LOG_LEVEL=INFO

# Default settings
DEFAULT_TIMEZONE=UTC
MAX_SLEEP_SECONDS=300
SHELL_DEFAULT_TIMEOUT=900
PYTHON_REPL_BINARY_MAX_LEN=100

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Server Configuration
HOST=0.0.0.0
PORT=8000
EOF
    echo "✅ Created .env file - Please update with your API keys"
else
    echo "✅ .env file already exists"
fi

echo "🔍 Verifying installation..."

# Test imports
python3 -c "
import sys
try:
    from strands import Agent
    print('✅ Strands SDK installed successfully')
except ImportError:
    print('❌ Strands SDK not installed')
    sys.exit(1)

try:
    from strands_tools import file_read, file_write, http_request
    print('✅ Strands Tools installed successfully')
except ImportError:
    print('❌ Strands Tools not installed')
    sys.exit(1)

try:
    import tavily
    print('✅ Tavily (web search) installed successfully')
except ImportError:
    print('⚠️  Tavily not installed - web search will be disabled')

try:
    import boto3
    print('✅ Boto3 (AWS) installed successfully')
except ImportError:
    print('⚠️  Boto3 not installed - AWS tools will be disabled')
"

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update the .env file with your API keys"
echo "2. Run the backend: uvicorn app.main:app --reload"
echo "3. The agents will now have access to real tools!"
echo ""
echo "Available tools:"
echo "- File operations (read, write, edit)"
echo "- Web search (with Tavily API key)"
echo "- HTTP requests"
echo "- Python code execution"
echo "- Mathematical calculations"
echo "- And many more!"