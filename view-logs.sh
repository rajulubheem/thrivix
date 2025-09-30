#!/bin/bash
#
# View Thrivix Backend Logs
#

echo "📋 Thrivix Backend Logs"
echo "======================="
echo ""

if [ ! -f "logs/production.log" ]; then
    echo "❌ No log file found at logs/production.log"
    echo "   Start the server first with ./start-production.sh"
    exit 1
fi

# Filter and show only important logs
echo "🔍 Filtering logs (showing INFO, WARNING, ERROR only)..."
echo ""

tail -f logs/production.log | grep -E "INFO:|WARNING:|ERROR:|✅|❌|🚀|event"