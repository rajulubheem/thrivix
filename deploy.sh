#!/bin/bash
#
# Thrivix Production Deployment Script
# This script deploys Thrivix in production mode
#

set -e

echo "=================================================="
echo "  Thrivix - Production Deployment"
echo "=================================================="
echo ""

# Step 1: Build Frontend
echo "📦 Building frontend for production..."
cd frontend
npm run build
echo "✅ Frontend build complete"
cd ..

# Step 2: Copy production environment
echo "⚙️  Setting up production environment..."
if [ -f "backend/.env" ]; then
    # Copy API keys from existing .env to .env.production
    if [ -f "backend/.env.production" ]; then
        echo "📝 Updating .env.production with your API keys..."
        # Extract API keys from .env and update .env.production
        OPENAI_KEY=$(grep "^OPENAI_API_KEY=" backend/.env | cut -d'=' -f2)
        TAVILY_KEY=$(grep "^TAVILY_API_KEY=" backend/.env | cut -d'=' -f2)
        ANTHROPIC_KEY=$(grep "^ANTHROPIC_API_KEY=" backend/.env | cut -d'=' -f2)

        if [ ! -z "$OPENAI_KEY" ]; then
            sed -i.bak "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=$OPENAI_KEY|" backend/.env.production
        fi
        if [ ! -z "$TAVILY_KEY" ]; then
            sed -i.bak "s|^TAVILY_API_KEY=.*|TAVILY_API_KEY=$TAVILY_KEY|" backend/.env.production
        fi
        if [ ! -z "$ANTHROPIC_KEY" ]; then
            sed -i.bak "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$ANTHROPIC_KEY|" backend/.env.production
        fi
        rm -f backend/.env.production.bak
    fi
fi

echo "✅ Production environment configured"

# Step 3: Display deployment info
echo ""
echo "=================================================="
echo "  ✅ Deployment Ready!"
echo "=================================================="
echo ""
echo "To start the production server:"
echo ""
echo "  ./start-production.sh"
echo ""
echo "The server will run on http://0.0.0.0:8000"
echo "Frontend will be served from the same port"
echo ""
echo "🔧 Cloudflare Tunnel Configuration (Optional):"
echo "  - Type: HTTP"
echo "  - URL: http://127.0.0.1:8000"
echo "  - Domain: <your-domain.com>"
echo ""
echo "That's it! Your tunnel will serve both frontend and backend."
echo ""