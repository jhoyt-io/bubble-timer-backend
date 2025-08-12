import { handler } from '../lib/bubble-timer-backend-stack.api';

// Mock the timers module
jest.mock('../lib/backend/timers', () => ({
  getTimer: jest.fn(),
  updateTimer: jest.fn(),
  getTimersSharedWithUser: jest.fn(),
  removeSharedTimerRelationship: jest.fn(),
  shareTimerWithUsers: jest.fn(),
  Timer: jest.fn().mockImplementation((id, userId, name, totalDuration, remainingDuration, endTime) => ({
    id,
    userId,
    name,
    totalDuration,
    remainingDuration,
    endTime
  }))
}));

// Mock the notifications module
jest.mock('../lib/backend/notifications', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    registerDeviceToken: jest.fn(),
    removeDeviceToken: jest.fn(),
    updatePreferences: jest.fn(),
    sendSharingInvitation: jest.fn()
  }))
}));

const { getTimer, updateTimer, getTimersSharedWithUser, removeSharedTimerRelationship, shareTimerWithUsers, Timer } = require('../lib/backend/timers');
const { NotificationService } = require('../lib/backend/notifications');

describe('API Handler', () => {
  const mockEvent = {
    requestContext: {
      authorizer: {
        claims: {
          'cognito:username': 'testuser'
        }
      }
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /timers/{timer}', () => {
    describe('Given a timer exists', () => {
      const mockTimer = {
        id: 'timer123',
        userId: 'testuser',
        name: 'Test Timer',
        totalDuration: '300',
        remainingDuration: '150',
        endTime: '2024-01-01T12:00:00Z'
      };

      beforeEach(() => {
        (getTimer as jest.Mock).mockResolvedValue(mockTimer);
      });

      describe('When retrieving the timer', () => {
        test('Then the timer should be returned with correct data', async () => {
          // Given
          const event = {
            ...mockEvent,
            resource: '/timers/{timer}',
            httpMethod: 'GET',
            path: '/timers/timer123'
          };

          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          expect(JSON.parse(result.body)).toEqual(mockTimer);
          expect(getTimer).toHaveBeenCalledWith('timer123');
        });
      });
    });

    describe('Given a timer does not exist', () => {
      beforeEach(() => {
        (getTimer as jest.Mock).mockResolvedValue(null);
      });

      describe('When retrieving the timer', () => {
        test('Then an error response should be returned', async () => {
          // Given
          const event = {
            ...mockEvent,
            resource: '/timers/{timer}',
            httpMethod: 'GET',
            path: '/timers/nonexistent'
          };

          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          expect(result.body).toBe('{"error":"Timer not found"}');
        });
      });
    });
  });

  describe('POST /timers/{timer}', () => {
    describe('Given a valid timer update request', () => {
      const event = {
        ...mockEvent,
        resource: '/timers/{timer}',
        httpMethod: 'POST',
        path: '/timers/timer123',
        body: JSON.stringify({
          timer: {
            id: 'timer123',
            name: 'Updated Timer',
            totalDuration: '600',
            remainingDuration: '300',
            endTime: '2024-01-01T13:00:00Z'
          }
        })
      };

      beforeEach(() => {
        (updateTimer as jest.Mock).mockResolvedValue(true);
      });

      describe('When updating the timer', () => {
        test('Then the timer should be updated successfully', async () => {
          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          expect(body.result.hello).toBe('world');
          expect(updateTimer).toHaveBeenCalledWith(
            expect.objectContaining({
              id: 'timer123',
              userId: 'testuser',
              name: 'Updated Timer',
              totalDuration: '600',
              remainingDuration: '300',
              endTime: '2024-01-01T13:00:00Z'
            })
          );
        });
      });
    });
  });

  describe('GET /timers/shared', () => {
    describe('Given shared timers exist', () => {
      const mockSharedTimers = [
        {
          id: 'shared1',
          userId: 'otheruser',
          name: 'Shared Timer 1',
          totalDuration: '300',
          remainingDuration: '150',
          endTime: '2024-01-01T12:00:00Z'
        }
      ];

      beforeEach(() => {
        (getTimersSharedWithUser as jest.Mock).mockResolvedValue(mockSharedTimers);
      });

      describe('When retrieving shared timers', () => {
        test('Then the shared timers should be returned', async () => {
          // Given
          const event = {
            ...mockEvent,
            resource: '/timers/shared',
            httpMethod: 'GET',
            path: '/timers/shared'
          };

          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          expect(JSON.parse(result.body)).toEqual(mockSharedTimers);
          expect(getTimersSharedWithUser).toHaveBeenCalledWith('testuser');
        });
      });
    });

    describe('Given no shared timers exist', () => {
      beforeEach(() => {
        (getTimersSharedWithUser as jest.Mock).mockResolvedValue([]);
      });

      describe('When retrieving shared timers', () => {
        test('Then an empty array should be returned', async () => {
          // Given
          const event = {
            ...mockEvent,
            resource: '/timers/shared',
            httpMethod: 'GET',
            path: '/timers/shared'
          };

          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          expect(JSON.parse(result.body)).toEqual([]);
        });
      });
    });

    describe('Given an error occurs', () => {
      beforeEach(() => {
        (getTimersSharedWithUser as jest.Mock).mockRejectedValue(new Error('Database error'));
      });

      describe('When retrieving shared timers', () => {
        test('Then an error response should be returned', async () => {
          // Given
          const event = {
            ...mockEvent,
            resource: '/timers/shared',
            httpMethod: 'GET',
            path: '/timers/shared'
          };

          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          expect(result.body).toContain('error');
        });
      });
    });
  });

  describe('POST /timers/shared', () => {
    describe('Given a valid timer sharing request', () => {
      const event = {
        ...mockEvent,
        resource: '/timers/shared',
        httpMethod: 'POST',
        path: '/timers/shared',
        body: JSON.stringify({
          timerId: 'timer123',
          userIds: ['user1', 'user2'],
          timer: {
            id: 'timer123',
            name: 'Shared Timer',
            totalDuration: '300',
            remainingDuration: '150',
            endTime: '2024-01-01T12:00:00Z'
          }
        })
      };

      beforeEach(() => {
        (shareTimerWithUsers as jest.Mock).mockResolvedValue({
          success: ['user1'],
          failed: ['user2']
        });
      });

      describe('When sharing the timer', () => {
        test('Then the timer should be shared successfully', async () => {
          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          expect(body.result).toBe('shared');
          expect(body.success).toEqual(['user1']);
          expect(body.failed).toEqual(['user2']);
          expect(shareTimerWithUsers).toHaveBeenCalledWith(
            'timer123',
            'testuser',
            ['user1', 'user2'],
            expect.any(Object)
          );
        });
      });
    });

    describe('Given a sharing request with missing parameters', () => {
      const event = {
        ...mockEvent,
        resource: '/timers/shared',
        httpMethod: 'POST',
        path: '/timers/shared',
        body: JSON.stringify({
          timerId: 'timer123'
          // Missing userIds
        })
      };

      describe('When sharing the timer', () => {
        test('Then an error should be returned', async () => {
          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          expect(body.error).toBe('Missing timerId or userIds in request body');
        });
      });
    });

    describe('Given a sharing request with invalid userIds', () => {
      const event = {
        ...mockEvent,
        resource: '/timers/shared',
        httpMethod: 'POST',
        path: '/timers/shared',
        body: JSON.stringify({
          timerId: 'timer123',
          userIds: 'not-an-array' // Should be an array
        })
      };

      describe('When sharing the timer', () => {
        test('Then an error should be returned', async () => {
          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          expect(body.error).toBe('Missing timerId or userIds in request body');
        });
      });
    });

    describe('Given a sharing request that fails', () => {
      const event = {
        ...mockEvent,
        resource: '/timers/shared',
        httpMethod: 'POST',
        path: '/timers/shared',
        body: JSON.stringify({
          timerId: 'timer123',
          userIds: ['user1'],
          timer: {
            id: 'timer123',
            name: 'Shared Timer',
            totalDuration: '300',
            remainingDuration: '150',
            endTime: '2024-01-01T12:00:00Z'
          }
        })
      };

      beforeEach(() => {
        (shareTimerWithUsers as jest.Mock).mockRejectedValue(new Error('Sharing failed'));
      });

      describe('When sharing the timer', () => {
        test('Then an error response should be returned', async () => {
          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          expect(body.error).toBe('Failed to share timer');
        });
      });
    });
  });

  describe('DELETE /timers/shared', () => {
    describe('Given a valid timer rejection request', () => {
      const event = {
        requestContext: {
          authorizer: {
            claims: {
              'cognito:username': 'testuser'
            }
          }
        },
        resource: '/timers/shared',
        httpMethod: 'DELETE',
        path: '/timers/shared',
        body: JSON.stringify({
          timerId: 'timer123'
        })
      };

      beforeEach(() => {
        (removeSharedTimerRelationship as jest.Mock).mockResolvedValue(true);
      });

      describe('When rejecting the timer', () => {
        test('Then the rejection should be handled successfully', async () => {
          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          expect(body.result).toBe('rejected');
          expect(removeSharedTimerRelationship).toHaveBeenCalledWith('timer123', 'testuser');
        });
      });
    });

    describe('Given a rejection request with missing timerId', () => {
      const event = {
        requestContext: {
          authorizer: {
            claims: {
              'cognito:username': 'testuser'
            }
          }
        },
        resource: '/timers/shared',
        httpMethod: 'DELETE',
        path: '/timers/shared',
        body: JSON.stringify({})
      };

      describe('When rejecting the timer', () => {
        test('Then an error should be returned', async () => {
          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          expect(body.error).toBe('Missing timerId in request body');
        });
      });
    });

    describe('Given a rejection request that fails', () => {
      const event = {
        requestContext: {
          authorizer: {
            claims: {
              'cognito:username': 'testuser'
            }
          }
        },
        resource: '/timers/shared',
        httpMethod: 'DELETE',
        path: '/timers/shared',
        body: JSON.stringify({
          timerId: 'timer123'
        })
      };

      beforeEach(() => {
        (removeSharedTimerRelationship as jest.Mock).mockRejectedValue(new Error('Rejection failed'));
      });

      describe('When rejecting the timer', () => {
        test('Then an error should be returned', async () => {
          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          expect(body.error).toBe('Failed to reject shared timer invitation');
        });
      });
    });
  });

  describe('POST /device-tokens', () => {
    describe('Given a valid device token registration request', () => {
      const event = {
        ...mockEvent,
        resource: '/device-tokens',
        httpMethod: 'POST',
        path: '/device-tokens',
        body: JSON.stringify({
          deviceId: 'device123',
          fcmToken: 'fcm-token-456'
        })
      };

      beforeEach(() => {
        const mockNotificationService = new NotificationService();
        (mockNotificationService.registerDeviceToken as jest.Mock).mockResolvedValue(true);
        (NotificationService as jest.Mock).mockImplementation(() => mockNotificationService);
      });

      describe('When registering the device token', () => {
        test('Then the device token should be registered successfully', async () => {
          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          expect(body.result).toBe('registered');
        });
      });
    });

    describe('Given a registration request with missing parameters', () => {
      const event = {
        ...mockEvent,
        resource: '/device-tokens',
        httpMethod: 'POST',
        path: '/device-tokens',
        body: JSON.stringify({
          deviceId: 'device123'
          // Missing fcmToken
        })
      };

      describe('When registering the device token', () => {
        test('Then an error should be returned', async () => {
          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          expect(body.error).toBe('Missing deviceId or fcmToken in request body');
        });
      });
    });

    describe('Given a registration request that fails', () => {
      const event = {
        ...mockEvent,
        resource: '/device-tokens',
        httpMethod: 'POST',
        path: '/device-tokens',
        body: JSON.stringify({
          deviceId: 'device123',
          fcmToken: 'fcm-token-456'
        })
      };

      beforeEach(() => {
        const mockNotificationService = new NotificationService();
        (mockNotificationService.registerDeviceToken as jest.Mock).mockRejectedValue(new Error('Registration failed'));
        (NotificationService as jest.Mock).mockImplementation(() => mockNotificationService);
      });

      describe('When registering the device token', () => {
        test('Then an error should be returned', async () => {
          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          expect(body.error).toBe('Failed to register device token');
        });
      });
    });
  });

  describe('DELETE /device-tokens/{deviceId}', () => {
    describe('Given a valid device token removal request', () => {
      const event = {
        ...mockEvent,
        resource: '/device-tokens/{deviceId}',
        httpMethod: 'DELETE',
        path: '/device-tokens/device123'
      };

      beforeEach(() => {
        const mockNotificationService = new NotificationService();
        (mockNotificationService.removeDeviceToken as jest.Mock).mockResolvedValue(true);
        (NotificationService as jest.Mock).mockImplementation(() => mockNotificationService);
      });

      describe('When removing the device token', () => {
        test('Then the device token should be removed successfully', async () => {
          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          expect(body.result).toBe('removed');
        });
      });
    });

    describe('Given a removal request that fails', () => {
      const event = {
        ...mockEvent,
        resource: '/device-tokens/{deviceId}',
        httpMethod: 'DELETE',
        path: '/device-tokens/device123'
      };

      beforeEach(() => {
        const mockNotificationService = new NotificationService();
        (mockNotificationService.removeDeviceToken as jest.Mock).mockRejectedValue(new Error('Removal failed'));
        (NotificationService as jest.Mock).mockImplementation(() => mockNotificationService);
      });

      describe('When removing the device token', () => {
        test('Then an error should be returned', async () => {
          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          expect(body.error).toBe('Failed to remove device token');
        });
      });
    });
  });

  describe('Error Handling', () => {
    describe('Given an unauthenticated request', () => {
      const event = {
        requestContext: {
          authorizer: {
            claims: {}
          }
        },
        resource: '/timers/{timer}',
        httpMethod: 'GET',
        path: '/timers/timer123'
      };

      beforeEach(() => {
        (getTimer as jest.Mock).mockResolvedValue(null);
      });

      describe('When processing the request', () => {
        test('Then an error response should be returned', async () => {
          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          expect(result.body).toBe('{"error":"Timer not found"}');
        });
      });
    });

    describe('Given a request with no authorizer', () => {
      const event = {
        requestContext: {},
        resource: '/timers/{timer}',
        httpMethod: 'GET',
        path: '/timers/timer123'
      };

      describe('When processing the request', () => {
        test('Then an error response should be returned', async () => {
          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          expect(result.body).toBe('<nada>');
        });
      });
    });

    describe('Given an unknown resource', () => {
      const event = {
        ...mockEvent,
        resource: '/unknown/resource',
        httpMethod: 'GET',
        path: '/unknown/resource'
      };

      describe('When processing the request', () => {
        test('Then an error response should be returned', async () => {
          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          expect(result.body).toBe('<nada>');
        });
      });
    });
  });

  describe('CORS Headers', () => {
    describe('Given any API request', () => {
      describe('When the request is processed', () => {
        test('Then proper CORS headers should be included', async () => {
          // Given
          const event = {
            ...mockEvent,
            resource: '/timers/shared',
            httpMethod: 'GET',
            path: '/timers/shared'
          };

          // When
          const result = await handler(event, {});

          // Then
          expect(result.headers).toEqual({
            "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
            "Access-Control-Allow-Origin": "http://localhost:4000",
            "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,PATCH,DELETE",
            "Content-Type": "application/json",
          });
        });
      });
    });
  });
}); 