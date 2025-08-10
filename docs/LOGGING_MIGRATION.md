# Logging System Migration Guide

## Overview

This guide explains how to migrate from direct `console.log` calls to the new structured logging system. The new system provides better testability, configurable log levels, and structured context for debugging.

## Benefits of the New System

1. **Testable**: Log entries can be captured and verified in tests
2. **Configurable**: Log levels can be controlled via environment variables
3. **Structured**: Context and data are properly structured for better debugging
4. **Contextual**: Specialized loggers provide relevant context automatically
5. **Production Ready**: Debug logs can be easily disabled in production
6. **Industry Standard**: Follows Node.js logging best practices with JSON structured logging
7. **AWS Optimized**: Includes Lambda-specific context and CloudWatch compatibility

## Migration Steps

### 1. Import the Logging System

Replace direct `console.log` calls with the new logging system:

```typescript
// Before
console.log("Event: " + JSON.stringify(event));

// After
import { log, createApiLogger } from '../core/logger';

const logger = createApiLogger('GET', cognitoUserName);
logger.info('API event received', { eventType: 'GET' }, event);
```

### 2. Use Specialized Loggers

Use the appropriate specialized logger for your context:

```typescript
// For WebSocket operations
import { createWebSocketLogger } from '../core/logger';
const wsLogger = createWebSocketLogger(connectionId, userId, deviceId);
wsLogger.info('WebSocket message received', { messageType: 'updateTimer' });

// For timer operations
import { createTimerLogger } from '../core/logger';
const timerLogger = createTimerLogger(timerId, userId);
timerLogger.info('Timer updated', { operation: 'update' }, timerData);

// For database operations
import { createDatabaseLogger } from '../core/logger';
const dbLogger = createDatabaseLogger('getTimer');
dbLogger.debug('Database query executed', { table: 'timers' }, results);
```

### 3. Add Context and Data

Include relevant context and data in your log entries:

```typescript
// Before
console.log("DDB Response: " + JSON.stringify(results));

// After
const dbLogger = createDatabaseLogger('getTimer');
dbLogger.debug('DynamoDB response received', 
  { table: 'timers', operation: 'get' }, 
  results
);
```

### 4. Use Appropriate Log Levels

Choose the appropriate log level for your message:

- **DEBUG**: Detailed information for debugging
- **INFO**: General information about application flow
- **WARN**: Warning messages for potential issues
- **ERROR**: Error messages for actual problems

```typescript
logger.debug('Detailed debug information');
logger.info('Application flow information');
logger.warn('Potential issue detected');
logger.error('Error occurred', { errorCode: 'DB_CONNECTION_FAILED' });
```

## Migration Examples

### WebSocket Handler Migration

```typescript
// Before
console.log("Event: " + JSON.stringify(event));
console.log("Context: " + JSON.stringify(context));
console.log("Token is valid. Payload: ", payload);

// After
import { createWebSocketLogger } from '../core/logger';

const logger = createWebSocketLogger(connectionId, cognitoUserName, deviceId);
logger.debug('WebSocket event received', { eventType: 'MESSAGE' }, event);
logger.debug('WebSocket context', { contextType: 'request' }, context);
logger.info('Token validation successful', { tokenType: 'JWT' }, payload);
```

### API Handler Migration

```typescript
// Before
console.log("Event: " + JSON.stringify(event));
console.log("Context: " + JSON.stringify(context));
console.log("Cognito User: " + cognitoUserName);

// After
import { createApiLogger } from '../core/logger';

const logger = createApiLogger('GET', cognitoUserName);
logger.debug('API event received', { eventType: 'GET' }, event);
logger.debug('API context', { contextType: 'lambda' }, context);
logger.info('User authenticated', { authMethod: 'cognito' });
```

### Database Operations Migration

```typescript
// Before
console.log("DDB Response: " + JSON.stringify(results));

// After
import { createDatabaseLogger } from '../core/logger';

const dbLogger = createDatabaseLogger('getTimer');
dbLogger.debug('DynamoDB response', { table: 'timers', operation: 'get' }, results);
```

## Testing with the New System

### Setup Test Logger

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
    expect(testLogger).toHaveLoggedEntryCountAtLevel(LogLevel.INFO, 2);
  });
});
```

### Verify Log Entries

```typescript
// Check for specific messages
expect(testLogger.hasMessage('Timer created')).toBe(true);

// Check for messages with context
const entries = testLogger.getEntriesByContext({ operation: 'timer' });
expect(entries.length).toBeGreaterThan(0);

// Check for messages at specific levels
const errorEntries = testLogger.getErrorEntries();
expect(errorEntries.length).toBe(0);
```

## Environment Configuration

Set the log level via environment variable:

```bash
# Development - show all logs
LOG_LEVEL=DEBUG

# Production - show only warnings and errors
LOG_LEVEL=WARN

# Disable all logging
LOG_LEVEL=NONE
```

## Migration Checklist

- [ ] Replace `console.log` calls with appropriate logger
- [ ] Add relevant context to log entries
- [ ] Use appropriate log levels (DEBUG, INFO, WARN, ERROR)
- [ ] Update tests to use test logger
- [ ] Verify log entries in tests
- [ ] Set appropriate log level for environment

## Common Patterns

### Error Logging
```typescript
try {
  // Some operation
} catch (error) {
  logger.error('Operation failed', { operation: 'updateTimer' }, error);
  throw error;
}
```

### Conditional Logging
```typescript
if (logger.getLevel() <= LogLevel.DEBUG) {
  logger.debug('Detailed debug info', { step: 'validation' }, data);
}
```

### Performance Logging
```typescript
const startTime = Date.now();
// ... operation ...
const duration = Date.now() - startTime;
logger.info('Operation completed', { duration, operation: 'timerUpdate' });
```

## Benefits After Migration

1. **Better Debugging**: Structured logs with context make debugging easier
2. **Testable Code**: Logging behavior can be verified in tests
3. **Production Control**: Debug logs can be disabled in production
4. **Consistent Format**: All logs follow the same structured format
5. **Context Awareness**: Logs automatically include relevant context
6. **Industry Compliance**: Follows established Node.js logging best practices
7. **AWS Integration**: Optimized for CloudWatch and Lambda monitoring
8. **Log Aggregation Ready**: JSON format enables easy parsing and analysis
