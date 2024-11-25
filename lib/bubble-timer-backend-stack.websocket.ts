// import { getTimer, updateTimer, Timer } from "./backend/timers";
import { CognitoJwtVerifier } from 'aws-jwt-verify';

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

    const resultBody: string = "{}";
    try {
        const payload = await jwtVerifier.verify(cognitoToken);
        console.log("Token is valid. Payload: ", payload);
    } catch {
        console.log("Token not valid!");
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