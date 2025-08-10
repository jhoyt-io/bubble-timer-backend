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
  timerId: string  // Direct timerId, not nested in timer object
}
```

### 2. Sharing Messages
```typescript
// Add Sharing
{
  type: 'share',
  action: 'add',
  timerId: string,
  sharedWithUser: string
}

// Remove Sharing
{
  type: 'share',
  action: 'remove',
  timerId: string,
  sharedWithUser: string
}
```

### 3. System Messages
```typescript
// Ping (keep-alive)
{
  type: 'ping',
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
```typescript
// Connect Handler
async function handleConnect(
    connectionId: string,
    userId: string,
    deviceId: string,
    logger: MonitoringLogger
): Promise<any> {
    // Store connection in DynamoDB
    await updateConnection({
        userId: userId,
        deviceId: deviceId,
        connectionId: connectionId
    });
    
    logger.info('WebSocket connection established', {
        connectionId,
        userId,
        deviceId
    });
    
    return ResponseUtils.websocketSuccess({ status: 'connected' });
}
```

### 2. Disconnect Handling
```typescript
// Disconnect Handler
async function handleDisconnect(
    connectionId: string,
    userId: string,
    deviceId: string,
    logger: MonitoringLogger
): Promise<any> {
    // Remove connection from DynamoDB
    await updateConnection({
        userId: userId,
        deviceId: deviceId,
        connectionId: undefined
    });
    
    logger.info('WebSocket connection closed', {
        connectionId,
        userId,
        deviceId
    });
    
    return ResponseUtils.websocketSuccess({ status: 'disconnected' });
}
```

### 3. Connection Storage
```typescript
// DynamoDB Schema
{
  user_id: string,        // Partition key
  device_id: string,      // Sort key
  connection_id: string,  // WebSocket connection ID
  updated_at: string      // ISO timestamp
}
```

## Message Routing

### 1. Message Handler
```typescript
async function handleSendMessage(
    event: any,
    connectionId: string,
    userId: string,
    deviceId: string,
    logger: MonitoringLogger
): Promise<any> {
    const data = JSON.parse(event.body);
    
    switch (data.type) {
        case 'timer':
            return await handleTimerMessage(data, userId, deviceId, logger);
        case 'share':
            return await handleTimerSharing(data, deviceId, logger);
        case 'ping':
            return await handlePingMessage(data, userId, deviceId, logger);
        default:
            logger.warn('Unknown message type', { type: data.type });
            return ResponseUtils.websocketSuccess({ error: 'Unknown message type' }, 400);
    }
}
```

### 2. Timer Message Processing
```typescript
async function handleTimerMessage(
    data: any,
    userId: string,
    deviceId: string,
    logger: MonitoringLogger
): Promise<any> {
    const { action, timer, timerId } = data;
    
    switch (action) {
        case 'update':
            await handleTimerPersistence(data, logger);
            break;
        case 'stop':
            await stopTimer(timerId);
            break;
        default:
            logger.warn('Unknown timer action', { action });
            return ResponseUtils.websocketSuccess({ error: 'Unknown timer action' }, 400);
    }
    
    // Broadcast to shared users
    await handleTimerSharing(data, deviceId, logger);
    
    return ResponseUtils.websocketSuccess({ status: 'processed' });
}
```

## Broadcasting Patterns

### 1. User-to-User Broadcasting
```typescript
async function sendDataToUser(
    userId: string,
    sentFromDeviceId: string,
    data: any
): Promise<void> {
    const connections = await getConnectionsByUserId(userId);
    
    for (const connection of connections) {
        // Skip sending back to the originating device
        if (connection.deviceId === sentFromDeviceId) {
            continue;
        }
        
        try {
            await sendToConnection(connection.connectionId!, data);
        } catch (error) {
            logger.error('Failed to send to connection', {
                connectionId: connection.connectionId,
                userId: userId,
                error: error.message
            });
            
            // Clean up failed connection
            await updateConnection({
                userId: connection.userId,
                deviceId: connection.deviceId,
                connectionId: undefined
            });
        }
    }
}
```

### 2. Shared Timer Broadcasting
```typescript
async function handleTimerSharing(
    data: any,
    senderDeviceId: string,
    logger: MonitoringLogger
): Promise<void> {
    const { timerId, sharedWithUser } = data;
    
    if (sharedWithUser) {
        // Send to specific shared user
        try {
            await sendDataToUser(sharedWithUser, senderDeviceId, data);
        } catch (error) {
            logger.error('Failed to send to shared user', {
                sharedWithUser,
                timerId,
                error: error.message
            });
        }
    } else {
        // Broadcast to all users who have this timer shared with them
        const sharedUsers = await getSharedTimerRelationships(timerId);
        
        for (const sharedUser of sharedUsers) {
            try {
                await sendDataToUser(sharedUser, senderDeviceId, data);
            } catch (error) {
                logger.error('Failed to send to shared user', {
                    sharedUser,
                    timerId,
                    error: error.message
                });
            }
        }
    }
}
```

### 3. Connection-Level Sending
```typescript
async function sendToConnection(connectionId: string, data: any): Promise<void> {
    const client = Config.websocket;
    const command = new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify(data)
    });
    
    await client.send(command);
}
```

## Authentication and Security

### 1. JWT Token Validation
```typescript
async function handleAuthentication(
    event: any,
    logger: MonitoringLogger
): Promise<{
    cognitoUserName?: string;
    deviceId: string;
}> {
    const queryParams = event.queryStringParameters || {};
    const token = queryParams.token;
    const deviceId = queryParams.deviceId || 'unknown';
    
    if (!token) {
        logger.warn('No token provided in WebSocket connection');
        return { deviceId };
    }
    
    try {
        const payload = await jwtVerifier.verify(token);
        const cognitoUserName = payload.sub;
        
        logger.info('WebSocket authentication successful', {
            userId: cognitoUserName,
            deviceId
        });
        
        return { cognitoUserName, deviceId };
    } catch (error) {
        logger.error('WebSocket authentication failed', {
            deviceId,
            error: error.message
        });
        
        return { deviceId };
    }
}
```

### 2. Connection Authorization
- **Token required** for all message operations
- **Device ID tracking** for multi-device support
- **User isolation** ensures users can only access their own data

## Error Handling

### 1. Connection Failures
```typescript
// Clean up on any connection failure
try {
    await sendToConnection(connectionId, data);
} catch (error) {
    logger.error('Connection failed', {
        connectionId,
        error: error.message
    });
    
    // Remove failed connection
    await updateConnection({
        userId: connection.userId,
        deviceId: connection.deviceId,
        connectionId: undefined
    });
}
```

### 2. Message Processing Errors
```typescript
// Wrap message handling in error boundary
try {
    result = await handleSendMessage(event, connectionId, userId, deviceId, logger);
} catch (error) {
    logger.error('Message processing failed', {
        connectionId,
        userId,
        error: error.message
    });
    
    result = ResponseUtils.websocketSuccess({ 
        error: 'Internal server error' 
    }, 500);
}
```

### 3. Graceful Degradation
- **Partial failures** don't break the entire system
- **Connection cleanup** on any error
- **Logging** for debugging and monitoring

## Performance Considerations

### 1. Connection Efficiency
- **Connection reuse** for multiple messages
- **Batch operations** where possible
- **Efficient queries** using DynamoDB GSIs

### 2. Broadcasting Optimization
- **Fire-and-forget** for shared user broadcasts
- **Parallel processing** for multiple recipients
- **Connection state caching** to reduce database calls

### 3. Resource Management
- **Connection limits** to prevent abuse
- **Message size limits** for performance
- **Rate limiting** for message frequency

## Monitoring and Observability

### 1. Metrics Collection
```typescript
// Record WebSocket metrics
await Monitoring.websocketEvent(
    eventType === 'CONNECT' ? 'connect' :
    eventType === 'DISCONNECT' ? 'disconnect' : 'message',
    cognitoUserName,
    duration
);
```

### 2. Structured Logging
```typescript
const requestLogger = logger.child('websocket', {
    requestId,
    connectionId,
    eventType,
    routeKey
});
```

### 3. Health Checks
- **Connection health** monitoring
- **Message processing** metrics
- **Error rate** tracking

## Testing WebSocket Functionality

### 1. Unit Tests
```typescript
describe('WebSocket Handler', () => {
    it('should handle timer updates', async () => {
        const event = {
            body: JSON.stringify({
                type: 'timer',
                action: 'update',
                timer: { id: 'test', name: 'Test Timer' }
            })
        };
        
        const result = await handler(event, context);
        expect(result.statusCode).toBe(200);
    });
});
```

### 2. Integration Tests
```typescript
describe('WebSocket Integration', () => {
    it('should broadcast timer updates to shared users', async () => {
        // Setup test connections
        // Send timer update
        // Verify broadcast to shared users
    });
});
```

### 3. Load Testing
- **Connection limits** testing
- **Message throughput** testing
- **Concurrent user** simulation

## Best Practices

### 1. Message Design
- **Consistent format** across all message types
- **Required fields** validation
- **Backward compatibility** for message evolution

### 2. Connection Management
- **Explicit cleanup** on disconnect
- **Connection state** validation
- **Reconnection handling** for reliability

### 3. Broadcasting
- **Targeted broadcasts** to reduce unnecessary traffic
- **Error handling** for failed deliveries
- **Performance monitoring** for broadcast operations

### 4. Security
- **Token validation** on every message
- **Input sanitization** for all data
- **Rate limiting** to prevent abuse

## Troubleshooting

### 1. Connection Issues
- **Check DynamoDB permissions** for connection table
- **Verify JWT token** format and expiration
- **Monitor CloudWatch logs** for authentication errors

### 2. Broadcasting Problems
- **Verify sharing relationships** in database
- **Check connection state** for target users
- **Review error logs** for failed deliveries

### 3. Performance Issues
- **Monitor connection counts** and limits
- **Check DynamoDB throttling** metrics
- **Review Lambda execution** times and memory usage
