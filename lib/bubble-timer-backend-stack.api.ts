import { getTimer, updateTimer, Timer, getTimersSharedWithUser, removeSharedTimerRelationship } from "./backend/timers";
import { ErrorHandler } from './backend/middleware/errorHandler';
import { ValidationMiddleware } from './backend/middleware/validation';
import { ResponseUtils } from './backend/utils/response';
import { MonitoringLogger, Monitoring } from './monitoring';

const logger = new MonitoringLogger('ApiHandler');

/**
 * Enhanced API handler with proper error handling, validation, and monitoring
 */
export const handler = ErrorHandler.wrapHandler(async (event: any, context: any) => {
    const requestId = context.awsRequestId;
    const requestLogger = logger.child('request', { requestId, resource: event.resource, method: event.httpMethod });
    const timer = Monitoring.timer('api_request_duration');
    
    try {
        requestLogger.info('API request received', {
            resource: event.resource,
            method: event.httpMethod,
            path: event.path,
            userAgent: event.headers?.['User-Agent']
        });

        // Validate user authentication
        const cognitoUserName = ValidationMiddleware.validateUserIdFromCognito(event);
        const authenticatedLogger = requestLogger.child('authenticated', { userId: cognitoUserName });

        // Validate HTTP method
        const method = ValidationMiddleware.validateHttpMethod(event, ['GET', 'POST', 'DELETE', 'OPTIONS']);

        // Handle CORS preflight
        if (method === 'OPTIONS') {
            authenticatedLogger.info('CORS preflight request');
            return ResponseUtils.success({ message: 'CORS preflight' });
        }

        let result: any;

        // Route handling
        if (event.resource === '/timers/{timer}') {
            result = await handleTimerResource(event, method, cognitoUserName, authenticatedLogger);
        } else if (event.resource === '/timers/shared') {
            result = await handleSharedTimersResource(event, method, cognitoUserName, authenticatedLogger);
        } else {
            throw new Error(`Unknown resource: ${event.resource}`);
        }

        const duration = timer.stop();
        
        // Record API metrics
        await Monitoring.apiRequest(method, event.resource, 200, duration, cognitoUserName);
        
        authenticatedLogger.info('API request completed successfully', {
            duration,
            statusCode: 200
        });

        return result;

    } catch (error) {
        const duration = timer.stop();
        requestLogger.error('API request failed', error);
        
        // Record error metrics
        await Monitoring.apiRequest(
            event.httpMethod || 'UNKNOWN', 
            event.resource || 'UNKNOWN', 
            500, 
            duration, 
            event.requestContext?.authorizer?.claims?.['cognito:username']
        );
        
        await Monitoring.error(
            error instanceof Error ? error.name : 'UnknownError',
            'api_handler',
            'high'
        );

        return ErrorHandler.createApiErrorResponse(error, requestId);
    }
}, 'ApiHandler');

/**
 * Handles /timers/{timer} resource
 */
async function handleTimerResource(
    event: any, 
    method: string, 
    userId: string, 
    requestLogger: MonitoringLogger
): Promise<any> {
    const timerId = ValidationMiddleware.validateTimerIdFromPath(event);
    
    if (method === 'GET') {
        return await handleGetTimer(timerId, requestLogger);
    } else if (method === 'POST') {
        return await handleUpdateTimer(event, userId, requestLogger);
    } else {
        throw new Error(`Method ${method} not allowed for timer resource`);
    }
}

/**
 * Handles /timers/shared resource
 */
async function handleSharedTimersResource(
    event: any, 
    method: string, 
    userId: string, 
    requestLogger: MonitoringLogger
): Promise<any> {
    if (method === 'GET') {
        return await handleGetSharedTimers(userId, requestLogger);
    } else if (method === 'DELETE') {
        return await handleDeleteSharedTimer(event, userId, requestLogger);
    } else {
        throw new Error(`Method ${method} not allowed for shared timers resource`);
    }
}

/**
 * GET /timers/{timer}
 */
async function handleGetTimer(timerId: string, requestLogger: MonitoringLogger): Promise<any> {
    const timerLogger = requestLogger.child('getTimer', { timerId });
    
    const timer = await Monitoring.time('get_timer', async () => {
        return await getTimer(timerId);
    });

    if (!timer) {
        timerLogger.info('Timer not found', { timerId });
        return ResponseUtils.success({ error: 'Timer not found' }, 404);
    }

    timerLogger.info('Timer retrieved successfully', { timerId });
    await Monitoring.timerOperation('create', true, 0, timer.userId);
    
    return ResponseUtils.timerResponse(timer);
}

/**
 * POST /timers/{timer}
 */
async function handleUpdateTimer(event: any, userId: string, requestLogger: MonitoringLogger): Promise<any> {
    const timerLogger = requestLogger.child('updateTimer', { userId });
    
    // Validate request body
    const validatedTimer = ValidationMiddleware.validateTimerBody(event.body);
    
    // Ensure the timer belongs to the authenticated user
    if (validatedTimer.userId !== userId) {
        timerLogger.warn('User attempted to update timer belonging to different user', {
            requestUserId: userId,
            timerUserId: validatedTimer.userId,
            timerId: validatedTimer.id
        });
        return ResponseUtils.success({ error: 'Access denied' }, 403);
    }

    await Monitoring.time('update_timer', async () => {
        const timer = Timer.fromValidatedData(validatedTimer);
        await updateTimer(timer);
    });

    timerLogger.info('Timer updated successfully', { 
        timerId: validatedTimer.id,
        userId 
    });
    
    await Monitoring.timerOperation('update', true, 0, userId);
    
    return ResponseUtils.success({
        result: {
            message: 'Timer updated successfully',
            timerId: validatedTimer.id
        }
    });
}

/**
 * GET /timers/shared
 */
async function handleGetSharedTimers(userId: string, requestLogger: MonitoringLogger): Promise<any> {
    const sharedLogger = requestLogger.child('getSharedTimers', { userId });
    
    const sharedTimers = await Monitoring.time('get_shared_timers', async () => {
        return await getTimersSharedWithUser(userId);
    });

    sharedLogger.info('Shared timers retrieved successfully', { 
        userId,
        sharedTimersCount: sharedTimers.length 
    });
    
    await Monitoring.businessMetric('SharedTimersRetrieved', sharedTimers.length, {
        UserId: userId
    });
    
    return ResponseUtils.success(sharedTimers);
}

/**
 * DELETE /timers/shared
 */
async function handleDeleteSharedTimer(event: any, userId: string, requestLogger: MonitoringLogger): Promise<any> {
    const deleteLogger = requestLogger.child('deleteSharedTimer', { userId });
    
    const { timerId } = ValidationMiddleware.validateSharedTimerQuery(event);
    
    await Monitoring.time('remove_shared_timer', async () => {
        await removeSharedTimerRelationship(timerId, userId);
    });

    deleteLogger.info('Shared timer relationship removed successfully', { 
        timerId,
        userId 
    });
    
    await Monitoring.timerOperation('share', true, 0, userId);
    
    return ResponseUtils.success({ 
        result: 'Shared timer invitation rejected successfully',
        timerId 
    });
}