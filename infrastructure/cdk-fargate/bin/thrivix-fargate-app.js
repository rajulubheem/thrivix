#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const cdk = __importStar(require("aws-cdk-lib"));
const thrivix_fargate_stack_1 = require("../lib/thrivix-fargate-stack");
/**
 * Thrivix Fargate CDK Application
 *
 * Deploys Thrivix AI workflow orchestration platform to AWS Fargate
 * with Application Load Balancer, auto-scaling, and production-ready configuration.
 */
const app = new cdk.App();
// Environment configuration
const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT || '294750864064',
    region: process.env.CDK_DEFAULT_REGION || 'us-west-2',
};
// Create the Fargate stack
new thrivix_fargate_stack_1.ThrivixFargateStack(app, 'ThrivixFargateStack', {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGhyaXZpeC1mYXJnYXRlLWFwcC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRocml2aXgtZmFyZ2F0ZS1hcHAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsdUNBQXFDO0FBQ3JDLGlEQUFtQztBQUNuQyx3RUFBbUU7QUFFbkU7Ozs7O0dBS0c7QUFFSCxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUUxQiw0QkFBNEI7QUFDNUIsTUFBTSxHQUFHLEdBQUc7SUFDVixPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsSUFBSSxjQUFjO0lBQzFELE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixJQUFJLFdBQVc7Q0FDdEQsQ0FBQztBQUVGLDJCQUEyQjtBQUMzQixJQUFJLDJDQUFtQixDQUFDLEdBQUcsRUFBRSxxQkFBcUIsRUFBRTtJQUNsRCxHQUFHO0lBQ0gsV0FBVyxFQUFFLDJEQUEyRDtJQUN4RSxJQUFJLEVBQUU7UUFDSixPQUFPLEVBQUUsU0FBUztRQUNsQixXQUFXLEVBQUUsWUFBWTtRQUN6QixTQUFTLEVBQUUsS0FBSztRQUNoQixTQUFTLEVBQUUsU0FBUztRQUNwQixjQUFjLEVBQUUsU0FBUztLQUMxQjtDQUNGLENBQUMsQ0FBQztBQUVILEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAnc291cmNlLW1hcC1zdXBwb3J0L3JlZ2lzdGVyJztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBUaHJpdml4RmFyZ2F0ZVN0YWNrIH0gZnJvbSAnLi4vbGliL3Rocml2aXgtZmFyZ2F0ZS1zdGFjayc7XG5cbi8qKlxuICogVGhyaXZpeCBGYXJnYXRlIENESyBBcHBsaWNhdGlvblxuICpcbiAqIERlcGxveXMgVGhyaXZpeCBBSSB3b3JrZmxvdyBvcmNoZXN0cmF0aW9uIHBsYXRmb3JtIHRvIEFXUyBGYXJnYXRlXG4gKiB3aXRoIEFwcGxpY2F0aW9uIExvYWQgQmFsYW5jZXIsIGF1dG8tc2NhbGluZywgYW5kIHByb2R1Y3Rpb24tcmVhZHkgY29uZmlndXJhdGlvbi5cbiAqL1xuXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuXG4vLyBFbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXG5jb25zdCBlbnYgPSB7XG4gIGFjY291bnQ6IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQgfHwgJzI5NDc1MDg2NDA2NCcsXG4gIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfUkVHSU9OIHx8ICd1cy13ZXN0LTInLFxufTtcblxuLy8gQ3JlYXRlIHRoZSBGYXJnYXRlIHN0YWNrXG5uZXcgVGhyaXZpeEZhcmdhdGVTdGFjayhhcHAsICdUaHJpdml4RmFyZ2F0ZVN0YWNrJywge1xuICBlbnYsXG4gIGRlc2NyaXB0aW9uOiAnVGhyaXZpeCBBSSBXb3JrZmxvdyBPcmNoZXN0cmF0aW9uIFBsYXRmb3JtIG9uIEFXUyBGYXJnYXRlJyxcbiAgdGFnczoge1xuICAgIFByb2plY3Q6ICdUaHJpdml4JyxcbiAgICBFbnZpcm9ubWVudDogJ1Byb2R1Y3Rpb24nLFxuICAgIE1hbmFnZWRCeTogJ0NESycsXG4gICAgRnJhbWV3b3JrOiAnU3RyYW5kcycsXG4gICAgRGVwbG95bWVudFR5cGU6ICdGYXJnYXRlJyxcbiAgfSxcbn0pO1xuXG5hcHAuc3ludGgoKTtcbiJdfQ==