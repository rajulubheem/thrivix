#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { InfrastructureStack } from '../lib/infrastructure-stack';
import { AgentCoreStack } from '../lib/agentcore-stack';
import { config, getStackName } from '../config';

/**
 * Bedrock AgentCore CDK Application
 *
 * This CDK app deploys a production-ready Strands agent on AWS Bedrock AgentCore
 * with VPC endpoints for enterprise security compliance.
 *
 * Architecture:
 * 1. Network Stack: VPC + Bedrock VPC Endpoint (PrivateLink)
 * 2. Infrastructure Stack: IAM + ECR + DynamoDB + Docker Image
 * 3. AgentCore Stack: Bedrock AgentCore Runtime + Endpoint
 *
 * To customize: Edit config.ts
 * To deploy: npx cdk deploy --all --profile <your-profile>
 */

const app = new cdk.App();

// Environment configuration from config.ts
const env = {
  account: config.awsAccountId,
  region: config.awsRegion,
};

// Apply tags from config
Object.entries(config.tags).forEach(([key, value]) => {
  cdk.Tags.of(app).add(key, value);
});

// ============================================
// 1. Network Stack
// ============================================
const networkStack = new NetworkStack(app, getStackName('Network'), {
  env,
  description: 'Network infrastructure with VPC and Bedrock VPC endpoint for enterprise security',
});

// ============================================
// 2. Infrastructure Stack
// ============================================
const infraStack = new InfrastructureStack(app, getStackName('Infrastructure'), {
  env,
  description: 'Core infrastructure - IAM roles, ECR, DynamoDB, Docker image',
  bedrockEndpointUrl: networkStack.bedrockEndpointUrl,
});

// ============================================
// 3. AgentCore Stack
// ============================================
const agentCoreStack = new AgentCoreStack(app, getStackName('AgentCore'), {
  env,
  description: 'Bedrock AgentCore runtime for Strands agents',
  agentCoreRole: infraStack.agentCoreRole,
  ecrRepository: infraStack.ecrRepository,
  dockerImageAsset: infraStack.dockerImageAsset,
});

// ============================================
// Stack Dependencies
// ============================================
infraStack.addDependency(networkStack);
agentCoreStack.addDependency(infraStack);

// ============================================
// Stack Outputs
// ============================================

// Network Stack Outputs
new cdk.CfnOutput(networkStack, 'VpcId', {
  value: networkStack.vpc.vpcId,
  description: 'VPC ID',
  exportName: `${config.projectName}-VpcId`,
});

new cdk.CfnOutput(networkStack, 'BedrockVpcEndpointId', {
  value: networkStack.bedrockVpcEndpoint.vpcEndpointId,
  description: 'Bedrock Runtime VPC Endpoint ID',
  exportName: `${config.projectName}-BedrockVpcEndpointId`,
});

new cdk.CfnOutput(networkStack, 'BedrockEndpointUrl', {
  value: networkStack.bedrockEndpointUrl,
  description: 'Bedrock VPC Endpoint URL (AWS_ENDPOINT_URL_BEDROCK_RUNTIME)',
  exportName: `${config.projectName}-BedrockEndpointUrl`,
});

// Infrastructure Stack Outputs
new cdk.CfnOutput(infraStack, 'ECRRepositoryUri', {
  value: infraStack.ecrRepository.repositoryUri,
  description: 'ECR Repository URI for agent container images',
  exportName: `${config.projectName}-ECRRepositoryUri`,
});

new cdk.CfnOutput(infraStack, 'DockerImageUri', {
  value: infraStack.dockerImageAsset.imageUri,
  description: 'Docker image URI (ARM64)',
  exportName: `${config.projectName}-DockerImageUri`,
});

new cdk.CfnOutput(infraStack, 'DynamoDBTableName', {
  value: infraStack.dynamodbTable.tableName,
  description: 'DynamoDB table for agent sessions',
  exportName: `${config.projectName}-DynamoDBTableName`,
});

new cdk.CfnOutput(infraStack, 'AgentCoreRoleArn', {
  value: infraStack.agentCoreRole.roleArn,
  description: 'IAM Role ARN for AgentCore Runtime',
  exportName: `${config.projectName}-AgentCoreRoleArn`,
});

// AgentCore Stack Outputs
new cdk.CfnOutput(agentCoreStack, 'AgentCoreRuntimeArn', {
  value: agentCoreStack.runtime.attrAgentRuntimeArn,
  description: 'Bedrock AgentCore Runtime ARN',
  exportName: `${config.projectName}-AgentCoreRuntimeArn`,
});

new cdk.CfnOutput(agentCoreStack, 'AgentCoreRuntimeId', {
  value: agentCoreStack.runtime.attrAgentRuntimeId,
  description: 'Bedrock AgentCore Runtime ID',
  exportName: `${config.projectName}-AgentCoreRuntimeId`,
});

new cdk.CfnOutput(agentCoreStack, 'AgentCoreEndpointArn', {
  value: agentCoreStack.runtimeEndpoint.attrAgentRuntimeEndpointArn,
  description: 'AgentCore Runtime Endpoint ARN',
  exportName: `${config.projectName}-AgentCoreEndpointArn`,
});

new cdk.CfnOutput(agentCoreStack, 'AgentCoreEndpointId', {
  value: agentCoreStack.runtimeEndpoint.attrId,
  description: 'AgentCore Runtime Endpoint ID',
  exportName: `${config.projectName}-AgentCoreEndpointId`,
});

app.synth();
