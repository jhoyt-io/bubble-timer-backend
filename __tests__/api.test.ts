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
    it('should return timer when it exists', async () => {
      const mockTimer = {
        id: 'timer123',
        userId: 'testuser',
        name: 'Test Timer',
        totalDuration: '300',
        remainingDuration: '150',
        endTime: '2024-01-01T12:00:00Z'
      };

      (getTimer as jest.Mock).mockResolvedValue(mockTimer);

      const event = {
        ...mockEvent,
        resource: '/timers/{timer}',
        httpMethod: 'GET',
        path: '/timers/timer123'
      };

      const result = await handler(event, {});

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual(mockTimer);
      expect(getTimer).toHaveBeenCalledWith('timer123');
    });

    it('should return error when timer does not exist', async () => {
      (getTimer as jest.Mock).mockResolvedValue(null);

      const event = {
        ...mockEvent,
        resource: '/timers/{timer}',
        httpMethod: 'GET',
        path: '/timers/nonexistent'
      };

      const result = await handler(event, {});

      expect(result.statusCode).toBe(200);
      expect(result.body).toBe('{"error":"Timer not found"}');
    });
  });

  describe('POST /timers/{timer}', () => {
    it('should update timer successfully', async () => {
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

      const result = await handler(event, {});

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

  describe('GET /timers/shared', () => {
    it('should return shared timers for user', async () => {
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

      (getTimersSharedWithUser as jest.Mock).mockResolvedValue(mockSharedTimers);

      const event = {
        ...mockEvent,
        resource: '/timers/shared',
        httpMethod: 'GET',
        path: '/timers/shared'
      };

      const result = await handler(event, {});

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual(mockSharedTimers);
      expect(getTimersSharedWithUser).toHaveBeenCalledWith('testuser');
    });

    it('should return empty array when no shared timers exist', async () => {
      (getTimersSharedWithUser as jest.Mock).mockResolvedValue([]);

      const event = {
        ...mockEvent,
        resource: '/timers/shared',
        httpMethod: 'GET',
        path: '/timers/shared'
      };

      const result = await handler(event, {});

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing authorization', async () => {
      const event = {
        resource: '/timers/shared',
        httpMethod: 'GET',
        path: '/timers/shared',
        requestContext: {
          authorizer: null
        }
      };

      const result = await handler(event, {});

      expect(result.statusCode).toBe(200);
      expect(result.body).toBe('<nada>');
    });

    it('should handle API errors gracefully', async () => {
      (getTimersSharedWithUser as jest.Mock).mockRejectedValue(new Error('Database error'));

      const event = {
        ...mockEvent,
        resource: '/timers/shared',
        httpMethod: 'GET',
        path: '/timers/shared'
      };

      const result = await handler(event, {});

      expect(result.statusCode).toBe(200);
      expect(result.body).toContain('error');
    });
  });

  describe('CORS Headers', () => {
    it('should include proper CORS headers', async () => {
      const event = {
        ...mockEvent,
        resource: '/timers/shared',
        httpMethod: 'GET',
        path: '/timers/shared'
      };

      const result = await handler(event, {});

      expect(result.headers).toEqual({
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Origin": "http://localhost:4000",
        "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,PATCH,DELETE",
        "Content-Type": "application/json",
      });
    });
  });

    it('should handle DELETE request for rejecting shared timer invitation', async () => {
        (removeSharedTimerRelationship as jest.Mock).mockResolvedValue(true);

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

        const result = await handler(event, {});

        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body.result).toBe('rejected');
        expect(removeSharedTimerRelationship).toHaveBeenCalledWith('timer123', 'testuser');
    });

    it('should handle DELETE request with missing timerId', async () => {
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

        const result = await handler(event, {});

        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body.error).toBe('Missing timerId in request body');
    });
}); 