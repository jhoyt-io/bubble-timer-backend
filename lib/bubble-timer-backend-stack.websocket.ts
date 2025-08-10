// import { getTimer, updateTimer, Timer } from "./backend/timers";
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

const jwtVerifier = CognitoJwtVerifier.create({
    userPoolId: 'us-east-1_cjED6eOHp',
    tokenUse: 'id',
    clientId: '4t3c5p3875qboh3p1va2t9q63c',
});

const connectionClient = new ApiGatewayManagementApiClient({
    endpoint: 'https://zc4ahryh1l.execute-api.us-east-1.amazonaws.com/prod/',
});

export async function handler(event: any, context: any) {
    console.log("Event: " + JSON.stringify(event));
    console.log("Context: " + JSON.stringify(context));

    const connectionId = event.requestContext.connectionId;
    let cognitoUserName;
    let deviceId = '';
    let resultBody = "{}";

    try {
        if (event.headers) {
            const cognitoToken = event.headers.Authorization;
            deviceId = event.headers.DeviceId;

            try {
                const payload = await jwtVerifier.verify(cognitoToken);
                console.log("Token is valid. Payload: ", payload);

                cognitoUserName = payload['cognito:username'];
            } catch {
                console.log("Token not valid!");
            }
        } else {
            console.log("No token, getting auth info for connection id: ", connectionId);
            const connection = await getConnectionById(connectionId);

            cognitoUserName = connection?.userId;
            deviceId = connection?.deviceId || '';

            console.log("Cognito user name: ", cognitoUserName);
            console.log("Device id: ", deviceId);
        }

        if (cognitoUserName) {
            if (event.requestContext.eventType === 'CONNECT') {
                try {
                    await updateConnection({
                        userId: cognitoUserName,
                        deviceId,
                        connectionId,
                    });
                    console.log("Updated connection!");
                } catch(e) {
                    console.error("FAILED to update connection!", e);
                    throw e;
                }
            } else if (event.requestContext.eventType === 'DISCONNECT') {
                try {
                    await updateConnection({
                        userId: cognitoUserName,
                        deviceId,
                        connectionId: undefined,
                    });
                    console.log("Updated connection!");
                } catch(e) {
                    console.error("FAILED to update connection!", e);
                    throw e;
                }
            } else if (event.requestContext.routeKey === 'sendmessage') {
                try {
                    const body = JSON.parse(event.body);
                    const data = body.data;
                    console.log('Received WebSocket message:', JSON.stringify(data));

                    // Handle ping messages
                    if (data.type === 'ping') {
                        console.log('Received ping message from device:', deviceId);
                        const pongData = {
                            type: 'pong',
                            timestamp: data.timestamp
                        };
                        console.log('Sending pong response:', JSON.stringify(pongData));
                        try {
                            // Passed device id is skipped so specify empty string to send to all connections for the user
                            await sendDataToUser(cognitoUserName, '', pongData);
                            console.log('Successfully sent pong response');
                        } catch (error) {
                            console.error('Failed to send pong response:', error);
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
                        console.log(`Message ${data.messageId} acknowledged`);
                        return;
                    }



                    // Add messageId to outgoing messages
                    if (data.type === 'activeTimerList' || data.type === 'updateTimer' || data.type === 'stopTimer') {
                        const messageWithId = {
                            ...data,
                            messageId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                        };
                        console.log('Got ', messageWithId.type, ' sending to all connections for user id ', cognitoUserName);

                        await sendDataToUser(cognitoUserName, deviceId, messageWithId);
                    }

                    // Send timer updates to all users who are currently sharing the timer
                    if (data.type === 'updateTimer' || data.type === 'stopTimer') {
                        const currentSharedUsers = await getSharedTimerRelationships(data.timerId || data.timer?.id);
                        console.log('Got ', data.type, ' sending to all users currently sharing timer:', currentSharedUsers);

                        Promise.allSettled(
                            currentSharedUsers.map((userName: string) => {
                                console.log('Sending to: ', userName);
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
                        }

                        // Stop timer in ddb (after sending messages to all shared users)
                        if (data.type === 'stopTimer') {
                            // Get all shared users before deleting the timer
                            console.log('Stopping timer and removing shared relationships for users:', currentSharedUsers);
                            
                            // Remove all shared timer relationships
                            for (const sharedUser of currentSharedUsers) {
                                await removeSharedTimerRelationship(data.timerId, sharedUser);
                            }
                            
                            // Delete the timer
                            await stopTimer(data.timerId);
                        }
                    }
                } catch (error) {
                    console.error('Error processing message:', error);
                    throw error;
                }
            }
        }
    } catch (error) {
        console.error('Lambda handler error:', error);
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
        console.log("No cognito user name, skipping");
        return;
    }

    console.log(`Looking up connections for user: ${cognitoUserName}`);
    const connectionsForUser = await getConnectionsByUserId(cognitoUserName);
    console.log(`Found ${connectionsForUser?.length || 0} connections for user`);
    
    if (!connectionsForUser || connectionsForUser.length === 0) {
        console.log(`No connections found for user ${cognitoUserName}`);
        return;
    }

    const sendPromises = connectionsForUser.map(async (connection) => {
        console.log(`Processing connection - deviceId: ${connection.deviceId}, connectionId: ${connection.connectionId}`);
        if (connection.deviceId !== sentFrom && connection.connectionId) {
            console.log(`Sending message to connection ${connection.connectionId}:`, JSON.stringify(data));
            const command = new PostToConnectionCommand({
                Data: JSON.stringify(data),
                ConnectionId: connection.connectionId,
            });

            try {
                await connectionClient.send(command);
                console.log(`Successfully sent message to connection ${connection.connectionId}`);
            } catch (error) {
                console.error(`Failed to send message to connection ${connection.connectionId}:`, error);
                await updateConnection({
                    userId: cognitoUserName,
                    deviceId: connection.deviceId,
                    connectionId: undefined,
                });
                throw error;
            }
        } else if (connection.deviceId === sentFrom) {
            console.log('Sending to self, skipping');
        } else if (!connection.connectionId) {
            console.log('Connection has no connection id, skipping');
        }
    });

    await Promise.all(sendPromises);
}
