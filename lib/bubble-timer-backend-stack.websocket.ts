import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { getConnectionById, getConnectionsByUserId, updateConnection } from './backend/connections';
import { 
    stopTimer, 
    Timer, 
    updateTimer, 
    getTimer,
    addSharedTimerRelationship,
    removeSharedTimerRelationship,
    getSharedTimerRelationships
} from "./backend/timers";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { ErrorHandler } from './backend/middleware/errorHandler';
import { ValidationMiddleware } from './backend/middleware/validation';
import { ResponseUtils } from './backend/utils/response';
import { MonitoringLogger, Monitoring } from './monitoring';
import { Config } from './config';

const logger = new MonitoringLogger('WebSocketHandler');

// Initialize JWT verifier with configuration
const authConfig = Config.ws.auth;
const jwtVerifier = CognitoJwtVerifier.create({
    userPoolId: authConfig.cognito.userPoolId,
    tokenUse: 'id',
    clientId: authConfig.cognito.clientId,
});

// Initialize API Gateway Management client
const connectionClient = Config.websocket;

/**
 * Enhanced WebSocket handler with proper error handling, validation, and monitoring
 */
export const handler = ErrorHandler.wrapHandler(async (event: any, context: any) => {
    const requestId = context.awsRequestId;
    const connectionId = ValidationMiddleware.validateConnectionId(event);
    const eventType = event.requestContext.eventType;
    const routeKey = event.requestContext.routeKey;
    
    const requestLogger = logger.child('websocket', { 
        requestId, 
        connectionId, 
        eventType, 
        routeKey 
    });
    
    const timer = Monitoring.timer('websocket_request_duration');
    
    try {
        requestLogger.info('WebSocket event received', {
            eventType,
            routeKey,
            connectionId
        });

        let cognitoUserName: string | undefined;
        let deviceId = '';

        // Handle authentication
        const authResult = await handleAuthentication(event, requestLogger);
        cognitoUserName = authResult.cognitoUserName;
        deviceId = authResult.deviceId;

        if (!cognitoUserName) {
            requestLogger.warn('Unauthenticated WebSocket request', { connectionId });
            return ResponseUtils.websocketSuccess({ error: 'Authentication required' }, 401);
        }

        const userLogger = requestLogger.child('authenticated', { 
            userId: cognitoUserName, 
            deviceId 
        });

        let result: any;

        // Route handling
        if (eventType === 'CONNECT') {
            result = await handleConnect(connectionId, cognitoUserName, deviceId, userLogger);
        } else if (eventType === 'DISCONNECT') {
            result = await handleDisconnect(connectionId, cognitoUserName, deviceId, userLogger);
        } else if (routeKey === 'sendmessage') {
            result = await handleSendMessage(event, connectionId, cognitoUserName, deviceId, userLogger);
        } else {
            userLogger.warn('Unknown WebSocket route', { routeKey, eventType });
            result = ResponseUtils.websocketSuccess({ error: 'Unknown route' }, 400);
        }

        const duration = timer.stop();
        
        // Record WebSocket metrics
        await Monitoring.websocketEvent(
            eventType === 'CONNECT' ? 'connect' : 
            eventType === 'DISCONNECT' ? 'disconnect' : 'message',
            cognitoUserName,
            duration
        );
        
        userLogger.info('WebSocket request completed successfully', { duration });
        
        return result;

    } catch (error) {
        const duration = timer.stop();
        requestLogger.error('WebSocket request failed', error);
        
        // Record error metrics
        await Monitoring.websocketEvent('error', undefined, duration);
        await Monitoring.error(
            error instanceof Error ? error.name : 'UnknownError',
            'websocket_handler',
            'high'
        );

        return ErrorHandler.createWebSocketErrorResponse(error, requestId);
    }
}, 'WebSocketHandler');

/**
 * Handles authentication for WebSocket connections
 */
async function handleAuthentication(event: any, requestLogger: MonitoringLogger): Promise<{
    cognitoUserName?: string;
    deviceId: string;
}> {
    let cognitoUserName: string | undefined;
    let deviceId = '';

    try {
        if (event.headers) {
            // Direct authentication with token
            const cognitoToken = event.headers.Authorization;
            deviceId = event.headers.DeviceId || '';

            if (cognitoToken) {
                try {
                    const payload = await jwtVerifier.verify(cognitoToken, { tokenUse: 'id' });
                    requestLogger.debug('Token verification successful', { 
                        sub: payload.sub,
                        tokenUse: payload.token_use 
                    });
                    cognitoUserName = payload['cognito:username'];
                } catch (authError) {
                    requestLogger.warn('Token verification failed', { error: authError });
                }
            }
        } else {
            // Authentication via stored connection
            requestLogger.debug('Looking up authentication from stored connection');
            const connection = await getConnectionById(event.requestContext.connectionId);
            
            if (connection) {
                cognitoUserName = connection.userId;
                deviceId = connection.deviceId;
                requestLogger.debug('Authentication retrieved from connection', { 
                    userId: cognitoUserName,
                    deviceId 
                });
            }
        }
    } catch (error) {
        requestLogger.error('Authentication lookup failed', error);
    }

    return { cognitoUserName, deviceId };
}

/**
 * Handles WebSocket CONNECT events
 */
async function handleConnect(
    connectionId: string,
    userId: string,
    deviceId: string,
    requestLogger: MonitoringLogger
): Promise<any> {
    const connectLogger = requestLogger.child('connect', { connectionId, userId, deviceId });
    
    await Monitoring.time('websocket_connect', async () => {
        await updateConnection({
            userId,
            deviceId,
            connectionId,
        });
    });

    connectLogger.info('WebSocket connection established', { 
        connectionId,
        userId,
        deviceId 
    });

    await Monitoring.businessMetric('WebSocketConnections', 1, {
        UserId: userId,
        DeviceId: deviceId
    });

    return ResponseUtils.websocketSuccess({ status: 'connected' });
}

/**
 * Handles WebSocket DISCONNECT events
 */
async function handleDisconnect(
    connectionId: string,
    userId: string,
    deviceId: string,
    requestLogger: MonitoringLogger
): Promise<any> {
    const disconnectLogger = requestLogger.child('disconnect', { connectionId, userId, deviceId });
    
    await Monitoring.time('websocket_disconnect', async () => {
        await updateConnection({
            userId,
            deviceId,
            connectionId: undefined,
        });
    });

    disconnectLogger.info('WebSocket connection closed', { 
        connectionId,
        userId,
        deviceId 
    });

    await Monitoring.businessMetric('WebSocketDisconnections', 1, {
        UserId: userId,
        DeviceId: deviceId
    });

    return ResponseUtils.websocketSuccess({ status: 'disconnected' });
}

/**
 * Handles sendmessage route
 */
async function handleSendMessage(
    event: any,
    connectionId: string,
    userId: string,
    deviceId: string,
    requestLogger: MonitoringLogger
): Promise<any> {
    const messageLogger = requestLogger.child('sendMessage', { connectionId, userId, deviceId });
    
    // Validate message
    const data = ValidationMiddleware.validateWebSocketMessage(event.body);
    
    messageLogger.info('WebSocket message received', { 
        messageType: data.type,
        hasMessageId: !!data.messageId 
    });

    // Handle different message types
    if (data.type === 'ping') {
        return await handlePingMessage(data, userId, deviceId, messageLogger);
    } else if (data.type === 'acknowledge') {
        return await handleAcknowledgeMessage(data, messageLogger);
    } else if (['activeTimerList', 'updateTimer', 'stopTimer'].includes(data.type)) {
        return await handleTimerMessage(data, userId, deviceId, messageLogger);
    } else {
        messageLogger.warn('Unknown message type', { messageType: data.type });
        return ResponseUtils.websocketSuccess({ error: 'Unknown message type' }, 400);
    }
}

/**
 * Handles ping messages
 */
async function handlePingMessage(
    data: any,
    userId: string,
    deviceId: string,
    messageLogger: MonitoringLogger
): Promise<any> {
    messageLogger.debug('Processing ping message', { timestamp: data.timestamp });
    
    const pongData = ResponseUtils.pong(data.timestamp);
    
    await Monitoring.time('websocket_ping_response', async () => {
        // Send to all connections except the sender
        await sendDataToUser(userId, deviceId, pongData);
    });

    messageLogger.info('Pong response sent', { originalTimestamp: data.timestamp });
    
    return ResponseUtils.websocketSuccess({ status: 'pong_sent' });
}

/**
 * Handles acknowledge messages
 */
async function handleAcknowledgeMessage(data: any, messageLogger: MonitoringLogger): Promise<any> {
    messageLogger.info('Message acknowledged', { messageId: data.messageId });
    return ResponseUtils.websocketSuccess({ status: 'acknowledged' });
}

/**
 * Handles timer-related messages
 */
async function handleTimerMessage(
    data: any,
    userId: string,
    deviceId: string,
    messageLogger: MonitoringLogger
): Promise<any> {
    const timerLogger = messageLogger.child('timerMessage', { 
        messageType: data.type,
        timerId: data.timerId || data.timer?.id 
    });

    // Add messageId to outgoing messages
    const messageWithId = {
        ...data,
        messageId: data.messageId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    // Send to all connections for the user
    await Monitoring.time('send_to_user_connections', async () => {
        await sendDataToUser(userId, deviceId, messageWithId);
    });

    // Handle timer updates and sharing
    if (data.type === 'updateTimer' || data.type === 'stopTimer') {
        await handleTimerSharing(data, deviceId, timerLogger);
        await handleTimerPersistence(data, timerLogger);
    }

    timerLogger.info('Timer message processed successfully', { 
        messageType: data.type,
        messageId: messageWithId.messageId 
    });

    return ResponseUtils.websocketSuccess({ 
        status: 'message_processed',
        messageId: messageWithId.messageId 
    });
}

/**
 * Handles timer sharing logic
 */
async function handleTimerSharing(data: any, senderDeviceId: string, timerLogger: MonitoringLogger): Promise<void> {
    const timerId = data.timerId || data.timer?.id;
    if (!timerId) return;

    const currentSharedUsers = await getSharedTimerRelationships(timerId);
    timerLogger.debug('Sending timer update to shared users', { 
        timerId,
        sharedUsersCount: currentSharedUsers.length 
    });

    // Send to all users sharing the timer
    const sendPromises = currentSharedUsers.map(async (userName: string) => {
        try {
            await sendDataToUser(userName, senderDeviceId, data);
            timerLogger.debug('Timer update sent to shared user', { 
                timerId,
                sharedUser: userName 
            });
        } catch (error) {
            timerLogger.error('Failed to send timer update to shared user', { 
                error,
                timerId,
                sharedUser: userName 
            });
        }
    });

    await Promise.allSettled(sendPromises);
}

/**
 * Handles timer persistence logic
 */
async function handleTimerPersistence(data: any, timerLogger: MonitoringLogger): Promise<void> {
    if (data.type === 'updateTimer') {
        await Monitoring.time('persist_timer_update', async () => {
            const timer = Timer.fromValidatedData({
                id: data.timer.id,
                userId: data.timer.userId,
                name: data.timer.name,
                totalDuration: data.timer.totalDuration,
                remainingDuration: data.timer.remainingDuration,
                endTime: data.timer.timerEnd
            });
            
            await updateTimer(timer);
            
            // Manage shared timer relationships
            const currentSharedUsers = await getSharedTimerRelationships(data.timer.id);
            const newSharedUsers = data.shareWith || [];
            
            // Add new relationships
            for (const sharedUser of newSharedUsers) {
                if (!currentSharedUsers.includes(sharedUser)) {
                    await addSharedTimerRelationship(data.timer.id, sharedUser);
                }
            }
            
            // Remove outdated relationships
            for (const currentUser of currentSharedUsers) {
                if (!newSharedUsers.includes(currentUser)) {
                    await removeSharedTimerRelationship(data.timer.id, currentUser);
                }
            }
        });
        
        await Monitoring.timerOperation('update', true, 0, data.timer.userId);
        timerLogger.info('Timer updated and relationships synchronized', { 
            timerId: data.timer.id,
            newSharedUsers: data.shareWith?.length || 0 
        });
        
    } else if (data.type === 'stopTimer') {
        await Monitoring.time('persist_timer_stop', async () => {
            const currentSharedUsers = await getSharedTimerRelationships(data.timerId);
            
            // Remove all shared timer relationships
            for (const sharedUser of currentSharedUsers) {
                await removeSharedTimerRelationship(data.timerId, sharedUser);
            }
            
            // Delete the timer
            await stopTimer(data.timerId);
        });
        
        await Monitoring.timerOperation('stop', true, 0);
        timerLogger.info('Timer stopped and relationships cleaned up', { 
            timerId: data.timerId 
        });
    }
}

/**
 * Sends data to all connections for a user
 */
async function sendDataToUser(cognitoUserName: string, sentFromDeviceId: string, data: any): Promise<void> {
    const sendLogger = logger.child('sendDataToUser', { 
        targetUser: cognitoUserName,
        sentFromDevice: sentFromDeviceId 
    });
    
    if (!cognitoUserName) {
        sendLogger.debug('No username provided, skipping send');
        return;
    }

    const connectionsForUser = await getConnectionsByUserId(cognitoUserName);
    sendLogger.debug('Retrieved user connections', { 
        targetUser: cognitoUserName,
        connectionsCount: connectionsForUser.length 
    });
    
    if (connectionsForUser.length === 0) {
        sendLogger.info('No active connections found for user', { targetUser: cognitoUserName });
        return;
    }

    const sendPromises = connectionsForUser.map(async (connection) => {
        if (connection.deviceId !== sentFromDeviceId && connection.connectionId) {
            try {
                const command = new PostToConnectionCommand({
                    Data: JSON.stringify(data),
                    ConnectionId: connection.connectionId,
                });

                await connectionClient.send(command);
                sendLogger.debug('Message sent to connection successfully', { 
                    connectionId: connection.connectionId,
                    deviceId: connection.deviceId 
                });
                
            } catch (error) {
                sendLogger.error('Failed to send message to connection', { 
                    error,
                    connectionId: connection.connectionId,
                    deviceId: connection.deviceId 
                });
                
                // Clean up stale connection
                await updateConnection({
                    userId: cognitoUserName,
                    deviceId: connection.deviceId,
                    connectionId: undefined,
                });
            }
        } else {
            sendLogger.debug('Skipping connection', { 
                deviceId: connection.deviceId,
                reason: connection.deviceId === sentFromDeviceId ? 'sender' : 'no_connection_id' 
            });
        }
    });

    await Promise.allSettled(sendPromises);
    
    await Monitoring.businessMetric('WebSocketMessagesSent', sendPromises.length, {
        TargetUser: cognitoUserName,
        MessageType: data.type || 'unknown'
    });
}
