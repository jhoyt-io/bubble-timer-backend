import { AttributeValue, DynamoDBClient, GetItemCommand, GetItemOutput, QueryCommand, ScanCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

class Connection {
    public userId: string;
    public deviceId: string;

    public connectionId?: string;

    constructor(userId: string, deviceId: string, connectionId?: string) {
        this.userId = userId;
        this.deviceId = deviceId;
        this.connectionId = connectionId;
    }
}

async function updateConnection(connection: Connection) {
    const client = new DynamoDBClient({ region: "us-east-1" });
    let command;
    if (connection.connectionId) {
        command = new UpdateItemCommand({
            TableName: process.env.USER_CONNECTIONS_TABLE_NAME,
            Key: {
                user_id: {
                    S: connection.userId,
                },
                device_id: {
                    S: connection.deviceId,
                },
            },
            AttributeUpdates: {
                connection_id: {
                    Value: {
                        S: connection.connectionId!,
                    },
                    Action: 'PUT',
                },
            },
        });
    } else {
        command = new UpdateItemCommand({
            TableName: process.env.USER_CONNECTIONS_TABLE_NAME,
            Key: {
                user_id: {
                    S: connection.userId,
                },
                device_id: {
                    S: connection.deviceId,
                },
            },
            AttributeUpdates: {
                connection_id: {
                    Action: "DELETE",
                },
            },
        });
    }

    try {
        const results = await client.send(command);
        console.log("DDB Response: " + JSON.stringify(results));
    } catch(err) {
        console.error("DDB Error: " + err);
    }
}

async function getConnection(userId: string, deviceId: string) {
    const client = new DynamoDBClient({ region: "us-east-1" });
    const command = new GetItemCommand({
        TableName: process.env.USER_CONNECTIONS_TABLE_NAME,
        Key: {
            user_id: {
                S: userId,
            },
            device_id: {
                S: deviceId,
            },
        },
    });
    try {
        const results = await client.send(command);
        console.log("DDB Response: " + JSON.stringify(results));

        if (results.Item) {
            return convertItemToConnection(results.Item);
        }

        return null;
    } catch(err) {
        console.error("DDB Error: " + err);
        return null;
    }
}

function convertItemToConnection(item: { [key: string] : AttributeValue }) {
    const timer = new Connection(
        item.user_id.S!,
        item.device_id.S!,
        item.connection_id.S,
    );

    return timer;
}

export {
    getConnection,
    updateConnection,
    Connection,
}