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
- **`updateTimer` messages**: Mobile app sends `timer` object with nested fields
- **Always check message structure** in both frontend and backend before changing field access patterns

### 3. WebSocket Broadcasting Patterns
- **Fire-and-forget for shared users**: Use `.forEach()` with `.catch()` instead of awaiting `Promise.allSettled()`
- **Send to user's connections first**: Then broadcast to shared users
- **Clean up connections on any error**: Don't try to be smart about error types - clean up on any failure

### 4. Error Handling Philosophy
- **Simple is better**: Don't over-engineer error handling
- **Clean up on any connection failure**: The original approach of cleaning up any failed connection was correct
- **Avoid complex error type detection**: It adds complexity without significant benefit

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

## Remember

The goal is to maintain a **reliable, performant backend** that works seamlessly with the Android frontend. When in doubt, **preserve working behavior** and make **minimal, focused changes**.
