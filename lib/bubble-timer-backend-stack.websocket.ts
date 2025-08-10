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
logger.info('JWT Verifier configuration', {
    userPoolId: authConfig.cognito.userPoolId,
    clientId: authConfig.cognito.clientId,
    region: authConfig.cognito.region
});

const jwtVerifier = CognitoJwtVerifier.create({
    userPoolId: authConfig.cognito.userPoolId,
    tokenUse: 'id',
    clientId: authConfig.cognito.clientId,
});

// Initialize API Gateway Management client - use simple configuration like working version
const connectionClient = new ApiGatewayManagementApiClient({
    endpoint: Config.ws.endpoint.endpoint,
    region: Config.environment.region,
    // No retry configuration - let AWS SDK use defaults like working version
});

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

        // For CONNECT events, only process if we have authentication info
        // This matches the working implementation behavior exactly
        if (eventType === 'CONNECT') {
            if (cognitoUserName) {
                // Store connection if we have authentication info
                const userLogger = requestLogger.child('authenticated', {
                    userId: cognitoUserName,
                    deviceId
                });
                
                const result = await handleConnect(connectionId, cognitoUserName, deviceId, userLogger);
                
                const duration = timer.stop();
                await Monitoring.websocketEvent('connect', cognitoUserName, duration);
                userLogger.info('WebSocket request completed successfully', { duration });
                
                return result;
            } else {
                // No authentication info available - in working implementation, this was ignored
                requestLogger.warn('CONNECT without authentication - ignoring connection attempt', { connectionId });
                return ResponseUtils.websocketSuccess({ status: 'connected_limited' });
            }
        }

        // For DISCONNECT events, allow unauthenticated requests to proceed
        // DISCONNECT events typically don't have headers, so we look up the connection
        if (eventType === 'DISCONNECT') {
            if (!cognitoUserName) {
                requestLogger.warn('DISCONNECT without authentication - looking up connection by ID', { connectionId });
                // Try to get user info from the connection itself
                const connection = await getConnectionById(connectionId);
                if (connection) {
                    cognitoUserName = connection.userId;
                    deviceId = connection.deviceId;
                    requestLogger.info('Retrieved user info from connection for DISCONNECT', {
                        userId: cognitoUserName,
                        deviceId
                    });
                } else {
                    requestLogger.warn('No connection found for DISCONNECT', { connectionId });
                    return ResponseUtils.websocketSuccess({ status: 'disconnected' });
                }
            }
            
            const userLogger = requestLogger.child('authenticated', {
                userId: cognitoUserName,
                deviceId
            });
            
            const result = await handleDisconnect(connectionId, cognitoUserName, deviceId, userLogger);
            
            const duration = timer.stop();
            await Monitoring.websocketEvent('disconnect', cognitoUserName, duration);
            userLogger.info('WebSocket request completed successfully', { duration });
            
            return result;
        }

        // For all other events, require authentication
        if (!cognitoUserName) {
            requestLogger.warn('Unauthenticated WebSocket request', { connectionId });
            return ResponseUtils.websocketSuccess({ error: 'Authentication required' }, 401);
        }

        const userLogger = requestLogger.child('authenticated', {
            userId: cognitoUserName,
            deviceId
        });

        let result: any;

        // Route handling for authenticated requests
        if (routeKey === 'sendmessage') {
            result = await handleSendMessage(event, connectionId, cognitoUserName, deviceId, userLogger);
        } else {
            userLogger.warn('Unknown WebSocket route', { routeKey, eventType });
            result = ResponseUtils.websocketSuccess({ error: 'Unknown route' }, 400);
        }

        const duration = timer.stop();

        // Record WebSocket metrics (CONNECT and DISCONNECT are handled separately above)
        await Monitoring.websocketEvent('message', cognitoUserName, duration);

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
        // DEBUG: Log what we're receiving
        requestLogger.info('Authentication attempt', {
            hasHeaders: !!event.headers,
            headerKeys: event.headers ? Object.keys(event.headers) : [],
            hasAuthorization: !!(event.headers && event.headers.Authorization),
            hasDeviceId: !!(event.headers && event.headers.DeviceId),
            authorizationLength: event.headers?.Authorization?.length || 0,
            deviceId: event.headers?.DeviceId || 'not-provided'
        });

        if (event.headers) {
            // Direct authentication with token (matching working implementation)
            let cognitoToken = event.headers.Authorization;
            deviceId = event.headers.DeviceId || '';

            // Strip "Bearer " prefix if present (mobile app might send it)
            if (cognitoToken && cognitoToken.startsWith('Bearer ')) {
                cognitoToken = cognitoToken.substring(7);
                requestLogger.debug('Stripped Bearer prefix from token');
            }

            // DEBUG: Log token details
            if (cognitoToken) {
                requestLogger.info('Token details', {
                    tokenLength: cognitoToken.length,
                    tokenStart: cognitoToken.substring(0, 20) + '...',
                    tokenEnd: '...' + cognitoToken.substring(cognitoToken.length - 20),
                    hasBearerPrefix: event.headers.Authorization?.startsWith('Bearer ') || false
                });
            }

            if (cognitoToken) {
                try {
                    const payload = await jwtVerifier.verify(cognitoToken);
                    requestLogger.info('Token verification successful', {
                        sub: payload.sub,
                        tokenUse: payload.token_use,
                        cognitoUsername: payload['cognito:username']
                    });
                    cognitoUserName = payload['cognito:username'];
                } catch (authError) {
                    // In working implementation, this just logged and continued
                    requestLogger.warn('Token verification failed - continuing without authentication', { 
                        error: authError,
                        errorMessage: authError instanceof Error ? authError.message : 'Unknown error',
                        errorName: authError instanceof Error ? authError.name : 'Unknown',
                        errorStack: authError instanceof Error ? authError.stack : 'No stack trace',
                        tokenPreview: cognitoToken.substring(0, 50) + '...'
                    });
                    // Don't set cognitoUserName to undefined - let it remain undefined
                }
            } else {
                requestLogger.warn('No Authorization token provided in headers');
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

    requestLogger.info('Authentication result', {
        cognitoUserName: cognitoUserName || 'not-authenticated',
        deviceId: deviceId || 'not-provided'
    });

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
        // DEBUG: Log the exact values being passed to updateConnection
        connectLogger.info('Calling updateConnection with', {
            userId,
            deviceId,
            connectionId,
            connectionIdType: typeof connectionId,
            connectionIdLength: connectionId ? connectionId.length : 0
        });
        
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
    messageLogger.debug('Processing ping message', { 
        timestamp: data.timestamp,
        isDirect: data.direct || false,
        senderDevice: deviceId
    });

    const pongData = ResponseUtils.pong(data.timestamp);

    await Monitoring.time('websocket_ping_response', async () => {
        // Check if this is a direct ping (client expects targeted response)
        if (data.direct) {
            // Send pong only to the device that sent the ping
            await sendDataToDevice(userId, deviceId, pongData);
            messageLogger.info('Direct pong response sent to sender device', { 
                originalTimestamp: data.timestamp,
                targetDevice: deviceId
            });
        } else {
            // Legacy behavior: send to all connections (including sender)
            await sendDataToUser(userId, '', pongData);
            messageLogger.info('Broadcast pong response sent to all connections', { 
                originalTimestamp: data.timestamp
            });
        }
    });

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
        timerId: data.type === 'stopTimer' ? data.timerId : (data.timer?.id || data.timerId)
    });

    // Add messageId to outgoing messages
    const messageWithId = {
        ...data,
        messageId: data.messageId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    // Send to all other connections for the user (excluding sender)
    await Monitoring.time('send_to_user_connections', async () => {
        await sendDataToUserExceptSender(userId, deviceId, messageWithId);
    });

    // Handle timer updates and sharing
    if (data.type === 'updateTimer' || data.type === 'stopTimer') {
        timerLogger.info('Processing timer message for sharing and persistence', {
            messageType: data.type,
            timerId: data.type === 'stopTimer' ? data.timerId : (data.timer?.id || data.timerId)
        });
        
        handleTimerSharing(data, deviceId, timerLogger);
        await handleTimerPersistence(data, timerLogger);
        
        timerLogger.info('Completed timer message processing', {
            messageType: data.type,
            timerId: data.type === 'stopTimer' ? data.timerId : (data.timer?.id || data.timerId)
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
function handleTimerSharing(data: any, senderDeviceId: string, timerLogger: MonitoringLogger): void {
    const timerId = data.type === 'stopTimer' ? data.timerId : (data.timerId || data.timer?.id);
    if (!timerId) return;

    // Use shareWith data from the timer directly instead of querying database
    const sharedUsers = data.shareWith || [];
    
    timerLogger.info('Sending timer update to shared users', {
        timerId,
        messageType: data.type,
        sharedUsersCount: sharedUsers.length,
        sharedUsers: sharedUsers
    });

    if (sharedUsers.length === 0) {
        timerLogger.info('No shared users found for timer', { timerId });
        return;
    }

    // Send to all users sharing the timer - fire-and-forget like original
    sharedUsers.forEach((userName: string) => {
        sendDataToUserExceptSender(userName, senderDeviceId, data).catch((error) => {
            timerLogger.error('Failed to send timer update to shared user', {
                error,
                timerId,
                sharedUser: userName
            });
        });
    });
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
            const stopTimerId = data.timerId;
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
        // Match original logic: 
        // - If sentFromDeviceId is empty string, send to ALL connections (including sender)
        // - If sentFromDeviceId is provided, skip the sender
        if ((sentFromDeviceId === '' || connection.deviceId !== sentFromDeviceId) && connection.connectionId) {
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
                const errorCode = error && typeof error === 'object' && 'code' in error ? (error as any).code : 'unknown';
                const errorMessage = error instanceof Error ? error.message : String(error);
                
                sendLogger.error('Failed to send message to connection', {
                    error: {
                        code: errorCode,
                        message: errorMessage,
                        fullError: error
                    },
                    connectionId: connection.connectionId,
                    deviceId: connection.deviceId,
                    targetUser: cognitoUserName,
                    messageType: data.type || 'unknown'
                });

                // Clean up connection immediately on any send failure (like working version)
                sendLogger.info('Cleaning up connection due to send failure', {
                    connectionId: connection.connectionId,
                    deviceId: connection.deviceId,
                    errorCode
                });
                
                await updateConnection({
                    userId: cognitoUserName,
                    deviceId: connection.deviceId,
                    connectionId: undefined,
                });
                
                // Throw error to match working implementation behavior
                throw error;
            }
        } else {
            sendLogger.debug('Skipping connection', {
                deviceId: connection.deviceId,
                sentFromDeviceId,
                hasConnectionId: !!connection.connectionId
            });
        }
    });

    // Use Promise.all to match working implementation - if any send fails, the entire operation fails
    await Promise.all(sendPromises);

    await Monitoring.businessMetric('WebSocketMessagesSent', sendPromises.length, {
        TargetUser: cognitoUserName,
        MessageType: data.type || 'unknown'
    });
}

/**
 * Sends a message to a specific device only
 */
async function sendDataToDevice(cognitoUserName: string, targetDeviceId: string, data: any): Promise<void> {
    const sendLogger = logger.child('sendDataToDevice', {
        targetUser: cognitoUserName,
        targetDevice: targetDeviceId
    });

    if (!cognitoUserName || !targetDeviceId) {
        sendLogger.debug('Missing username or deviceId, skipping send');
        return;
    }

    const connectionsForUser = await getConnectionsByUserId(cognitoUserName);
    sendLogger.debug('Retrieved user connections for targeted send', {
        targetUser: cognitoUserName,
        targetDevice: targetDeviceId,
        connectionsCount: connectionsForUser.length
    });

    if (connectionsForUser.length === 0) {
        sendLogger.info('No active connections found for user', { targetUser: cognitoUserName });
        return;
    }

    // Find connections for the specific device
    const targetConnections = connectionsForUser.filter(connection => 
        connection.deviceId === targetDeviceId && connection.connectionId
    );

    if (targetConnections.length === 0) {
        sendLogger.info('No active connections found for target device', { 
            targetUser: cognitoUserName,
            targetDevice: targetDeviceId 
        });
        return;
    }

    const sendPromises = targetConnections.map(async (connection) => {
        try {
            const command = new PostToConnectionCommand({
                Data: JSON.stringify(data),
                ConnectionId: connection.connectionId,
            });

            await connectionClient.send(command);
            sendLogger.debug('Targeted message sent to connection successfully', {
                connectionId: connection.connectionId,
                deviceId: connection.deviceId
            });

        } catch (error) {
            const errorCode = error && typeof error === 'object' && 'code' in error ? (error as any).code : 'unknown';
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            sendLogger.error('Failed to send targeted message to connection', {
                error: {
                    code: errorCode,
                    message: errorMessage,
                    fullError: error
                },
                connectionId: connection.connectionId,
                deviceId: connection.deviceId,
                targetUser: cognitoUserName,
                messageType: data.type || 'unknown'
            });

            // Clean up connection immediately on any send failure (like working version)
            sendLogger.info('Cleaning up connection due to targeted send failure', {
                connectionId: connection.connectionId,
                deviceId: connection.deviceId,
                errorCode
            });
            
            await updateConnection({
                userId: cognitoUserName,
                deviceId: connection.deviceId,
                connectionId: undefined,
            });
            
            // Throw error to match working implementation behavior
            throw error;
        }
    });

    // Use Promise.all to match working implementation - if any send fails, the entire operation fails
    await Promise.all(sendPromises);

    await Monitoring.businessMetric('WebSocketTargetedMessagesSent', sendPromises.length, {
        TargetUser: cognitoUserName,
        TargetDevice: targetDeviceId,
        MessageType: data.type || 'unknown'
    });
}

/**
 * Sends a message to all connections for a user except the sender
 */
async function sendDataToUserExceptSender(cognitoUserName: string, senderDeviceId: string, data: any): Promise<void> {
    const sendLogger = logger.child('sendDataToUserExceptSender', {
        targetUser: cognitoUserName,
        senderDevice: senderDeviceId
    });

    if (!cognitoUserName) {
        sendLogger.debug('No username provided, skipping send');
        return;
    }

    const connectionsForUser = await getConnectionsByUserId(cognitoUserName);
    sendLogger.debug('Retrieved user connections for broadcast', {
        targetUser: cognitoUserName,
        senderDevice: senderDeviceId,
        connectionsCount: connectionsForUser.length
    });

    if (connectionsForUser.length === 0) {
        sendLogger.info('No active connections found for user', { targetUser: cognitoUserName });
        return;
    }

    const sendPromises = connectionsForUser.map(async (connection) => {
        // Skip the sender's connections
        if (connection.deviceId === senderDeviceId || !connection.connectionId) {
            sendLogger.debug('Skipping connection (sender or no connectionId)', {
                deviceId: connection.deviceId,
                senderDeviceId,
                hasConnectionId: !!connection.connectionId
            });
            return;
        }

        try {
            const command = new PostToConnectionCommand({
                Data: JSON.stringify(data),
                ConnectionId: connection.connectionId,
            });

            await connectionClient.send(command);
            sendLogger.debug('Broadcast message sent to connection successfully', {
                connectionId: connection.connectionId,
                deviceId: connection.deviceId
            });

        } catch (error) {
            const errorCode = error && typeof error === 'object' && 'code' in error ? (error as any).code : 'unknown';
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            sendLogger.error('Failed to send broadcast message to connection', {
                error: {
                    code: errorCode,
                    message: errorMessage,
                    fullError: error
                },
                connectionId: connection.connectionId,
                deviceId: connection.deviceId,
                targetUser: cognitoUserName,
                messageType: data.type || 'unknown'
            });

            // Clean up connection immediately on any send failure (like working version)
            sendLogger.info('Cleaning up connection due to broadcast send failure', {
                connectionId: connection.connectionId,
                deviceId: connection.deviceId,
                errorCode
            });
            
            await updateConnection({
                userId: cognitoUserName,
                deviceId: connection.deviceId,
                connectionId: undefined,
            });
            
            // Throw error to match working implementation behavior
            throw error;
        }
    });

    // Use Promise.all to match working implementation - if any send fails, the entire operation fails
    await Promise.all(sendPromises);

    await Monitoring.businessMetric('WebSocketBroadcastMessagesSent', sendPromises.length, {
        TargetUser: cognitoUserName,
        MessageType: data.type || 'unknown'
    });
}


