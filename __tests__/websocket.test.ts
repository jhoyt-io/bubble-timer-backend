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
    let mockJwtVerify: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Get the mock JWT verify function
        const { CognitoJwtVerifier } = require('aws-jwt-verify');
        mockJwtVerify = CognitoJwtVerifier.create().verify;
        
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
                        timerId: 'test-timer-id',
                        timer: {
                            id: 'test-timer-id',
                            userId: 'test-user',
                            name: 'Test Timer',
                            totalDuration: 'PT30M',
                            remainingDuration: 'PT25M',
                            timerEnd: '2025-08-03T21:15:00Z'
                        }
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
                    // Should also send to original sharer (test-user) since they're in the timer data
                    expect(mockGetConnectionsByUserId).toHaveBeenCalledWith('test-user');
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
                    // Should still send to original sharer (test-user) since they're in the timer data
                    expect(mockGetConnectionsByUserId).toHaveBeenCalledWith('test-user');
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

            describe('When stopping a timer with shared users (timer data included)', () => {
                beforeEach(() => {
                    // Mock JWT to return test-user (default)
                    mockJwtVerify.mockResolvedValue({
                        'cognito:username': 'test-user'
                    });
                    
                    mockGetSharedTimerRelationships.mockResolvedValue(['shared-user-1', 'shared-user-2']);
                    mockStopTimer.mockResolvedValue();
                    mockRemoveSharedTimerRelationship.mockResolvedValue();
                });

                test('Then the stop should be broadcast to shared users AND the original sharer', async () => {
                    // When
                    const result = await handler(event, {});

                    // Then
                    expect(mockGetSharedTimerRelationships).toHaveBeenCalledWith('test-timer-id');
                    // Should send to current user first (from first sendDataToUser call)
                    expect(mockGetConnectionsByUserId).toHaveBeenCalledWith('test-user');
                    // Should send to shared users
                    expect(mockGetConnectionsByUserId).toHaveBeenCalledWith('shared-user-1');
                    expect(mockGetConnectionsByUserId).toHaveBeenCalledWith('shared-user-2');
                    // Should also send to original sharer (test-user) since they're in the timer data
                    // Note: test-user is both the current user and the original sharer, so they get notified
                    expect(mockGetConnectionsByUserId).toHaveBeenCalledTimes(3); // Current user + 2 shared users
                    expect(mockStopTimer).toHaveBeenCalledWith('test-timer-id');
                    expect(result?.statusCode).toBe(200);
                });
            });

            describe('When stopping a timer with timer data included', () => {
                const stopTimerWithDataEvent = {
                    requestContext: {
                        connectionId: 'non-sharer-connection-id',
                        routeKey: 'sendmessage',
                        eventType: 'MESSAGE'
                    },
                    headers: {
                        Authorization: 'mock-jwt-token',
                        DeviceId: 'non-sharer-device-id'
                    },
                    body: JSON.stringify({
                        data: {
                            type: 'stopTimer',
                            timerId: 'test-timer-id',
                            timer: {
                                id: 'test-timer-id',
                                userId: 'original-sharer', // Original sharer is different from current user
                                name: 'Test Timer',
                                totalDuration: 'PT30M',
                                remainingDuration: 'PT25M',
                                timerEnd: '2025-08-03T21:15:00Z'
                            }
                        }
                    })
                };

                beforeEach(() => {
                    // Mock JWT to return non-sharer user
                    mockJwtVerify.mockResolvedValue({
                        'cognito:username': 'non-sharer-user'
                    });
                    
                    mockGetSharedTimerRelationships.mockResolvedValue(['shared-user-1', 'shared-user-2']);
                    mockStopTimer.mockResolvedValue();
                    mockRemoveSharedTimerRelationship.mockResolvedValue();
                    
                    // Mock connection for non-sharer
                    mockGetConnectionById.mockResolvedValue({
                        userId: 'non-sharer-user',
                        deviceId: 'non-sharer-device-id',
                        connectionId: 'non-sharer-connection-id'
                    });
                });

                test('Then the stop should be broadcast to shared users AND the original sharer', async () => {
                    // When
                    const result = await handler(stopTimerWithDataEvent, {});

                    // Then
                    expect(mockGetSharedTimerRelationships).toHaveBeenCalledWith('test-timer-id');
                    // Should send to shared users
                    expect(mockGetConnectionsByUserId).toHaveBeenCalledWith('shared-user-1');
                    expect(mockGetConnectionsByUserId).toHaveBeenCalledWith('shared-user-2');
                    // Should also send to original sharer (since they're not the current user)
                    expect(mockGetConnectionsByUserId).toHaveBeenCalledWith('original-sharer');
                    expect(mockStopTimer).toHaveBeenCalledWith('test-timer-id');
                    expect(result?.statusCode).toBe(200);
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

            describe('When updating a timer with shared users', () => {
                beforeEach(() => {
                    mockUpdateTimer.mockResolvedValue();
                    mockGetSharedTimerRelationships.mockResolvedValue(['shared-user-1', 'shared-user-2']);
                });

                test('Then the update should be broadcast to all shared users', async () => {
                    // When
                    const result = await handler(event, {});

                    // Then
                    expect(mockGetSharedTimerRelationships).toHaveBeenCalledWith('test-timer-id');
                    expect(mockGetConnectionsByUserId).toHaveBeenCalledWith('shared-user-1');
                    expect(mockGetConnectionsByUserId).toHaveBeenCalledWith('shared-user-2');
                    expect(mockUpdateTimer).toHaveBeenCalled();
                    expect(result?.statusCode).toBe(200);
                });
            });

            describe('When a non-sharer updates a timer', () => {
                const nonSharerEvent = {
                    requestContext: {
                        connectionId: 'non-sharer-connection-id',
                        routeKey: 'sendmessage',
                        eventType: 'MESSAGE'
                    },
                    headers: {
                        Authorization: 'mock-jwt-token',
                        DeviceId: 'non-sharer-device-id'
                    },
                    body: JSON.stringify({
                        data: {
                            type: 'updateTimer',
                            timer: {
                                id: 'test-timer-id',
                                userId: 'original-sharer', // Original sharer is different from current user
                                name: 'Updated Timer Name',
                                totalDuration: 'PT30M',
                                remainingDuration: 'PT25M',
                                timerEnd: '2025-08-03T21:15:00Z'
                            }
                        }
                    })
                };

                beforeEach(() => {
                    // Mock JWT to return non-sharer user
                    mockJwtVerify.mockResolvedValue({
                        'cognito:username': 'non-sharer-user'
                    });
                    
                    mockUpdateTimer.mockResolvedValue();
                    mockGetSharedTimerRelationships.mockResolvedValue(['shared-user-1', 'shared-user-2']);
                    
                    // Mock connection for non-sharer
                    mockGetConnectionById.mockResolvedValue({
                        userId: 'non-sharer-user',
                        deviceId: 'non-sharer-device-id',
                        connectionId: 'non-sharer-connection-id'
                    });
                });

                test('Then the update should be broadcast to shared users AND the original sharer', async () => {
                    // When
                    const result = await handler(nonSharerEvent, {});

                    // Then
                    expect(mockGetSharedTimerRelationships).toHaveBeenCalledWith('test-timer-id');
                    // Should send to shared users
                    expect(mockGetConnectionsByUserId).toHaveBeenCalledWith('shared-user-1');
                    expect(mockGetConnectionsByUserId).toHaveBeenCalledWith('shared-user-2');
                    // Should also send to original sharer (since they're not the current user)
                    expect(mockGetConnectionsByUserId).toHaveBeenCalledWith('original-sharer');
                    expect(mockUpdateTimer).toHaveBeenCalled();
                    expect(result?.statusCode).toBe(200);
                });
            });

            describe('When the original sharer updates their own timer', () => {
                const sharerEvent = {
                    requestContext: {
                        connectionId: 'sharer-connection-id',
                        routeKey: 'sendmessage',
                        eventType: 'MESSAGE'
                    },
                    headers: {
                        Authorization: 'mock-jwt-token',
                        DeviceId: 'sharer-device-id'
                    },
                    body: JSON.stringify({
                        data: {
                            type: 'updateTimer',
                            timer: {
                                id: 'test-timer-id',
                                userId: 'test-user', // Same as current user
                                name: 'Updated Timer Name',
                                totalDuration: 'PT30M',
                                remainingDuration: 'PT25M',
                                timerEnd: '2025-08-03T21:15:00Z'
                            }
                        }
                    })
                };

                beforeEach(() => {
                    // Mock JWT to return sharer user (same as timer userId)
                    mockJwtVerify.mockResolvedValue({
                        'cognito:username': 'test-user'
                    });
                    
                    mockUpdateTimer.mockResolvedValue();
                    mockGetSharedTimerRelationships.mockResolvedValue(['shared-user-1', 'shared-user-2']);
                    
                    // Mock connection for sharer
                    mockGetConnectionById.mockResolvedValue({
                        userId: 'test-user',
                        deviceId: 'sharer-device-id',
                        connectionId: 'sharer-connection-id'
                    });
                });

                test('Then the update should be broadcast to shared users but NOT to the sharer themselves', async () => {
                    // When
                    const result = await handler(sharerEvent, {});

                    // Then
                    expect(mockGetSharedTimerRelationships).toHaveBeenCalledWith('test-timer-id');
                    // Should send to current user first (from first sendDataToUser call)
                    expect(mockGetConnectionsByUserId).toHaveBeenCalledWith('test-user');
                    // Should send to shared users
                    expect(mockGetConnectionsByUserId).toHaveBeenCalledWith('shared-user-1');
                    expect(mockGetConnectionsByUserId).toHaveBeenCalledWith('shared-user-2');
                    // Should NOT add sharer again (since they're the current user)
                    expect(mockGetConnectionsByUserId).toHaveBeenCalledTimes(3); // Current user + 2 shared users
                    expect(mockUpdateTimer).toHaveBeenCalled();
                    expect(result?.statusCode).toBe(200);
                });
            });

            describe('When timer has no userId (edge case)', () => {
                const noUserIdEvent = {
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
                                // userId is missing
                                name: 'Updated Timer Name',
                                totalDuration: 'PT30M',
                                remainingDuration: 'PT25M',
                                timerEnd: '2025-08-03T21:15:00Z'
                            }
                        }
                    })
                };

                beforeEach(() => {
                    mockUpdateTimer.mockResolvedValue();
                    mockGetSharedTimerRelationships.mockResolvedValue(['shared-user-1']);
                });

                test('Then the update should be broadcast to shared users without adding undefined sharer', async () => {
                    // When
                    const result = await handler(noUserIdEvent, {});

                    // Then
                    expect(mockGetSharedTimerRelationships).toHaveBeenCalledWith('test-timer-id');
                    // Should send to current user first (from first sendDataToUser call)
                    expect(mockGetConnectionsByUserId).toHaveBeenCalledWith('test-user');
                    // Should only send to shared users, not try to add undefined sharer
                    expect(mockGetConnectionsByUserId).toHaveBeenCalledWith('shared-user-1');
                    expect(mockGetConnectionsByUserId).toHaveBeenCalledTimes(2); // Current user + 1 shared user
                    expect(mockUpdateTimer).toHaveBeenCalled();
                    expect(result?.statusCode).toBe(200);
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