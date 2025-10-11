#!/bin/bash

# Thrivix Fargate - Update Secrets in AWS Secrets Manager
# This script safely updates API keys in AWS Secrets Manager with KMS encryption

set -e

PROFILE="thrivix-admin"
REGION="us-west-2"
SECRET_NAME="thrivix-fargate-secrets"

echo "🔐 Thrivix Secrets Manager Updater"
echo "=================================="
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first."
    exit 1
fi

# Prompt for required API keys
read -sp "Enter OPENAI_API_KEY (required): " OPENAI_KEY
echo ""
read -sp "Enter ANTHROPIC_API_KEY (required): " ANTHROPIC_KEY
echo ""

# Prompt for optional API keys
read -p "Enter TAVILY_API_KEY (optional, press Enter to skip): " TAVILY_KEY
read -p "Enter E2B_API_KEY (optional, press Enter to skip): " E2B_KEY
read -sp "Enter SLACK_BOT_TOKEN (optional, press Enter to skip): " SLACK_TOKEN
echo ""
read -sp "Enter SLACK_SIGNING_SECRET (optional, press Enter to skip): " SLACK_SECRET
echo ""

# Validate required keys
if [ -z "$OPENAI_KEY" ]; then
    echo "❌ OPENAI_API_KEY is required"
    exit 1
fi

if [ -z "$ANTHROPIC_KEY" ]; then
    echo "❌ ANTHROPIC_API_KEY is required"
    exit 1
fi

# Build JSON payload
SECRET_JSON=$(cat <<EOF
{
  "OPENAI_API_KEY": "$OPENAI_KEY",
  "ANTHROPIC_API_KEY": "$ANTHROPIC_KEY",
  "TAVILY_API_KEY": "${TAVILY_KEY:-}",
  "E2B_API_KEY": "${E2B_KEY:-}",
  "SLACK_BOT_TOKEN": "${SLACK_TOKEN:-}",
  "SLACK_SIGNING_SECRET": "${SLACK_SECRET:-}"
}
EOF
)

echo ""
echo "📤 Updating secrets in AWS Secrets Manager..."
echo "   Secret Name: $SECRET_NAME"
echo "   Region: $REGION"
echo ""

# Update the secret
aws secretsmanager update-secret \
    --secret-id "$SECRET_NAME" \
    --secret-string "$SECRET_JSON" \
    --profile "$PROFILE" \
    --region "$REGION"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Secrets updated successfully!"
    echo ""
    echo "🚀 Next steps:"
    echo "   1. Force a new ECS deployment to pick up the secrets:"
    echo "      aws ecs update-service --cluster ThrivixCluster --service thrivix-workflow-assistant --force-new-deployment --profile $PROFILE --region $REGION"
    echo ""
    echo "   2. Monitor the deployment:"
    echo "      aws ecs describe-services --cluster ThrivixCluster --services thrivix-workflow-assistant --profile $PROFILE --region $REGION"
    echo ""
    echo "   3. Check container logs:"
    echo "      aws logs tail /aws/ecs/thrivix-workflow-assistant --follow --profile $PROFILE --region $REGION"
else
    echo ""
    echo "❌ Failed to update secrets. Please check your AWS credentials and permissions."
    exit 1
fi
