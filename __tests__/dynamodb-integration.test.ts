import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
    getTimer, 
    updateTimer, 
    stopTimer, 
    getTimersSharedWithUser, 
    addSharedTimerRelationship, 
    removeSharedTimerRelationship, 
    getSharedTimerRelationships,
    Timer 
} from '../lib/backend/timers';
import { 
    getConnection, 
    getConnectionById, 
    getConnectionsByUserId, 
    updateConnection, 
    Connection 
} from '../lib/backend/connections';

// Mock the DynamoDB client
jest.mock('@aws-sdk/client-dynamodb');

const mockDynamoClient = {
    send: jest.fn()
};

(DynamoDBClient as jest.MockedClass<typeof DynamoDBClient>).mockImplementation(() => mockDynamoClient as any);

// Mock environment variables
process.env.TIMERS_TABLE_NAME = 'test-timers-table';
process.env.SHARED_TIMERS_TABLE_NAME = 'test-shared-timers-table';
process.env.USER_CONNECTIONS_TABLE_NAME = 'test-user-connections-table';

describe('DynamoDB Integration Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        console.log = jest.fn();
        console.error = jest.fn();
    });

    describe('Timer Operations', () => {
        describe('Given a timer exists in the database', () => {
            const mockTimer = {
                id: { S: 'test-timer-id' },
                user_id: { S: 'test-user' },
                name: { S: 'Test Timer' },
                total_duration: { S: 'PT30M' },
                remaining_duration: { S: 'PT25M' },
                end_time: { S: '2024-01-01T12:30:00Z' }
            };

            beforeEach(() => {
                mockDynamoClient.send.mockResolvedValue({ Item: mockTimer });
            });

            describe('When retrieving the timer', () => {
                test('Then the timer should be returned with correct data', async () => {
                    // When
                    const result = await getTimer('test-timer-id');

                    // Then
                    expect(result).toBeInstanceOf(Timer);
                    expect(result?.id).toBe('test-timer-id');
                    expect(result?.userId).toBe('test-user');
                    expect(result?.name).toBe('Test Timer');
                    expect(result?.totalDuration).toBe('PT30M');
                    expect(result?.remainingDuration).toBe('PT25M');
                    expect(result?.endTime).toBe('2024-01-01T12:30:00Z');
                    
                    // Verify DynamoDB was called
                    expect(mockDynamoClient.send).toHaveBeenCalledTimes(1);
                });
            });

            describe('When updating the timer', () => {
                test('Then the timer should be updated in the database', async () => {
                    // Given
                    const updatedTimer = new Timer(
                        'test-timer-id',
                        'test-user',
                        'Updated Timer',
                        'PT45M',
                        'PT40M',
                        '2024-01-01T12:45:00Z'
                    );

                    mockDynamoClient.send.mockResolvedValue({});

                    // When
                    await updateTimer(updatedTimer);

                    // Then
                    expect(mockDynamoClient.send).toHaveBeenCalledTimes(1);
                });
            });

            describe('When stopping the timer', () => {
                test('Then the timer should be deleted from the database', async () => {
                    // Given
                    mockDynamoClient.send.mockResolvedValue({});

                    // When
                    await stopTimer('test-timer-id');

                    // Then
                    expect(mockDynamoClient.send).toHaveBeenCalledTimes(1);
                });
            });
        });

        describe('Given a timer does not exist', () => {
            beforeEach(() => {
                mockDynamoClient.send.mockResolvedValue({ Item: undefined });
            });

            describe('When retrieving the timer', () => {
                test('Then null should be returned', async () => {
                    // When
                    const result = await getTimer('non-existent-timer');

                    // Then
                    expect(result).toBeNull();
                });
            });
        });

        describe('Given a database error occurs', () => {
            beforeEach(() => {
                mockDynamoClient.send.mockRejectedValue(new Error('Database connection failed'));
            });

            describe('When retrieving a timer', () => {
                test('Then null should be returned and error should be logged', async () => {
                    // When
                    const result = await getTimer('test-timer-id');

                    // Then
                    expect(result).toBeNull();
                    expect(console.error).toHaveBeenCalledWith('DDB Error: Error: Database connection failed');
                });
            });

            describe('When updating a timer', () => {
                test('Then the error should be logged', async () => {
                    // Given
                    const timer = new Timer('test-timer-id', 'test-user', 'Test Timer', 'PT30M');

                    // When
                    await updateTimer(timer);

                    // Then
                    expect(console.error).toHaveBeenCalledWith('DDB Error: Error: Database connection failed');
                });
            });
        });
    });

    describe('Shared Timer Operations', () => {
        describe('Given shared timer relationships exist', () => {
            const mockSharedTimers = [
                { timer_id: { S: 'timer-1' } },
                { timer_id: { S: 'timer-2' } }
            ];

            const mockTimerData = {
                id: { S: 'timer-1' },
                user_id: { S: 'owner-user' },
                name: { S: 'Shared Timer' },
                total_duration: { S: 'PT30M' }
            };

            beforeEach(() => {
                // Mock the shared timers query
                mockDynamoClient.send
                    .mockResolvedValueOnce({ Items: mockSharedTimers })
                    .mockResolvedValueOnce({ Item: mockTimerData })
                    .mockResolvedValueOnce({ Item: mockTimerData });
            });

            describe('When retrieving timers shared with a user', () => {
                test('Then all shared timers should be returned', async () => {
                    // When
                    const result = await getTimersSharedWithUser('shared-user');

                    // Then
                    expect(result).toHaveLength(2);
                    expect(result[0]).toBeInstanceOf(Timer);
                    expect(result[0]?.id).toBe('timer-1');
                    
                    // Verify DynamoDB was called multiple times (query + individual timer fetches)
                    expect(mockDynamoClient.send).toHaveBeenCalledTimes(3);
                });
            });
        });

        describe('Given no shared timer relationships exist', () => {
            beforeEach(() => {
                mockDynamoClient.send.mockResolvedValue({ Items: [] });
            });

            describe('When retrieving timers shared with a user', () => {
                test('Then an empty array should be returned', async () => {
                    // When
                    const result = await getTimersSharedWithUser('user-with-no-shares');

                    // Then
                    expect(result).toEqual([]);
                });
            });
        });

        describe('Given shared relationships for a timer exist', () => {
            const mockRelationships = [
                { shared_with_user: { S: 'user1' } },
                { shared_with_user: { S: 'user2' } }
            ];

            beforeEach(() => {
                mockDynamoClient.send.mockResolvedValue({ Items: mockRelationships });
            });

            describe('When retrieving shared relationships for a timer', () => {
                test('Then all shared users should be returned', async () => {
                    // When
                    const result = await getSharedTimerRelationships('shared-timer-id');

                    // Then
                    expect(result).toEqual(['user1', 'user2']);
                    
                    // Verify DynamoDB was called
                    expect(mockDynamoClient.send).toHaveBeenCalledTimes(1);
                });
            });
        });

        describe('When adding a shared timer relationship', () => {
            test('Then the relationship should be created in the database', async () => {
                // Given
                mockDynamoClient.send.mockResolvedValue({});

                // When
                await addSharedTimerRelationship('timer-id', 'shared-user');

                // Then
                expect(mockDynamoClient.send).toHaveBeenCalledTimes(1);
            });
        });

        describe('When removing a shared timer relationship', () => {
            test('Then the relationship should be deleted from the database', async () => {
                // Given
                mockDynamoClient.send.mockResolvedValue({});

                // When
                await removeSharedTimerRelationship('timer-id', 'shared-user');

                // Then
                expect(mockDynamoClient.send).toHaveBeenCalledTimes(1);
            });
        });
    });

    describe('Connection Operations', () => {
        describe('Given a user connection exists', () => {
            const mockConnection = {
                user_id: { S: 'test-user' },
                device_id: { S: 'test-device' },
                connection_id: { S: 'test-connection' }
            };

            beforeEach(() => {
                mockDynamoClient.send.mockResolvedValue({ Item: mockConnection });
            });

            describe('When retrieving a connection by user and device', () => {
                test('Then the connection should be returned with correct data', async () => {
                    // When
                    const result = await getConnection('test-user', 'test-device');

                    // Then
                    expect(result).toBeInstanceOf(Connection);
                    expect(result?.userId).toBe('test-user');
                    expect(result?.deviceId).toBe('test-device');
                    expect(result?.connectionId).toBe('test-connection');
                    
                    // Verify DynamoDB was called
                    expect(mockDynamoClient.send).toHaveBeenCalledTimes(1);
                });
            });

            describe('When updating a connection with a new connection ID', () => {
                test('Then the connection should be updated in the database', async () => {
                    // Given
                    const connection = new Connection('test-user', 'test-device', 'new-connection-id');
                    mockDynamoClient.send.mockResolvedValue({});

                    // When
                    await updateConnection(connection);

                    // Then
                    expect(mockDynamoClient.send).toHaveBeenCalledTimes(1);
                });
            });

            describe('When removing a connection ID', () => {
                test('Then the connection ID should be deleted from the database', async () => {
                    // Given
                    const connection = new Connection('test-user', 'test-device');
                    mockDynamoClient.send.mockResolvedValue({});

                    // When
                    await updateConnection(connection);

                    // Then
                    expect(mockDynamoClient.send).toHaveBeenCalledTimes(1);
                });
            });
        });

        describe('Given multiple connections for a user exist', () => {
            const mockConnections = [
                {
                    user_id: { S: 'test-user' },
                    device_id: { S: 'device-1' },
                    connection_id: { S: 'connection-1' }
                },
                {
                    user_id: { S: 'test-user' },
                    device_id: { S: 'device-2' },
                    connection_id: { S: 'connection-2' }
                }
            ];

            beforeEach(() => {
                mockDynamoClient.send.mockResolvedValue({ Items: mockConnections });
            });

            describe('When retrieving all connections for a user', () => {
                test('Then all connections should be returned', async () => {
                    // When
                    const result = await getConnectionsByUserId('test-user');

                    // Then
                    expect(result).toHaveLength(2);
                    expect(result?.[0]).toBeInstanceOf(Connection);
                    expect(result?.[0]?.userId).toBe('test-user');
                    expect(result?.[0]?.deviceId).toBe('device-1');
                    expect(result?.[0]?.connectionId).toBe('connection-1');
                    expect(result?.[1]?.deviceId).toBe('device-2');
                    expect(result?.[1]?.connectionId).toBe('connection-2');
                    
                    // Verify DynamoDB was called
                    expect(mockDynamoClient.send).toHaveBeenCalledTimes(1);
                });
            });
        });

        describe('Given a connection exists with a specific connection ID', () => {
            const mockConnection = {
                user_id: { S: 'test-user' },
                device_id: { S: 'test-device' },
                connection_id: { S: 'specific-connection' }
            };

            beforeEach(() => {
                mockDynamoClient.send.mockResolvedValue({ Items: [mockConnection] });
            });

            describe('When retrieving a connection by connection ID', () => {
                test('Then the connection should be returned', async () => {
                    // When
                    const result = await getConnectionById('specific-connection');

                    // Then
                    expect(result).toBeInstanceOf(Connection);
                    expect(result?.userId).toBe('test-user');
                    expect(result?.deviceId).toBe('test-device');
                    expect(result?.connectionId).toBe('specific-connection');
                    
                    // Verify DynamoDB was called
                    expect(mockDynamoClient.send).toHaveBeenCalledTimes(1);
                });
            });
        });

        describe('Given no connections exist', () => {
            beforeEach(() => {
                mockDynamoClient.send.mockResolvedValue({ Items: [] });
            });

            describe('When retrieving connections for a user', () => {
                test('Then an empty array should be returned', async () => {
                    // When
                    const result = await getConnectionsByUserId('user-with-no-connections');

                    // Then
                    expect(result).toEqual([]);
                });
            });

            describe('When retrieving a connection by ID', () => {
                test('Then null should be returned', async () => {
                    // When
                    const result = await getConnectionById('non-existent-connection');

                    // Then
                    expect(result).toBeNull();
                });
            });
        });
    });

    describe('Data Conversion', () => {
        describe('Given DynamoDB item data', () => {
            describe('When converting timer data', () => {
                test('Then the Timer object should have correct properties', () => {
                    // Given
                    const item = {
                        id: { S: 'test-id' },
                        user_id: { S: 'test-user' },
                        name: { S: 'Test Timer' },
                        total_duration: { S: 'PT30M' },
                        remaining_duration: { S: 'PT25M' },
                        end_time: { S: '2024-01-01T12:30:00Z' }
                    };

                    // When
                    const timer = new Timer(
                        item.id.S!,
                        item.user_id.S!,
                        item.name.S!,
                        item.total_duration.S!,
                        item.remaining_duration?.S,
                        item.end_time?.S
                    );

                    // Then
                    expect(timer.id).toBe('test-id');
                    expect(timer.userId).toBe('test-user');
                    expect(timer.name).toBe('Test Timer');
                    expect(timer.totalDuration).toBe('PT30M');
                    expect(timer.remainingDuration).toBe('PT25M');
                    expect(timer.endTime).toBe('2024-01-01T12:30:00Z');
                });
            });

            describe('When converting connection data', () => {
                test('Then the Connection object should have correct properties', () => {
                    // Given
                    const item = {
                        user_id: { S: 'test-user' },
                        device_id: { S: 'test-device' },
                        connection_id: { S: 'test-connection' }
                    };

                    // When
                    const connection = new Connection(
                        item.user_id.S!,
                        item.device_id.S!,
                        item.connection_id?.S
                    );

                    // Then
                    expect(connection.userId).toBe('test-user');
                    expect(connection.deviceId).toBe('test-device');
                    expect(connection.connectionId).toBe('test-connection');
                });
            });
        });
    });
});
