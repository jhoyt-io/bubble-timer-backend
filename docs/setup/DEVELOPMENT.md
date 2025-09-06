# Development Guide

## Overview

This document provides guidelines for developing the Bubble Timer backend application.

## Testing Patterns

### Given/When/Then Pattern

All tests should follow the **Given/When/Then** pattern as demonstrated in `__tests__/dynamodb-integration.test.ts`. This pattern provides clear, readable test scenarios that are easy to understand and maintain.

#### Structure

```typescript
describe('Feature Name', () => {
  describe('Given a specific precondition', () => {
    beforeEach(() => {
      // Setup the precondition
    });

    describe('When a specific action occurs', () => {
      test('Then the expected outcome should happen', () => {
        // Given (if additional setup is needed)
        const input = 'test data';

        // When
        const result = someFunction(input);

        // Then
        expect(result).toBe('expected output');
      });
    });
  });
});
```

#### Examples

**✅ Good - Using Given/When/Then pattern:**
```typescript
describe('Timer Operations', () => {
  describe('Given a timer exists in the database', () => {
    beforeEach(() => {
      mockDynamoClient.send.mockResolvedValue({ Item: mockTimer });
    });

    describe('When retrieving the timer', () => {
      test('Then the timer should be returned with correct data', async () => {
        // When
        const result = await getTimer('test-timer-id');

        // Then
        expect(result).toBeInstanceOf(Timer);
        expect(result?.id).toBe('test-timer-id');
      });
    });
  });
});
```

**❌ Avoid - Using "it should" pattern:**
```typescript
describe('Timer Operations', () => {
  it('should return timer with correct data', async () => {
    // Setup
    mockDynamoClient.send.mockResolvedValue({ Item: mockTimer });
    
    // Test
    const result = await getTimer('test-timer-id');
    
    // Assert
    expect(result).toBeInstanceOf(Timer);
  });
});
```

#### Benefits

1. **Readability**: Tests read like natural language scenarios
2. **Maintainability**: Clear structure makes tests easy to modify
3. **Documentation**: Tests serve as living documentation of behavior
4. **Consistency**: Uniform pattern across all test files
5. **Debugging**: Clear separation of setup, action, and verification

#### Guidelines

- Use `describe` blocks for "Given" and "When" conditions
- Use `test` blocks for "Then" assertions
- Use `beforeEach` for setup that applies to multiple tests
- Keep test descriptions descriptive and action-oriented
- Group related scenarios under common "Given" conditions

## Logging Guidelines

### Structured Logging

Use the structured logging system for all logging operations. This provides better testability, context awareness, and production readiness.

#### Usage

```typescript
import { createWebSocketLogger, createTimerLogger, createDatabaseLogger } from '../core/logger';

// WebSocket operations
const wsLogger = createWebSocketLogger(connectionId, userId, deviceId);
wsLogger.info('WebSocket message received', { messageType: 'updateTimer' });

// Timer operations
const timerLogger = createTimerLogger(timerId, userId);
timerLogger.info('Timer updated', { operation: 'update' });

// Database operations
const dbLogger = createDatabaseLogger('getTimer');
dbLogger.debug('Database query executed', { table: 'timers' }, results);
```

#### Log Levels

- **DEBUG**: Detailed information for debugging
- **INFO**: General information about application flow
- **WARN**: Warning messages for potential issues
- **ERROR**: Error messages for actual problems

#### Testing Logging

```typescript
import { setupTestLogger, cleanupTestLogger } from '../__tests__/utils/logger-test-utils';

describe('My Test Suite', () => {
  let testLogger: TestLogger;

  beforeEach(() => {
    testLogger = setupTestLogger();
  });

  afterEach(() => {
    cleanupTestLogger();
  });

  test('should log appropriate messages', () => {
    // Your test code here
    
    // Verify logging behavior
    expect(testLogger).toHaveLoggedMessage('Expected message');
    expect(testLogger).toHaveLoggedEntryCount(3);
  });
});
```

## Code Style

### TypeScript

- Use strict TypeScript configuration
- Prefer interfaces over types for object shapes
- Use explicit return types for public functions
- Avoid `any` type - use proper typing

### Error Handling

- Use try/catch blocks for async operations
- Log errors with appropriate context
- Re-throw errors when appropriate
- Provide meaningful error messages

### AWS Best Practices

- Use environment variables for configuration
- Implement proper IAM roles and permissions
- Use CloudWatch for monitoring and logging
- Follow AWS Lambda best practices

## Development Workflow

### Testing

1. Write tests first (TDD approach)
2. Follow Given/When/Then pattern
3. Ensure comprehensive coverage
4. Test error scenarios
5. Verify logging behavior

### Code Review

1. Check test coverage
2. Verify logging implementation
3. Review error handling
4. Check TypeScript types
5. Ensure AWS best practices

### Deployment

1. Run all tests locally
2. Check linting and formatting
3. Verify environment configuration
4. Test in staging environment
5. Monitor logs and metrics
