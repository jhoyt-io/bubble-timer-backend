# Bubble Timer Backend Documentation

## Overview

This directory contains documentation for the Bubble Timer backend service, including architectural guidance, development patterns, and lessons learned from implementation.

## Quick Start

- **Architecture**: See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design and data flows
- **Development**: See [DEVELOPMENT.md](./DEVELOPMENT.md) for development workflow and patterns
- **WebSocket**: See [WEBSOCKET.md](./WEBSOCKET.md) for WebSocket implementation details
- **Migration**: See [GITHUB_MIGRATION.md](./GITHUB_MIGRATION.md) for repository migration notes

## Key Architectural Principles

### 1. Preserve Working Interfaces
- **NEVER change message formats** that the frontend relies on without explicit coordination
- **Maintain backward compatibility** during refactoring - the frontend expects specific data structures
- **Compare with original implementations** before making changes to understand the working interface

### 2. Message Format Awareness
- **`stopTimer` messages**: Mobile app sends `timerId` directly (not nested in `timer` object)
- **`updateTimer` messages**: Mobile app sends `timer` object with nested fields and `timerEnd` field
- **Always check message structure** in both frontend and backend before changing field access patterns

### 3. WebSocket Broadcasting Patterns
- **Sender inclusion**: Timer updates sent to ALL user connections (including sender for confirmation)
- **Fire-and-forget for shared users**: Use `forEach()` with `.catch()` instead of awaiting `Promise.allSettled()`
- **Clean up connections on any error**: Don't try to be smart about error types - clean up on any failure

### 4. Authentication Patterns
- **CONNECT events**: Require authentication for connection storage (matches working implementation)
- **JWT verification**: Use `tokenUse: 'id'` in verifier creation, no additional parameters in verify() call
- **Token format**: Mobile app sends ID token directly (no "Bearer " prefix required)

### 5. Error Handling Philosophy
- **Simple is better**: Don't over-engineer error handling
- **Clean up on any connection failure**: The original approach of cleaning up any failed connection was correct
- **Avoid complex error type detection**: It adds complexity without significant benefit

## Recent Implementation Fixes

### WebSocket Connection Issues (Resolved)
- **Problem**: Devices unable to establish basic connections
- **Root Cause**: Authentication logic was too strict for CONNECT events
- **Solution**: Restored working implementation behavior where CONNECT events require authentication for connection storage

### Timer Synchronization Issues (Resolved)
- **Problem**: Sender not receiving their own timer updates
- **Root Cause**: `sendDataToUser` was excluding sender when `sentFromDeviceId` was provided
- **Solution**: Send timer updates to ALL user connections (including sender for confirmation)

### JWT Verification Issues (Resolved)
- **Problem**: Authentication failures despite valid tokens
- **Root Cause**: Redundant `{ tokenUse: 'id' }` parameter in verify() call
- **Solution**: Removed redundant parameter to match working implementation

## Development Workflow

### Before Making Changes
1. **Check git history**: Look at the original working implementation before refactoring
2. **Understand the interface**: Know what the frontend expects to send/receive
3. **Test locally**: Build and test changes before deploying

### During Refactoring
1. **Incremental changes**: Make small, testable changes rather than large rewrites
2. **Preserve behavior**: Ensure the new implementation behaves identically to the old one
3. **Document decisions**: Add comments explaining why certain patterns are used

### After Changes
1. **Verify functionality**: Test the actual user flows, not just unit tests
2. **Check logs**: Monitor CloudWatch logs for any new errors or issues
3. **Validate integration**: Ensure frontend and backend still work together

## Testing Requirements

- **All changes must pass tests**: Run `npm test` before committing
- **CDK must synthesize**: Run `npx cdk synth` to ensure infrastructure changes are valid
- **Maintain test coverage**: Don't break existing tests during refactoring

## Deployment Safety

- **Always run tests**: `npm run build && npm test`
- **Always check CDK**: `npx cdk synth`
- **Review changes**: Ensure changes are minimal and focused
- **Monitor after deployment**: Watch CloudWatch logs and test user flows

## Critical Implementation Details

### WebSocket Message Formats
```typescript
// Timer Update (Mobile App Format)
{
  action: "sendmessage",
  data: {
    type: 'updateTimer',
    shareWith: ["user1", "user2"],
    timer: {
      id: string,
      userId: string,
      name: string,
      totalDuration: string,
      remainingDuration?: string,
      timerEnd?: string  // Mobile app uses timerEnd, not endTime
    }
  }
}

// Timer Stop (Mobile App Format)
{
  action: "sendmessage",
  data: {
    type: 'stopTimer',
    timerId: string,  // Direct timerId, not nested in timer object
    shareWith: ["user1", "user2"]
  }
}
```

### Authentication Configuration
```typescript
// JWT Verifier (matches working implementation)
const jwtVerifier = CognitoJwtVerifier.create({
    userPoolId: 'us-east-1_cjED6eOHp',
    tokenUse: 'id',
    clientId: '4t3c5p3875qboh3p1va2t9q63c',
});

// Token verification (no additional parameters)
const payload = await jwtVerifier.verify(cognitoToken);
```

### Broadcasting Patterns
```typescript
// Send to user's connections (including sender for confirmation)
await sendDataToUser(userId, '', messageWithId);  // Empty sentFromDeviceId = send to ALL

// Broadcast to shared users (fire-and-forget)
data.shareWith.forEach(userName => {
    sendDataToUser(userName, deviceId, data).catch(error => {
        logger.error('Failed to send to shared user', { userName, error: error.message });
    });
});
```

## Remember

The goal is to maintain a **reliable, performant backend** that works seamlessly with the Android frontend. When in doubt, **preserve working behavior** and make **minimal, focused changes**.

### Key Success Factors
1. **Interface preservation**: Don't change message formats without coordination
2. **Authentication consistency**: Use same patterns as working implementation
3. **Sender inclusion**: Always send timer updates to sender for confirmation
4. **Simple error handling**: Clean up connections on any failure
5. **Fire-and-forget broadcasting**: Use `forEach().catch()` for shared users
