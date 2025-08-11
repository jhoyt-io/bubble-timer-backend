// import { getTimer, updateTimer, Timer } from "./backend/timers";
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { getConnectionById, getConnectionsByUserId, updateConnection } from './backend/connections';
import { 
    stopTimer, 
    Timer, 
    updateTimer, 
    getTimer,
    removeSharedTimerRelationship,
    getSharedTimerRelationships
} from "./backend/timers";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { createWebSocketLogger } from './core/logger';

const jwtVerifier = CognitoJwtVerifier.create({
    userPoolId: 'us-east-1_cjED6eOHp',
    tokenUse: 'id',
    clientId: '4t3c5p3875qboh3p1va2t9q63c',
});

const connectionClient = new ApiGatewayManagementApiClient({
    endpoint: 'https://zc4ahryh1l.execute-api.us-east-1.amazonaws.com/prod/',
});

export async function handler(event: any, context: any) {
    const connectionId = event.requestContext.connectionId;
    let cognitoUserName;
    let deviceId = '';
    let resultBody = "{}";

    // Create logger with connection context
    const logger = createWebSocketLogger(connectionId);
    logger.debug('WebSocket event received', { eventType: event.requestContext.eventType }, event);
    logger.debug('WebSocket context', { contextType: 'lambda' }, context);

    try {
        if (event.headers) {
            const cognitoToken = event.headers.Authorization;
            deviceId = event.headers.DeviceId;

            try {
                const payload = await jwtVerifier.verify(cognitoToken);
                logger.info('Token validation successful', { tokenType: 'JWT' }, payload);

                cognitoUserName = payload['cognito:username'];
            } catch {
                logger.warn('Token validation failed', { tokenType: 'JWT' });
            }
        } else {
            logger.debug('No token provided, getting auth info from connection', { connectionId });
            const connection = await getConnectionById(connectionId);

            cognitoUserName = connection?.userId;
            deviceId = connection?.deviceId || '';

            logger.debug('Connection auth info retrieved', { cognitoUserName, deviceId });
        }

        if (cognitoUserName) {
            // Update logger with user context
            const userLogger = createWebSocketLogger(connectionId, cognitoUserName, deviceId);
            
            if (event.requestContext.eventType === 'CONNECT') {
                try {
                    await updateConnection({
                        userId: cognitoUserName,
                        deviceId,
                        connectionId,
                    });
                    userLogger.info('Connection established', { eventType: 'CONNECT' });
                } catch(e) {
                    userLogger.error('Failed to update connection', { eventType: 'CONNECT' }, e);
                    throw e;
                }
            } else if (event.requestContext.eventType === 'DISCONNECT') {
                try {
                    await updateConnection({
                        userId: cognitoUserName,
                        deviceId,
                        connectionId: undefined,
                    });
                    userLogger.info('Connection disconnected', { eventType: 'DISCONNECT' });
                } catch(e) {
                    userLogger.error('Failed to update connection', { eventType: 'DISCONNECT' }, e);
                    throw e;
                }
            } else if (event.requestContext.routeKey === 'sendmessage') {
                let data: any;
                try {
                    const body = JSON.parse(event.body);
                    data = body.data;
                    userLogger.debug('WebSocket message received', { messageType: data.type }, data);

                    // Handle ping messages
                    if (data.type === 'ping') {
                        userLogger.debug('Ping message received', { deviceId });
                        const pongData = {
                            type: 'pong',
                            timestamp: data.timestamp
                        };
                        userLogger.debug('Sending pong response', { pongData });
                        try {
                            // Passed device id is skipped so specify empty string to send to all connections for the user
                            await sendDataToUser(cognitoUserName, '', pongData);
                            userLogger.debug('Pong response sent successfully');
                        } catch (error) {
                            userLogger.error('Failed to send pong response', { pongData }, error);
                            throw error;
                        }
                        return {
                            "isBase64Encoded": false,
                            "statusCode": 200,
                            "headers": { 
                                "Access-Control-Allow-Headers" :  "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                                "Access-Control-Allow-Origin": "http://localhost:4000",
                                "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,PATCH,DELETE",
                                "Content-Type": "application/json",
                            },
                            "body": JSON.stringify({ status: "success" })
                        };
                    }

                    // Handle acknowledge messages
                    if (data.type === 'acknowledge') {
                        userLogger.debug('Message acknowledged', { messageId: data.messageId });
                        return;
                    }



                    // Add messageId to outgoing messages
                    if (data.type === 'activeTimerList' || data.type === 'updateTimer' || data.type === 'stopTimer') {
                        const messageWithId = {
                            ...data,
                            messageId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                        };
                        userLogger.info('Broadcasting message to user connections', { 
                            messageType: messageWithId.type, 
                            messageId: messageWithId.messageId 
                        });

                        await sendDataToUser(cognitoUserName, deviceId, messageWithId);
                    }

                    // Send timer updates to all users who are currently sharing the timer
                    if (data.type === 'updateTimer' || data.type === 'stopTimer') {
                        const currentSharedUsers = await getSharedTimerRelationships(data.timerId || data.timer?.id);
                        userLogger.info('Broadcasting timer update to shared users', { 
                            messageType: data.type, 
                            timerId: data.timerId || data.timer?.id,
                            sharedUserCount: currentSharedUsers.length 
                        });

                        Promise.allSettled(
                            currentSharedUsers.map((userName: string) => {
                                userLogger.debug('Sending timer update to shared user', { userName });
                                return sendDataToUser(userName, deviceId, data);
                            })
                        );

                        // Update timer in ddb
                        if (data.type === 'updateTimer') {
                            await updateTimer(new Timer(
                                data.timer.id,
                                data.timer.userId,
                                data.timer.name,
                                data.timer.totalDuration,
                                data.timer.remainingDuration,
                                data.timer.timerEnd
                            ));
                        }

                        // Stop timer in ddb (after sending messages to all shared users)
                        if (data.type === 'stopTimer') {
                            // Get all shared users before deleting the timer
                            userLogger.info('Stopping timer and removing shared relationships', { 
                                timerId: data.timerId,
                                sharedUserCount: currentSharedUsers.length 
                            });
                            
                            // Remove all shared timer relationships
                            for (const sharedUser of currentSharedUsers) {
                                await removeSharedTimerRelationship(data.timerId, sharedUser);
                            }
                            
                            // Delete the timer
                            await stopTimer(data.timerId);
                        }
                    }
                } catch (error) {
                    userLogger.error('Error processing message', { messageType: data?.type }, error);
                    throw error;
                }
            }
        }
    } catch (error) {
        logger.error('Lambda handler error', { connectionId }, error);
        return {
            "isBase64Encoded": false,
            "statusCode": 500,
            "headers": { 
                "Access-Control-Allow-Headers" :  "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                "Access-Control-Allow-Origin": "http://localhost:4000",
                "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,PATCH,DELETE",
                "Content-Type": "application/json",
            },
            "body": JSON.stringify({ 
                error: "Internal server error",
                details: error instanceof Error ? error.message : String(error)
            })
        };
    }

    return {
        "isBase64Encoded": false,
        "statusCode": 200,
        "headers": { 
            "Access-Control-Allow-Headers" :  "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
            "Access-Control-Allow-Origin": "http://localhost:4000",
            "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,PATCH,DELETE",
            "Content-Type": "application/json",
        },
        "body": resultBody,
    }
}

async function sendDataToUser(cognitoUserName: string, sentFrom: any, data: any) {
    if (!cognitoUserName) {
        // Use a basic logger since we don't have connection context
        const { log } = require('./core/logger');
        log.warn('No cognito user name provided for sendDataToUser', { sentFrom });
        return;
    }

    const logger = createWebSocketLogger(undefined, cognitoUserName, sentFrom);
    logger.debug('Looking up connections for user', { cognitoUserName });
    const connectionsForUser = await getConnectionsByUserId(cognitoUserName);
    logger.debug('Found connections for user', { 
        cognitoUserName, 
        connectionCount: connectionsForUser?.length || 0 
    });
    
    if (!connectionsForUser || connectionsForUser.length === 0) {
        logger.warn('No connections found for user', { cognitoUserName });
        return;
    }

    const sendPromises = connectionsForUser.map(async (connection) => {
        logger.debug('Processing connection', { 
            deviceId: connection.deviceId, 
            connectionId: connection.connectionId 
        });
        
        if (connection.deviceId !== sentFrom && connection.connectionId) {
            logger.debug('Sending message to connection', { 
                connectionId: connection.connectionId,
                messageType: data?.type 
            }, data);
            
            const command = new PostToConnectionCommand({
                Data: JSON.stringify(data),
                ConnectionId: connection.connectionId,
            });

            try {
                await connectionClient.send(command);
                logger.debug('Successfully sent message to connection', { connectionId: connection.connectionId });
            } catch (error) {
                logger.error('Failed to send message to connection', { 
                    connectionId: connection.connectionId,
                    deviceId: connection.deviceId 
                }, error);
                
                await updateConnection({
                    userId: cognitoUserName,
                    deviceId: connection.deviceId,
                    connectionId: undefined,
                });
                throw error;
            }
        } else if (connection.deviceId === sentFrom) {
            logger.debug('Skipping self-send', { deviceId: connection.deviceId });
        } else if (!connection.connectionId) {
            logger.debug('Skipping connection without connection ID', { deviceId: connection.deviceId });
        }
    });

    await Promise.all(sendPromises);
}
