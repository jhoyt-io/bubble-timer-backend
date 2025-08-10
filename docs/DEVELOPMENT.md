# Bubble Timer Backend Development Guide

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- AWS CLI configured with appropriate permissions
- AWS CDK v2 installed globally: `npm install -g aws-cdk`

### Initial Setup
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Synthesize CDK stack
npx cdk synth
```

## Development Workflow

### 1. Local Development
```bash
# Watch mode for TypeScript compilation
npm run watch

# Run tests in watch mode
npm run test:watch

# Build and test
npm run build:test
```

### 2. Testing Strategy
- **Unit tests**: `npm test` - Tests individual functions and classes
- **Integration tests**: Test API endpoints and WebSocket handlers
- **CDK tests**: Validate infrastructure changes with `npx cdk synth`

### 3. Code Quality
- **TypeScript**: Strict type checking enabled
- **ESLint**: Code style and best practices
- **Jest**: Test framework with coverage reporting

## Project Structure

```
lib/
├── backend/                 # Core business logic
│   ├── timers.ts           # Timer CRUD operations
│   ├── connections.ts      # WebSocket connection management
│   ├── errors/             # Custom error types
│   ├── middleware/         # Request/response middleware
│   └── utils/              # Shared utilities
├── config/                 # Configuration management
│   ├── environment.ts      # Environment variables
│   ├── database.ts         # DynamoDB configuration
│   ├── api.ts             # API Gateway settings
│   └── websocket.ts       # WebSocket configuration
├── monitoring/             # Observability and logging
│   ├── logger.ts          # Structured logging
│   ├── metrics.ts         # CloudWatch metrics
│   ├── health.ts          # Health checks
│   └── performance.ts     # Performance monitoring
└── *.ts                   # CDK stack definitions
```

## Key Development Patterns

### 1. Error Handling
```typescript
// Use custom error types for different scenarios
import { TimerError, TimerErrorCodes } from './errors/TimerError';

try {
    await updateTimer(timer);
} catch (error) {
    if (error instanceof TimerError) {
        // Handle timer-specific errors
        logger.error('Timer operation failed', { 
            code: error.code, 
            timerId: timer.id 
        });
    } else {
        // Handle unexpected errors
        throw new TimerError(
            'Unexpected error during timer update',
            TimerErrorCodes.TIMER_UPDATE_FAILED,
            500,
            { originalError: error.message }
        );
    }
}
```

### 2. Logging and Monitoring
```typescript
import { MonitoringLogger, PerformanceMonitor } from '../monitoring';

const logger = new MonitoringLogger('TimerService');

// Structured logging with context
const timerLogger = logger.child('updateTimer', { 
    timerId: timer.id, 
    userId: timer.userId 
});

// Performance tracking
await PerformanceMonitor.trackDatabaseOperation('put', 'timers', async () => {
    // Database operation here
});
```

### 3. Configuration Management
```typescript
import { Config } from '../config';

// Access configuration
const dbClient = Config.database;
const tableNames = Config.tables;
const wsClient = Config.websocket;

// Environment-specific config
const env = Config.environment;
```

### 4. Validation Patterns
```typescript
import { ValidationUtils } from './utils/validation';

// Validate input data
const validatedTimer = ValidationUtils.validateTimer(data);

// Use validated data in operations
const timer = Timer.fromValidatedData(validatedTimer);
```

## WebSocket Development

### 1. Message Handling
```typescript
// Route messages by type
switch (data.type) {
    case 'timer':
        await handleTimerMessage(data, userId, deviceId, logger);
        break;
    case 'share':
        await handleTimerSharing(data, deviceId, logger);
        break;
    case 'ping':
        await handlePingMessage(data, userId, deviceId, logger);
        break;
    default:
        logger.warn('Unknown message type', { type: data.type });
}
```

### 2. Broadcasting Patterns
```typescript
// Send to user's connections first
await sendDataToUser(userId, deviceId, data);

// Then broadcast to shared users
const sharedUsers = await getSharedTimerRelationships(timerId);
for (const sharedUser of sharedUsers) {
    try {
        await sendDataToUser(sharedUser, '', data);
    } catch (error) {
        logger.error('Failed to send to shared user', { 
            sharedUser, 
            error: error.message 
        });
    }
}
```

### 3. Connection Management
```typescript
// Store connection on connect
await updateConnection({
    userId: cognitoUserName,
    deviceId: deviceId,
    connectionId: connectionId
});

// Clean up on disconnect
await updateConnection({
    userId: cognitoUserName,
    deviceId: deviceId,
    connectionId: undefined
});
```

## Database Operations

### 1. DynamoDB Patterns
```typescript
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const client = Config.database;
const command = new PutItemCommand({
    TableName: Config.tables.timers,
    Item: {
        id: { S: timer.id },
        user_id: { S: timer.userId },
        name: { S: timer.name },
        total_duration: { S: timer.totalDuration },
        updated_at: { S: new Date().toISOString() }
    }
});

await client.send(command);
```

### 2. Query Patterns
```typescript
// Query by user ID using GSI
const command = new QueryCommand({
    TableName: Config.tables.timers,
    IndexName: 'TimersByUser',
    KeyConditionExpression: 'user_id = :userId',
    ExpressionAttributeValues: {
        ':userId': { S: userId }
    }
});
```

## Testing Guidelines

### 1. Unit Tests
```typescript
// Test individual functions
describe('TimerService', () => {
    it('should update timer successfully', async () => {
        const timer = new Timer('test-id', 'user-1', 'Test Timer', '300');
        await expect(updateTimer(timer)).resolves.not.toThrow();
    });
});
```

### 2. Integration Tests
```typescript
// Test API endpoints
describe('API Integration', () => {
    it('should handle timer creation', async () => {
        const response = await request(app)
            .post('/timers')
            .send({ name: 'Test Timer', totalDuration: '300' })
            .expect(201);
    });
});
```

### 3. WebSocket Tests
```typescript
// Test WebSocket message handling
describe('WebSocket Integration', () => {
    it('should broadcast timer updates', async () => {
        // Setup test connections
        // Send message
        // Verify broadcast
    });
});
```

## Deployment Process

### 1. Pre-deployment Checklist
- [ ] All tests pass: `npm run build:test`
- [ ] CDK synthesizes: `npx cdk synth`
- [ ] Code review completed
- [ ] Environment variables configured

### 2. Deployment Commands
```bash
# Deploy to staging
npx cdk deploy --profile staging

# Deploy to production
npx cdk deploy --profile production

# Destroy stack (if needed)
npx cdk destroy --profile production
```

### 3. Post-deployment Verification
- [ ] Health checks pass
- [ ] API endpoints respond correctly
- [ ] WebSocket connections work
- [ ] Monitoring shows no errors

## Common Issues and Solutions

### 1. WebSocket Connection Issues
- **Problem**: Connections not persisting
- **Solution**: Check DynamoDB permissions and connection table structure

### 2. Timer Synchronization Problems
- **Problem**: Updates not broadcasting to shared users
- **Solution**: Verify sharing relationships and connection state

### 3. Performance Issues
- **Problem**: High Lambda cold start times
- **Solution**: Optimize bundle size and use provisioned concurrency

### 4. Authentication Errors
- **Problem**: JWT validation failures
- **Solution**: Check Cognito configuration and token format

## Best Practices

### 1. Code Organization
- **Single responsibility**: Each function has one clear purpose
- **Dependency injection**: Use configuration for external dependencies
- **Error boundaries**: Handle errors at appropriate levels

### 2. Performance
- **Connection reuse**: Reuse DynamoDB clients
- **Batch operations**: Group database operations where possible
- **Efficient queries**: Use GSIs for common access patterns

### 3. Security
- **Input validation**: Validate all user inputs
- **Authentication**: Verify JWT tokens on every request
- **Authorization**: Check user permissions for all operations

### 4. Monitoring
- **Structured logging**: Use consistent log formats
- **Metrics**: Track key performance indicators
- **Health checks**: Monitor service availability

## Troubleshooting

### 1. Local Development Issues
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Reset TypeScript cache
rm -rf dist/
npm run build
```

### 2. AWS Issues
```bash
# Check AWS credentials
aws sts get-caller-identity

# Verify CDK bootstrap
npx cdk bootstrap

# Check CloudWatch logs
aws logs describe-log-groups
```

### 3. Testing Issues
```bash
# Run tests with verbose output
npm test -- --verbose

# Run specific test file
npm test -- timers.test.ts

# Check test coverage
npm run test:coverage
```
