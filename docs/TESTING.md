# Testing Strategy and Implementation

## Overview

Testing is critical for the Bubble Timer backend to ensure reliability, especially for WebSocket functionality and real-time timer synchronization. This document outlines our testing strategy, patterns, and implementation guidelines.

## Testing Pyramid

### 1. Unit Tests (Foundation)
- **Purpose**: Test individual functions in isolation
- **Coverage**: Business logic, utility functions, data transformations
- **Tools**: Jest, TypeScript
- **Location**: `__tests__/` directory

### 2. Integration Tests (Middle Layer)
- **Purpose**: Test component interactions and external service integration
- **Coverage**: DynamoDB operations, API Gateway integration, WebSocket message handling
- **Tools**: Jest with AWS SDK mocks
- **Location**: `__tests__/` directory

### 3. End-to-End Tests (Top Layer)
- **Purpose**: Test complete user workflows and real-world scenarios
- **Coverage**: Full timer lifecycle, sharing workflows, multi-user scenarios
- **Tools**: Jest with realistic test data
- **Location**: `__tests__/` directory

## Test Structure

### File Organization
```
__tests__/
├── api.test.ts           # REST API endpoint tests
├── timers.test.ts        # Timer business logic tests
├── websocket.test.ts     # WebSocket message handling tests
├── connections.test.ts   # Connection management tests
├── auth.test.ts          # Authentication and authorization tests
└── integration.test.ts   # End-to-end workflow tests
```

### Test Naming Convention
```typescript
describe('Timer Operations', () => {
  describe('Given a user owns a timer', () => {
    describe('When updating the timer', () => {
      test('Then the timer should be updated and broadcast to connected users', () => {
        // Test implementation
      });
    });
  });
  
  describe('Given an unauthorized user attempts to update a timer', () => {
    describe('When attempting the update', () => {
      test('Then the operation should be rejected', () => {
        // Test implementation
      });
    });
  });
  
  describe('Given DynamoDB returns an error', () => {
    describe('When updating a timer', () => {
      test('Then the error should be handled gracefully', () => {
        // Test implementation
      });
    });
  });
});
```

## Testing Patterns

### Given/When/Then Pattern

We use the Given/When/Then pattern for all tests to tell a complete story about system behavior. This approach makes tests more readable and serves as documentation of expected behavior.

#### Pattern Structure
```typescript
describe('Given [context/initial state]', () => {
  describe('When [action/event occurs]', () => {
    test('Then [expected outcome]', () => {
      // Test implementation
    });
  });
});
```

#### Benefits
- **Readability**: Tests read like specifications
- **Documentation**: Tests serve as living documentation
- **Clarity**: Clear separation of context, action, and outcome
- **Maintainability**: Easy to understand what's being tested

#### Example: Timer Update Test
```typescript
describe('Given a user owns a timer with 10 minutes remaining', () => {
  const timer = createTestTimer({
    id: 'test-timer',
    user_id: 'test-user',
    remaining_duration: 600
  });
  
  beforeEach(() => {
    mockDynamoClient.send.mockResolvedValue({ Item: timer });
  });
  
  describe('When the user pauses the timer', () => {
    test('Then the timer should be updated with current remaining time', async () => {
      const result = await updateTimer('test-timer', 'test-user', { 
        remaining_duration: 450 
      });
      
      expect(result.remaining_duration).toBe(450);
    });
  });
});
```

### 1. WebSocket Message Testing

#### Mock WebSocket Event
```typescript
const createMockWebSocketEvent = (action: string, data: any, userId: string = 'test-user') => ({
  requestContext: {
    connectionId: 'test-connection-id',
    authorizer: {
      claims: {
        sub: userId,
        'cognito:username': userId
      }
    }
  },
  body: JSON.stringify({
    action,
    ...data
  })
});

// Usage
const event = createMockWebSocketEvent('updateTimer', {
  timerId: 'test-timer-id',
  timer: { name: 'Test Timer', remaining_duration: 300 }
});
```

#### Test Message Broadcasting
```typescript
describe('Given multiple users are connected to WebSocket', () => {
  const mockConnections = [
    { user_id: 'user1', device_id: 'device1', connection_id: 'conn1' },
    { user_id: 'user1', device_id: 'device2', connection_id: 'conn2' },
    { user_id: 'user2', device_id: 'device3', connection_id: 'conn3' }
  ];
  
  beforeEach(() => {
    // Mock DynamoDB query for connections
    mockDynamoClient.send.mockResolvedValueOnce({
      Items: mockConnections
    });
    
    // Mock API Gateway Management API
    mockApiGatewayClient.send.mockResolvedValue({});
  });
  
  describe('When a timer is updated', () => {
    test('Then all connected users should receive the update', async () => {
      // Execute: Call updateTimer
      await updateTimer('timer-id', 'user1', { name: 'Updated Timer' });
      
      // Verify: All connections received the update
      expect(mockApiGatewayClient.send).toHaveBeenCalledTimes(3);
      expect(mockApiGatewayClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            ConnectionId: 'conn1',
            Data: expect.stringContaining('Updated Timer')
          }
        })
      );
    });
  });
});
```

### 2. DynamoDB Testing

#### Mock DynamoDB Client
```typescript
const mockDynamoClient = {
  send: jest.fn()
};

// Mock successful responses
mockDynamoClient.send.mockResolvedValue({
  Item: {
    id: 'test-timer-id',
    user_id: 'test-user-id',
    name: 'Test Timer',
    total_duration: 600,
    remaining_duration: 300
  }
});

// Mock error responses
mockDynamoClient.send.mockRejectedValue(new Error('DynamoDB error'));
```

#### Test DynamoDB Operations
```typescript
describe('Given DynamoDB returns a conditional check failure', () => {
  beforeEach(() => {
    // Mock conditional check failure
    const conditionalCheckError = new Error('ConditionalCheckFailedException');
    conditionalCheckError.name = 'ConditionalCheckFailedException';
    mockDynamoClient.send.mockRejectedValue(conditionalCheckError);
  });
  
  describe('When updating a timer', () => {
    test('Then the operation should be rejected with appropriate error', async () => {
      // Execute & Verify: Should handle gracefully
      await expect(updateTimer('timer-id', 'user-id', { name: 'New Name' }))
        .rejects.toThrow('Timer not found or access denied');
    });
  });
});
```

### 3. Authentication Testing

#### Mock JWT Validation
```typescript
const mockValidToken = 'valid.jwt.token';
const mockInvalidToken = 'invalid.jwt.token';

// Mock JWT verification
jest.mock('aws-jwt-verify', () => ({
  verify: jest.fn((token) => {
    if (token === mockValidToken) {
      return {
        sub: 'test-user-id',
        'cognito:username': 'testuser',
        exp: Math.floor(Date.now() / 1000) + 3600
      };
    }
    throw new Error('Invalid token');
  })
}));
```

#### Test Authorization Scenarios
```typescript
describe('Given a WebSocket request with invalid JWT', () => {
  const event = createMockWebSocketEvent('updateTimer', {
    timerId: 'test-timer-id',
    timer: { name: 'Test Timer' }
  });
  
  beforeEach(() => {
    // Mock invalid token
    event.requestContext.authorizer.claims = null;
  });
  
  describe('When processing the message', () => {
    test('Then the request should be rejected with 401 status', async () => {
      const result = await handleWebSocketMessage(event);
      
      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body)).toEqual({
        error: 'Unauthorized'
      });
    });
  });
});
```

### 4. Error Handling Testing

#### Test Graceful Degradation
```typescript
describe('Given WebSocket broadcast fails but timer update succeeds', () => {
  beforeEach(() => {
    // Mock successful timer update but failed broadcast
    mockDynamoClient.send.mockResolvedValueOnce({}); // Timer update succeeds
    mockApiGatewayClient.send.mockRejectedValue(new Error('Connection failed')); // Broadcast fails
  });
  
  describe('When updating a timer', () => {
    test('Then the operation should complete successfully despite broadcast failure', async () => {
      // Execute: Should not throw error
      await expect(updateTimer('timer-id', 'user-id', { name: 'Updated Timer' }))
        .resolves.not.toThrow();
      
      // Verify: Timer was still updated in database
      expect(mockDynamoClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'BubbleTimerTimersTable'
          })
        })
      );
    });
  });
});
```

## Test Data Management

### Test Data Factories
```typescript
const createTestTimer = (overrides = {}) => ({
  id: 'test-timer-id',
  user_id: 'test-user-id',
  name: 'Test Timer',
  total_duration: 600,
  remaining_duration: 300,
  end_time: new Date(Date.now() + 300000).toISOString(),
  shared_with: new Set(['shared-user']),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides
});

const createTestUser = (overrides = {}) => ({
  id: 'test-user-id',
  username: 'testuser',
  email: 'test@example.com',
  ...overrides
});
```

### Test Database Setup
```typescript
beforeEach(async () => {
  // Clear all mocks
  jest.clearAllMocks();
  
  // Setup default mock responses
  mockDynamoClient.send.mockResolvedValue({});
  mockApiGatewayClient.send.mockResolvedValue({});
});

afterEach(async () => {
  // Clean up any test data
  // Reset mocks to default state
});
```

## Performance Testing

### Load Testing WebSocket Connections
```typescript
describe('Given 100 concurrent WebSocket connection attempts', () => {
  const connectionCount = 100;
  const connections = Array.from({ length: connectionCount }, (_, i) => ({
    connectionId: `conn-${i}`,
    userId: `user-${i % 10}` // 10 users, 10 connections each
  }));
  
  describe('When all connections are established simultaneously', () => {
    test('Then all connections should be handled successfully', async () => {
      // Simulate concurrent connections
      const connectionPromises = connections.map(conn =>
        handleWebSocketConnect({
          requestContext: {
            connectionId: conn.connectionId,
            authorizer: {
              claims: {
                sub: conn.userId,
                'cognito:username': conn.userId
              }
            }
          }
        })
      );
      
      const results = await Promise.all(connectionPromises);
      
      // Verify all connections were handled successfully
      expect(results.every(result => result.statusCode === 200)).toBe(true);
    });
  });
});
```

### Database Performance Testing
```typescript
describe('Given a user has shared timers', () => {
  describe('When querying for shared timers', () => {
    test('Then the query should complete within acceptable time', async () => {
      const startTime = Date.now();
      
      // Execute shared timer query
      await getSharedTimers('test-user-id');
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Verify query completes within acceptable time
      expect(duration).toBeLessThan(1000); // 1 second
      
      // Verify efficient DynamoDB usage
      expect(mockDynamoClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            KeyConditionExpression: 'shared_with_user = :userId'
          })
        })
      );
    });
  });
});
```

## Continuous Integration

### Test Scripts
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --watchAll=false",
    "test:integration": "jest --testPathPattern=integration.test.ts",
    "test:unit": "jest --testPathPattern='(api|timers|websocket|connections|auth).test.ts'"
  }
}
```

### Coverage Requirements
- **Minimum Coverage**: 80% for all source files
- **Critical Paths**: 95% coverage for WebSocket handlers and timer operations
- **Error Handling**: 100% coverage for error scenarios

### Pre-commit Hooks
```bash
#!/bin/bash
# pre-commit hook
npm run build:test
npm run test:coverage

# Check coverage thresholds
if [ $? -ne 0 ]; then
  echo "Tests failed or coverage below threshold"
  exit 1
fi
```

## Debugging Tests

### Common Issues and Solutions

#### 1. Async Test Failures
```typescript
// Problem: Test completes before async operations
it('should update timer', async () => {
  const result = await updateTimer('id', 'user', { name: 'New Name' });
  expect(result).toBeDefined();
});

// Solution: Use proper async/await and wait for promises
it('should update timer', async () => {
  await expect(updateTimer('id', 'user', { name: 'New Name' }))
    .resolves.toBeDefined();
});
```

#### 2. Mock Reset Issues
```typescript
// Problem: Mocks not reset between tests
beforeEach(() => {
  jest.clearAllMocks(); // Clear mock calls and implementations
});

afterEach(() => {
  jest.resetAllMocks(); // Reset to original implementation
});
```

#### 3. DynamoDB Mock Issues
```typescript
// Problem: DynamoDB client not properly mocked
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => mockDynamoClient)
}));

// Ensure mock is available in test scope
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
```

## Best Practices

### 1. Test Isolation
- Each test should be independent
- Use `beforeEach` and `afterEach` for setup/cleanup
- Avoid shared state between tests

### 2. Descriptive Test Names
- Use clear, descriptive test names
- Follow the pattern: "should [expected behavior] when [condition]"
- Group related tests with `describe` blocks

### 3. Mock External Dependencies
- Mock all external services (DynamoDB, API Gateway)
- Test error scenarios with mocked failures
- Verify mock interactions

### 4. Test Real User Scenarios
- Test complete user workflows
- Test error handling and edge cases
- Test performance under load

### 5. Maintain Test Data
- Use factories for consistent test data
- Keep test data realistic but minimal
- Document any special test data requirements
