/**
 * Configuration for Bedrock AgentCore CDK Deployment
 *
 * This file allows you to customize the deployment for your use case.
 * Simply update the values below and deploy.
 */

export interface DeploymentConfig {
  // Project/Application name (used for resource naming)
  projectName: string;

  // AWS Account and Region
  awsAccountId: string;
  awsRegion: string;

  // Environment (development, staging, production)
  environment: string;

  // Path to your backend application (relative to this file)
  backendPath: string;

  // Docker configuration
  dockerFile: string;

  // DynamoDB configuration
  dynamodbTableName: string;
  dynamodbPartitionKey: string;
  dynamodbSortKey: string;

  // AgentCore Runtime configuration
  agentRuntimeName: string;
  agentRuntimeDescription: string;

  // VPC configuration
  vpcCidr: string;
  maxAzs: number;
  natGateways: number; // 1 for dev/cost-optimization, 2+ for production

  // Tags to apply to all resources
  tags: Record<string, string>;
}

/**
 * Default configuration
 * Update these values for your deployment
 */
export const config: DeploymentConfig = {
  // Update this to your project name (lowercase, no spaces)
  projectName: 'thrivix',

  // Update with your AWS account ID and preferred region
  awsAccountId: process.env.AWS_ACCOUNT_ID || 'YOUR_AWS_ACCOUNT_ID',
  awsRegion: process.env.AWS_REGION || 'us-west-2',

  // Environment (development, staging, production)
  environment: process.env.ENVIRONMENT || 'production',

  // Path to your backend application (where Dockerfile is located)
  backendPath: '../../../backend',

  // Docker configuration
  dockerFile: 'Dockerfile',

  // DynamoDB table configuration
  dynamodbTableName: 'thrivix-workflow-sessions',
  dynamodbPartitionKey: 'userId',
  dynamodbSortKey: 'sessionId',

  // AgentCore Runtime configuration
  // Name must match pattern: ^[a-zA-Z][a-zA-Z0-9_]{0,47}$ (alphanumeric and underscores only, no hyphens)
  agentRuntimeName: 'thrivix_workflow_assistant',
  agentRuntimeDescription: 'Thrivix AI-powered workflow orchestration assistant powered by Strands',

  // VPC configuration
  vpcCidr: '10.0.0.0/16',
  maxAzs: 2,
  natGateways: 1, // Set to 2 for production high availability

  // Tags applied to all resources (customize as needed)
  tags: {
    Project: 'Thrivix',
    ManagedBy: 'CDK',
    Environment: process.env.ENVIRONMENT || 'production',
    Framework: 'Strands',
  },
};

/**
 * Helper function to generate resource names with project prefix
 */
export function getResourceName(resourceType: string): string {
  return `${config.projectName}-${resourceType}`;
}

/**
 * Helper function to get stack name with environment
 */
export function getStackName(stackType: string): string {
  const env = config.environment.charAt(0).toUpperCase() + config.environment.slice(1);
  return `${config.projectName}-${env}-${stackType}`;
}
