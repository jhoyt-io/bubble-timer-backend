import { getTimer, updateTimer, Timer, getTimersSharedWithUser, removeSharedTimerRelationship, shareTimerWithUsers } from "./backend/timers";
import { NotificationService } from "./backend/notifications";
import { uploadAvatar, getAvatar, deleteAvatar } from "./backend/avatars";
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
                } else if (event.httpMethod == 'POST') {
                    userLogger.info('Processing POST shared timer request');
                    const body = JSON.parse(event.body || '{}');
                    const { timerId, userIds, timer } = body;
                    
                    if (timerId && userIds && Array.isArray(userIds)) {
                        try {
                            const result = await shareTimerWithUsers(timerId, cognitoUserName, userIds, timer);
                            resultBody = JSON.stringify({
                                result: 'shared',
                                success: result.success,
                                failed: result.failed
                            });
                            userLogger.info('Timer shared successfully', { 
                                timerId, 
                                successCount: result.success.length,
                                failedCount: result.failed.length 
                            });
                        } catch (error) {
                            resultBody = JSON.stringify({ 'error': 'Failed to share timer' });
                            userLogger.error('Failed to share timer', { timerId }, error);
                        }
                    } else {
                        resultBody = JSON.stringify({ 'error': 'Missing timerId or userIds in request body' });
                        userLogger.warn('Missing timerId or userIds in POST shared timer request');
                    }
                } else if (event.httpMethod == 'DELETE') {
                    userLogger.info('Processing DELETE shared timer request');
                    // Support both query parameter and body for timerId to stay compatible with clients
                    const queryTimerId = event.queryStringParameters && event.queryStringParameters.timerId;
                    const body = JSON.parse(event.body || '{}');
                    const bodyTimerId = body.timerId;
                    const timerId = queryTimerId || bodyTimerId;

                    userLogger.debug('Parsed DELETE shared timer request params', {
                        queryTimerId: queryTimerId ? '[present]' : '[absent]',
                        bodyTimerId: bodyTimerId ? '[present]' : '[absent]'
                    });

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
                        // Keep legacy error message for test compatibility
                        resultBody = JSON.stringify({ 'error': 'Missing timerId in request body' });
                        userLogger.warn('Missing timerId in DELETE shared timer request');
                    }
                }
            } else if (event.resource == '/device-tokens') {
                userLogger.debug('Processing DEVICE TOKENS resource');
                const notificationService = new NotificationService();
                
                if (event.httpMethod == 'POST') {
                    userLogger.info('Processing POST device token request');
                    const body = JSON.parse(event.body || '{}');
                    const { deviceId, fcmToken } = body;
                    
                    if (deviceId && fcmToken) {
                        try {
                            await notificationService.registerDeviceToken(cognitoUserName, deviceId, fcmToken);
                            resultBody = JSON.stringify({ 'result': 'registered' });
                            userLogger.info('Device token registered successfully', { deviceId });
                        } catch (error) {
                            resultBody = JSON.stringify({ 'error': 'Failed to register device token' });
                            userLogger.error('Failed to register device token', { deviceId }, error);
                        }
                    } else {
                        resultBody = JSON.stringify({ 'error': 'Missing deviceId or fcmToken in request body' });
                        userLogger.warn('Missing deviceId or fcmToken in POST device token request');
                    }
                }
            } else if (event.resource == '/device-tokens/{deviceId}') {
                userLogger.debug('Processing DEVICE TOKEN resource', { deviceId: splitPath[2] });
                const notificationService = new NotificationService();
                const deviceId = splitPath[2];
                
                if (event.httpMethod == 'DELETE') {
                    userLogger.info('Processing DELETE device token request', { deviceId });
                    
                    try {
                        await notificationService.removeDeviceToken(cognitoUserName, deviceId);
                        resultBody = JSON.stringify({ 'result': 'removed' });
                        userLogger.info('Device token removed successfully', { deviceId });
                    } catch (error) {
                        resultBody = JSON.stringify({ 'error': 'Failed to remove device token' });
                        userLogger.error('Failed to remove device token', { deviceId }, error);
                    }
                }
            } else if (event.resource == '/users/{userId}/avatar') {
                userLogger.debug('Processing AVATAR resource', { userId: splitPath[2] });
                
                const userId = splitPath[2];

                if (event.httpMethod == 'POST') {
                    userLogger.info('Processing POST avatar request', { userId });
                    try {
                        const body = JSON.parse(event.body || '{}');
                        const { imageData } = body;
                        
                        // Debug logging
                        userLogger.debug('Received imageData', { 
                            hasImageData: !!imageData,
                            imageDataLength: imageData ? imageData.length : 0,
                            imageDataStart: imageData ? imageData.substring(0, Math.min(50, imageData.length)) : 'null'
                        });
                        
                        if (!imageData) {
                            resultBody = JSON.stringify({ 'error': 'Missing imageData in request body' });
                            userLogger.warn('Missing imageData in POST avatar request');
                            return {
                                "isBase64Encoded": false,
                                "statusCode": 400,
                                "headers": { 
                                    "Access-Control-Allow-Headers" :  "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                                    "Access-Control-Allow-Origin": "http://localhost:4000",
                                    "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,PATCH,DELETE",
                                    "Content-Type": "application/json",
                                },
                                "body": resultBody,
                            };
                        } else {
                            const result = await uploadAvatar(userId, imageData);
                            if (result.success) {
                                resultBody = JSON.stringify({ avatarUrl: result.avatarUrl });
                                userLogger.info('Avatar uploaded successfully', { userId });
                            } else {
                                resultBody = JSON.stringify({ 'error': result.error });
                                userLogger.warn('Avatar upload failed', { userId, error: result.error });
                                return {
                                    "isBase64Encoded": false,
                                    "statusCode": 400,
                                    "headers": { 
                                        "Access-Control-Allow-Headers" :  "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                                        "Access-Control-Allow-Origin": "http://localhost:4000",
                                        "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,PATCH,DELETE",
                                        "Content-Type": "application/json",
                                    },
                                    "body": resultBody,
                                };
                            }
                        }
                    } catch (error) {
                        resultBody = JSON.stringify({ 'error': 'Failed to upload avatar' });
                        userLogger.error('Failed to upload avatar', { userId }, error);
                    }
                } else if (event.httpMethod == 'GET') {
                    userLogger.info('Processing GET avatar request', { userId });
                    try {
                        const avatarInfo = await getAvatar(userId);
                        resultBody = JSON.stringify({ avatarUrl: avatarInfo.avatarUrl });
                        userLogger.info('Avatar retrieved successfully', { userId });
                    } catch (error) {
                        resultBody = JSON.stringify({ 'error': 'Failed to retrieve avatar' });
                        userLogger.error('Failed to retrieve avatar', { userId }, error);
                    }
                } else if (event.httpMethod == 'DELETE') {
                    userLogger.info('Processing DELETE avatar request', { userId });
                    try {
                        const result = await deleteAvatar(userId);
                        if (result.success) {
                            resultBody = JSON.stringify({ 'message': 'Avatar deleted successfully' });
                            userLogger.info('Avatar deleted successfully', { userId });
                        } else {
                            resultBody = JSON.stringify({ 'error': result.error });
                            userLogger.warn('Avatar deletion failed', { userId, error: result.error });
                        }
                    } catch (error) {
                        resultBody = JSON.stringify({ 'error': 'Failed to delete avatar' });
                        userLogger.error('Failed to delete avatar', { userId }, error);
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