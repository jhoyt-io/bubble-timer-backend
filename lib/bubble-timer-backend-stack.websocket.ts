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

    // RAW MESSAGE LOGGING - capture exactly what mobile app sends
    messageLogger.info('Raw WebSocket message received', {
        eventBody: event.body,
        eventBodyType: typeof event.body,
        eventBodyLength: event.body ? event.body.length : 0
    });

    // Parse raw body to see structure before validation
    let rawParsedBody;
    try {
        if (typeof event.body === 'string') {
            rawParsedBody = JSON.parse(event.body);
            messageLogger.info('Parsed raw message structure', {
                hasData: !!rawParsedBody.data,
                dataKeys: rawParsedBody.data ? Object.keys(rawParsedBody.data) : [],
                dataType: rawParsedBody.data ? rawParsedBody.data.type : 'undefined',
                completeDataStructure: rawParsedBody.data
            });
        } else {
            rawParsedBody = event.body;
            messageLogger.info('Non-string message body', {
                bodyType: typeof event.body,
                body: event.body
            });
        }
    } catch (parseError) {
        messageLogger.error('Failed to parse raw message body', {
            error: parseError,
            rawBody: event.body
        });
    }

    // Validate message
    const data = ValidationMiddleware.validateWebSocketMessage(event.body);

    // The validated data IS the message data - no need to access .data
    const rawData = data as any;

    messageLogger.info('WebSocket message received', {
        messageType: data.type,
        hasMessageId: !!data.messageId,
        dataStructure: {
            hasTimer: !!(rawData && rawData.timer),
            hasTimerId: !!(rawData && rawData.timerId),
            hasUserId: !!(rawData && rawData.userId),
            hasName: !!(rawData && rawData.name),
            hasTotalDuration: !!(rawData && rawData.totalDuration),
            hasRemainingDuration: !!(rawData && rawData.remainingDuration),
            hasTimerEnd: !!(rawData && rawData.timerEnd),
            hasShareWith: !!(rawData && rawData.shareWith)
        }
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
        timerId: data.timer?.id || data.timerId
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
        timerLogger.info('Processing timer message for sharing and persistence', {
            messageType: data.type,
            timerId: data.timer?.id || data.timerId
        });
        
        await handleTimerSharing(data, deviceId, timerLogger);
        await handleTimerPersistence(data, timerLogger);
        
        timerLogger.info('Completed timer message processing', {
            messageType: data.type,
            timerId: data.timer?.id || data.timerId
        });
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
    timerLogger.info('Sending timer update to shared users', {
        timerId,
        messageType: data.type,
        sharedUsersCount: currentSharedUsers.length,
        sharedUsers: currentSharedUsers
    });

    if (currentSharedUsers.length === 0) {
        timerLogger.info('No shared users found for timer', { timerId });
        return;
    }

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
        // Handle mobile app format: data.timer.{id, userId, name, totalDuration, timerEnd}
        // Based on logs, mobile app ALWAYS sends data.timer object
        const timerId = data.timer?.id || data.timerId;
        const userId = data.timer?.userId || data.userId;
        const name = data.timer?.name || data.name;
        const totalDuration = data.timer?.totalDuration || data.totalDuration;
        const remainingDuration = data.timer?.remainingDuration || data.remainingDuration;
        const endTime = data.timer?.timerEnd || data.timerEnd;

        // Debug logging to understand interface mismatch
        timerLogger.info('Field mapping analysis', {
            mobileAppFormat: {
                'data.timer?.id': data.timer?.id,
                'data.timer?.userId': data.timer?.userId,
                'data.timer?.name': data.timer?.name,
                'data.timer?.totalDuration': data.timer?.totalDuration,
                'data.timer?.remainingDuration': data.timer?.remainingDuration,
                'data.timer?.timerEnd': data.timer?.timerEnd,
                'data.shareWith': data.shareWith
            },
            directFormat: {
                'data.timerId': data.timerId,
                'data.userId': data.userId,
                'data.name': data.name,
                'data.totalDuration': data.totalDuration,
                'data.remainingDuration': data.remainingDuration,
                'data.timerEnd': data.timerEnd
            },
            mappedValues: {
                timerId,
                userId,
                name,
                totalDuration,
                remainingDuration,
                endTime
            }
        });

        if (!timerId) {
            timerLogger.warn('No timer ID found in update message', {
                data,
                mobileAppSentTimer: !!data.timer,
                timerHasId: data.timer?.id,
                directTimerId: data.timerId
            });
            return;
        }

        await Monitoring.time('persist_timer_update', async () => {
            const timer = Timer.fromValidatedData({
                id: timerId,
                userId: userId,
                name: name,
                totalDuration: totalDuration,
                remainingDuration: remainingDuration,
                endTime: endTime
            });

            await updateTimer(timer);

            // Manage shared timer relationships
            const currentSharedUsers = await getSharedTimerRelationships(timerId);
            const newSharedUsers = data.shareWith || [];

            // Add new relationships
            for (const sharedUser of newSharedUsers) {
                if (!currentSharedUsers.includes(sharedUser)) {
                    await addSharedTimerRelationship(timerId, sharedUser);
                }
            }

            // Remove outdated relationships
            for (const currentUser of currentSharedUsers) {
                if (!newSharedUsers.includes(currentUser)) {
                    await removeSharedTimerRelationship(timerId, currentUser);
                }
            }
        });

        await Monitoring.timerOperation('update', true, 0, userId);
        timerLogger.info('Timer updated and relationships synchronized', {
            timerId: timerId,
            newSharedUsers: data.shareWith?.length || 0
        });

    } else if (data.type === 'stopTimer') {
        await Monitoring.time('persist_timer_stop', async () => {
            const stopTimerId = data.timer?.id || data.timerId;
            const stopUserId = data.timer?.userId || data.userId;

            if (!stopTimerId) {
                timerLogger.warn('No timer ID found in stop message', { data });
                return;
            }

            const currentSharedUsers = await getSharedTimerRelationships(stopTimerId);

            // Remove all shared timer relationships
            for (const sharedUser of currentSharedUsers) {
                await removeSharedTimerRelationship(stopTimerId, sharedUser);
            }

            // Delete the timer
            await stopTimer(stopTimerId);
        });

        await Monitoring.timerOperation('stop', true, 0);
        timerLogger.info('Timer stopped and relationships cleaned up', {
            timerId: data.timer?.id || data.timerId
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
