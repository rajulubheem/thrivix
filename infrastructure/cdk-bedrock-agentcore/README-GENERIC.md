# Bedrock AgentCore CDK Deployment Template

A **production-ready, community-contributed AWS CDK template** for deploying Strands agents on Amazon Bedrock AgentCore with enterprise-grade security.

## 🎯 What This Template Provides

✅ **VPC Endpoint Security** - Private connectivity to Bedrock (no public internet required)
✅ **ARM64 Architecture** - Cost-optimized for AgentCore
✅ **Infrastructure as Code** - AWS CDK with TypeScript
✅ **Fully Configurable** - Single `config.ts` file for customization
✅ **AWS Best Practices** - Security, high availability, observability
✅ **Community Standard** - Generic template for any Strands agent project

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                  AWS Bedrock AgentCore Runtime                    │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │  Your Strands Agent (ARM64 Container)                        ││
│  │  ├── FastAPI / Flask / Your Framework                        ││
│  │  ├── Strands Agents SDK                                      ││
│  │  └── Your Custom Logic                                       ││
│  └──────────────────────────────────────────────────────────────┘│
│                              ↓                                     │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │  VPC (Private Network)                                        ││
│  │  ├── Bedrock VPC Endpoint (PrivateLink) ✅ CRITICAL          ││
│  │  ├── ECR VPC Endpoints                                        ││
│  │  ├── DynamoDB Gateway Endpoint                                ││
│  │  └── CloudWatch Logs VPC Endpoint                             ││
│  └──────────────────────────────────────────────────────────────┘│
│                              ↓                                     │
│  ┌────────────┐  ┌────────────────────────────────────────────┐ │
│  │  Bedrock   │  │  DynamoDB (Session Storage)                │ │
│  │  Models    │  │  - Serverless, scalable                    │ │
│  └────────────┘  │  - Auto-expire old sessions (TTL)          │ │
│                  └────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📦 What Gets Deployed

### 3 CDK Stacks:

1. **Network Stack** - VPC + Bedrock VPC Endpoint + Security
2. **Infrastructure Stack** - IAM + ECR + DynamoDB + Docker Image
3. **AgentCore Stack** - Bedrock AgentCore Runtime + Endpoint

### AWS Resources Created:

- **VPC** with 3-tier subnet architecture (public, private, isolated)
- **Bedrock Runtime VPC Endpoint** (Interface endpoint with PrivateLink)
- **ECR Repository** for container images (ARM64)
- **Docker Image** automatically built and pushed
- **IAM Role** with least-privilege permissions
- **DynamoDB Table** for session storage
- **CloudWatch Log Group** for agent logs
- **AgentCore Runtime** with auto-scaling
- **AgentCore Endpoint** for agent invocation

---

## 🚀 Quick Start

### Step 1: Prerequisites

```bash
# Required tools
- AWS CLI configured
- Node.js 18+
- Docker (for building ARM64 images)
- Your Strands agent code in backend/

# Verify AWS CLI
aws sts get-caller-identity --profile <your-profile>

# Verify region has Bedrock AgentCore
# Available regions: us-east-1, us-west-2, eu-west-1, ap-southeast-2
aws configure get region --profile <your-profile>
```

### Step 2: Configure Your Deployment

Edit `config.ts`:

```typescript
export const config: DeploymentConfig = {
  // Your project name (lowercase, no spaces)
  projectName: 'my-agent',

  // Your AWS account and region
  awsAccountId: '123456789012',
  awsRegion: 'us-west-2',

  // Path to your backend application
  backendPath: '../../../backend',

  // DynamoDB configuration
  dynamodbTableName: 'my-agent-sessions',

  // AgentCore runtime name
  agentRuntimeName: 'my-agent-runtime',
  agentRuntimeDescription: 'My AI Agent powered by Strands',

  // VPC settings
  vpcCidr: '10.0.0.0/16',
  maxAzs: 2,
  natGateways: 1, // Set to 2 for production HA

  // Tags
  tags: {
    Project: 'MyProject',
    Environment: 'production',
  },
};
```

### Step 3: Prepare Your Backend

Ensure your backend has:

1. **Dockerfile** (ARM64-compatible)
2. **Health endpoint** at `/health` (required by AgentCore)
3. **Strands Agents SDK** installed

Example minimal Dockerfile:

```dockerfile
FROM --platform=linux/arm64 python:3.12-slim

ARG BEDROCK_ENDPOINT_URL
ENV AWS_ENDPOINT_URL_BEDROCK_RUNTIME=${BEDROCK_ENDPOINT_URL}

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

### Step 4: Install Dependencies

```bash
cd infrastructure/cdk
npm install
```

### Step 5: Bootstrap CDK (One-time)

```bash
npx cdk bootstrap aws://<account-id>/<region> --profile <your-profile>
```

### Step 6: Deploy

```bash
# Build TypeScript
npm run build

# Review changes (optional but recommended)
npx cdk diff --profile <your-profile>

# Deploy all stacks
npx cdk deploy --all --profile <your-profile>
```

**Deployment time**: 20-25 minutes (includes Docker build)

### Step 7: Get Your Agent Endpoint

```bash
# Get the AgentCore endpoint URL
aws cloudformation describe-stacks \
  --stack-name <projectName>-Production-AgentCore \
  --query 'Stacks[0].Outputs[?OutputKey==`AgentCoreEndpointUrl`].OutputValue' \
  --output text \
  --profile <your-profile>
```

---

## 🔧 Configuration Reference

### config.ts Options

| Option | Description | Example |
|--------|-------------|---------|
| `projectName` | Your project name (used for resource naming) | `my-agent` |
| `awsAccountId` | AWS account ID | `123456789012` |
| `awsRegion` | AWS region (must support AgentCore) | `us-west-2` |
| `environment` | Environment name | `production` |
| `backendPath` | Path to backend code | `../../../backend` |
| `dockerFile` | Dockerfile name | `Dockerfile` |
| `dynamodbTableName` | DynamoDB table name | `agent-sessions` |
| `dynamodbPartitionKey` | DynamoDB partition key | `userId` |
| `dynamodbSortKey` | DynamoDB sort key | `sessionId` |
| `agentRuntimeName` | AgentCore runtime name | `my-agent-runtime` |
| `vpcCidr` | VPC CIDR block | `10.0.0.0/16` |
| `maxAzs` | Number of availability zones | `2` |
| `natGateways` | Number of NAT gateways (1 for dev, 2+ for prod) | `1` |

---

## 🔒 Security Features

### 1. Bedrock VPC Endpoint (Critical for Enterprise)

This template implements **VPC PrivateLink** for Bedrock, ensuring:

- ✅ All Bedrock API calls stay within AWS private network
- ✅ No public internet access required
- ✅ Compliance with enterprise security policies
- ✅ Automatic configuration via `AWS_ENDPOINT_URL_BEDROCK_RUNTIME`

**Why this matters**: Many enterprises block direct internet access to AWS services. This VPC endpoint enables Bedrock usage in restricted environments.

### 2. Least-Privilege IAM

The AgentCore execution role has only necessary permissions:

- ECR image pull
- CloudWatch Logs write
- Bedrock model invocation
- DynamoDB read/write (scoped to specific table)
- No wildcard `*` resources except where AWS requires

### 3. Private Subnets

- AgentCore runtime runs in private subnets
- No direct internet access
- All AWS service calls via VPC endpoints

### 4. ARM64 Architecture

- Required by Bedrock AgentCore
- 20-30% cost savings vs x86
- Better performance for AI workloads

---

## 💰 Cost Estimate

| Service | Monthly Cost (Dev) | Monthly Cost (Prod) |
|---------|-------------------|---------------------|
| VPC (NAT Gateway) | ~$32 | ~$64 (2 NAT GWs) |
| VPC Endpoints (Interface) | ~$21 | ~$21 |
| AgentCore Runtime | ~$50-100 | ~$100-200 |
| ECR Storage | ~$1 | ~$1 |
| DynamoDB (On-Demand) | ~$5-20 | ~$10-40 |
| CloudWatch Logs | ~$5-10 | ~$10-20 |
| Data Transfer | ~$10-20 | ~$20-40 |
| **Total Infrastructure** | **~$124-184/mo** | **~$226-386/mo** |

**Plus Bedrock API costs** (usage-based, ~$50-300/month for dev)

**Total**: ~$174-484/month (dev) to ~$276-686/month (prod)

---

## 🧪 Testing Your Deployment

### 1. Verify Runtime Status

```bash
RUNTIME_ID=$(aws cloudformation describe-stacks \
  --stack-name <projectName>-Production-AgentCore \
  --query 'Stacks[0].Outputs[?OutputKey==`AgentCoreRuntimeId`].OutputValue' \
  --output text \
  --profile <your-profile>)

aws bedrock-agentcore describe-runtime \
  --agent-runtime-id $RUNTIME_ID \
  --profile <your-profile>
```

**Expected**: `agentRuntimeStatus: "ACTIVE"`

### 2. View Logs

```bash
aws logs tail /aws/bedrock-agentcore/runtimes/<agentRuntimeName> \
  --follow \
  --profile <your-profile>
```

### 3. Test Agent

```bash
# Get endpoint
ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name <projectName>-Production-AgentCore \
  --query 'Stacks[0].Outputs[?OutputKey==`AgentCoreEndpointUrl`].OutputValue' \
  --output text \
  --profile <your-profile>)

# Test health
curl $ENDPOINT/health
```

---

## 🔄 Updating Your Agent

### Update Code

```bash
# 1. Make changes to your backend code
# 2. Redeploy Infrastructure stack (rebuilds Docker image)
cd infrastructure/cdk
npx cdk deploy <projectName>-Production-Infrastructure --profile <your-profile>
```

CDK automatically:
- Builds new ARM64 image
- Pushes to ECR with new tag
- Updates AgentCore runtime

### Update Infrastructure

```bash
# 1. Edit config.ts or stack code
# 2. Build and deploy
npm run build
npx cdk deploy --all --profile <your-profile>
```

---

## 🐛 Troubleshooting

### Docker Build Fails for ARM64

**Mac M1/M2**: Enable Rosetta in Docker Desktop
**Settings** → **General** → **Use Rosetta for x86/amd64 emulation**

Or use Buildx:

```bash
docker buildx create --use
docker buildx build --platform linux/arm64 -t test .
```

### CDK Bootstrap Fails

```bash
# Verify credentials
aws sts get-caller-identity --profile <your-profile>

# Verify region
aws configure get region --profile <your-profile>

# Try with verbose
npx cdk bootstrap --profile <your-profile> --verbose
```

### AgentCore Runtime Not Starting

```bash
# Check logs
aws logs tail /aws/bedrock-agentcore/runtimes/<agentRuntimeName> \
  --profile <your-profile>

# Common issues:
# - ECR image pull failure (check IAM permissions)
# - Container health check failure (check /health endpoint)
# - Network connectivity (check VPC endpoint status)
```

### Bedrock VPC Endpoint Issues

```bash
# Verify endpoint status
aws ec2 describe-vpc-endpoints \
  --filters "Name=tag:Name,Values=*Bedrock*" \
  --profile <your-profile>

# Should show: State: available, privateDnsEnabled: true
```

---

## 🗑️ Cleanup

```bash
# Destroy all stacks
npx cdk destroy --all --profile <your-profile>

# Note: ECR repository and DynamoDB table have RETAIN policy
# They won't be deleted automatically (prevents data loss)
# Delete manually if needed:
aws ecr delete-repository --repository-name <repo-name> --force
aws dynamodb delete-table --table-name <table-name>
```

---

## 📚 Resources

- **AWS Bedrock AgentCore Docs**: https://docs.aws.amazon.com/bedrock-agentcore/
- **Strands Agents Docs**: https://strandsagents.com/
- **AWS CDK Docs**: https://docs.aws.amazon.com/cdk/
- **Bedrock VPC Endpoints**: https://docs.aws.amazon.com/bedrock/latest/userguide/vpc-interface-endpoints.html
- **Strands VPC Endpoint Feature**: https://github.com/anthropics/strands/issues/496

---

## 🤝 Contributing

This is a community template. Contributions welcome!

1. Fork this repo
2. Make your changes
3. Submit a pull request
4. Share with the AWS community!

---

## 📝 License

This template is provided as-is for community use. Customize as needed for your project.

---

## ✨ What Makes This Template Special

1. **VPC Endpoint Security** - Enterprise-grade private connectivity to Bedrock
2. **Fully Configurable** - Single `config.ts` file for all settings
3. **AWS Best Practices** - Security, HA, observability built-in
4. **Community Standard** - Generic template for any Strands project
5. **Production-Ready** - Not a toy example, real production architecture

**Ready to deploy your Strands agent? Edit `config.ts` and run `npx cdk deploy --all`!**
