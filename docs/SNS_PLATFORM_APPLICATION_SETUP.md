# SNS Platform Application Setup Guide

## Overview
This guide explains how to set up the Amazon SNS Platform Application for Android push notifications, as required by the Bubble Timer backend. The Platform Application needs to be created manually since CDK doesn't provide a direct construct for it.

## Prerequisites
1. Firebase Cloud Messaging (FCM) Server Key
2. AWS CLI configured with appropriate permissions
3. AWS Account ID

## Step 1: Get FCM Server Key

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to Project Settings > Cloud Messaging
4. Copy the Server key (starts with `AAAA...`)

## Step 2: Store FCM Server Key in AWS Parameter Store

```bash
# Store the FCM server key in AWS Parameter Store
aws ssm put-parameter \
    --name "/bubble-timer/fcm-server-key" \
    --value "YOUR_FCM_SERVER_KEY_HERE" \
    --type "SecureString" \
    --description "FCM Server Key for Bubble Timer Android app"
```

## Step 3: Create SNS Platform Application

### Option A: Using AWS CLI

```bash
# Create the Platform Application
aws sns create-platform-application \
    --name "BubbleTimerAndroid" \
    --platform "GCM" \
    --attributes PlatformCredential="YOUR_FCM_SERVER_KEY_HERE"
```

### Option B: Using AWS Console

1. Go to AWS SNS Console
2. Navigate to Mobile > Push notifications
3. Click "Create platform application"
4. Fill in the details:
   - **Name**: `BubbleTimerAndroid`
   - **Platform**: `Google Cloud Messaging (GCM)`
   - **Server key**: Your FCM server key
5. Click "Create platform application"

## Step 4: Get Platform Application ARN

After creating the Platform Application, note its ARN. It will look like:
```
arn:aws:sns:us-east-1:123456789012:app/GCM/BubbleTimerAndroid
```

## Step 5: Platform Application ARNs Configured ✅

The Platform Application ARNs have been configured in the CDK stack for both environments:

### `lib/bubble-timer-application.ts`

```typescript
// Platform Application ARNs for different environments
const platformApplicationArns = {
    'beta': 'arn:aws:sns:us-east-1:897729117121:app/GCM/BubbleTimer-Beta',
    'prod': 'arn:aws:sns:us-east-1:586794474099:app/GCM/BubbleTimer-Prod',
};
```

The CDK stack automatically uses the correct Platform Application ARN based on the deployment stage.

## Step 6: Deploy Infrastructure

```bash
# Deploy the CDK stack
npm run cdk deploy
```

## Environment-Specific Setup

### Beta Environment
Create a separate Platform Application for beta:

```bash
aws sns create-platform-application \
    --name "BubbleTimerAndroid-Beta" \
    --platform "GCM" \
    --attributes PlatformCredential="YOUR_FCM_SERVER_KEY_HERE"
```

### Production Environment
Create a separate Platform Application for production:

```bash
aws sns create-platform-application \
    --name "BubbleTimerAndroid-Prod" \
    --platform "GCM" \
    --attributes PlatformCredential="YOUR_FCM_SERVER_KEY_HERE"
```

## Verification

### Test Platform Application Creation

```bash
# List platform applications
aws sns list-platform-applications

# Get platform application attributes
aws sns get-platform-application-attributes \
    --platform-application-arn "arn:aws:sns:us-east-1:YOUR_ACCOUNT_ID:app/GCM/BubbleTimerAndroid"
```

### Test Endpoint Creation

```bash
# Create a test endpoint (replace with actual FCM token)
aws sns create-platform-endpoint \
    --platform-application-arn "arn:aws:sns:us-east-1:YOUR_ACCOUNT_ID:app/GCM/BubbleTimerAndroid" \
    --token "TEST_FCM_TOKEN"
```

## Troubleshooting

### Common Issues

1. **Invalid Platform Credential**: Ensure the FCM server key is correct and not expired
2. **Permission Denied**: Verify IAM permissions for SNS operations
3. **Platform Application Not Found**: Check the ARN is correct and the application exists

### Debug Commands

```bash
# Check platform application status
aws sns get-platform-application-attributes \
    --platform-application-arn "arn:aws:sns:us-east-1:YOUR_ACCOUNT_ID:app/GCM/BubbleTimerAndroid"

# List all endpoints for the platform application
aws sns list-endpoints-by-platform-application \
    --platform-application-arn "arn:aws:sns:us-east-1:YOUR_ACCOUNT_ID:app/GCM/BubbleTimerAndroid"
```

## Security Considerations

1. **FCM Server Key**: Store securely in AWS Parameter Store
2. **IAM Permissions**: Use least privilege principle
3. **Platform Application ARN**: Don't commit actual ARNs to version control
4. **Environment Separation**: Use different Platform Applications for beta/prod

## Next Steps

After setting up the Platform Application:

1. Deploy the CDK stack
2. Test device token registration
3. Test push notification delivery
4. Integrate with Android app

## References

- [AWS SNS Mobile Push Documentation](https://docs.aws.amazon.com/sns/latest/dg/mobile-push-send.html)
- [Firebase Cloud Messaging Setup](https://firebase.google.com/docs/cloud-messaging)
- [AWS SNS CLI Reference](https://docs.aws.amazon.com/cli/latest/reference/sns/)
