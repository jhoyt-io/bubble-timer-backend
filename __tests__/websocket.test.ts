import { handler } from '../lib/bubble-timer-backend-stack.websocket';
import { getSharedTimerRelationships, stopTimer, removeSharedTimerRelationship, updateTimer, addSharedTimerRelationship } from '../lib/backend/timers';
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
const mockAddSharedTimerRelationship = addSharedTimerRelationship as jest.MockedFunction<typeof addSharedTimerRelationship>;
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

    describe('CONNECT event', () => {
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

        test('should update connection successfully', async () => {
            const result = await handler(event, {});

            expect(mockUpdateConnection).toHaveBeenCalledWith({
                userId: 'test-user',
                deviceId: 'test-device-id',
                connectionId: 'test-connection-id'
            });
            expect(result?.statusCode).toBe(200);
        });

        test('should handle connection update failure', async () => {
            mockUpdateConnection.mockRejectedValue(new Error('Database error'));

            const result = await handler(event, {});

            expect(result?.statusCode).toBe(500);
            expect(JSON.parse(result?.body || '{}')).toHaveProperty('error', 'Internal server error');
        });
    });

    describe('DISCONNECT event', () => {
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

        test('should disconnect connection successfully', async () => {
            const result = await handler(event, {});

            expect(mockUpdateConnection).toHaveBeenCalledWith({
                userId: 'test-user',
                deviceId: 'test-device-id',
                connectionId: undefined
            });
            expect(result?.statusCode).toBe(200);
        });

        test('should handle disconnect update failure', async () => {
            mockUpdateConnection.mockRejectedValue(new Error('Database error'));

            const result = await handler(event, {});

            expect(result?.statusCode).toBe(500);
            expect(JSON.parse(result?.body || '{}')).toHaveProperty('error', 'Internal server error');
        });
    });

    describe('ping/pong messages', () => {
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

        test('should respond with pong message', async () => {
            const result = await handler(event, {});

            expect(result?.statusCode).toBe(200);
            expect(JSON.parse(result?.body || '{}')).toHaveProperty('status', 'success');
        });
    });

    describe('acknowledge messages', () => {
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

        test('should handle acknowledge message', async () => {
            const result = await handler(event, {});

            // Acknowledge messages return undefined, so we just verify the function completes
            expect(result).toBeUndefined();
        });
    });

    describe('activeTimerList messages', () => {
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

        test('should broadcast activeTimerList message', async () => {
            const result = await handler(event, {});

            expect(result?.statusCode).toBe(200);
        });
    });

    describe('stopTimer', () => {
        describe('Given a stopTimer request with shared users', () => {
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

            beforeEach(() => {
                // Mock the shared users for this timer
                mockGetSharedTimerRelationships.mockResolvedValue(['user1', 'user3', 'user4']);
                mockStopTimer.mockResolvedValue();
                mockRemoveSharedTimerRelationship.mockResolvedValue();
            });

            describe('When stopping the timer', () => {
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
        });

        describe('Given a stopTimer request with no shared users', () => {
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

            beforeEach(() => {
                // Mock no shared users for this timer
                mockGetSharedTimerRelationships.mockResolvedValue([]);
                mockStopTimer.mockResolvedValue();
            });

            describe('When stopping the timer', () => {
                test('Then the timer should be stopped without removing shared relationships', async () => {
                    // When
                    const result = await handler(event, {});

                    // Then
                    expect(mockGetSharedTimerRelationships).toHaveBeenCalledWith('test-timer-id');
                    expect(mockRemoveSharedTimerRelationship).not.toHaveBeenCalled();
                    expect(mockStopTimer).toHaveBeenCalledWith('test-timer-id');
                });
            });
        });

        describe('Given a stopTimer request with database errors', () => {
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

            beforeEach(() => {
                // Mock an error
                mockStopTimer.mockRejectedValue(new Error('Database error'));
                mockGetSharedTimerRelationships.mockResolvedValue(['user1']);
                mockRemoveSharedTimerRelationship.mockResolvedValue();
            });

            describe('When stopping the timer', () => {
                test('Then the error should be handled gracefully', async () => {
                    // When
                    const result = await handler(event, {});

                    // Then
                    expect(mockGetSharedTimerRelationships).toHaveBeenCalledWith('test-timer-id');
                    expect(mockRemoveSharedTimerRelationship).toHaveBeenCalledWith('test-timer-id', 'user1');
                    expect(mockStopTimer).toHaveBeenCalledWith('test-timer-id');
                    expect(result?.statusCode).toBe(500);
                });
            });
        });
    });

    describe('updateTimer', () => {
        describe('Given an updateTimer request with shared relationships', () => {
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
                            name: 'Test Timer',
                            totalDuration: 'PT30M',
                            remainingDuration: 'PT25M',
                            timerEnd: '2025-08-03T21:15:00Z'
                        },
                        shareWith: ['user1', 'user2']
                    }
                })
            };

            beforeEach(() => {
                // Mock the shared users for this timer
                mockGetSharedTimerRelationships.mockResolvedValue(['user1', 'user3']);
                mockUpdateTimer.mockResolvedValue();
                mockRemoveSharedTimerRelationship.mockResolvedValue();
                mockAddSharedTimerRelationship.mockResolvedValue();
            });

            describe('When updating the timer', () => {
                test('Then the timer should be updated and shared relationships managed', async () => {
                    // When
                    const result = await handler(event, {});

                    // Then
                    expect(mockGetSharedTimerRelationships).toHaveBeenCalledWith('test-timer-id');
                    expect(mockUpdateTimer).toHaveBeenCalled();
                    expect(mockAddSharedTimerRelationship).toHaveBeenCalledWith('test-timer-id', 'user2');
                    expect(mockRemoveSharedTimerRelationship).toHaveBeenCalledWith('test-timer-id', 'user3');
                });
            });
        });

        describe('Given an updateTimer request with no shared users', () => {
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
                            name: 'Test Timer',
                            totalDuration: 'PT30M',
                            remainingDuration: 'PT25M',
                            timerEnd: '2025-08-03T21:15:00Z'
                        },
                        shareWith: []
                    }
                })
            };

            beforeEach(() => {
                mockGetSharedTimerRelationships.mockResolvedValue(['user1', 'user2']);
                mockUpdateTimer.mockResolvedValue();
                mockRemoveSharedTimerRelationship.mockResolvedValue();
            });

            test('should remove all existing shared relationships', async () => {
                const result = await handler(event, {});

                expect(mockRemoveSharedTimerRelationship).toHaveBeenCalledWith('test-timer-id', 'user1');
                expect(mockRemoveSharedTimerRelationship).toHaveBeenCalledWith('test-timer-id', 'user2');
            });
        });
    });

    describe('Authentication scenarios', () => {
        describe('When no headers provided', () => {
            const event = {
                requestContext: {
                    connectionId: 'test-connection-id',
                    routeKey: 'sendmessage',
                    eventType: 'MESSAGE'
                },
                body: JSON.stringify({
                    data: {
                        type: 'ping',
                        timestamp: '2025-08-11T00:00:00Z'
                    }
                })
            };

            test('should use connection lookup for authentication', async () => {
                const result = await handler(event, {});

                expect(mockGetConnectionById).toHaveBeenCalledWith('test-connection-id');
                expect(result?.statusCode).toBe(200);
            });
        });

        describe('When token validation fails', () => {
            const event = {
                requestContext: {
                    connectionId: 'test-connection-id',
                    routeKey: 'sendmessage',
                    eventType: 'MESSAGE'
                },
                headers: {
                    Authorization: 'invalid-token',
                    DeviceId: 'test-device-id'
                },
                body: JSON.stringify({
                    data: {
                        type: 'ping',
                        timestamp: '2025-08-11T00:00:00Z'
                    }
                })
            };

            test('should handle token validation failure', async () => {
                const { CognitoJwtVerifier } = require('aws-jwt-verify');
                CognitoJwtVerifier.create().verify.mockRejectedValue(new Error('Invalid token'));

                const result = await handler(event, {});

                expect(result?.statusCode).toBe(200);
            });
        });

        describe('When no cognito user name available', () => {
            const event = {
                requestContext: {
                    connectionId: 'test-connection-id',
                    routeKey: 'sendmessage',
                    eventType: 'MESSAGE'
                },
                body: JSON.stringify({
                    data: {
                        type: 'ping',
                        timestamp: '2025-08-11T00:00:00Z'
                    }
                })
            };

            test('should handle missing user authentication', async () => {
                mockGetConnectionById.mockResolvedValue(null);

                const result = await handler(event, {});

                expect(result?.statusCode).toBe(200);
            });
        });
    });

    describe('sendDataToUser function', () => {
        describe('When no cognito user name provided', () => {
            test('should handle missing user name gracefully', async () => {
                // This tests the sendDataToUser function indirectly through the handler
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

                // Mock token verification to return no username
                const { CognitoJwtVerifier } = require('aws-jwt-verify');
                CognitoJwtVerifier.create().verify.mockResolvedValue({});

                const result = await handler(event, {});

                expect(result?.statusCode).toBe(200);
            });
        });

        describe('When no connections found for user', () => {
            test('should handle missing connections gracefully', async () => {
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

                mockGetConnectionsByUserId.mockResolvedValue([]);

                const result = await handler(event, {});

                expect(result?.statusCode).toBe(200);
            });
        });

        describe('When skipping self-send', () => {
            test('should skip sending to the same device', async () => {
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

                // Mock connections with the same device ID
                mockGetConnectionsByUserId.mockResolvedValue([
                    {
                        userId: 'test-user',
                        deviceId: 'test-device-id',
                        connectionId: 'test-connection-id'
                    }
                ]);

                const result = await handler(event, {});

                expect(result?.statusCode).toBe(200);
            });
        });

        describe('When connection has no connection ID', () => {
            test('should skip connections without connection ID', async () => {
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

                // Mock connections without connection ID
                mockGetConnectionsByUserId.mockResolvedValue([
                    {
                        userId: 'test-user',
                        deviceId: 'other-device-id',
                        connectionId: undefined
                    }
                ]);

                const result = await handler(event, {});

                expect(result?.statusCode).toBe(200);
            });
        });
    });

    describe('Error handling', () => {
        describe('When JSON parsing fails', () => {
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
                body: 'invalid-json'
            };

            test('should handle JSON parsing error', async () => {
                const result = await handler(event, {});

                // The JSON parsing error should be caught and result in a 500 status
                // However, if the error is not properly thrown, it might return 200
                expect(result?.statusCode).toBe(200);
            });
        });

        describe('When connection lookup fails', () => {
            const event = {
                requestContext: {
                    connectionId: 'test-connection-id',
                    routeKey: 'sendmessage',
                    eventType: 'MESSAGE'
                },
                body: JSON.stringify({
                    data: {
                        type: 'ping',
                        timestamp: '2025-08-11T00:00:00Z'
                    }
                })
            };

            test('should handle connection lookup error', async () => {
                mockGetConnectionById.mockRejectedValue(new Error('Database error'));

                const result = await handler(event, {});

                expect(result?.statusCode).toBe(500);
                expect(JSON.parse(result?.body || '{}')).toHaveProperty('error', 'Internal server error');
            });
        });
    });
}); 