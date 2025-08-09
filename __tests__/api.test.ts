import { handler } from '../lib/bubble-timer-backend-stack.api';

// Mock the timers module
jest.mock('../lib/backend/timers', () => ({
  getTimer: jest.fn(),
  updateTimer: jest.fn(),
  getTimersSharedWithUser: jest.fn(),
  removeSharedTimerRelationship: jest.fn(),
  Timer: {
    fromValidatedData: jest.fn().mockImplementation((data) => ({
      id: data.id,
      userId: data.userId,
      name: data.name,
      totalDuration: data.totalDuration,
      remainingDuration: data.remainingDuration,
      endTime: data.endTime
    }))
  }
}));

// Mock the validation middleware
jest.mock('../lib/backend/middleware/validation', () => ({
  ValidationMiddleware: {
    validateUserIdFromCognito: jest.fn().mockImplementation((event) => {
      const userId = event.requestContext?.authorizer?.claims?.['cognito:username'];
      if (!userId) {
        throw new Error('Missing user authentication');
      }
      return userId;
    }),
    validateHttpMethod: jest.fn().mockImplementation((event, allowedMethods) => {
      return event.httpMethod;
    }),
    validateTimerIdFromPath: jest.fn().mockImplementation((event) => {
      return event.path.split('/')[2];
    }),
    validateTimerBody: jest.fn().mockImplementation((body) => {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      return parsed.timer;
    }),
    validateSharedTimerQuery: jest.fn().mockImplementation((event) => {
      const timerId = event.queryStringParameters?.timerId;
      if (!timerId) {
        throw new Error('Missing timerId query parameter');
      }
      return { timerId };
    })
  }
}));

// Mock the response utils
jest.mock('../lib/backend/utils/response', () => ({
  ResponseUtils: {
    success: jest.fn().mockImplementation((body, statusCode = 200) => ({
      statusCode,
      headers: {
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Origin": "http://localhost:4000",
        "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,PATCH,DELETE",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })),
    timerResponse: jest.fn().mockImplementation((timer) => ({
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Origin": "http://localhost:4000",
        "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,PATCH,DELETE",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ timer }),
    }))
  }
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

      const result = await handler(event, { awsRequestId: 'test-request-id' });

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.timer).toEqual(mockTimer);
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

      const result = await handler(event, { awsRequestId: 'test-request-id' });

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Timer not found');
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
            userId: 'testuser',
            name: 'Updated Timer',
            totalDuration: '600',
            remainingDuration: '300',
            endTime: '2024-01-01T12:30:00Z'
          }
        })
      };

      const result = await handler(event, { awsRequestId: 'test-request-id' });

      // The new architecture validates the timer body and should succeed
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.result).toBeDefined();
      expect(updateTimer).toHaveBeenCalled();
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

      const result = await handler(event, { awsRequestId: 'test-request-id' });

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

      const result = await handler(event, { awsRequestId: 'test-request-id' });

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

      const result = await handler(event, { awsRequestId: 'test-request-id' });

      // The new architecture catches validation errors with ErrorHandler
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBeDefined();
    });

    it('should handle API errors gracefully', async () => {
      (getTimersSharedWithUser as jest.Mock).mockRejectedValue(new Error('Database error'));

      const event = {
        ...mockEvent,
        resource: '/timers/shared',
        httpMethod: 'GET',
        path: '/timers/shared'
      };

      const result = await handler(event, { awsRequestId: 'test-request-id' });

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBeDefined();
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

      const result = await handler(event, { awsRequestId: 'test-request-id' });

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
            queryStringParameters: {
                timerId: 'timer123'
            }
        };

        const result = await handler(event, { awsRequestId: 'test-request-id' });

        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body.result).toBe('Shared timer invitation rejected successfully');
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
            queryStringParameters: {}
        };

        const result = await handler(event, { awsRequestId: 'test-request-id' });

        expect(result.statusCode).toBe(500);
        const body = JSON.parse(result.body);
        expect(body.error).toBeDefined();
    });
}); 