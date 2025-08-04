import { getTimer, updateTimer, Timer, getTimersSharedWithUser, removeSharedTimerRelationship } from "./backend/timers";

export async function handler(event: any, context: any) {
    console.log("Event: " + JSON.stringify(event));
    console.log("Context: " + JSON.stringify(context));

    let resultBody: string = "<nada>";

    try {
        if (event &&
            event.requestContext &&
            event.requestContext.authorizer &&
            event.requestContext.authorizer.claims) {
            const cognitoUserName: string = event.requestContext.authorizer.claims['cognito:username'];
            console.log("Cognito User: " + cognitoUserName);

            const splitPath = event.path.split('/');

            if (event.resource == '/timers/{timer}') {
                console.log('TIMER resource');

                const timerId = splitPath[2];

                if (event.httpMethod == 'GET') {
                    console.log('GET Request');
                    const timer = await getTimer(timerId);

                    if (timer) {
                        resultBody = JSON.stringify(timer);
                    } else {
                        resultBody = JSON.stringify({ 'error': 'Timer not found' });
                    }
                } else if (event.httpMethod == 'POST') {
                    console.log('POST Request');
                    const body = JSON.parse(event.body);

                    console.log(`${body}`);
                    console.log(`Id: ${body.timer.id}, Name: ${body.timer.name}`);

                    await updateTimer(new Timer(
                        body.timer.id,
                        cognitoUserName,
                        body.timer.name,
                        body.timer.totalDuration,
                        body.timer.remainingDuration,
                        body.timer.endTime
                    ));
                    resultBody = JSON.stringify({
                        'result': {
                            'hello': 'world'
                        }
                    });
                }
            } else if (event.resource == '/timers/shared') {
                console.log('SHARED TIMERS resource');
                
                if (event.httpMethod == 'GET') {
                    console.log('GET Shared Timers Request');
                    const sharedTimers = await getTimersSharedWithUser(cognitoUserName);
                    resultBody = JSON.stringify(sharedTimers);
                } else if (event.httpMethod == 'DELETE') {
                    console.log('DELETE Shared Timer Request');
                    const body = JSON.parse(event.body || '{}');
                    const timerId = body.timerId;
                    
                    if (timerId) {
                        try {
                            await removeSharedTimerRelationship(timerId, cognitoUserName);
                            resultBody = JSON.stringify({ 'result': 'rejected' });
                        } catch (error) {
                            resultBody = JSON.stringify({ 'error': 'Failed to reject shared timer invitation' });
                        }
                    } else {
                        resultBody = JSON.stringify({ 'error': 'Missing timerId in request body' });
                    }
                }
            }
        }
    } catch (e) {
        resultBody = JSON.stringify({ 'error': String(e) });
    }

    console.log("Result Body: " + resultBody);

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