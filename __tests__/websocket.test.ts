import { handler } from '../lib/bubble-timer-backend-stack.websocket';
import { getSharedTimerRelationships, stopTimer, removeSharedTimerRelationship, updateTimer } from '../lib/backend/timers';
import { getConnectionById, updateConnection, getConnectionsByUserId } from '../lib/backend/connections';

// Mock the backend modules
jest.mock('../lib/backend/timers');
jest.mock('../lib/backend/connections');

// Mock the CognitoJwtVerifier
jest.mock('aws-jwt-verify', () => ({
    CognitoJwtVerifier: {
        create: jest.fn().mockReturnValue({
            verify: jest.fn().mockResolvedValue({
                'cognito:username': 'test-user'
            })
        })
    }
}));

// Mock the ApiGatewayManagementApiClient
jest.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
    ApiGatewayManagementApiClient: jest.fn().mockImplementation(() => ({
        send: jest.fn().mockResolvedValue({})
    })),
    PostToConnectionCommand: jest.fn().mockImplementation((params) => params)
}));

// Mock the logger
jest.mock('../lib/core/logger', () => ({
    createWebSocketLogger: jest.fn().mockReturnValue({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    })
}));

const mockGetSharedTimerRelationships = getSharedTimerRelationships as jest.MockedFunction<typeof getSharedTimerRelationships>;
const mockStopTimer = stopTimer as jest.MockedFunction<typeof stopTimer>;
const mockRemoveSharedTimerRelationship = removeSharedTimerRelationship as jest.MockedFunction<typeof removeSharedTimerRelationship>;
const mockUpdateTimer = updateTimer as jest.MockedFunction<typeof updateTimer>;
const mockGetConnectionById = getConnectionById as jest.MockedFunction<typeof getConnectionById>;
const mockUpdateConnection = updateConnection as jest.MockedFunction<typeof updateConnection>;
const mockGetConnectionsByUserId = getConnectionsByUserId as jest.MockedFunction<typeof getConnectionsByUserId>;

describe('WebSocket Handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Mock connection data
        mockGetConnectionById.mockResolvedValue({
            userId: 'test-user',
            deviceId: 'test-device-id',
            connectionId: 'test-connection-id'
        });
        mockUpdateConnection.mockResolvedValue();
        mockGetConnectionsByUserId.mockResolvedValue([
            {
                userId: 'test-user',
                deviceId: 'test-device-id',
                connectionId: 'test-connection-id'
            }
        ]);
    });

    describe('Given a WebSocket connection event', () => {
        describe('When handling a CONNECT event', () => {
            const event = {
                requestContext: {
                    connectionId: 'test-connection-id',
                    eventType: 'CONNECT'
                },
                headers: {
                    Authorization: 'mock-jwt-token',
                    DeviceId: 'test-device-id'
                }
            };

            test('Then the connection should be updated successfully', async () => {
                // When
                const result = await handler(event, {});

                // Then
                expect(mockUpdateConnection).toHaveBeenCalledWith({
                    userId: 'test-user',
                    deviceId: 'test-device-id',
                    connectionId: 'test-connection-id'
                });
                expect(result?.statusCode).toBe(200);
            });

            test('Then connection update failures should be handled gracefully', async () => {
                // Given
                mockUpdateConnection.mockRejectedValue(new Error('Database error'));

                // When
                const result = await handler(event, {});

                // Then
                expect(result?.statusCode).toBe(500);
                expect(JSON.parse(result?.body || '{}')).toHaveProperty('error', 'Internal server error');
            });
        });

        describe('When handling a DISCONNECT event', () => {
            const event = {
                requestContext: {
                    connectionId: 'test-connection-id',
                    eventType: 'DISCONNECT'
                },
                headers: {
                    Authorization: 'mock-jwt-token',
                    DeviceId: 'test-device-id'
                }
            };

            test('Then the connection should be disconnected successfully', async () => {
                // When
                const result = await handler(event, {});

                // Then
                expect(mockUpdateConnection).toHaveBeenCalledWith({
                    userId: 'test-user',
                    deviceId: 'test-device-id',
                    connectionId: undefined
                });
                expect(result?.statusCode).toBe(200);
            });

            test('Then disconnect update failures should be handled gracefully', async () => {
                // Given
                mockUpdateConnection.mockRejectedValue(new Error('Database error'));

                // When
                const result = await handler(event, {});

                // Then
                expect(result?.statusCode).toBe(500);
                expect(JSON.parse(result?.body || '{}')).toHaveProperty('error', 'Internal server error');
            });
        });
    });

    describe('Given a WebSocket message event', () => {
        describe('When receiving a ping message', () => {
            const event = {
                requestContext: {
                    connectionId: 'test-connection-id',
                    routeKey: 'sendmessage',
                    eventType: 'MESSAGE'
                },
                headers: {
                    Authorization: 'mock-jwt-token',
                    DeviceId: 'test-device-id'
                },
                body: JSON.stringify({
                    data: {
                        type: 'ping',
                        timestamp: '2025-08-11T00:00:00Z'
                    }
                })
            };

            test('Then a pong response should be sent', async () => {
                // When
                const result = await handler(event, {});

                // Then
                expect(result?.statusCode).toBe(200);
                expect(JSON.parse(result?.body || '{}')).toHaveProperty('status', 'success');
            });
        });

        describe('When receiving an acknowledge message', () => {
            const event = {
                requestContext: {
                    connectionId: 'test-connection-id',
                    routeKey: 'sendmessage',
                    eventType: 'MESSAGE'
                },
                headers: {
                    Authorization: 'mock-jwt-token',
                    DeviceId: 'test-device-id'
                },
                body: JSON.stringify({
                    data: {
                        type: 'acknowledge',
                        messageId: 'test-message-id'
                    }
                })
            };

            test('Then the acknowledge message should be handled', async () => {
                // When
                const result = await handler(event, {});

                // Then
                // Acknowledge messages return undefined, so we just verify the function completes
                expect(result).toBeUndefined();
            });
        });

        describe('When receiving an activeTimerList message', () => {
            const event = {
                requestContext: {
                    connectionId: 'test-connection-id',
                    routeKey: 'sendmessage',
                    eventType: 'MESSAGE'
                },
                headers: {
                    Authorization: 'mock-jwt-token',
                    DeviceId: 'test-device-id'
                },
                body: JSON.stringify({
                    data: {
                        type: 'activeTimerList',
                        timers: []
                    }
                })
            };

            test('Then the activeTimerList message should be broadcast', async () => {
                // When
                const result = await handler(event, {});

                // Then
                expect(result?.statusCode).toBe(200);
            });
        });

        describe('When receiving a stopTimer message', () => {
            const event = {
                requestContext: {
                    connectionId: 'test-connection-id',
                    routeKey: 'sendmessage',
                    eventType: 'MESSAGE'
                },
                headers: {
                    Authorization: 'mock-jwt-token',
                    DeviceId: 'test-device-id'
                },
                body: JSON.stringify({
                    data: {
                        type: 'stopTimer',
                        timerId: 'test-timer-id'
                    }
                })
            };

            describe('When the timer has shared users', () => {
                beforeEach(() => {
                    // Mock the shared users for this timer
                    mockGetSharedTimerRelationships.mockResolvedValue(['user1', 'user3', 'user4']);
                    mockStopTimer.mockResolvedValue();
                    mockRemoveSharedTimerRelationship.mockResolvedValue();
                });

                test('Then shared relationships should be removed and timer deleted', async () => {
                    // When
                    const result = await handler(event, {});

                    // Then
                    expect(mockGetSharedTimerRelationships).toHaveBeenCalledWith('test-timer-id');
                    expect(mockRemoveSharedTimerRelationship).toHaveBeenCalledWith('test-timer-id', 'user1');
                    expect(mockRemoveSharedTimerRelationship).toHaveBeenCalledWith('test-timer-id', 'user3');
                    expect(mockRemoveSharedTimerRelationship).toHaveBeenCalledWith('test-timer-id', 'user4');
                    expect(mockStopTimer).toHaveBeenCalledWith('test-timer-id');
                });
            });

            describe('When the timer has no shared users', () => {
                beforeEach(() => {
                    mockGetSharedTimerRelationships.mockResolvedValue([]);
                    mockStopTimer.mockResolvedValue();
                });

                test('Then only the timer should be stopped', async () => {
                    // When
                    const result = await handler(event, {});

                    // Then
                    expect(mockGetSharedTimerRelationships).toHaveBeenCalledWith('test-timer-id');
                    expect(mockRemoveSharedTimerRelationship).not.toHaveBeenCalled();
                    expect(mockStopTimer).toHaveBeenCalledWith('test-timer-id');
                });
            });

            describe('When stopping the timer fails', () => {
                beforeEach(() => {
                    mockGetSharedTimerRelationships.mockResolvedValue([]);
                    mockStopTimer.mockRejectedValue(new Error('Timer stop failed'));
                });

                test('Then the error should be handled gracefully', async () => {
                    // When
                    const result = await handler(event, {});

                    // Then
                    expect(result?.statusCode).toBe(500);
                    expect(JSON.parse(result?.body || '{}')).toHaveProperty('error', 'Internal server error');
                });
            });
        });

        describe('When receiving an updateTimer message', () => {
            const event = {
                requestContext: {
                    connectionId: 'test-connection-id',
                    routeKey: 'sendmessage',
                    eventType: 'MESSAGE'
                },
                headers: {
                    Authorization: 'mock-jwt-token',
                    DeviceId: 'test-device-id'
                },
                body: JSON.stringify({
                    data: {
                        type: 'updateTimer',
                        timer: {
                            id: 'test-timer-id',
                            userId: 'test-user',
                            name: 'Updated Timer Name',
                            totalDuration: 'PT30M',
                            remainingDuration: 'PT25M',
                            timerEnd: '2025-08-03T21:15:00Z'
                        }
                    }
                })
            };

            describe('When the timer update succeeds', () => {
                beforeEach(() => {
                    mockUpdateTimer.mockResolvedValue();
                    mockGetSharedTimerRelationships.mockResolvedValue([]);
                });

                test('Then the timer should be updated successfully', async () => {
                    // When
                    const result = await handler(event, {});

                    // Then
                    expect(mockUpdateTimer).toHaveBeenCalled();
                    expect(result?.statusCode).toBe(200);
                });
            });

            describe('When the timer update fails', () => {
                beforeEach(() => {
                    mockUpdateTimer.mockRejectedValue(new Error('Update failed'));
                    mockGetSharedTimerRelationships.mockResolvedValue([]);
                });

                test('Then the error should be handled gracefully', async () => {
                    // When
                    const result = await handler(event, {});

                    // Then
                    expect(result?.statusCode).toBe(500);
                    expect(JSON.parse(result?.body || '{}')).toHaveProperty('error', 'Internal server error');
                });
            });
        });

        describe('When receiving an unknown message type', () => {
            const event = {
                requestContext: {
                    connectionId: 'test-connection-id',
                    routeKey: 'sendmessage',
                    eventType: 'MESSAGE'
                },
                headers: {
                    Authorization: 'mock-jwt-token',
                    DeviceId: 'test-device-id'
                },
                body: JSON.stringify({
                    data: {
                        type: 'unknownType',
                        someData: 'value'
                    }
                })
            };

            test('Then the message should be processed without error', async () => {
                // When
                const result = await handler(event, {});

                // Then
                // Unknown message types are processed without error in the current implementation
                expect(result?.statusCode).toBe(200);
            });
        });
    });
}); 