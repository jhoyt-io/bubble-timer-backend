import { AttributeValue, DynamoDBClient, GetItemCommand, GetItemOutput, QueryCommand, ScanCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { Config } from '../config';
import { NetworkError, NetworkErrorCodes } from './errors/NetworkError';
import { ValidationUtils } from './utils/validation';
import { MonitoringLogger, PerformanceMonitor } from '../monitoring';

const logger = new MonitoringLogger('ConnectionService');

class Connection {
    public userId: string;
    public deviceId: string;
    public connectionId?: string;

    constructor(userId: string, deviceId: string, connectionId?: string) {
        this.userId = userId;
        this.deviceId = deviceId;
        this.connectionId = connectionId;
    }

    /**
     * Creates a Connection from validated data
     */
    static fromValidatedData(data: any): Connection {
        const validated = ValidationUtils.validateConnection(data);
        return new Connection(
            validated.userId,
            validated.deviceId,
            validated.connectionId
        );
    }
}

async function updateConnection(connection: Connection): Promise<void> {
    return PerformanceMonitor.trackDatabaseOperation('put', 'user_connections', async () => {
        const connLogger = logger.child('updateConnection', { 
            userId: connection.userId, 
            deviceId: connection.deviceId,
            hasConnectionId: !!connection.connectionId
        });
        
        try {
            // DEBUG: Log the raw connection data before validation
            connLogger.info('Raw connection data received', {
                userId: connection.userId,
                deviceId: connection.deviceId,
                connectionId: connection.connectionId,
                connectionIdType: typeof connection.connectionId,
                connectionIdLength: connection.connectionId ? connection.connectionId.length : 0
            });
            
            // Validate connection data
            const validatedConnection = Connection.fromValidatedData(connection);
            
            // DEBUG: Log the validated connection data
            connLogger.info('Validated connection data', {
                userId: validatedConnection.userId,
                deviceId: validatedConnection.deviceId,
                connectionId: validatedConnection.connectionId,
                connectionIdType: typeof validatedConnection.connectionId,
                connectionIdLength: validatedConnection.connectionId ? validatedConnection.connectionId.length : 0
            });
            
            const client = Config.database;
            let command;
            
            if (validatedConnection.connectionId) {
                command = new UpdateItemCommand({
                    TableName: Config.tables.userConnections,
                    Key: {
                        user_id: {
                            S: validatedConnection.userId,
                        },
                        device_id: {
                            S: validatedConnection.deviceId,
                        },
                    },
                    AttributeUpdates: {
                        connection_id: {
                            Value: {
                                S: validatedConnection.connectionId,
                            },
                            Action: 'PUT',
                        },
                        updated_at: {
                            Value: {
                                S: new Date().toISOString(),
                            },
                            Action: 'PUT',
                        },
                    },
                });
            } else {
                command = new UpdateItemCommand({
                    TableName: Config.tables.userConnections,
                    Key: {
                        user_id: {
                            S: validatedConnection.userId,
                        },
                        device_id: {
                            S: validatedConnection.deviceId,
                        },
                    },
                    AttributeUpdates: {
                        connection_id: {
                            Action: "DELETE",
                        },
                        updated_at: {
                            Value: {
                                S: new Date().toISOString(),
                            },
                            Action: 'PUT',
                        },
                    },
                });
            }

            // DEBUG: Log which command is being executed
            connLogger.info('Executing DynamoDB command', {
                hasConnectionId: !!validatedConnection.connectionId,
                operation: validatedConnection.connectionId ? 'PUT connection_id' : 'DELETE connection_id',
                tableName: Config.tables.userConnections
            });
            
            const results = await client.send(command);
            connLogger.info('Connection updated successfully', {
                userId: validatedConnection.userId,
                deviceId: validatedConnection.deviceId,
                operation: validatedConnection.connectionId ? 'connect' : 'disconnect',
                httpStatusCode: results.$metadata.httpStatusCode
            });
        } catch (error) {
            connLogger.error('Failed to update connection', error);
            
            throw new NetworkError(
                'Failed to update connection in database',
                NetworkErrorCodes.DATABASE_CONNECTION_FAILED,
                500,
                'updateConnection',
                true
            );
        }
    });
}

async function getConnection(userId: string, deviceId: string): Promise<Connection | null> {
    return PerformanceMonitor.trackDatabaseOperation('get', 'user_connections', async () => {
        const connLogger = logger.child('getConnection', { userId, deviceId });
        
        try {
            const validatedUserId = ValidationUtils.validateUserId(userId);
            const validatedDeviceId = ValidationUtils.validateUserId(deviceId); // Reuse validation
            
            const client = Config.database;
            const command = new GetItemCommand({
                TableName: Config.tables.userConnections,
                Key: {
                    user_id: {
                        S: validatedUserId,
                    },
                    device_id: {
                        S: validatedDeviceId,
                    },
                },
            });
            
            const results = await client.send(command);
            connLogger.debug('DynamoDB get connection response', {
                userId: validatedUserId,
                deviceId: validatedDeviceId,
                found: !!results.Item,
                httpStatusCode: results.$metadata.httpStatusCode
            });

            if (results.Item) {
                const connection = convertItemToConnection(results.Item);
                connLogger.info('Connection retrieved successfully', {
                    userId: validatedUserId,
                    deviceId: validatedDeviceId
                });
                return connection;
            }

            connLogger.info('Connection not found', {
                userId: validatedUserId,
                deviceId: validatedDeviceId
            });
            return null;
        } catch (error) {
            connLogger.error('Failed to get connection', error);
            
            throw new NetworkError(
                'Failed to retrieve connection from database',
                NetworkErrorCodes.DATABASE_CONNECTION_FAILED,
                500,
                'getConnection',
                true
            );
        }
    });
}

async function getConnectionById(connectionId: string): Promise<Connection | null> {
    return PerformanceMonitor.trackDatabaseOperation('query', 'user_connections', async () => {
        const connLogger = logger.child('getConnectionById', { connectionId });
        
        try {
            if (!connectionId || typeof connectionId !== 'string' || connectionId.trim().length === 0) {
                throw new NetworkError(
                    'Connection ID is required and must be a non-empty string',
                    NetworkErrorCodes.CONNECTION_FAILED,
                    400,
                    'getConnectionById'
                );
            }
            
            const client = Config.database;
            const command = new QueryCommand({
                TableName: Config.tables.userConnections,
                IndexName: 'ConnectionsByConnectionId',
                ProjectionExpression: 'user_id, device_id, connection_id',
                ExpressionAttributeValues: {
                    ':connectionId': {
                        'S': connectionId.trim()
                    }
                },
                KeyConditionExpression: 'connection_id = :connectionId',
            });

            const results = await client.send(command);
            connLogger.debug('DynamoDB query by connection ID response', {
                connectionId,
                found: !!(results.Items && results.Items.length > 0),
                count: results.Items?.length || 0,
                httpStatusCode: results.$metadata.httpStatusCode
            });

            if (results.Items && results.Items.length > 0) {
                const connection = convertItemToConnection(results.Items[0]);
                connLogger.info('Connection retrieved by ID successfully', { connectionId });
                return connection;
            }

            connLogger.info('Connection not found by ID', { connectionId });
            return null;
        } catch (error) {
            connLogger.error('Failed to get connection by ID', error);
            
            if (error instanceof NetworkError) {
                throw error;
            }
            
            throw new NetworkError(
                'Failed to retrieve connection by ID from database',
                NetworkErrorCodes.DATABASE_CONNECTION_FAILED,
                500,
                'getConnectionById',
                true
            );
        }
    });
}

async function getConnectionsByUserId(userId: string): Promise<Connection[]> {
    return PerformanceMonitor.trackDatabaseOperation('query', 'user_connections', async () => {
        const connLogger = logger.child('getConnectionsByUserId', { userId });
        
        try {
            const validatedUserId = ValidationUtils.validateUserId(userId);
            
            const client = Config.database;
            const command = new QueryCommand({
                TableName: Config.tables.userConnections,
                ProjectionExpression: 'user_id, device_id, connection_id',
                ExpressionAttributeValues: {
                    ':userId': {
                        'S': validatedUserId
                    }
                },
                KeyConditionExpression: 'user_id = :userId',
            });

            const results = await client.send(command);
            connLogger.debug('DynamoDB query connections by user ID response', {
                userId: validatedUserId,
                connectionsCount: results.Items?.length || 0,
                httpStatusCode: results.$metadata.httpStatusCode
            });

            if (results.Items && results.Items.length > 0) {
                const connections = results.Items.map((item: any) => convertItemToConnection(item));
                connLogger.info('Connections retrieved by user ID successfully', {
                    userId: validatedUserId,
                    connectionsCount: connections.length
                });
                return connections;
            }

            connLogger.info('No connections found for user', { userId: validatedUserId });
            return [];
        } catch (error) {
            connLogger.error('Failed to get connections by user ID', error);
            
            throw new NetworkError(
                'Failed to retrieve connections by user ID from database',
                NetworkErrorCodes.DATABASE_CONNECTION_FAILED,
                500,
                'getConnectionsByUserId',
                true
            );
        }
    });
}

function convertItemToConnection(item: { [key: string] : AttributeValue }): Connection {
    try {
        if (!item.user_id?.S || !item.device_id?.S) {
            throw new NetworkError(
                'Invalid connection data from database - missing required fields',
                NetworkErrorCodes.DATABASE_CONNECTION_FAILED,
                500,
                'convertItemToConnection'
            );
        }

        const connection = new Connection(
            item.user_id.S,
            item.device_id.S,
            item.connection_id?.S
        );

        return connection;
    } catch (error) {
        logger.error('Failed to convert DynamoDB item to connection', { error, item });
        
        if (error instanceof NetworkError) {
            throw error;
        }
        
        throw new NetworkError(
            'Failed to parse connection data from database',
            NetworkErrorCodes.DATABASE_CONNECTION_FAILED,
            500,
            'convertItemToConnection'
        );
    }
}

export {
    getConnection,
    getConnectionById,
    getConnectionsByUserId,
    updateConnection,
    Connection,
}