# Bubble Timer Backend Documentation

This directory contains comprehensive documentation for the Bubble Timer backend project, designed to help developers understand the system architecture, development patterns, and testing strategies.

## Documentation Structure

### Core Documentation
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture, data flows, and component responsibilities
- **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - Common commands, debugging steps, and development patterns
- **[TESTING.md](TESTING.md)** - Testing strategy, patterns, and implementation guidelines
- **[TEST_COVERAGE.md](TEST_COVERAGE.md)** - Test coverage configuration, reporting, and improvement strategies
- **[FEATURE_EXTENSION_PATTERNS.md](FEATURE_EXTENSION_PATTERNS.md)** - Guidelines for extending the system with new features

## Quick Start

### For New Developers
1. Start with **[ARCHITECTURE.md](ARCHITECTURE.md)** to understand the system design
2. Review **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** for common development tasks
3. Read **[TESTING.md](TESTING.md)** to understand testing requirements and patterns
4. Check **[FEATURE_EXTENSION_PATTERNS.md](FEATURE_EXTENSION_PATTERNS.md)** before adding new features

### For Specific Tasks
- **Adding new features**: See [FEATURE_EXTENSION_PATTERNS.md](FEATURE_EXTENSION_PATTERNS.md)
- **Debugging issues**: See [QUICK_REFERENCE.md](QUICK_REFERENCE.md)
- **Writing tests**: See [TESTING.md](TESTING.md)
- **Understanding data flows**: See [ARCHITECTURE.md](ARCHITECTURE.md)

## Development Guidelines

### Before Making Changes
1. **Read the documentation** - Understand the current architecture and patterns
2. **Run tests** - Ensure you have a clean baseline: `npm run build:test`
3. **Follow incremental development** - Make small, testable changes
4. **Write tests first** - Use TDD approach for new functionality

### Testing Requirements
- **Unit tests** for all business logic
- **Integration tests** for AWS service interactions
- **End-to-end tests** for complete user workflows
- **Performance tests** for critical paths

### Code Quality Standards
- **TypeScript** for type safety
- **Comprehensive error handling** for all operations
- **Proper logging** for debugging and monitoring
- **Security validation** for all inputs

## Key Architecture Concepts

### Data Flow
```
Client → API Gateway → Lambda → DynamoDB
                ↓
            WebSocket → Real-time Updates
```

### Core Components
- **REST API**: Timer management endpoints
- **WebSocket API**: Real-time timer updates and sharing
- **DynamoDB**: Scalable timer storage
- **Cognito**: User authentication and authorization

### Security Model
- **JWT tokens** for authentication
- **Resource ownership** for authorization
- **Input validation** for all operations
- **HTTPS enforcement** for all communications

## Common Patterns

### WebSocket Message Handling
```typescript
// Standard pattern for WebSocket messages
export async function handleWebSocketMessage(event: any): Promise<any> {
  const { action, ...data } = JSON.parse(event.body);
  
  switch (action) {
    case 'updateTimer':
      return await handleUpdateTimer(data);
    case 'stopTimer':
      return await handleStopTimer(data);
    default:
      return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };
  }
}
```

### DynamoDB Operations
```typescript
// Standard pattern for DynamoDB operations
export async function getTimer(timerId: string, userId: string): Promise<any> {
  const command = new GetCommand({
    TableName: process.env.TIMERS_TABLE,
    Key: { id: timerId, user_id: userId }
  });
  
  const result = await dynamoClient.send(command);
  return result.Item;
}
```

### Error Handling
```typescript
// Standard pattern for error handling
try {
  const result = await businessLogic();
  return { statusCode: 200, body: JSON.stringify(result) };
} catch (error) {
  console.error('Error:', error);
  return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
}
```

## Testing Patterns

### WebSocket Testing
```typescript
// Test WebSocket message handling
const mockEvent = {
  requestContext: {
    connectionId: 'test-connection-id',
    authorizer: { claims: { sub: 'test-user-id' } }
  },
  body: JSON.stringify({ action: 'updateTimer', timerId: 'test-id' })
};

const result = await handleWebSocketMessage(mockEvent);
expect(result.statusCode).toBe(200);
```

### DynamoDB Testing
```typescript
// Mock DynamoDB client
const mockDynamoClient = { send: jest.fn() };
mockDynamoClient.send.mockResolvedValue({
  Item: { id: 'test-id', user_id: 'test-user' }
});
```

## Performance Considerations

### DynamoDB Optimization
- Use **Query operations** instead of Scans
- Design **efficient indexes** for access patterns
- Implement **batch operations** to reduce round trips

### WebSocket Efficiency
- **Reuse connections** when possible
- **Batch messages** for related updates
- **Handle failures gracefully** without breaking operations

### Lambda Optimization
- Keep functions **lightweight** to minimize cold starts
- **Reuse connections** to external services
- **Optimize memory allocation** for specific workloads

## Monitoring and Debugging

### CloudWatch Metrics
- **API Gateway**: Request counts, latency, error rates
- **Lambda**: Invocation counts, duration, error rates
- **DynamoDB**: Read/write capacity, throttling events

### Logging Best Practices
- Use **structured logging** (JSON format)
- Include **correlation IDs** for request tracking
- Log **error context** for debugging
- Avoid logging **sensitive information**

## Deployment Safety

### Never Deploy Without
- [ ] All tests passing locally
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Performance validation
- [ ] Security review

### Rollback Strategy
- **Infrastructure**: Use CDK for easy rollback
- **Application**: Maintain backward compatibility
- **Database**: Use additive schema changes
- **Monitoring**: Watch for issues after deployment

## Getting Help

### When Stuck
1. **Check the documentation** - Most common issues are covered
2. **Run tests** - Verify the current state and identify issues
3. **Check logs** - Use CloudWatch for debugging
4. **Review recent changes** - Look for recent modifications that might cause issues

### Common Issues
- **WebSocket connection failures**: Check connection limits and cleanup
- **DynamoDB throttling**: Monitor capacity and optimize queries
- **Authentication errors**: Verify JWT tokens and Cognito configuration
- **Performance issues**: Check Lambda memory and DynamoDB indexes

## Contributing

### Documentation Updates
- Keep documentation **up to date** with code changes
- Add **examples** for new patterns
- Update **quick reference** for common tasks
- Document **decisions** and **rationale**

### Code Changes
- Follow **established patterns**
- Add **comprehensive tests**
- Update **relevant documentation**
- Ensure **backward compatibility**
