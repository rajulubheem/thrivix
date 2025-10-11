/**
 * Load Deployment Configuration
 *
 * Safely loads deployment-config.json with fallbacks and validation.
 * Prevents accidental exposure of sensitive deployment details in git.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface DeploymentConfig {
  aws: {
    account: string;
    region: string;
    profile: string;
  };
  backend: {
    secretName: string;
    corsOrigins: string[];
    certificateArn: string | null;
  };
  frontend: {
    bucketNameSuffix: string | null;
  };
  deployment: {
    autoUpdateFrontendWithBackendAlb: boolean;
  };
}

/**
 * Load deployment configuration from deployment-config.json
 * Falls back to environment variables and safe defaults
 */
export function loadDeploymentConfig(): DeploymentConfig {
  const configPath = path.join(__dirname, 'deployment-config.json');

  // Try to load from file
  if (fs.existsSync(configPath)) {
    try {
      const configData = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configData);

      // Validate required fields
      if (!config.aws?.account || config.aws.account === 'YOUR_AWS_ACCOUNT_ID') {
        throw new Error(
          '❌ deployment-config.json found but AWS account not configured.\n' +
          '   Please update aws.account in deployment-config.json'
        );
      }

      console.log('✅ Loaded deployment configuration from deployment-config.json');
      return config;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to parse deployment-config.json: ${error}`);
    }
  }

  // Fallback to environment variables (for CI/CD)
  const envAccount = process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID;
  const envRegion = process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-west-2';
  const envProfile = process.env.AWS_PROFILE || 'default';

  if (envAccount) {
    console.log('⚠️  No deployment-config.json found. Using environment variables.');
    console.log('   For production deployments, create deployment-config.json from template.');

    return {
      aws: {
        account: envAccount,
        region: envRegion,
        profile: envProfile,
      },
      backend: {
        secretName: process.env.SECRET_NAME || 'thrivix-fargate-secrets',
        corsOrigins: process.env.CORS_ORIGINS?.split(',') || [
          'http://localhost:3000',
          'http://localhost:5173',
        ],
        certificateArn: process.env.ACM_CERTIFICATE_ARN || null,
      },
      frontend: {
        bucketNameSuffix: process.env.BUCKET_SUFFIX || null,
      },
      deployment: {
        autoUpdateFrontendWithBackendAlb: true,
      },
    };
  }

  // No config found - show helpful error
  throw new Error(
    '❌ No deployment configuration found!\n\n' +
    'Please create deployment-config.json:\n' +
    '  1. Copy template: cp deployment-config.template.json deployment-config.json\n' +
    '  2. Edit deployment-config.json and fill in your AWS account details\n' +
    '  3. Run cdk deploy again\n\n' +
    'OR set environment variables:\n' +
    '  export CDK_DEFAULT_ACCOUNT=123456789012\n' +
    '  export CDK_DEFAULT_REGION=us-west-2\n'
  );
}

/**
 * Get CloudFormation environment for CDK stack
 */
export function getStackEnv(config: DeploymentConfig) {
  return {
    account: config.aws.account,
    region: config.aws.region,
  };
}
