import { getTimer, updateTimer, Timer, getTimersSharedWithUser, removeSharedTimerRelationship } from "./backend/timers";
import { createApiLogger } from './core/logger';

export async function handler(event: any, context: any) {
    let resultBody: string = "<nada>";

    // Create logger with API context
    const logger = createApiLogger();
    logger.debug('API event received', { 
        httpMethod: event.httpMethod,
        resource: event.resource,
        path: event.path 
    }, event);
    logger.debug('API context', { contextType: 'lambda' }, context);

    try {
        if (event &&
            event.requestContext &&
            event.requestContext.authorizer &&
            event.requestContext.authorizer.claims) {
            const cognitoUserName: string = event.requestContext.authorizer.claims['cognito:username'];
            
            // Create user-specific logger
            const userLogger = createApiLogger(event.httpMethod, cognitoUserName);
            userLogger.info('User authenticated', { authMethod: 'cognito' });

            const splitPath = event.path.split('/');

            if (event.resource == '/timers/{timer}') {
                userLogger.debug('Processing TIMER resource', { timerId: splitPath[2] });

                const timerId = splitPath[2];

                if (event.httpMethod == 'GET') {
                    userLogger.info('Processing GET timer request', { timerId });
                    const timer = await getTimer(timerId);

                    if (timer) {
                        resultBody = JSON.stringify(timer);
                        userLogger.debug('Timer retrieved successfully', { timerId });
                    } else {
                        resultBody = JSON.stringify({ 'error': 'Timer not found' });
                        userLogger.warn('Timer not found', { timerId });
                    }
                } else if (event.httpMethod == 'POST') {
                    userLogger.info('Processing POST timer request', { timerId });
                    const body = JSON.parse(event.body);

                    userLogger.debug('Timer update data received', { 
                        timerId: body.timer.id, 
                        timerName: body.timer.name 
                    }, body);

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
                    userLogger.info('Timer updated successfully', { timerId: body.timer.id });
                }
            } else if (event.resource == '/timers/shared') {
                userLogger.debug('Processing SHARED TIMERS resource');
                
                if (event.httpMethod == 'GET') {
                    userLogger.info('Processing GET shared timers request');
                    const sharedTimers = await getTimersSharedWithUser(cognitoUserName);
                    resultBody = JSON.stringify(sharedTimers);
                    userLogger.debug('Shared timers retrieved', { 
                        sharedTimerCount: sharedTimers.length 
                    });
                } else if (event.httpMethod == 'DELETE') {
                    userLogger.info('Processing DELETE shared timer request');
                    const body = JSON.parse(event.body || '{}');
                    const timerId = body.timerId;
                    
                    if (timerId) {
                        try {
                            await removeSharedTimerRelationship(timerId, cognitoUserName);
                            resultBody = JSON.stringify({ 'result': 'rejected' });
                            userLogger.info('Shared timer relationship removed', { timerId });
                        } catch (error) {
                            resultBody = JSON.stringify({ 'error': 'Failed to reject shared timer invitation' });
                            userLogger.error('Failed to remove shared timer relationship', { timerId }, error);
                        }
                    } else {
                        resultBody = JSON.stringify({ 'error': 'Missing timerId in request body' });
                        userLogger.warn('Missing timerId in DELETE shared timer request');
                    }
                }
            }
        }
    } catch (e) {
        logger.error('API handler error', { 
            httpMethod: event.httpMethod,
            resource: event.resource 
        }, e);
        resultBody = JSON.stringify({ 'error': String(e) });
    }

    logger.debug('API response prepared', { 
        resultBodyLength: resultBody.length,
        hasError: resultBody.includes('"error"')
    });

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