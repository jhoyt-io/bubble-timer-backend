import { handler } from '../lib/bubble-timer-backend-stack.api';

// Mock the timers module
jest.mock('../lib/backend/timers', () => ({
  getTimer: jest.fn(),
  updateTimer: jest.fn(),
  getTimersSharedWithUser: jest.fn(),
  removeSharedTimerRelationship: jest.fn(),
  Timer: jest.fn().mockImplementation((id, userId, name, totalDuration, remainingDuration, endTime) => ({
    id,
    userId,
    name,
    totalDuration,
    remainingDuration,
    endTime
  }))
}));

const { getTimer, updateTimer, getTimersSharedWithUser, removeSharedTimerRelationship, Timer } = require('../lib/backend/timers');

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
            endTime: '2024-01-01T12:30:00Z'
          }
        })
      };

      describe('When updating the timer', () => {
        test('Then the timer should be updated successfully', async () => {
          // When
          const result = await handler(event, {});

          // Then
          expect(result.statusCode).toBe(200);
          expect(updateTimer).toHaveBeenCalledWith(
            expect.objectContaining({
              id: 'timer123',
              userId: 'testuser',
              name: 'Updated Timer',
              totalDuration: '600',
              remainingDuration: '300',
              endTime: '2024-01-01T12:30:00Z'
            })
          );
        });
      });
    });
  });

  describe('GET /timers/shared', () => {
    describe('Given shared timers exist for the user', () => {
      const mockSharedTimers = [
        {
          id: 'timer1',
          userId: 'user1',
          name: 'Shared Timer 1',
          totalDuration: '300',
          remainingDuration: '150',
          endTime: '2024-01-01T12:00:00Z',
          sharedWith: ['testuser']
        },
        {
          id: 'timer2',
          userId: 'user2',
          name: 'Shared Timer 2',
          totalDuration: '600',
          remainingDuration: '300',
          endTime: '2024-01-01T12:30:00Z',
          sharedWith: ['testuser', 'user3']
        }
      ];

      beforeEach(() => {
        (getTimersSharedWithUser as jest.Mock).mockResolvedValue(mockSharedTimers);
      });

      describe('When retrieving shared timers', () => {
        test('Then all shared timers should be returned', async () => {
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
  });

  describe('Error Handling', () => {
    describe('Given missing authorization', () => {
      test('Then it should handle the missing authorization', async () => {
        // Given
        const event = {
          resource: '/timers/shared',
          httpMethod: 'GET',
          path: '/timers/shared',
          requestContext: {
            authorizer: null
          }
        };

        // When
        const result = await handler(event, {});

        // Then
        expect(result.statusCode).toBe(200);
        expect(result.body).toBe('<nada>');
      });
    });

    describe('Given a database error occurs', () => {
      test('Then it should handle the error gracefully', async () => {
        // Given
        (getTimersSharedWithUser as jest.Mock).mockRejectedValue(new Error('Database error'));

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
  });
}); 