# Secure Deployment Configuration

## Overview

This project uses a **secure configuration system** to prevent exposing sensitive deployment details (AWS account IDs, ALB URLs, CloudFront domains) in version control.

## Security Architecture

### ✅ What's Protected

1. **AWS Account Details**
   - Account ID
   - Region
   - Profile names

2. **Infrastructure Endpoints**
   - Application Load Balancer DNS names (automatically imported via CloudFormation)
   - CloudFront distribution domains (generated dynamically)
   - Redis endpoints (derived from CDK resources)
   - DynamoDB table names (managed by CDK)

3. **API Keys** (stored separately in AWS Secrets Manager)
   - OpenAI API Key
   - Anthropic API Key
   - Tavily API Key
   - E2B API Key
   - Slack credentials

### ❌ What's NOT in Git

- `deployment-config.json` - Your actual deployment configuration
- AWS credentials (`~/.aws/credentials`)
- API keys (stored in AWS Secrets Manager)
- ALB/CloudFront URLs (dynamically resolved)

## Setup Instructions

### 1. Create Your Deployment Config

```bash
cd infrastructure
cp deployment-config.template.json deployment-config.json
```

### 2. Fill In Your Details

Edit `deployment-config.json`:

```json
{
  "aws": {
    "account": "YOUR_AWS_ACCOUNT_ID",  // e.g., "123456789012"
    "region": "us-west-2",
    "profile": "thrivix-admin"  // Your AWS CLI profile
  },
  "backend": {
    "secretName": "thrivix-fargate-secrets",
    "corsOrigins": [
      "http://localhost:3000",
      "http://localhost:5173"
    ],
    "certificateArn": null  // Optional: ACM certificate ARN for HTTPS
  },
  "frontend": {
    "bucketNameSuffix": null  // Optional: custom S3 bucket suffix
  },
  "deployment": {
    "autoUpdateFrontendWithBackendAlb": true
  }
}
```

### 3. Deploy Infrastructure

#### Deploy Backend First

```bash
cd infrastructure/cdk-fargate
npx cdk deploy --profile thrivix-admin
```

This will:
- Create VPC, ECS Fargate, ALB, Redis, DynamoDB
- Export ALB DNS name for frontend to consume

#### Deploy Frontend Second

```bash
cd ../cdk-frontend
npx cdk deploy --profile thrivix-admin
```

This will:
- Import ALB DNS from backend stack (automatically!)
- Create S3 bucket, CloudFront distribution
- Configure CloudFront origin to point to your ALB

## How It Works

### Automatic ALB Discovery

The frontend stack **automatically discovers** the backend ALB URL using CloudFormation exports:

**Backend Stack** (`cdk-fargate`):
```typescript
new CfnOutput(this, "AlbDnsName", {
  value: lb.loadBalancerDnsName,
  exportName: "ThrivixAlbDnsName",  // ← Exported
});
```

**Frontend Stack** (`cdk-frontend`):
```typescript
const albDnsName = cdk.Fn.importValue('ThrivixAlbDnsName');  // ← Imported
const backendAlbOrigin = new origins.HttpOrigin(albDnsName, {
  protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
});
```

**Benefits:**
- ✅ No hardcoded ALB URLs
- ✅ Frontend auto-updates if backend ALB changes
- ✅ Safe to commit to public repos
- ✅ Zero-config deployment

### Configuration Loader

The `load-config.ts` module:
1. Loads `deployment-config.json` (gitignored)
2. Falls back to environment variables for CI/CD
3. Validates all required fields
4. Provides helpful error messages

## CI/CD Integration

For automated deployments, set environment variables:

```bash
export CDK_DEFAULT_ACCOUNT=123456789012
export CDK_DEFAULT_REGION=us-west-2
export AWS_PROFILE=thrivix-admin
export SECRET_NAME=thrivix-fargate-secrets
export CORS_ORIGINS=https://app.thrivix.com,https://staging.thrivix.com
```

## Best Practices

### DO ✅

- Keep `deployment-config.template.json` in git (template with placeholders)
- Add `deployment-config.json` to `.gitignore`
- Use CloudFormation exports/imports for resource references
- Store API keys in AWS Secrets Manager
- Use AWS IAM roles for permissions

### DON'T ❌

- Hardcode AWS account IDs in code
- Commit `deployment-config.json` to git
- Expose ALB/CloudFront URLs in code
- Store API keys in code or environment variables
- Use default AWS credentials in production

## Troubleshooting

### Error: "deployment-config.json found but AWS account not configured"

You copied the template but didn't fill in `aws.account`. Edit the file and replace `YOUR_AWS_ACCOUNT_ID` with your actual AWS account ID.

### Error: "No deployment configuration found"

Create `deployment-config.json` from the template:
```bash
cp deployment-config.template.json deployment-config.json
```

### Frontend can't find backend ALB

Make sure you deploy backend **before** frontend. The frontend imports the ALB DNS name from the backend stack's CloudFormation exports.

## Security Review Checklist

Before committing:

- [ ] `deployment-config.json` is in `.gitignore`
- [ ] No hardcoded AWS account IDs in code
- [ ] No hardcoded ALB URLs in code
- [ ] No API keys in code
- [ ] CloudFormation exports used for cross-stack references
- [ ] Secrets stored in AWS Secrets Manager

## Support

For issues or questions, see:
- [AWS CDK Best Practices](https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html)
- [CloudFormation Exports](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-stack-exports.html)
- [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html)
