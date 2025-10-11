# Thrivix AWS Infrastructure

This folder contains AWS CDK deployment configurations for Thrivix.

## 📁 Folder Structure

```
infrastructure/
├── cdk-bedrock-agentcore/     # AWS Bedrock AgentCore deployment (future)
│   └── Full-managed Bedrock runtime for agents
│
├── cdk-fargate/               # ECS Fargate deployment (MAIN - current)
│   ├── VPC + Security Groups
│   ├── ECS Fargate cluster + ALB
│   ├── ElastiCache Redis
│   ├── DynamoDB sessions table
│   └── CloudWatch monitoring
│
├── cdk-frontend/              # CloudFront + S3 static hosting
│   ├── S3 bucket for React build
│   ├── CloudFront distribution (global CDN)
│   └── Automatic deployment from build/
│
├── deploy.sh                  # One-command deployment automation
├── pause-services.sh          # Pause/resume to save costs
├── deployment-config.template.json  # Config template (copy to deployment-config.json)
└── aws_architecture_diagram.png     # Architecture visualization
```

## 🚀 Quick Deploy

### 1. Configure
```bash
cp deployment-config.template.json deployment-config.json
# Edit deployment-config.json with your AWS account ID
```

### 2. Deploy All
```bash
./deploy.sh all
```

This deploys:
- Backend (ECS Fargate + ALB + Redis + DynamoDB)
- Frontend (CloudFront + S3)

### 3. Deploy Individual Components
```bash
./deploy.sh backend   # Deploy backend only
./deploy.sh frontend  # Deploy frontend only
```

## 💰 Cost Management

```bash
# Pause services (save ~$35/month on compute)
./pause-services.sh pause

# Resume services
./pause-services.sh resume

# Check status
./pause-services.sh status
```

## 📚 Which CDK to Use?

### **cdk-fargate/** (Recommended - Current Deployment)
- ✅ **Use this for production deployment**
- Full-featured: VPC, ECS, ALB, Redis, DynamoDB
- Cost: ~$80-120/month
- Best for: Multi-user production workloads

### **cdk-bedrock-agentcore/** (Future/Experimental)
- ⚠️ **Not yet implemented** - placeholder for future
- AWS Bedrock AgentCore fully-managed runtime
- Cost: Pay-per-use (no infrastructure)
- Best for: Serverless agent execution

### **cdk-frontend/**
- Always use with cdk-fargate
- Serves React frontend via CloudFront CDN
- Depends on backend ALB endpoint

## 🔒 Security

- `.gitignore` protects `deployment-config.json` (contains AWS Account ID)
- All secrets in AWS Secrets Manager
- No hardcoded credentials or endpoints
- Infrastructure as code (IaC) best practices

## 📖 Documentation

- `SECURE_DEPLOYMENT.md` - Security architecture
- `cdk-fargate/update-secrets.sh` - API key management
- `../README.md` - Main project documentation

---

**Note:** The `deployment-config.json` file is gitignored. Each developer/environment maintains their own copy with their AWS account details.
