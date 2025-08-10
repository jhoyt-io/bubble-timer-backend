import { AttributeValue, DeleteItemCommand, DynamoDBClient, GetItemCommand, GetItemOutput, QueryCommand, ScanCommand, UpdateItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";

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
        console.log("DDB Response: " + JSON.stringify(results));
    } catch(err) {
        console.error("DDB Error: " + err);
    }
}

async function getTimer(timerId: string) {
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
        console.log("DDB Response: " + JSON.stringify(results));

        if (results.Item) {
            return convertItemToTimer(results.Item);
        }

        return null;
    } catch(err) {
        console.error("DDB Error: " + err);
        return null;
    }
}

async function getTimersSharedWithUser(username: string) {
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
        console.log("DDB Shared Timers Response: " + JSON.stringify(results));
        
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
        console.error("DDB Error getting shared timers: " + err);
        return [];
    }
}

async function getSharedTimerRelationships(timerId: string) {
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
        console.log("DDB Shared Relationships Response: " + JSON.stringify(results));
        return results.Items?.map(item => item.shared_with_user.S!) || [];
    } catch(err) {
        console.error("DDB Error getting shared relationships: " + err);
        return [];
    }
}

async function addSharedTimerRelationship(timerId: string, sharedWithUser: string) {
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
        console.log(`Added shared timer relationship: ${timerId} -> ${sharedWithUser}`);
    } catch(err) {
        console.error("DDB Error adding shared timer relationship: " + err);
    }
}

async function removeSharedTimerRelationship(timerId: string, sharedWithUser: string) {
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
        console.log(`Removed shared timer relationship: ${timerId} -> ${sharedWithUser}`);
    } catch(err) {
        console.error("DDB Error removing shared timer relationship: " + err);
    }
}

async function stopTimer(timerId: string) {
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
        console.log("DDB Response: " + JSON.stringify(results));

        return;
    } catch(err) {
        console.error("DDB Error: " + err);
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
    Timer,
}