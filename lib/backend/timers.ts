import { AttributeValue, DeleteItemCommand, DynamoDBClient, GetItemCommand, GetItemOutput, QueryCommand, ScanCommand, UpdateItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { createDatabaseLogger } from '../core/logger';
import { NotificationService } from './notifications';

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
}

async function updateTimer(timer: Timer) {
    const logger = createDatabaseLogger('updateTimer');
    const client = new DynamoDBClient({ region: "us-east-1" });
    const command = new PutItemCommand({
        TableName: process.env.TIMERS_TABLE_NAME,
        Item: {
            id: { S: timer.id },
            user_id: { S: timer.userId },
            name: { S: timer.name },
            total_duration: { S: timer.totalDuration },
            ...(timer.remainingDuration && { remaining_duration: { S: timer.remainingDuration } }),
            ...(timer.endTime && { end_time: { S: timer.endTime } })
        }
    });

    try {
        const results = await client.send(command);
        logger.info("DDB Response", { timerId: timer.id, userId: timer.userId }, results);
    } catch(err) {
        logger.error("DDB Error", { timerId: timer.id, userId: timer.userId }, err);
    }
}

async function getTimer(timerId: string) {
    const logger = createDatabaseLogger('getTimer');
    const client = new DynamoDBClient({ region: "us-east-1" });
    const command = new GetItemCommand({
        TableName: process.env.TIMERS_TABLE_NAME,
        Key: {
            id: {
                S: timerId,
            },
        },
    });
    try {
        const results = await client.send(command);
        logger.info("DDB Response", { timerId }, results);

        if (results.Item) {
            return convertItemToTimer(results.Item);
        }

        return null;
    } catch(err) {
        logger.error("DDB Error", { timerId }, err);
        return null;
    }
}

async function getTimersSharedWithUser(username: string) {
    const logger = createDatabaseLogger('getTimersSharedWithUser');
    const client = new DynamoDBClient({ region: "us-east-1" });
    
    // Use the new shared timers table for efficient queries
    const command = new QueryCommand({
        TableName: process.env.SHARED_TIMERS_TABLE_NAME,
        KeyConditionExpression: "shared_with_user = :username",
        ExpressionAttributeValues: {
            ":username": { S: username }
        }
    });
    
    try {
        const results = await client.send(command);
        logger.info("DDB Shared Timers Response", { username }, results);
        
        if (!results.Items || results.Items.length === 0) {
            return [];
        }
        
        // Get the actual timer data for each shared timer
        const timerPromises = results.Items.map(async (item) => {
            const timerId = item.timer_id.S!;
            return await getTimer(timerId);
        });
        
        const timers = await Promise.all(timerPromises);
        return timers.filter(timer => timer !== null);
    } catch(err) {
        logger.error("DDB Error getting shared timers", { username }, err);
        return [];
    }
}

async function getSharedTimerRelationships(timerId: string) {
    const logger = createDatabaseLogger('getSharedTimerRelationships');
    const client = new DynamoDBClient({ region: "us-east-1" });
    const command = new QueryCommand({
        TableName: process.env.SHARED_TIMERS_TABLE_NAME,
        IndexName: 'TimerIdIndex', // We'll need to add this GSI
        KeyConditionExpression: "timer_id = :timerId",
        ExpressionAttributeValues: {
            ":timerId": { S: timerId }
        }
    });
    
    try {
        const results = await client.send(command);
        logger.info("DDB Shared Relationships Response", { timerId }, results);
        return results.Items?.map(item => item.shared_with_user.S!) || [];
    } catch(err) {
        logger.error("DDB Error getting shared relationships", { timerId }, err);
        return [];
    }
}

async function addSharedTimerRelationship(timerId: string, sharedWithUser: string) {
    const logger = createDatabaseLogger('addSharedTimerRelationship');
    const client = new DynamoDBClient({ region: "us-east-1" });
    const command = new PutItemCommand({
        TableName: process.env.SHARED_TIMERS_TABLE_NAME,
        Item: {
            shared_with_user: { S: sharedWithUser },
            timer_id: { S: timerId },
            created_at: { S: new Date().toISOString() }
        }
    });
    
    try {
        await client.send(command);
        logger.info(`Added shared timer relationship: ${timerId} -> ${sharedWithUser}`, { timerId, sharedWithUser });
    } catch(err) {
        logger.error("DDB Error adding shared timer relationship", { timerId, sharedWithUser }, err);
    }
}

async function removeSharedTimerRelationship(timerId: string, sharedWithUser: string) {
    const logger = createDatabaseLogger('removeSharedTimerRelationship');
    const client = new DynamoDBClient({ region: "us-east-1" });
    const command = new DeleteItemCommand({
        TableName: process.env.SHARED_TIMERS_TABLE_NAME,
        Key: {
            shared_with_user: { S: sharedWithUser },
            timer_id: { S: timerId }
        }
    });
    
    try {
        await client.send(command);
        logger.info(`Removed shared timer relationship: ${timerId} -> ${sharedWithUser}`, { timerId, sharedWithUser });
    } catch(err) {
        logger.error("DDB Error removing shared timer relationship", { timerId, sharedWithUser }, err);
    }
}

/**
 * Share timer with multiple users and send push notifications
 */
async function shareTimerWithUsers(timerId: string, sharerUserId: string, targetUserIds: string[], timerData?: any): Promise<{
    success: string[];
    failed: string[];
}> {
    const logger = createDatabaseLogger('shareTimerWithUsers');
    const notificationService = new NotificationService();
    
    logger.info('Sharing timer with users', { timerId, sharerUserId, targetUserIds });
    
    const success: string[] = [];
    const failed: string[] = [];
    
    // Get timer details for notification
    let timer = await getTimer(timerId);
    
    // If timer doesn't exist but we have timer data, create it
    if (!timer && timerData) {
        logger.info('Timer not found in backend, creating from provided data', { timerId });
        try {
            timer = new Timer(
                timerData.id || timerId,
                timerData.userId || sharerUserId,
                timerData.name || 'Shared Timer',
                timerData.totalDuration || 'PT30M',
                timerData.remainingDuration,
                timerData.endTime
            );
            
            await updateTimer(timer);
            logger.info('Successfully created timer in backend', { timerId });
        } catch (error) {
            logger.error('Failed to create timer in backend', { timerId, error });
            throw new Error('Failed to create timer in backend');
        }
    }
    
    if (!timer) {
        logger.error('Timer not found and no timer data provided', { timerId });
        throw new Error('Timer not found');
    }
    
    // Process each target user
    for (const targetUserId of targetUserIds) {
        try {
            // Add shared timer relationship
            await addSharedTimerRelationship(timerId, targetUserId);
            
            // Send push notification
            await notificationService.sendSharingInvitation(
                targetUserId,
                timerId,
                sharerUserId, // Using userId as name for now
                timer.name
            );
            
            success.push(targetUserId);
            logger.info('Successfully shared timer with user', { timerId, targetUserId });
            
        } catch (error) {
            logger.error('Failed to share timer with user', { timerId, targetUserId, error });
            failed.push(targetUserId);
        }
    }
    
    logger.info('Timer sharing completed', { 
        timerId, 
        sharerUserId, 
        successCount: success.length, 
        failedCount: failed.length 
    });
    
    return { success, failed };
}

async function stopTimer(timerId: string) {
    const logger = createDatabaseLogger('stopTimer');
    const client = new DynamoDBClient({ region: "us-east-1" });
    const command = new DeleteItemCommand({
        TableName: process.env.TIMERS_TABLE_NAME,
        Key: {
            id: {
                S: timerId,
            },
        },
    });
    try {
        const results = await client.send(command);
        logger.info("DDB Response", { timerId }, results);

        return;
    } catch(err) {
        logger.error("DDB Error", { timerId }, err);
        return;
    }
}

function convertItemToTimer(item: { [key: string] : AttributeValue }) {
    const timer = new Timer(
        item.id.S!,
        item.user_id.S!,
        item.name.S!,
        item.total_duration.S!,
        item.remaining_duration?.S,
        item.end_time?.S
    );

    return timer;
}

export {
    getTimer,
    updateTimer,
    stopTimer,
    getTimersSharedWithUser,
    addSharedTimerRelationship,
    removeSharedTimerRelationship,
    getSharedTimerRelationships,
    shareTimerWithUsers,
    Timer,
}