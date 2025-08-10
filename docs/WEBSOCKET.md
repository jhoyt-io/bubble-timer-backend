# Bubble Timer WebSocket Implementation

## Overview

The WebSocket implementation provides real-time bidirectional communication between the Android frontend and backend for timer synchronization and sharing. It handles connection management, message routing, and broadcasting to ensure all connected clients stay synchronized.

## Architecture

### Connection Model
```
User (userId) → Multiple Devices (deviceId) → Multiple Connections (connectionId)
```

- **One user** can have **multiple devices** (phone, tablet, etc.)
- **One device** can have **multiple connections** (app instances, browser tabs)
- **Connection tracking** in DynamoDB for reliability and reconnection

### Data Flow
```
Client Connect → Store Connection → Ready for Messages
Client Message → Route by Type → Process → Broadcast to Shared Users
Client Disconnect → Clean Connection → Update State
```

## Message Types and Formats

### 1. Timer Messages
```typescript
// Timer Update (Mobile App Format)
{
  type: 'updateTimer',
  timer: {
    id: string,
    userId: string,
    name: string,
    totalDuration: string,
    remainingDuration?: string,
    timerEnd?: string  // Note: mobile app uses timerEnd, not endTime
  },
  shareWith?: string[]  // Array of usernames to share with
}

// Timer Stop
{
  type: 'stopTimer',
  timerId: string  // Direct timerId, not nested in timer object
}
```

### 2. System Messages
```typescript
// Ping (keep-alive)
{
  type: 'ping',
  timestamp: number
}

// Pong Response
{
  type: 'pong',
  timestamp: number
}

// Acknowledge
{
  type: 'ack',
  messageId: string
}
```

## Connection Management

### 1. Connection Lifecycle
**Implementation**: `lib/bubble-timer-backend-stack.websocket.ts` lines 221-253

**Connect Handler Logic**:
- Store connection in DynamoDB with userId, deviceId, and connectionId
- Log successful connection establishment
- Return success response

**Disconnect Handler Logic**:
- Remove connection from DynamoDB by setting connectionId to undefined
- Log connection closure
- Return success response

### 2. Connection Storage
**DynamoDB Schema**:
```typescript
{
  user_id: string,        // Partition key
  device_id: string,      // Sort key
  connection_id: string,  // WebSocket connection ID
  updated_at: string      // ISO timestamp
}
```

## Authentication and Security

### 1. Authentication Flow
**Implementation**: `lib/bubble-timer-backend-stack.websocket.ts` lines 172-220

**Authentication Logic**:
- Extract token and deviceId from query parameters
- Verify JWT token using Cognito verifier
- Return cognitoUserName and deviceId
- Handle missing or invalid tokens gracefully

### 2. Event-Specific Authentication Requirements

| Event Type | Authentication Required | Method | Notes |
|------------|------------------------|---------|-------|
| **CONNECT** | ❌ No (allows unauthenticated) | Token in headers OR connection lookup | Initial handshake, returns `connected_limited` if no auth |
| **DISCONNECT** | ❌ No | Connection lookup by ID | No headers available, looks up stored connection |
| **sendmessage** | ✅ Yes | Token in headers | Full authentication required with JWT token |

### 3. Connection Authorization
- **Token validation** for message operations
- **Device ID tracking** for multi-device support
- **User isolation** ensures users can only access their own data
- **Connection state validation** for disconnect events

## Message Routing

### 1. Message Handler
**Implementation**: `lib/bubble-timer-backend-stack.websocket.ts` lines 287-364

**Routing Logic**:
- Validate WebSocket message using ValidationMiddleware
- Route by message type: `updateTimer`, `stopTimer`, `ping`, `ack`
- Handle unknown message types with error response

### 2. Timer Message Processing
**Implementation**: `lib/bubble-timer-backend-stack.websocket.ts` lines 397-448

**Processing Logic**:
- Generate unique messageId for tracking
- Send message to all user connections (including sender)
- For timer updates/stops: handle sharing and persistence
- Return success with messageId

### 3. Ping/Pong Handling
**Implementation**: `lib/bubble-timer-backend-stack.websocket.ts` lines 365-388

**Ping/Pong Logic**:
- Generate pong response with timestamp
- Send pong to ALL connections (including sender)
- Return success status

## Broadcasting Patterns

### 1. User-to-User Broadcasting
**Implementation**: `lib/bubble-timer-backend-stack.websocket.ts` lines 601-675

**Broadcasting Logic**:
- Retrieve all connections for target user
- For each connection:
  - If sentFromDeviceId is empty: send to ALL connections (including sender)
  - If sentFromDeviceId is provided: skip the sender
  - On any connection error: clean up stale connection
- Use Promise.allSettled for graceful failure handling

### 2. Shared Timer Broadcasting
**Implementation**: `lib/bubble-timer-backend-stack.websocket.ts` lines 449-482

**Sharing Logic**:
- Extract timerId from message (handles both updateTimer and stopTimer formats)
- Use shareWith array from message (not database queries)
- Fire-and-forget broadcast to all shared users
- Log failures but don't block processing

### 3. Connection-Level Sending
**Implementation**: Uses AWS API Gateway Management API client

**Sending Logic**:
- Create PostToConnectionCommand with JSON data
- Send via API Gateway Management client
- Handle connection failures with cleanup

## Timer Persistence

### 1. Timer Update Processing
**Implementation**: `lib/bubble-timer-backend-stack.websocket.ts` lines 483-600

**Update Logic**:
- Handle mobile app format: extract fields from `data.timer` object
- Map `timerEnd` field (mobile) to `endTime` (backend)
- Update timer in DynamoDB with all fields

**Stop Logic**:
- Extract direct `timerId` for stop messages
- Clean up all shared timer relationships
- Delete timer from database

## Error Handling

### 1. Connection Failures
**Implementation**: `lib/bubble-timer-backend-stack.websocket.ts` lines 601-675

**Error Handling Logic**:
- Clean up on ANY connection failure (not just specific error types)
- Remove failed connection from DynamoDB
- Continue processing other connections (don't throw)
- Use Promise.allSettled for batch operations

### 2. Message Processing Errors
**Implementation**: `lib/bubble-timer-backend-stack.websocket.ts` lines 287-364

**Error Handling Logic**:
- Wrap message handling in error boundary
- Log processing failures with context
- Return appropriate error responses
- Maintain system stability

### 3. Graceful Degradation
- **Partial failures** don't break the entire system
- **Connection cleanup** on any error (not just specific types)
- **Fire-and-forget broadcasting** prevents cascading failures
- **Promise.allSettled** for batch operations

## Performance Considerations

### 1. Connection Efficiency
- **Connection reuse** for multiple messages
- **Batch operations** where possible
- **Efficient queries** using DynamoDB GSIs

### 2. Broadcasting Optimization
- **Fire-and-forget** for shared user broadcasts
- **Parallel processing** for multiple recipients
- **Connection state caching** to reduce database calls
- **Promise.allSettled** for graceful failure handling

### 3. Resource Management
- **Connection limits** to prevent abuse
- **Message size limits** for performance
- **Rate limiting** for message frequency

## Monitoring and Observability

### 1. Metrics Collection
**Implementation**: Uses Monitoring.websocketEvent() for different event types

**Metrics Logic**:
- Record connect/disconnect/message events separately
- Track duration and user context
- Monitor WebSocket performance

### 2. Structured Logging
**Implementation**: Uses MonitoringLogger with child loggers

**Logging Structure**:
- Request-level logging with connection context
- Timer message logging with message type and timerId
- Performance timing for critical operations

### 3. Performance Monitoring
**Implementation**: Uses Monitoring.time() for critical operations

**Monitoring Logic**:
- Time user connection broadcasts
- Time ping/pong response generation
- Track business metrics for message sending

### 4. Business Metrics
**Implementation**: Uses Monitoring.businessMetric() for WebSocket activity

**Metrics Logic**:
- Track WebSocketMessagesSent with user and message type
- Monitor connection activity patterns
- Measure broadcast effectiveness

## Testing WebSocket Functionality

### 1. Unit Tests
**Implementation**: `__tests__/websocket.test.ts`

**Test Coverage**:
- Message type validation
- Authentication flow
- Error handling scenarios
- Response format validation

### 2. Integration Tests
**Implementation**: `__tests__/websocket.test.ts`

**Integration Coverage**:
- End-to-end message flow
- Connection lifecycle
- Broadcasting patterns
- Timer persistence integration

### 3. Load Testing
- **Connection limits** testing
- **Message throughput** testing
- **Concurrent user** simulation

## Best Practices

### 1. Message Design
- **Consistent format** across all message types
- **Required fields** validation
- **Backward compatibility** for message evolution
- **Message IDs** for tracking and acknowledgment

### 2. Connection Management
- **Explicit cleanup** on disconnect
- **Connection state** validation
- **Reconnection handling** for reliability
- **Stale connection cleanup** on any error

### 3. Broadcasting
- **Targeted broadcasts** to reduce unnecessary traffic
- **Fire-and-forget** for shared user broadcasts
- **Error handling** for failed deliveries
- **Performance monitoring** for broadcast operations

### 4. Security
- **Token validation** on message operations
- **Input sanitization** for all data
- **Rate limiting** to prevent abuse
- **Event-specific authentication** requirements

## Troubleshooting

### 1. Connection Issues
- **Check DynamoDB permissions** for connection table
- **Verify JWT token** format and expiration
- **Monitor CloudWatch logs** for authentication errors
- **Review CONNECT/DISCONNECT** event handling

### 2. Broadcasting Problems
- **Verify sharing relationships** in message data
- **Check connection state** for target users
- **Review error logs** for failed deliveries
- **Confirm sendDataToUser logic** for sender exclusion

### 3. Performance Issues
- **Monitor connection counts** and limits
- **Check DynamoDB throttling** metrics
- **Review Lambda execution** times and memory usage
- **Verify Promise.allSettled** usage for batch operations

### 4. Message Processing Issues
- **Check message format** validation
- **Verify timer ID extraction** logic
- **Review authentication** requirements by event type
- **Monitor ping/pong** message flow

## Recent Implementation Notes

### Key Fixes Applied
1. **DISCONNECT Authentication**: DISCONNECT events now use connection lookup instead of requiring authentication headers
2. **Ping/Pong Routing**: Pong messages are sent to ALL connections (including sender) using empty `sentFromDeviceId`
3. **Fire-and-forget Broadcasting**: Timer sharing uses `forEach().catch()` for non-blocking broadcasts
4. **Stale Connection Cleanup**: Any connection error triggers cleanup, not just specific error types
5. **Promise.allSettled**: Batch operations use `Promise.allSettled` for graceful failure handling

### Interface Preservation
- **Mobile app format**: Supports `data.timer` object structure with `timerEnd` field
- **Stop timer format**: Uses direct `data.timerId` for stop messages
- **Sharing format**: Uses `data.shareWith` array from message instead of database queries
- **Message routing**: Maintains original message type handling (`updateTimer`, `stopTimer`, `ping`)

### Authentication Flow
- **CONNECT**: Allows unauthenticated, returns `connected_limited` status
- **DISCONNECT**: No authentication required, uses connection lookup
- **sendmessage**: Full authentication required with JWT token
