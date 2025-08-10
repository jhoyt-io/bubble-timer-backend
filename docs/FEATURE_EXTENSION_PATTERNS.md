# Feature Extension Patterns

## Overview

This document provides patterns and guidelines for extending the Bubble Timer backend with new features while maintaining consistency, reliability, and testability.

## Core Extension Principles

### 1. Incremental Development
- **Small Changes**: Make small, testable changes rather than large rewrites
- **Test First**: Write tests before implementing features
- **Continuous Integration**: Ensure all tests pass after each change
- **Rollback Ready**: Each change should be easily reversible

### 2. Backward Compatibility
- **API Stability**: Maintain existing API contracts
- **Message Format Preservation**: Don't change WebSocket message formats without coordination
- **Database Schema Evolution**: Use additive changes when possible
- **Graceful Degradation**: Handle missing fields or new optional features

### 3. Testing Requirements
- **Unit Tests**: Test new business logic in isolation
- **Integration Tests**: Test interactions with existing components
- **End-to-End Tests**: Test complete user workflows
- **Error Scenarios**: Test failure modes and edge cases

## Adding New WebSocket Message Types

### Pattern: New Timer Action

#### 1. Define Message Structure
```typescript
// In lib/backend/types.ts
export interface TimerAction {
  action: 'updateTimer' | 'stopTimer' | 'shareTimer' | 'newAction';
  timerId: string;
  // ... other fields
}

export interface NewActionMessage {
  action: 'newAction';
  timerId: string;
  newField: string;
  optionalField?: number;
}
```

#### 2. Add Handler Function
```typescript
// In lib/backend/timers.ts
export async function handleNewAction(
  timerId: string,
  userId: string,
  data: NewActionMessage
): Promise<void> {
  // 1. Validate input
  if (!data.newField) {
    throw new Error('newField is required');
  }
  
  // 2. Check permissions
  const timer = await getTimer(timerId, userId);
  if (!timer) {
    throw new Error('Timer not found or access denied');
  }
  
  // 3. Perform business logic
  const updatedTimer = {
    ...timer,
    newField: data.newField,
    updated_at: new Date().toISOString()
  };
  
  // 4. Update database
  await updateTimerInDatabase(timerId, updatedTimer);
  
  // 5. Broadcast to connected users
  await broadcastTimerUpdate(timerId, updatedTimer);
}
```

#### 3. Update WebSocket Handler
```typescript
// In lib/backend/websocket.ts
export async function handleWebSocketMessage(event: any): Promise<any> {
  const { action, ...data } = JSON.parse(event.body);
  
  switch (action) {
    case 'updateTimer':
      return await handleUpdateTimer(data);
    case 'stopTimer':
      return await handleStopTimer(data);
    case 'newAction':
      return await handleNewAction(data.timerId, event.requestContext.authorizer.claims.sub, data);
    default:
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Unknown action' })
      };
  }
}
```

#### 4. Add Tests
```typescript
// In __tests__/timers.test.ts
describe('handleNewAction', () => {
  describe('Given a user owns a timer', () => {
    const timerId = 'test-timer-id';
    const userId = 'test-user-id';
    const data = { newField: 'test-value' };
    
    beforeEach(() => {
      // Mock dependencies
      mockDynamoClient.send.mockResolvedValueOnce({
        Item: createTestTimer({ id: timerId, user_id: userId })
      });
    });
    
    describe('When processing a new action', () => {
      test('Then the action should be processed and broadcast to users', async () => {
        // Execute
        await handleNewAction(timerId, userId, data);
        
        // Verify
        expect(mockDynamoClient.send).toHaveBeenCalledWith(
          expect.objectContaining({
            input: expect.objectContaining({
              Item: expect.objectContaining({
                newField: 'test-value'
              })
            })
          })
        );
      });
    });
  });
  
  describe('Given an unauthorized user attempts to perform an action', () => {
    const timerId = 'test-timer-id';
    const userId = 'unauthorized-user';
    const data = { newField: 'test-value' };
    
    beforeEach(() => {
      // Mock no access
      mockDynamoClient.send.mockResolvedValueOnce({});
    });
    
    describe('When attempting the action', () => {
      test('Then the operation should be rejected', async () => {
        // Execute & Verify
        await expect(handleNewAction(timerId, userId, data))
          .rejects.toThrow('Timer not found or access denied');
      });
    });
  });
});
```

## Adding New REST API Endpoints

### Pattern: New Timer Resource

#### 1. Define API Structure
```typescript
// In lib/backend/api.ts
export interface NewTimerResource {
  id: string;
  name: string;
  category: string;
  created_at: string;
  updated_at: string;
}

export async function getNewTimerResource(
  resourceId: string,
  userId: string
): Promise<NewTimerResource> {
  // Implementation
}
```

#### 2. Add Lambda Handler
```typescript
// In lib/lambda/new-resource-handler.ts
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // 1. Extract and validate JWT
    const token = event.headers.Authorization?.replace('Bearer ', '');
    if (!token) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }
    
    const claims = await verifyJWT(token);
    const userId = claims.sub;
    
    // 2. Extract path parameters
    const resourceId = event.pathParameters?.resourceId;
    if (!resourceId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Resource ID required' })
      };
    }
    
    // 3. Call business logic
    const resource = await getNewTimerResource(resourceId, userId);
    
    // 4. Return response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(resource)
    };
  } catch (error) {
    console.error('Error in new resource handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
```

#### 3. Update CDK Infrastructure
```typescript
// In lib/bubble-timer-backend-stack.api.ts
export class BubbleTimerBackendStackApi extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    
    // Add new Lambda function
    const newResourceHandler = new lambda.Function(this, 'NewResourceHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'new-resource-handler.handler',
      code: lambda.Code.fromAsset('lib/lambda'),
      environment: {
        TIMERS_TABLE: timersTable.tableName,
        // ... other environment variables
      }
    });
    
    // Grant permissions
    timersTable.grantReadData(newResourceHandler);
    
    // Add API Gateway route
    const newResourceResource = api.root.addResource('new-resource');
    const newResourceWithId = newResourceResource.addResource('{resourceId}');
    
    newResourceWithId.addMethod('GET', new apigw.LambdaIntegration(newResourceHandler), {
      authorizer: cognitoAuthorizer
    });
  }
}
```

#### 4. Add Tests
```typescript
// In __tests__/api.test.ts
describe('GET /new-resource/{resourceId}', () => {
  describe('Given an authorized user requests a resource', () => {
    const event = {
      pathParameters: { resourceId: 'test-resource-id' },
      headers: { Authorization: 'Bearer valid-token' }
    };
    
    beforeEach(() => {
      // Mock JWT verification
      mockJWTVerify.mockResolvedValue({
        sub: 'test-user-id',
        'cognito:username': 'testuser'
      });
      
      // Mock business logic
      mockGetNewTimerResource.mockResolvedValue({
        id: 'test-resource-id',
        name: 'Test Resource',
        category: 'test'
      });
    });
    
    describe('When the request is processed', () => {
      test('Then the resource should be returned with 200 status', async () => {
        // Execute
        const result = await handler(event);
        
        // Verify
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body)).toEqual({
          id: 'test-resource-id',
          name: 'Test Resource',
          category: 'test'
        });
      });
    });
  });
});
```

## Adding New Database Tables

### Pattern: New Entity Table

#### 1. Define Table Schema
```typescript
// In lib/bubble-timer-backend-stack.ts
const newEntityTable = new dynamodb.Table(this, 'NewEntityTable', {
  partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.DESTROY,
  timeToLiveAttribute: 'ttl'
});

// Add GSI for user-based queries
newEntityTable.addGlobalSecondaryIndex({
  indexName: 'UserIndex',
  partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'created_at', type: dynamodb.AttributeType.STRING }
});
```

#### 2. Create Data Access Layer
```typescript
// In lib/backend/new-entity.ts
export interface NewEntity {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  ttl?: number;
}

export async function createNewEntity(entity: NewEntity): Promise<void> {
  const command = new PutCommand({
    TableName: process.env.NEW_ENTITY_TABLE,
    Item: {
      ...entity,
      ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
    }
  });
  
  await dynamoClient.send(command);
}

export async function getNewEntityById(id: string, userId: string): Promise<NewEntity | null> {
  const command = new GetCommand({
    TableName: process.env.NEW_ENTITY_TABLE,
    Key: { id, user_id: userId }
  });
  
  const result = await dynamoClient.send(command);
  return result.Item as NewEntity || null;
}

export async function getNewEntitiesByUser(userId: string): Promise<NewEntity[]> {
  const command = new QueryCommand({
    TableName: process.env.NEW_ENTITY_TABLE,
    IndexName: 'UserIndex',
    KeyConditionExpression: 'user_id = :userId',
    ExpressionAttributeValues: { ':userId': userId },
    ScanIndexForward: false // Most recent first
  });
  
  const result = await dynamoClient.send(command);
  return result.Items as NewEntity[] || [];
}
```

#### 3. Add Tests
```typescript
// In __tests__/new-entity.test.ts
describe('NewEntity Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Given a new entity to create', () => {
    const entity: NewEntity = {
      id: 'test-id',
      user_id: 'test-user',
      name: 'Test Entity',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    beforeEach(() => {
      // Mock successful creation
      mockDynamoClient.send.mockResolvedValueOnce({});
    });
    
    describe('When creating the entity', () => {
      test('Then the entity should be stored in DynamoDB', async () => {
        // Execute
        await createNewEntity(entity);
        
        // Verify
        expect(mockDynamoClient.send).toHaveBeenCalledWith(
          expect.objectContaining({
            input: expect.objectContaining({
              TableName: 'NewEntityTable',
              Item: expect.objectContaining({
                id: 'test-id',
                user_id: 'test-user',
                name: 'Test Entity'
              })
            })
          })
        );
      });
    });
  });
  
  describe('Given a user has multiple entities', () => {
    const mockEntities = [
      { id: '1', user_id: 'user1', name: 'Entity 1' },
      { id: '2', user_id: 'user1', name: 'Entity 2' }
    ];
    
    beforeEach(() => {
      mockDynamoClient.send.mockResolvedValueOnce({
        Items: mockEntities
      });
    });
    
    describe('When querying entities by user', () => {
      test('Then all user entities should be returned', async () => {
        // Execute
        const result = await getNewEntitiesByUser('user1');
        
        // Verify
        expect(result).toEqual(mockEntities);
        expect(mockDynamoClient.send).toHaveBeenCalledWith(
          expect.objectContaining({
            input: expect.objectContaining({
              IndexName: 'UserIndex',
              KeyConditionExpression: 'user_id = :userId'
            })
          })
        );
      });
    });
  });
});
```

## Adding New Authentication Patterns

### Pattern: Custom Authorization

#### 1. Define Authorization Logic
```typescript
// In lib/backend/auth.ts
export interface AuthorizationContext {
  userId: string;
  username: string;
  groups: string[];
  permissions: string[];
}

export async function checkPermission(
  context: AuthorizationContext,
  resource: string,
  action: string
): Promise<boolean> {
  // Custom authorization logic
  const requiredPermission = `${resource}:${action}`;
  return context.permissions.includes(requiredPermission);
}

export async function authorizeTimerAccess(
  context: AuthorizationContext,
  timerId: string
): Promise<boolean> {
  // Check if user owns timer or has shared access
  const timer = await getTimer(timerId, context.userId);
  return timer !== null;
}
```

#### 2. Integrate with Existing Handlers
```typescript
// In lib/backend/timers.ts
export async function updateTimerWithAuth(
  timerId: string,
  context: AuthorizationContext,
  updates: any
): Promise<void> {
  // Check authorization
  const hasAccess = await authorizeTimerAccess(context, timerId);
  if (!hasAccess) {
    throw new Error('Access denied');
  }
  
  // Check specific permission
  const canUpdate = await checkPermission(context, 'timer', 'update');
  if (!canUpdate) {
    throw new Error('Insufficient permissions');
  }
  
  // Proceed with update
  await updateTimer(timerId, context.userId, updates);
}
```

## Error Handling Patterns

### Pattern: Consistent Error Responses

#### 1. Define Error Types
```typescript
// In lib/backend/errors.ts
export class TimerError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'TIMER_ERROR'
  ) {
    super(message);
    this.name = 'TimerError';
  }
}

export class AuthorizationError extends TimerError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class ValidationError extends TimerError {
  constructor(message: string = 'Invalid input') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}
```

#### 2. Error Handling Middleware
```typescript
// In lib/backend/middleware.ts
export function withErrorHandling<T extends any[], R>(
  handler: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof TimerError) {
        throw error;
      }
      
      console.error('Unexpected error:', error);
      throw new TimerError('Internal server error', 500);
    }
  };
}

// Usage
export const updateTimerWithErrorHandling = withErrorHandling(updateTimer);
```

## Performance Optimization Patterns

### Pattern: Caching Layer

#### 1. Implement Caching
```typescript
// In lib/backend/cache.ts
export class TimerCache {
  private cache = new Map<string, { data: any; expires: number }>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes
  
  set(key: string, data: any): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + this.TTL
    });
  }
  
  get(key: string): any | null {
    const item = this.cache.get(key);
    if (!item || item.expires < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }
  
  clear(): void {
    this.cache.clear();
  }
}

export const timerCache = new TimerCache();
```

#### 2. Integrate with Business Logic
```typescript
// In lib/backend/timers.ts
export async function getTimerWithCache(timerId: string, userId: string): Promise<any> {
  const cacheKey = `timer:${timerId}:${userId}`;
  
  // Check cache first
  const cached = timerCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Fetch from database
  const timer = await getTimer(timerId, userId);
  if (timer) {
    timerCache.set(cacheKey, timer);
  }
  
  return timer;
}
```

## Testing Patterns for Extensions

### Pattern: Comprehensive Test Coverage

#### 1. Unit Tests for New Features
```typescript
// Test business logic in isolation
describe('NewFeature', () => {
  describe('Given valid input data', () => {
    describe('When processing the input', () => {
      test('Then the result should be correct', async () => {
        // Test happy path
      });
    });
  });
  
  describe('Given invalid input data', () => {
    describe('When processing the input', () => {
      test('Then the error should be handled gracefully', async () => {
        // Test error cases
      });
    });
  });
  
  describe('Given an unauthorized user', () => {
    describe('When attempting the operation', () => {
      test('Then the operation should be rejected', async () => {
        // Test security
      });
    });
  });
});
```

#### 2. Integration Tests
```typescript
// Test component interactions
describe('NewFeature Integration', () => {
  describe('Given existing timer operations are running', () => {
    describe('When the new feature is used', () => {
      test('Then it should integrate seamlessly', async () => {
        // Test integration with existing code
      });
    });
  });
  
  describe('Given database errors occur', () => {
    describe('When using the new feature', () => {
      test('Then errors should be handled gracefully', async () => {
        // Test error scenarios
      });
    });
  });
});
```

#### 3. End-to-End Tests
```typescript
// Test complete workflows
describe('NewFeature E2E', () => {
  describe('Given a complete user workflow', () => {
    describe('When the user performs all steps', () => {
      test('Then the workflow should complete successfully', async () => {
        // Test full user journey
      });
    });
  });
  
  describe('Given multiple concurrent users', () => {
    describe('When all users use the feature simultaneously', () => {
      test('Then all operations should complete correctly', async () => {
        // Test concurrency
      });
    });
  });
});
```

## Best Practices Summary

### 1. Development Process
- Write tests first (TDD approach)
- Make small, incremental changes
- Ensure all tests pass before proceeding
- Document new patterns and decisions

### 2. Code Quality
- Follow existing naming conventions
- Use TypeScript for type safety
- Implement proper error handling
- Add comprehensive logging

### 3. Security
- Validate all inputs
- Check authorization for all operations
- Use parameterized queries
- Don't expose sensitive information

### 4. Performance
- Use efficient database queries
- Implement caching where appropriate
- Monitor performance metrics
- Handle errors gracefully

### 5. Testing
- Maintain high test coverage
- Test error scenarios
- Use realistic test data
- Test integration points
