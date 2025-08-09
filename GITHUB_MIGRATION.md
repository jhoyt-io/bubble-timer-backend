# GitHub Migration Setup

This document outlines the steps to complete the migration from AWS CodeCommit to GitHub for the bubble-timer-backend pipeline.

## Prerequisites

The pipeline has been updated to use GitHub as the source repository. Before deploying, you need to create a GitHub Personal Access Token (PAT) and store it in AWS Secrets Manager.

## Setup Steps

### 1. Create GitHub Personal Access Token

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate a new token with the following scopes:
   - `repo` (Full control of private repositories)
   - `admin:repo_hook` (Full control of repository hooks)
3. Copy the token value (you won't be able to see it again)

### 2. Store Token in AWS Secrets Manager

Run the following AWS CLI command to store the token:

```bash
aws secretsmanager create-secret \
  --name github-token \
  --description "GitHub Personal Access Token for bubble-timer-backend pipeline" \
  --secret-string "your-github-pat-here"
```

### 3. Verify Repository Configuration

The pipeline is now configured to:
- Pull from: `https://github.com/jhoyt-io/bubble-timer-backend`
- Branch: `main`
- Authentication: Uses the `github-token` secret from AWS Secrets Manager

### 4. Deploy the Updated Pipeline

Once the GitHub token is configured in Secrets Manager, deploy the pipeline:

```bash
cdk deploy BubbleTimerPipelineStack
```

## Migration Changes Made

- **Removed**: CodeCommit repository dependency and imports
- **Added**: GitHub source configuration using `CodePipelineSource.gitHub()`
- **Updated**: Import statements to include `SecretValue` from AWS CDK
- **Configured**: Authentication using AWS Secrets Manager for the GitHub token

## Repository Details

- **GitHub Repository**: `jhoyt-io/bubble-timer-backend`
- **Branch**: `main` (changed from `mainline` used in CodeCommit)
- **Access**: Private repository requiring authentication via PAT

## Security Notes

- The GitHub PAT is stored securely in AWS Secrets Manager
- The pipeline will authenticate to GitHub using this token
- Ensure the PAT has the minimum required permissions
- Consider setting an expiration date for the PAT and updating it before expiry
