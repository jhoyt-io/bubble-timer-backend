# Bubble Timer Backend Architecture

## Overview

The Bubble Timer backend is a serverless application built on AWS using CDK, providing real-time timer management and sharing capabilities through REST APIs and WebSocket connections.

## Core Components

### 1. Infrastructure (CDK Stacks)

#### `bubble-timer-backend-stack.ts`
- **Purpose**: Main infrastructure stack
- **Components**: 
  - DynamoDB tables for timer storage
  - Cognito User Pool for authentication
  - IAM roles and policies
  - CloudWatch logging

#### `bubble-timer-backend-stack.api.ts`
- **Purpose**: REST API infrastructure
- **Components**:
  - API Gateway REST API
  - Lambda functions for timer CRUD operations
  - Cognito authorizer integration
  - CORS configuration

#### `bubble-timer-backend-stack.websocket.ts`
- **Purpose**: WebSocket API infrastructure
- **Components**:
  - API Gateway WebSocket API
  - Lambda functions for WebSocket message handling
  - DynamoDB table for connection management
  - Route handlers for different message types

### 2. Data Layer

#### DynamoDB Tables

**Timers Table**
```
Partition Key: id (String)
Attributes:
- user_id (String) - Timer owner
- name (String) - Timer name
- total_duration (Number) - Total duration in seconds
- remaining_duration (Number) - Remaining time when paused
- end_time (String) - Expected end time (ISO 8601)
- shared_with (StringSet) - Set of usernames timer is shared with
- created_at (String) - Creation timestamp
- updated_at (String) - Last update timestamp
```

**Shared Timers Table**
```
Partition Key: shared_with_user (String)
Sort Key: timer_id (String)
Attributes:
- created_at (String) - When relationship was created
```

**User Connections Table**
```
Partition Key: user_id (String)
Sort Key: device_id (String)
Attributes:
- connection_id (String) - WebSocket connection ID
- created_at (String) - Connection timestamp
```

### 3. API Layer

#### REST API Endpoints

**Timer Management**
- `GET /timers/{timerId}` - Retrieve a specific timer
- `POST /timers/{timerId}` - Update a timer
- `DELETE /timers/{timerId}` - Delete a timer

**Shared Timers**
- `GET /timers/shared` - Get all timers shared with authenticated user

#### WebSocket API Routes

**Connection Management**
- `$connect` - Handle new WebSocket connections
- `$disconnect` - Handle WebSocket disconnections

**Timer Operations**
- `updateTimer` - Update timer state and broadcast to connected users
- `stopTimer` - Stop a timer and broadcast to connected users
- `shareTimer` - Share a timer with another user

### 4. Business Logic Layer

#### Timer Operations (`lib/backend/timers.ts`)

**Core Functions**
- `getTimer(timerId, userId)` - Retrieve timer with authorization check
- `updateTimer(timerId, userId, updates)` - Update timer and broadcast changes
- `stopTimer(timerId, userId)` - Stop timer and broadcast to all connected users
- `shareTimer(timerId, userId, targetUser)` - Share timer with another user

**Authorization Logic**
- Users can only access their own timers or timers shared with them
- Shared timer access is checked via DynamoDB queries
- JWT tokens are validated for all operations

#### WebSocket Management (`lib/backend/connections.ts`)

**Connection Tracking**
- Store active WebSocket connections in DynamoDB
- Track multiple device connections per user
- Clean up stale connections on disconnect

**Message Broadcasting**
- Send updates to all connected devices for a user
- Handle connection failures gracefully
- Support real-time timer synchronization

## Data Flow Patterns

### 1. Timer Update Flow
```
1. Client sends updateTimer WebSocket message
2. Lambda validates JWT and user permissions
3. DynamoDB timer record is updated
4. All connected devices for timer owner receive update
5. If timer is shared, connected devices for shared users receive update
```

### 2. Timer Sharing Flow
```
1. Client sends shareTimer WebSocket message
2. Lambda validates permissions and target user exists
3. Shared timer relationship is created in DynamoDB
4. Target user's connected devices receive new timer notification
```

### 3. Connection Management Flow
```
1. User connects via WebSocket
2. Connection ID is stored in DynamoDB with user/device mapping
3. User receives current timer state
4. On disconnect, connection record is cleaned up
```

## Security Model

### Authentication
- **Cognito JWT Tokens**: All API requests require valid JWT
- **Token Validation**: AWS JWT verify library for token validation
- **User Context**: User ID extracted from JWT for authorization

### Authorization
- **Resource Ownership**: Users can only access their own timers
- **Shared Access**: Users can access timers shared with them
- **Permission Checks**: DynamoDB queries verify access rights

### Data Protection
- **Encryption**: DynamoDB encryption at rest
- **Network Security**: API Gateway HTTPS enforcement
- **Input Validation**: All inputs validated before processing

## Performance Considerations

### DynamoDB Optimization
- **Efficient Queries**: Use Query operations instead of Scans
- **Index Design**: Optimized for user-based access patterns
- **Batch Operations**: Minimize round trips to DynamoDB

### WebSocket Efficiency
- **Connection Pooling**: Reuse connections when possible
- **Message Batching**: Group related updates when feasible
- **Error Handling**: Graceful degradation for connection failures

### Lambda Optimization
- **Cold Start Mitigation**: Keep functions lightweight
- **Connection Reuse**: Reuse DynamoDB connections
- **Memory Allocation**: Optimize for specific workloads

## Error Handling

### API Errors
- **400 Bad Request**: Invalid input data
- **401 Unauthorized**: Invalid or missing JWT
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Timer doesn't exist or user lacks access
- **500 Internal Server Error**: Unexpected server errors

### WebSocket Errors
- **Connection Errors**: Handle disconnections gracefully
- **Message Errors**: Return error responses for invalid messages
- **Broadcast Failures**: Log failed broadcasts but don't fail the operation

## Monitoring and Observability

### CloudWatch Metrics
- **API Gateway**: Request counts, latency, error rates
- **Lambda**: Invocation counts, duration, error rates
- **DynamoDB**: Read/write capacity, throttling events

### Logging
- **Structured Logs**: JSON format for easy parsing
- **Request Tracing**: Correlation IDs for request tracking
- **Error Context**: Detailed error information for debugging

## Deployment Strategy

### Infrastructure as Code
- **CDK**: All infrastructure defined in TypeScript
- **Environment Separation**: Different stacks for dev/staging/prod
- **Rollback Capability**: Easy rollback to previous versions

### Application Deployment
- **Lambda**: Automatic deployment with CDK
- **API Gateway**: Configuration managed through CDK
- **Database**: Schema changes handled through CDK
