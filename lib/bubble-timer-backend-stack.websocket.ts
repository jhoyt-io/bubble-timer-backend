// import { getTimer, updateTimer, Timer } from "./backend/timers";
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { getConnectionById, getConnectionsByUserId, updateConnection } from './backend/connections';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

const jwtVerifier = CognitoJwtVerifier.create({
    userPoolId: 'us-east-1_cjED6eOHp',
    tokenUse: 'id',
    clientId: '4t3c5p3875qboh3p1va2t9q63c',
});

const connectionClient = new ApiGatewayManagementApiClient();

export async function handler(event: any, context: any) {
    console.log("Event: " + JSON.stringify(event));
    console.log("Context: " + JSON.stringify(context));

    const connectionId = event.requestContext.connectionId;
    const cognitoToken = event.headers.Authorization;
    const deviceId = event.headers.DeviceId;

    let cognitoUserName;
    let resultBody = "{}";
    try {
        const payload = await jwtVerifier.verify(cognitoToken);
        console.log("Token is valid. Payload: ", payload);

        cognitoUserName = payload['cognito:username'];
    } catch {
        console.log("Token not valid!");
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
                console.log("FAILED to update connection!");
            }
        // This may not be reachable, since auth header isn't sent on graceful shutdown
        } else if (event.requestContext.eventType === 'DISCONNECT') {
            try {
                await updateConnection({
                    userId: cognitoUserName,
                    deviceId,
                });
                console.log("Updated connection!");
            } catch(e) {
                console.log("FAILED to update connection!");
            }
        } else if (event.requestContext.routeKey === 'sendmessage') {
            const data = event.body.data;

            if (data.type === 'activeTimerList') {
                console.log('Got ', data.type, ' sending to all connections for user id ', cognitoUserName);

                const connectionsForUser = await getConnectionsByUserId(cognitoUserName);
                connectionsForUser?.forEach(connection => {
                    // Don't send back to self...
                    if (connection.deviceId !== deviceId) {
                        const command = new PostToConnectionCommand({
                            Data: Buffer.from(data),
                            ConnectionId: connection.connectionId,
                        });

                        connectionClient.send(command);
                    }
                });
            }
        }
    } else if (connectionId) {
        const connection = await getConnectionById(connectionId);

        if (connection) {
            try {
                await updateConnection({
                    ...connection,
                    connectionId: undefined,
                });
                console.log("Updated connection!");
            } catch (e) {
                console.log("FAILED to update connection!");
            }
        }
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