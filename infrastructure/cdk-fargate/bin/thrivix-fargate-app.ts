#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ThrivixFargateStack } from '../lib/thrivix-fargate-stack';
import { loadDeploymentConfig, getStackEnv } from '../../load-config';

/**
 * Thrivix Fargate CDK Application
 *
 * Deploys Thrivix AI workflow orchestration platform to AWS Fargate
 * with Application Load Balancer, auto-scaling, and production-ready configuration.
 *
 * SECURITY: Uses deployment-config.json (gitignored) to prevent exposing
 * AWS account details, ALB URLs, and other sensitive deployment info.
 */

const app = new cdk.App();

// Load secure deployment configuration
const config = loadDeploymentConfig();
const env = getStackEnv(config);

// Create the Fargate stack
new ThrivixFargateStack(app, 'ThrivixFargateStack', {
  env,
  description: 'Thrivix AI Workflow Orchestration Platform on AWS Fargate',
  tags: {
    Project: 'Thrivix',
    Environment: 'Production',
    ManagedBy: 'CDK',
    Framework: 'Strands',
    DeploymentType: 'Fargate',
  },
});

app.synth();
