// import { getTimer, updateTimer, Timer } from "./backend/timers";
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { getConnection, getConnectionById, updateConnection } from './backend/connections';

const jwtVerifier = CognitoJwtVerifier.create({
    userPoolId: 'us-east-1_cjED6eOHp',
    tokenUse: 'id',
    clientId: '4t3c5p3875qboh3p1va2t9q63c',
})

export async function handler(event: any, context: any) {
    console.log("Event: " + JSON.stringify(event));
    console.log("Context: " + JSON.stringify(context));

    //     "body": "{\"action\":\"sendmessage\",\"data\":{\"Hello\":\"WORLD?????\"}}",
    event.body

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