#!/bin/bash

##############################################################################
# Thrivix Service Pause Script
#
# Stops all expensive AWS services to minimize costs when not in use.
# Estimated savings: ~95% of monthly costs (~$5-10/month vs ~$80-120/month)
#
# Usage: ./pause-services.sh [pause|resume]
##############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

print_cost() {
    echo -e "${YELLOW}💰 $1${NC}"
}

##############################################################################
# Load Configuration
##############################################################################

load_config() {
    if [ ! -f "$CONFIG_FILE" ]; then
        print_error "Configuration file not found: $CONFIG_FILE"
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        print_error "jq is not installed. Install with: brew install jq"
        exit 1
    fi

    AWS_ACCOUNT=$(jq -r '.aws.account' "$CONFIG_FILE")
    AWS_REGION=$(jq -r '.aws.region' "$CONFIG_FILE")
    AWS_PROFILE=$(jq -r '.aws.profile' "$CONFIG_FILE")

    if [ "$AWS_ACCOUNT" == "YOUR_AWS_ACCOUNT_ID" ] || [ "$AWS_ACCOUNT" == "null" ]; then
        print_error "AWS account not configured in $CONFIG_FILE"
        exit 1
    fi
}

##############################################################################
# Pause Services (Stop to Save Money)
##############################################################################

pause_services() {
    print_header "💤 Pausing Thrivix Services (Cost Saving Mode)"

    echo "This will SCALE DOWN the following services to 0:"
    echo ""
    echo "  1. ECS Fargate Tasks (2 → 0)"
    print_cost "    Saves: ~$35/month"
    echo ""
    echo "Services that REMAIN ACTIVE (will still incur costs):"
    echo "  - ElastiCache Redis (~$12/month)"
    echo "  - Application Load Balancer (~$18/month)"
    echo "  - NAT Gateways (~$32/month)"
    echo "  - S3 buckets (~$1/month)"
    echo "  - DynamoDB (on-demand, pay per request)"
    echo "  - CloudFront (pay per request)"
    echo "  - CloudWatch Logs (~$1/month)"
    echo "  - Secrets Manager (~$0.40/month)"
    echo ""
    print_cost "Monthly Savings: ~$35/month (by stopping ECS tasks)"
    print_cost "Estimated Cost While Paused: ~$65-85/month"
    echo ""
    print_warning "Note: To fully minimize costs, use 'cdk destroy' to delete all infrastructure"
    print_warning "      This pause only stops ECS tasks to save compute costs while keeping infrastructure ready"
    echo ""

    read -p "Continue with pausing services? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Cancelled"
        exit 0
    fi

    # Scale ECS service to 0 tasks
    print_info "Scaling ECS service to 0 tasks..."
    if aws ecs describe-services \
        --cluster thrivix-cluster \
        --services thrivix-workflow-assistant \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" &> /dev/null; then

        aws ecs update-service \
            --cluster thrivix-cluster \
            --service thrivix-workflow-assistant \
            --desired-count 0 \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION" > /dev/null

        print_success "ECS tasks stopped (0 tasks running)"
        print_cost "Saving: ~$35/month on compute costs"
    else
        print_warning "ECS service not found"
    fi

    print_header "🎉 Services Paused Successfully!"

    echo ""
    echo "Current Status:"
    echo "  ✅ ECS Tasks: 0 (stopped - no compute charges)"
    echo "  ℹ️  Redis: Still running (~$12/month)"
    echo "  ℹ️  ALB: Still running (~$18/month)"
    echo "  ℹ️  NAT Gateways: Still running (~$32/month)"
    echo "  ℹ️  Other services: Still active (minimal cost)"
    echo ""
    print_cost "Estimated Monthly Cost: ~$65-85/month (~30% reduction)"
    echo ""
    echo "To resume services (scale ECS back to 2 tasks), run:"
    echo "  ./pause-services.sh resume"
    echo ""
    print_warning "For maximum cost savings, destroy all infrastructure with:"
    print_warning "  cd infrastructure && ./deploy.sh destroy"
}

##############################################################################
# Resume Services (Start/Recreate Resources)
##############################################################################

resume_services() {
    print_header "🚀 Resuming Thrivix Services"

    echo "This will SCALE UP ECS tasks:"
    echo "  ECS Fargate Tasks (0 → 2)"
    echo ""
    print_warning "This will resume full billing (~$100-120/month)"
    echo ""

    read -p "Continue with resuming services? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Cancelled"
        exit 0
    fi

    # Scale ECS service back to 2 tasks
    print_info "Scaling ECS service to 2 tasks..."
    if aws ecs describe-services \
        --cluster thrivix-cluster \
        --services thrivix-workflow-assistant \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" &> /dev/null; then

        aws ecs update-service \
            --cluster thrivix-cluster \
            --service thrivix-workflow-assistant \
            --desired-count 2 \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION" > /dev/null

        print_success "ECS tasks started (2 tasks running)"
        echo ""
        print_info "Waiting for tasks to become healthy (~2-3 minutes)..."
    else
        print_error "ECS service not found"
        exit 1
    fi

    print_header "🎉 Services Resumed Successfully!"

    echo ""
    echo "Current Status:"
    echo "  ✅ ECS Tasks: 2 (running)"
    echo "  ✅ Redis: Running"
    echo "  ✅ ALB: Active"
    echo "  ✅ NAT Gateways: Active"
    echo ""
    print_cost "Estimated Monthly Cost: ~$100-120/month (full billing)"
    echo ""
    echo "Your application is now accessible via CloudFront"
    echo ""
    echo "To pause services again (stop ECS tasks), run:"
    echo "  ./pause-services.sh pause"
}

##############################################################################
# Show Current Status
##############################################################################

show_status() {
    print_header "📊 Current Service Status"

    load_config

    echo "Checking service status..."
    echo ""

    # Check ECS
    TASK_COUNT=$(aws ecs describe-services \
        --cluster thrivix-cluster \
        --services thrivix-workflow-assistant \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --query 'services[0].runningCount' \
        --output text 2>/dev/null || echo "0")

    if [ "$TASK_COUNT" -gt 0 ]; then
        echo -e "  ECS Tasks:     ${GREEN}Running ($TASK_COUNT tasks)${NC}"
    else
        echo -e "  ECS Tasks:     ${RED}Stopped (0 tasks)${NC}"
    fi

    # Check Redis
    REDIS_STATUS=$(aws elasticache describe-cache-clusters \
        --cache-cluster-id thrivix-redis \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --query 'CacheClusters[0].CacheClusterStatus' \
        --output text 2>/dev/null || echo "not-found")

    if [ "$REDIS_STATUS" == "available" ]; then
        echo -e "  Redis:         ${GREEN}Available${NC}"
    elif [ "$REDIS_STATUS" == "deleting" ]; then
        echo -e "  Redis:         ${YELLOW}Deleting...${NC}"
    else
        echo -e "  Redis:         ${RED}Not Found${NC}"
    fi

    # Check ALB
    ALB_STATE=$(aws elbv2 describe-load-balancers \
        --names thrivix-alb \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --query 'LoadBalancers[0].State.Code' \
        --output text 2>/dev/null || echo "not-found")

    if [ "$ALB_STATE" == "active" ]; then
        echo -e "  ALB:           ${GREEN}Active${NC}"
    else
        echo -e "  ALB:           ${RED}Not Found${NC}"
    fi

    # Check NAT Gateways
    NAT_COUNT=$(aws ec2 describe-nat-gateways \
        --filter "Name=state,Values=available" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --query 'length(NatGateways)' \
        --output text 2>/dev/null || echo "0")

    if [ "$NAT_COUNT" -gt 0 ]; then
        echo -e "  NAT Gateways:  ${GREEN}Active ($NAT_COUNT)${NC}"
    else
        echo -e "  NAT Gateways:  ${RED}None (deleted)${NC}"
    fi

    echo ""

    # Estimate current cost
    if [ "$TASK_COUNT" -gt 0 ] && [ "$REDIS_STATUS" == "available" ] && [ "$NAT_COUNT" -gt 0 ]; then
        echo -e "${YELLOW}💰 Estimated Monthly Cost: ~$80-120 (Full Billing)${NC}"
        echo ""
        echo "To save costs, run: ./pause-services.sh pause"
    else
        echo -e "${GREEN}💰 Estimated Monthly Cost: ~$5-10 (Paused)${NC}"
        echo ""
        echo "To resume services, run: ./pause-services.sh resume"
    fi
}

##############################################################################
# Main Script
##############################################################################

main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║         Thrivix Service Pause/Resume Manager                ║"
    echo "║                  (Cost Optimization)                         ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"

    load_config

    COMMAND=${1:-status}

    case "$COMMAND" in
        pause)
            pause_services
            ;;
        resume)
            resume_services
            ;;
        status)
            show_status
            ;;
        *)
            print_error "Unknown command: $COMMAND"
            echo ""
            echo "Usage: $0 [pause|resume|status]"
            echo ""
            echo "Commands:"
            echo "  pause   - Stop services to save money (~$97/month savings)"
            echo "  resume  - Recreate and start all services"
            echo "  status  - Show current service status and estimated cost"
            echo ""
            echo "Examples:"
            echo "  $0 status   # Check current status"
            echo "  $0 pause    # Stop services to save money"
            echo "  $0 resume   # Start services again"
            exit 1
            ;;
    esac
}

# Run main
main "$@"
