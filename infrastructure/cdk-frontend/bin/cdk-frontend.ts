#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CdkFrontendStack } from '../lib/cdk-frontend-stack';
import { loadDeploymentConfig, getStackEnv } from '../../load-config';

/**
 * Thrivix Frontend CDK Application
 *
 * Deploys Thrivix frontend to S3 + CloudFront with automatic backend ALB integration.
 *
 * SECURITY: Uses deployment-config.json (gitignored) to prevent exposing
 * AWS account details, backend ALB URLs, and CloudFront domains in git.
 */

const app = new cdk.App();

// Load secure deployment configuration
const config = loadDeploymentConfig();
const env = getStackEnv(config);

new CdkFrontendStack(app, 'CdkFrontendStack', {
  env,
  description: 'Thrivix Frontend - S3 + CloudFront with Backend ALB Integration',
  tags: {
    Project: 'Thrivix',
    Environment: 'Production',
    ManagedBy: 'CDK',
    Component: 'Frontend',
  },
});