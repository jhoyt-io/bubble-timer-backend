# Quick Reference Guide

## Development Commands

### Setup and Installation
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Watch mode for development
npm run watch
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Build and test
npm run build:test

# Run specific test file
npm test -- api.test.ts
npm test -- websocket.test.ts
npm test -- timers.test.ts
```

### CDK Commands
```bash
# Synthesize CloudFormation template
cdk synth

# Deploy to AWS (NEVER run without permission)
cdk deploy

# Deploy specific stack
cdk deploy BubbleTimerBackendStack

# Destroy infrastructure (NEVER run without permission)
cdk destroy

# List stacks
cdk list
```

### Local Development
```bash
# Start local development server (if available)
npm run dev

# Run linting
npm run lint

# Type checking
npx tsc --noEmit
```

## Debugging Commands

### Test Debugging
```bash
# Run tests with verbose output
npm test -- --verbose

# Run single test with debug output
npm test -- --testNamePattern="specific test name"

# Run tests with Node.js debugger
node --inspect-brk node_modules/.bin/jest --runInBand
```

### CDK Debugging
```bash
# Synthesize with debug output
cdk synth --debug

# Deploy with debug output
cdk deploy --debug

# Check CDK context
cdk context
```

### AWS CLI Debugging
```bash
# Check DynamoDB tables
aws dynamodb list-tables

# Scan DynamoDB table
aws dynamodb scan --table-name BubbleTimerTimersTable

# Check API Gateway APIs
aws apigateway get-rest-apis
aws apigatewayv2 get-apis

# Check Lambda functions
aws lambda list-functions
```

## Common Patterns

### WebSocket Message Testing
```typescript
// Test WebSocket message handling
const mockEvent = {
  requestContext: {
    connectionId: 'test-connection-id',
    authorizer: {
      claims: {
        sub: 'test-user-id',
        'cognito:username': 'testuser'
      }
    }
  },
  body: JSON.stringify({
    action: 'updateTimer',
    timerId: 'test-timer-id',
    timer: {
      name: 'Test Timer',
      remaining_duration: 300
    }
  })
};
```

### DynamoDB Testing
```typescript
// Mock DynamoDB client
const mockDynamoClient = {
  send: jest.fn()
};

// Test DynamoDB operations
const mockGetItemResponse = {
  Item: {
    id: 'test-timer-id',
    user_id: 'test-user-id',
    name: 'Test Timer',
    total_duration: 600,
    remaining_duration: 300
  }
};
```

### JWT Token Testing
```typescript
// Mock JWT token
const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

// Test token validation
const mockClaims = {
  sub: 'test-user-id',
  'cognito:username': 'testuser',
  exp: Math.floor(Date.now() / 1000) + 3600
};
```

## Error Codes and Meanings

### HTTP Status Codes
- `200 OK` - Successful operation
- `400 Bad Request` - Invalid input data
- `401 Unauthorized` - Invalid or missing JWT token
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource doesn't exist
- `500 Internal Server Error` - Unexpected server error

### WebSocket Error Codes
- `1000` - Normal closure
- `1001` - Going away
- `1002` - Protocol error
- `1003` - Unsupported data
- `1006` - Abnormal closure
- `1011` - Internal error

### DynamoDB Error Codes
- `ConditionalCheckFailedException` - Conditional write failed
- `ResourceNotFoundException` - Table doesn't exist
- `ProvisionedThroughputExceededException` - Rate limit exceeded
- `ValidationException` - Invalid request parameters

## Testing Strategies

### Unit Testing
- Test individual functions in isolation
- Mock external dependencies (DynamoDB, API Gateway)
- Test error scenarios and edge cases
- Verify input validation and authorization

### Integration Testing
- Test complete API flows
- Test WebSocket message handling
- Test DynamoDB operations with real data
- Test authentication and authorization flows

### End-to-End Testing
- Test complete user workflows
- Test timer sharing across multiple users
- Test WebSocket broadcasting
- Test error handling and recovery

## Performance Monitoring

### CloudWatch Metrics to Watch
- `ApiGateway4XXError` - Client errors
- `ApiGateway5XXError` - Server errors
- `LambdaDuration` - Function execution time
- `DynamoDBConsumedReadCapacityUnits` - Database read usage
- `DynamoDBConsumedWriteCapacityUnits` - Database write usage

### Log Analysis
```bash
# View recent logs
aws logs tail /aws/lambda/BubbleTimerWebSocketHandler --follow

# Search for errors
aws logs filter-log-events --log-group-name /aws/lambda/BubbleTimerWebSocketHandler --filter-pattern "ERROR"
```

## Security Checklist

### Authentication
- [ ] JWT tokens are properly validated
- [ ] User context is extracted from tokens
- [ ] Expired tokens are rejected
- [ ] Invalid tokens are rejected

### Authorization
- [ ] Users can only access their own timers
- [ ] Shared timer access is properly checked
- [ ] Permission checks are performed before operations
- [ ] Resource ownership is verified

### Input Validation
- [ ] All inputs are validated
- [ ] Malicious input is rejected
- [ ] Data types are checked
- [ ] Required fields are present

### Data Protection
- [ ] Sensitive data is not logged
- [ ] Database queries are parameterized
- [ ] Error messages don't leak sensitive information
- [ ] HTTPS is enforced for all communications
