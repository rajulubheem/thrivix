#!/bin/bash

##############################################################################
# Thrivix AWS Deployment Script
#
# Automates the entire deployment process using deployment-config.json
# Usage: ./deploy.sh [backend|frontend|all|destroy]
##############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CONFIG_FILE="$SCRIPT_DIR/deployment-config.json"

##############################################################################
# Helper Functions
##############################################################################

print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

##############################################################################
# Configuration Loading
##############################################################################

load_config() {
    print_header "Loading Deployment Configuration"

    if [ ! -f "$CONFIG_FILE" ]; then
        print_error "Configuration file not found: $CONFIG_FILE"
        echo ""
        echo "Please create it from the template:"
        echo "  cd infrastructure"
        echo "  cp deployment-config.template.json deployment-config.json"
        echo "  # Edit deployment-config.json with your AWS details"
        exit 1
    fi

    # Check if jq is installed
    if ! command -v jq &> /dev/null; then
        print_error "jq is not installed. Please install it first:"
        echo "  macOS: brew install jq"
        echo "  Ubuntu: sudo apt-get install jq"
        exit 1
    fi

    # Load configuration values
    AWS_ACCOUNT=$(jq -r '.aws.account' "$CONFIG_FILE")
    AWS_REGION=$(jq -r '.aws.region' "$CONFIG_FILE")
    AWS_PROFILE=$(jq -r '.aws.profile' "$CONFIG_FILE")
    SECRET_NAME=$(jq -r '.backend.secretName' "$CONFIG_FILE")

    # Validate configuration
    if [ "$AWS_ACCOUNT" == "YOUR_AWS_ACCOUNT_ID" ] || [ "$AWS_ACCOUNT" == "null" ]; then
        print_error "AWS account not configured in $CONFIG_FILE"
        echo ""
        echo "Please edit deployment-config.json and set your AWS account ID"
        exit 1
    fi

    print_success "Configuration loaded successfully"
    echo "  Account: $AWS_ACCOUNT"
    echo "  Region:  $AWS_REGION"
    echo "  Profile: $AWS_PROFILE"
}

##############################################################################
# Pre-deployment Checks
##############################################################################

check_prerequisites() {
    print_header "Checking Prerequisites"

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI not installed"
        exit 1
    fi
    print_success "AWS CLI installed"

    # Check AWS CDK
    if ! command -v cdk &> /dev/null; then
        print_error "AWS CDK not installed. Install with: npm install -g aws-cdk"
        exit 1
    fi
    print_success "AWS CDK installed"

    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_warning "Docker not installed. Required for building container images."
        echo "  Install from: https://docs.docker.com/get-docker/"
        exit 1
    fi
    print_success "Docker installed"

    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js not installed"
        exit 1
    fi
    print_success "Node.js installed ($(node --version))"

    # Check AWS credentials
    if ! aws sts get-caller-identity --profile "$AWS_PROFILE" &> /dev/null; then
        print_error "AWS credentials not configured for profile: $AWS_PROFILE"
        echo ""
        echo "Please configure AWS CLI:"
        echo "  aws configure --profile $AWS_PROFILE"
        exit 1
    fi

    CALLER_IDENTITY=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --output json)
    CURRENT_ACCOUNT=$(echo "$CALLER_IDENTITY" | jq -r '.Account')

    if [ "$CURRENT_ACCOUNT" != "$AWS_ACCOUNT" ]; then
        print_error "AWS account mismatch!"
        echo "  Config file:    $AWS_ACCOUNT"
        echo "  Current profile: $CURRENT_ACCOUNT"
        exit 1
    fi

    print_success "AWS credentials valid for account $AWS_ACCOUNT"
}

##############################################################################
# Secrets Management
##############################################################################

check_secrets() {
    print_header "Checking AWS Secrets Manager"

    if aws secretsmanager describe-secret \
        --secret-id "$SECRET_NAME" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" &> /dev/null; then
        print_success "Secret '$SECRET_NAME' exists"

        # Show when it was last updated
        LAST_UPDATED=$(aws secretsmanager describe-secret \
            --secret-id "$SECRET_NAME" \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION" \
            --query 'LastChangedDate' \
            --output text)
        echo "  Last updated: $LAST_UPDATED"
    else
        print_warning "Secret '$SECRET_NAME' not found"
        echo ""
        echo "Create it with:"
        echo "  cd infrastructure/cdk-fargate"
        echo "  ./update-secrets.sh"
        echo ""
        echo "Or manually:"
        echo "  aws secretsmanager create-secret \\"
        echo "    --name $SECRET_NAME \\"
        echo "    --secret-string '{\"OPENAI_API_KEY\":\"...\",\"ANTHROPIC_API_KEY\":\"...\"}' \\"
        echo "    --profile $AWS_PROFILE \\"
        echo "    --region $AWS_REGION"
        echo ""
        read -p "Would you like to create it now? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cd "$SCRIPT_DIR/cdk-fargate"
            ./update-secrets.sh
        else
            print_error "Secrets must be created before deployment"
            exit 1
        fi
    fi
}

##############################################################################
# CDK Bootstrap
##############################################################################

bootstrap_cdk() {
    print_header "Bootstrapping AWS CDK"

    # Check if already bootstrapped
    if aws cloudformation describe-stacks \
        --stack-name CDKToolkit \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" &> /dev/null; then
        print_success "CDK already bootstrapped for this account/region"
        return 0
    fi

    print_info "Bootstrapping CDK (first-time setup)..."
    cd "$SCRIPT_DIR/cdk-fargate"
    cdk bootstrap \
        --profile "$AWS_PROFILE" \
        aws://"$AWS_ACCOUNT"/"$AWS_REGION"

    print_success "CDK bootstrap complete"
}

##############################################################################
# Backend Deployment
##############################################################################

deploy_backend() {
    print_header "Deploying Backend Stack (ECS Fargate + ALB + Redis + DynamoDB)"

    cd "$SCRIPT_DIR/cdk-fargate"

    print_info "Installing dependencies..."
    npm install

    print_info "Synthesizing CloudFormation template..."
    cdk synth --profile "$AWS_PROFILE"

    print_info "Deploying backend stack..."
    echo "  This will take 10-15 minutes (building Docker image, creating VPC, ECS, ALB, Redis, DynamoDB)..."

    cdk deploy \
        --profile "$AWS_PROFILE" \
        --require-approval never \
        --outputs-file /tmp/backend-outputs.json

    print_success "Backend deployment complete!"

    # Show outputs
    if [ -f /tmp/backend-outputs.json ]; then
        echo ""
        echo "Backend Endpoints:"
        ALB_URL=$(jq -r '.ThrivixFargateStack.LoadBalancerURL' /tmp/backend-outputs.json 2>/dev/null || echo "N/A")
        REDIS_ENDPOINT=$(jq -r '.ThrivixFargateStack.RedisEndpoint' /tmp/backend-outputs.json 2>/dev/null || echo "N/A")
        echo "  ALB:   $ALB_URL"
        echo "  Redis: $REDIS_ENDPOINT"
    fi
}

##############################################################################
# Frontend Deployment
##############################################################################

deploy_frontend() {
    print_header "Deploying Frontend Stack (S3 + CloudFront)"

    # Check if backend is deployed (frontend needs backend's ALB export)
    if ! aws cloudformation describe-stacks \
        --stack-name ThrivixFargateStack \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" &> /dev/null; then
        print_error "Backend stack not found. Deploy backend first:"
        echo "  ./deploy.sh backend"
        exit 1
    fi

    cd "$SCRIPT_DIR/cdk-frontend"

    print_info "Installing dependencies..."
    npm install

    print_info "Synthesizing CloudFormation template..."
    cdk synth --profile "$AWS_PROFILE"

    print_info "Deploying frontend stack..."
    echo "  This will take 5-10 minutes (creating S3, CloudFront, deploying frontend build)..."

    cdk deploy \
        --profile "$AWS_PROFILE" \
        --require-approval never \
        --outputs-file /tmp/frontend-outputs.json

    print_success "Frontend deployment complete!"

    # Show outputs
    if [ -f /tmp/frontend-outputs.json ]; then
        echo ""
        echo "Frontend URL:"
        CLOUDFRONT_URL=$(jq -r '.CdkFrontendStack.CloudFrontURL' /tmp/frontend-outputs.json 2>/dev/null || echo "N/A")
        echo "  $CLOUDFRONT_URL"
    fi
}

##############################################################################
# Full Deployment
##############################################################################

deploy_all() {
    print_header "🚀 Full Thrivix Deployment"

    bootstrap_cdk
    check_secrets
    deploy_backend
    deploy_frontend

    print_header "🎉 Deployment Complete!"

    echo ""
    echo "Your Thrivix platform is now live on AWS!"
    echo ""

    if [ -f /tmp/frontend-outputs.json ]; then
        CLOUDFRONT_URL=$(jq -r '.CdkFrontendStack.CloudFrontURL' /tmp/frontend-outputs.json 2>/dev/null || echo "")
        if [ -n "$CLOUDFRONT_URL" ] && [ "$CLOUDFRONT_URL" != "N/A" ]; then
            echo "Access your application at:"
            echo "  ${GREEN}$CLOUDFRONT_URL${NC}"
        fi
    fi

    echo ""
    echo "Useful commands:"
    echo "  View logs:     aws logs tail /aws/ecs/thrivix-workflow-assistant --follow --profile $AWS_PROFILE"
    echo "  Update secrets: cd infrastructure/cdk-fargate && ./update-secrets.sh"
    echo "  Destroy all:   ./deploy.sh destroy"
}

##############################################################################
# Destroy Resources
##############################################################################

destroy_all() {
    print_header "⚠️  Destroying Thrivix Infrastructure"

    print_warning "This will DELETE all resources:"
    echo "  - ECS Fargate tasks and cluster"
    echo "  - Application Load Balancer"
    echo "  - ElastiCache Redis cluster"
    echo "  - DynamoDB table (sessions)"
    echo "  - S3 buckets (frontend + logs)"
    echo "  - CloudFront distribution"
    echo "  - VPC and networking"
    echo ""
    echo "Secrets Manager secret will be retained (manual deletion required)."
    echo ""

    read -p "Are you ABSOLUTELY sure? Type 'yes' to confirm: " -r
    echo

    if [ "$REPLY" != "yes" ]; then
        print_info "Destroy cancelled"
        exit 0
    fi

    # Destroy frontend first (depends on backend exports)
    if aws cloudformation describe-stacks \
        --stack-name CdkFrontendStack \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" &> /dev/null; then
        print_info "Destroying frontend stack..."
        cd "$SCRIPT_DIR/cdk-frontend"
        cdk destroy --profile "$AWS_PROFILE" --force
        print_success "Frontend stack destroyed"
    fi

    # Destroy backend
    if aws cloudformation describe-stacks \
        --stack-name ThrivixFargateStack \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" &> /dev/null; then
        print_info "Destroying backend stack..."
        cd "$SCRIPT_DIR/cdk-fargate"
        cdk destroy --profile "$AWS_PROFILE" --force
        print_success "Backend stack destroyed"
    fi

    print_success "All stacks destroyed"
    echo ""
    print_info "To delete secrets, run:"
    echo "  aws secretsmanager delete-secret --secret-id $SECRET_NAME --profile $AWS_PROFILE --region $AWS_REGION"
}

##############################################################################
# Main Script
##############################################################################

main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║            Thrivix AWS Deployment Automation                ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"

    # Parse command
    COMMAND=${1:-all}

    # Load configuration
    load_config

    # Check prerequisites
    check_prerequisites

    # Execute command
    case "$COMMAND" in
        backend)
            bootstrap_cdk
            check_secrets
            deploy_backend
            ;;
        frontend)
            deploy_frontend
            ;;
        all)
            deploy_all
            ;;
        destroy)
            destroy_all
            ;;
        *)
            print_error "Unknown command: $COMMAND"
            echo ""
            echo "Usage: $0 [backend|frontend|all|destroy]"
            echo ""
            echo "Commands:"
            echo "  backend   - Deploy backend only (ECS Fargate + ALB + Redis + DynamoDB)"
            echo "  frontend  - Deploy frontend only (S3 + CloudFront)"
            echo "  all       - Deploy both backend and frontend (default)"
            echo "  destroy   - Destroy all infrastructure"
            echo ""
            echo "Examples:"
            echo "  $0              # Deploy everything"
            echo "  $0 backend      # Deploy backend only"
            echo "  $0 frontend     # Deploy frontend only"
            echo "  $0 destroy      # Destroy everything"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
