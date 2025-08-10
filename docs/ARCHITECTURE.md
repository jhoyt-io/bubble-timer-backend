# Bubble Timer Backend Architecture

## System Overview

The Bubble Timer backend is a serverless AWS-based system that provides real-time timer synchronization and sharing capabilities for the Android frontend. The architecture follows a microservices pattern with clear separation of concerns.

## Core Components

### 1. Infrastructure (CDK Stacks)
- **BackendStack**: Main application stack with API Gateway, Lambda functions, and DynamoDB tables
- **BubbleTimerUsersStack**: Cognito user management and authentication
- **BubbleTimerDNSStack**: Domain and routing configuration
- **BubbleTimerPipelineStack**: CI/CD pipeline infrastructure

### 2. Data Layer
- **Timers Table**: Stores timer data with GSI for user-based queries
- **UserConnections Table**: Tracks WebSocket connections per user/device
- **SharedTimers Table**: Manages timer sharing relationships

### 3. Service Layer
- **TimerService**: CRUD operations for timers and sharing
- **ConnectionService**: WebSocket connection management
- **WebSocketHandler**: Real-time message routing and broadcasting

## Data Flow Patterns

### Timer Operations
```
Frontend → API Gateway → Lambda → DynamoDB
                ↓
        WebSocket Broadcast → Connected Clients
```

### WebSocket Communication
```
Client Connect → Store Connection → Ready for Messages
Client Message → Route by Type → Process → Broadcast
Client Disconnect → Clean Connection → Update State
```

## Key Architectural Decisions

### 1. Serverless-First Approach
- **Lambda functions** for compute with automatic scaling
- **API Gateway** for HTTP and WebSocket endpoints
- **DynamoDB** for data persistence with on-demand billing
- **Cognito** for user authentication and management

### 2. Real-Time Synchronization
- **WebSocket connections** maintained per user/device
- **Connection tracking** in DynamoDB for reliability
- **Broadcast patterns** for timer updates across shared users
- **Fire-and-forget** messaging for performance

### 3. Data Consistency
- **Eventual consistency** model with DynamoDB
- **Optimistic updates** with conflict resolution
- **Connection state** managed per device for multi-device support

## Message Formats

### WebSocket Messages
```typescript
// Timer Update
{
  type: 'timer',
  action: 'update',
  timer: {
    id: string,
    userId: string,
    name: string,
    totalDuration: string,
    remainingDuration?: string,
    endTime?: string
  }
}

// Timer Stop
{
  type: 'timer',
  action: 'stop',
  timerId: string  // Direct timerId, not nested
}

// Timer Sharing
{
  type: 'share',
  action: 'add' | 'remove',
  timerId: string,
  sharedWithUser: string
}
```

### API Endpoints
- `GET /timers` - List user's timers
- `POST /timers` - Create timer
- `PUT /timers/{timerId}` - Update timer
- `DELETE /timers/{timerId}` - Delete timer
- `GET /timers/shared` - List shared timers
- `POST /timers/{timerId}/share` - Share timer
- `DELETE /timers/{timerId}/share` - Unshare timer

## Error Handling Strategy

### 1. Graceful Degradation
- **Connection failures** don't break timer operations
- **Partial failures** handled with retry logic
- **Invalid messages** logged and ignored

### 2. Monitoring and Observability
- **Structured logging** with correlation IDs
- **Performance metrics** for all operations
- **Health checks** for critical services
- **Error tracking** with severity levels

### 3. Recovery Patterns
- **Connection cleanup** on any failure
- **State reconciliation** on reconnection
- **Message queuing** for offline scenarios

## Security Model

### 1. Authentication
- **Cognito JWT tokens** for API access
- **WebSocket authentication** via query parameters
- **Token validation** on every request

### 2. Authorization
- **User-based access** to timer resources
- **Sharing permissions** managed explicitly
- **Device isolation** for connection management

### 3. Data Protection
- **Encryption at rest** with DynamoDB
- **HTTPS/WSS** for all communications
- **Input validation** on all endpoints

## Performance Considerations

### 1. Scalability
- **Auto-scaling** Lambda functions
- **Connection pooling** for DynamoDB
- **Efficient queries** using GSIs

### 2. Latency Optimization
- **Connection reuse** for WebSocket clients
- **Batch operations** where possible
- **Caching strategies** for frequently accessed data

### 3. Cost Optimization
- **On-demand billing** for DynamoDB
- **Efficient Lambda** execution times
- **Connection limits** to prevent abuse

## Integration Points

### Frontend Integration
- **WebSocket endpoint** for real-time updates
- **REST API** for CRUD operations
- **Authentication flow** via Cognito

### External Services
- **CloudWatch** for monitoring and logging
- **X-Ray** for distributed tracing (future)
- **SNS/SQS** for async processing (future)

## Deployment Architecture

### Environment Strategy
- **Development**: Local testing with DynamoDB Local
- **Staging**: Full AWS stack for integration testing
- **Production**: Multi-region deployment (future)

### Infrastructure as Code
- **CDK** for all AWS resources
- **Version-controlled** infrastructure
- **Automated deployment** via pipeline

## Future Considerations

### 1. Scalability Enhancements
- **Multi-region** deployment for global users
- **Read replicas** for improved query performance
- **Connection clustering** for high availability

### 2. Feature Extensions
- **Push notifications** for timer events
- **Offline support** with message queuing
- **Analytics** and usage tracking

### 3. Operational Improvements
- **Automated testing** for infrastructure changes
- **Blue-green deployments** for zero downtime
- **Advanced monitoring** with custom dashboards
