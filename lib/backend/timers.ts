import { AttributeValue, DynamoDBClient, GetItemCommand, GetItemOutput, QueryCommand, ScanCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

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
    const command = new UpdateItemCommand({
        TableName: process.env.TIMERS_TABLE_NAME,
        Key: {
            id: {
                S: timer.id,
            },
        },
        AttributeUpdates: {
            user_id: {
                Value: {
                    S: timer.userId!,
                },
                Action: 'PUT',
            },
            name: {
                Value: {
                    S: timer.name!,
                },
                Action: 'PUT',
            },
            total_duration: {
                Value: {
                    S: timer.totalDuration!,
                },
                Action: 'PUT',
            },
            remaining_duration: {
                Value: {
                    S: timer.remainingDuration!,
                },
                Action: 'PUT',
            },
            end_time: {
                Value: {
                    S: timer.endTime!,
                },
                Action: 'PUT',
            }
        },
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

function convertItemToTimer(item: { [key: string] : AttributeValue }) {
    const timer = new Timer(
        item.id.S!,
        item.user_id.S!,
        item.name.S!,
        item.total_duration.S!,
        item.remaining_duration?.S,
        item.end_time?.S,
    );

    return timer;
}

export {
    getTimer,
    updateTimer,
    Timer,
}