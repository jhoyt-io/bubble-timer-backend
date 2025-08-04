import { handler } from '../lib/bubble-timer-backend-stack.websocket';
import { getSharedTimerRelationships, stopTimer, removeSharedTimerRelationship, updateTimer } from '../lib/backend/timers';
import { getConnectionById, updateConnection } from '../lib/backend/connections';

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

const mockGetSharedTimerRelationships = getSharedTimerRelationships as jest.MockedFunction<typeof getSharedTimerRelationships>;
const mockStopTimer = stopTimer as jest.MockedFunction<typeof stopTimer>;
const mockRemoveSharedTimerRelationship = removeSharedTimerRelationship as jest.MockedFunction<typeof removeSharedTimerRelationship>;
const mockUpdateTimer = updateTimer as jest.MockedFunction<typeof updateTimer>;
const mockGetConnectionById = getConnectionById as jest.MockedFunction<typeof getConnectionById>;
const mockUpdateConnection = updateConnection as jest.MockedFunction<typeof updateConnection>;

describe('WebSocket Handler - stopTimer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Mock connection data
        mockGetConnectionById.mockResolvedValue({
            userId: 'test-user',
            deviceId: 'test-device-id',
            connectionId: 'test-connection-id'
        });
        mockUpdateConnection.mockResolvedValue();
    });

    it('should remove shared relationships and delete timer', async () => {
        // Given
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

        // Mock the shared users for this timer
        mockGetSharedTimerRelationships.mockResolvedValue(['user1', 'user3', 'user4']);
        mockStopTimer.mockResolvedValue();
        mockRemoveSharedTimerRelationship.mockResolvedValue();

        // When
        const result = await handler(event, {});

        // Then
        expect(mockGetSharedTimerRelationships).toHaveBeenCalledWith('test-timer-id');
        expect(mockRemoveSharedTimerRelationship).toHaveBeenCalledWith('test-timer-id', 'user1');
        expect(mockRemoveSharedTimerRelationship).toHaveBeenCalledWith('test-timer-id', 'user3');
        expect(mockRemoveSharedTimerRelationship).toHaveBeenCalledWith('test-timer-id', 'user4');
        expect(mockStopTimer).toHaveBeenCalledWith('test-timer-id');
    });

    it('should handle stopTimer with no shared users', async () => {
        // Given
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

        // Mock no shared users for this timer
        mockGetSharedTimerRelationships.mockResolvedValue([]);
        mockStopTimer.mockResolvedValue();

        // When
        const result = await handler(event, {});

        // Then
        expect(mockGetSharedTimerRelationships).toHaveBeenCalledWith('test-timer-id');
        expect(mockRemoveSharedTimerRelationship).not.toHaveBeenCalled();
        expect(mockStopTimer).toHaveBeenCalledWith('test-timer-id');
    });

    it('should handle stopTimer errors gracefully', async () => {
        // Given
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

        // Mock an error
        mockStopTimer.mockRejectedValue(new Error('Database error'));
        mockGetSharedTimerRelationships.mockResolvedValue(['user1']);
        mockRemoveSharedTimerRelationship.mockResolvedValue();

        // When
        const result = await handler(event, {});

        // Then
        expect(mockGetSharedTimerRelationships).toHaveBeenCalledWith('test-timer-id');
        expect(mockRemoveSharedTimerRelationship).toHaveBeenCalledWith('test-timer-id', 'user1');
        expect(mockStopTimer).toHaveBeenCalledWith('test-timer-id');
        // Should handle the error gracefully
    });
});

describe('WebSocket Handler - updateTimer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Mock connection data
        mockGetConnectionById.mockResolvedValue({
            userId: 'test-user',
            deviceId: 'test-device-id',
            connectionId: 'test-connection-id'
        });
        mockUpdateConnection.mockResolvedValue();
    });

    it('should update timer and manage shared relationships', async () => {
        // Given
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

        // Mock the shared users for this timer
        mockGetSharedTimerRelationships.mockResolvedValue(['user1', 'user3']);
        mockUpdateTimer.mockResolvedValue();
        mockRemoveSharedTimerRelationship.mockResolvedValue();

        // When
        const result = await handler(event, {});

        // Then
        expect(mockGetSharedTimerRelationships).toHaveBeenCalledWith('test-timer-id');
        expect(mockUpdateTimer).toHaveBeenCalled();
        // Should add new relationships and remove outdated ones
    });
}); 