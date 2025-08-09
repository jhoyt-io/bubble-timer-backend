import { AttributeValue, DeleteItemCommand, DynamoDBClient, GetItemCommand, GetItemOutput, QueryCommand, ScanCommand, UpdateItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { Config } from '../config';
import { TimerError, TimerErrorCodes } from './errors/TimerError';
import { ValidationUtils } from './utils/validation';
import { MonitoringLogger, PerformanceMonitor } from '../monitoring';

const logger = new MonitoringLogger('TimerService');

class Timer {
    public id: string;
    public userId: string;
    public name: string;
    public totalDuration: string;
    public remainingDuration?: string;
    public endTime?: string;

    constructor(id: string, userId: string, name: string, totalDuration: string, remainingDuration?: string, endTime?: string) {
        this.id = id;
        this.userId = userId;
        this.name = name;
        this.totalDuration = totalDuration;
        this.remainingDuration = remainingDuration;
        this.endTime = endTime;
    }

    /**
     * Creates a Timer from validated data
     */
    static fromValidatedData(data: any): Timer {
        const validated = ValidationUtils.validateTimer(data);
        return new Timer(
            validated.id,
            validated.userId,
            validated.name,
            validated.totalDuration,
            validated.remainingDuration,
            validated.endTime
        );
    }
}

async function updateTimer(timer: Timer): Promise<void> {
    return PerformanceMonitor.trackDatabaseOperation('put', 'timers', async () => {
        const timerLogger = logger.child('updateTimer', { timerId: timer.id, userId: timer.userId });
        
        try {
            // Validate timer data
            const validatedTimer = Timer.fromValidatedData(timer);
            
            const client = Config.database;
            const command = new PutItemCommand({
                TableName: Config.tables.timers,
                Item: {
                    id: { S: validatedTimer.id },
                    user_id: { S: validatedTimer.userId },
                    name: { S: validatedTimer.name },
                    total_duration: { S: validatedTimer.totalDuration },
                    ...(validatedTimer.remainingDuration && { remaining_duration: { S: validatedTimer.remainingDuration } }),
                    ...(validatedTimer.endTime && { end_time: { S: validatedTimer.endTime } }),
                    updated_at: { S: new Date().toISOString() }
                }
            });

            const results = await client.send(command);
            timerLogger.info('Timer updated successfully', { 
                timerId: validatedTimer.id,
                httpStatusCode: results.$metadata.httpStatusCode 
            });
            
        } catch (error) {
            timerLogger.error('Failed to update timer', error);
            
            if (error instanceof Error && error.name === 'ValidationException') {
                throw new TimerError(
                    'Timer data validation failed',
                    TimerErrorCodes.TIMER_UPDATE_FAILED,
                    400,
                    { originalError: error.message }
                );
            }
            
            throw new TimerError(
                'Failed to update timer in database',
                TimerErrorCodes.TIMER_UPDATE_FAILED,
                500,
                { originalError: error instanceof Error ? error.message : String(error) }
            );
        }
    });
}

async function getTimer(timerId: string): Promise<Timer | null> {
    return PerformanceMonitor.trackDatabaseOperation('get', 'timers', async () => {
        const timerLogger = logger.child('getTimer', { timerId });
        
        try {
            // Validate timer ID
            const validatedTimerId = ValidationUtils.validateTimerId(timerId);
            
            const client = Config.database;
            const command = new GetItemCommand({
                TableName: Config.tables.timers,
                Key: {
                    id: {
                        S: validatedTimerId,
                    },
                },
            });

            const results = await client.send(command);
            timerLogger.debug('DynamoDB get response', { 
                timerId: validatedTimerId,
                found: !!results.Item,
                httpStatusCode: results.$metadata.httpStatusCode 
            });

            if (results.Item) {
                const timer = convertItemToTimer(results.Item);
                timerLogger.info('Timer retrieved successfully', { timerId: validatedTimerId });
                return timer;
            }

            timerLogger.info('Timer not found', { timerId: validatedTimerId });
            return null;
        } catch (error) {
            timerLogger.error('Failed to get timer', error);
            
            if (error instanceof Error && error.name === 'ResourceNotFoundException') {
                throw new TimerError(
                    'Timer not found',
                    TimerErrorCodes.TIMER_NOT_FOUND,
                    404,
                    { timerId }
                );
            }
            
            throw new TimerError(
                'Failed to retrieve timer from database',
                TimerErrorCodes.TIMER_NOT_FOUND,
                500,
                { 
                    timerId,
                    originalError: error instanceof Error ? error.message : String(error) 
                }
            );
        }
    });
}

async function getTimersSharedWithUser(username: string): Promise<Timer[]> {
    return PerformanceMonitor.trackDatabaseOperation('query', 'shared_timers', async () => {
        const timerLogger = logger.child('getTimersSharedWithUser', { username });
        
        try {
            // Validate username
            const validatedUsername = ValidationUtils.validateUserId(username);
            
            const client = Config.database;
            const command = new QueryCommand({
                TableName: Config.tables.sharedTimers,
                KeyConditionExpression: "shared_with_user = :username",
                ExpressionAttributeValues: {
                    ":username": { S: validatedUsername }
                }
            });
            
            const results = await client.send(command);
            timerLogger.debug('DynamoDB shared timers response', { 
                username: validatedUsername,
                sharedTimersCount: results.Items?.length || 0,
                httpStatusCode: results.$metadata.httpStatusCode 
            });
            
            if (!results.Items || results.Items.length === 0) {
                timerLogger.info('No shared timers found for user', { username: validatedUsername });
                return [];
            }
            
            // Get the actual timer data for each shared timer
            const timerPromises = results.Items.map(async (item: any) => {
                const timerId = item.timer_id.S!;
                return await getTimer(timerId);
            });
            
            const timers = await Promise.all(timerPromises);
            const validTimers = timers.filter((timer: Timer | null) => timer !== null) as Timer[];
            
            timerLogger.info('Retrieved shared timers successfully', { 
                username: validatedUsername,
                sharedTimersCount: results.Items.length,
                validTimersCount: validTimers.length
            });
            
            return validTimers;
        } catch (error) {
            timerLogger.error('Failed to get shared timers', error);
            
            throw new TimerError(
                'Failed to retrieve shared timers',
                TimerErrorCodes.TIMER_SHARING_FAILED,
                500,
                { 
                    username,
                    originalError: error instanceof Error ? error.message : String(error) 
                }
            );
        }
    });
}

async function getSharedTimerRelationships(timerId: string): Promise<string[]> {
    return PerformanceMonitor.trackDatabaseOperation('query', 'shared_timers', async () => {
        const timerLogger = logger.child('getSharedTimerRelationships', { timerId });
        
        try {
            const validatedTimerId = ValidationUtils.validateTimerId(timerId);
            
            const client = Config.database;
            const command = new QueryCommand({
                TableName: Config.tables.sharedTimers,
                IndexName: 'TimerIdIndex',
                KeyConditionExpression: "timer_id = :timerId",
                ExpressionAttributeValues: {
                    ":timerId": { S: validatedTimerId }
                }
            });
            
            const results = await client.send(command);
            const sharedUsers = results.Items?.map((item: any) => item.shared_with_user.S!) || [];
            
            timerLogger.info('Retrieved shared timer relationships', { 
                timerId: validatedTimerId,
                sharedUsersCount: sharedUsers.length
            });
            
            return sharedUsers;
        } catch (error) {
            timerLogger.error('Failed to get shared timer relationships', error);
            
            throw new TimerError(
                'Failed to retrieve shared timer relationships',
                TimerErrorCodes.TIMER_SHARING_FAILED,
                500,
                { 
                    timerId,
                    originalError: error instanceof Error ? error.message : String(error) 
                }
            );
        }
    });
}

async function addSharedTimerRelationship(timerId: string, sharedWithUser: string): Promise<void> {
    return PerformanceMonitor.trackDatabaseOperation('put', 'shared_timers', async () => {
        const timerLogger = logger.child('addSharedTimerRelationship', { timerId, sharedWithUser });
        
        try {
            const validatedTimerId = ValidationUtils.validateTimerId(timerId);
            const validatedUserId = ValidationUtils.validateUserId(sharedWithUser);
            
            const client = Config.database;
            const command = new PutItemCommand({
                TableName: Config.tables.sharedTimers,
                Item: {
                    shared_with_user: { S: validatedUserId },
                    timer_id: { S: validatedTimerId },
                    created_at: { S: new Date().toISOString() }
                }
            });
            
            await client.send(command);
            timerLogger.info('Added shared timer relationship successfully', { 
                timerId: validatedTimerId,
                sharedWithUser: validatedUserId
            });
        } catch (error) {
            timerLogger.error('Failed to add shared timer relationship', error);
            
            throw new TimerError(
                'Failed to add shared timer relationship',
                TimerErrorCodes.TIMER_SHARING_FAILED,
                500,
                { 
                    timerId,
                    sharedWithUser,
                    originalError: error instanceof Error ? error.message : String(error) 
                }
            );
        }
    });
}

async function removeSharedTimerRelationship(timerId: string, sharedWithUser: string): Promise<void> {
    return PerformanceMonitor.trackDatabaseOperation('delete', 'shared_timers', async () => {
        const timerLogger = logger.child('removeSharedTimerRelationship', { timerId, sharedWithUser });
        
        try {
            const validatedTimerId = ValidationUtils.validateTimerId(timerId);
            const validatedUserId = ValidationUtils.validateUserId(sharedWithUser);
            
            const client = Config.database;
            const command = new DeleteItemCommand({
                TableName: Config.tables.sharedTimers,
                Key: {
                    shared_with_user: { S: validatedUserId },
                    timer_id: { S: validatedTimerId }
                }
            });
            
            await client.send(command);
            timerLogger.info('Removed shared timer relationship successfully', { 
                timerId: validatedTimerId,
                sharedWithUser: validatedUserId
            });
        } catch (error) {
            timerLogger.error('Failed to remove shared timer relationship', error);
            
            throw new TimerError(
                'Failed to remove shared timer relationship',
                TimerErrorCodes.TIMER_SHARING_FAILED,
                500,
                { 
                    timerId,
                    sharedWithUser,
                    originalError: error instanceof Error ? error.message : String(error) 
                }
            );
        }
    });
}

async function stopTimer(timerId: string): Promise<void> {
    return PerformanceMonitor.trackDatabaseOperation('delete', 'timers', async () => {
        const timerLogger = logger.child('stopTimer', { timerId });
        
        try {
            const validatedTimerId = ValidationUtils.validateTimerId(timerId);
            
            const client = Config.database;
            const command = new DeleteItemCommand({
                TableName: Config.tables.timers,
                Key: {
                    id: {
                        S: validatedTimerId,
                    },
                },
            });
            
            const results = await client.send(command);
            timerLogger.info('Timer stopped successfully', { 
                timerId: validatedTimerId,
                httpStatusCode: results.$metadata.httpStatusCode
            });
        } catch (error) {
            timerLogger.error('Failed to stop timer', error);
            
            throw new TimerError(
                'Failed to stop timer',
                TimerErrorCodes.TIMER_DELETE_FAILED,
                500,
                { 
                    timerId,
                    originalError: error instanceof Error ? error.message : String(error) 
                }
            );
        }
    });
}

function convertItemToTimer(item: { [key: string] : AttributeValue }): Timer {
    try {
        if (!item.id?.S || !item.user_id?.S || !item.name?.S || !item.total_duration?.S) {
            throw new TimerError(
                'Invalid timer data from database - missing required fields',
                TimerErrorCodes.TIMER_INVALID_STATE,
                500,
                { item }
            );
        }

        const timer = new Timer(
            item.id.S,
            item.user_id.S,
            item.name.S,
            item.total_duration.S,
            item.remaining_duration?.S,
            item.end_time?.S
        );

        return timer;
    } catch (error) {
        logger.error('Failed to convert DynamoDB item to timer', { error, item });
        
        if (error instanceof TimerError) {
            throw error;
        }
        
        throw new TimerError(
            'Failed to parse timer data from database',
            TimerErrorCodes.TIMER_INVALID_STATE,
            500,
            { originalError: error instanceof Error ? error.message : String(error) }
        );
    }
}

export {
    getTimer,
    updateTimer,
    stopTimer,
    getTimersSharedWithUser,
    addSharedTimerRelationship,
    removeSharedTimerRelationship,
    getSharedTimerRelationships,
    Timer,
}