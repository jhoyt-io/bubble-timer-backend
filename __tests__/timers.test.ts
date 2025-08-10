import {
  Timer,
  getTimer,
  updateTimer,
  getTimersSharedWithUser,
  addSharedTimerRelationship,
  removeSharedTimerRelationship,
  getSharedTimerRelationships
} from '../lib/backend/timers';

// Mock DynamoDB client
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  GetItemCommand: jest.fn(),
  UpdateItemCommand: jest.fn(),
  QueryCommand: jest.fn(),
  PutItemCommand: jest.fn(),
  DeleteItemCommand: jest.fn()
}));

const { DynamoDBClient, GetItemCommand, UpdateItemCommand, QueryCommand, PutItemCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');

describe('Timers Module', () => {
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up environment variables
    process.env.TIMERS_TABLE_NAME = 'test-timers-table';
    process.env.SHARED_TIMERS_TABLE_NAME = 'test-shared-timers-table';
    
    mockClient = {
      send: jest.fn()
    };
    (DynamoDBClient as jest.Mock).mockImplementation(() => mockClient);
    
    // Mock command constructors to return objects with input property
    (UpdateItemCommand as jest.Mock).mockImplementation((params) => ({
      input: params
    }));
    (PutItemCommand as jest.Mock).mockImplementation((params) => ({
      input: params
    }));
    (DeleteItemCommand as jest.Mock).mockImplementation((params) => ({
      input: params
    }));
  });

  describe('Timer Class', () => {
    it('should create timer with all fields', () => {
      const timer = new Timer(
        'timer123',
        'user123',
        'Test Timer',
        '300',
        '150',
        '2024-01-01T12:00:00Z'
      );

      expect(timer.id).toBe('timer123');
      expect(timer.userId).toBe('user123');
      expect(timer.name).toBe('Test Timer');
      expect(timer.totalDuration).toBe('300');
      expect(timer.remainingDuration).toBe('150');
      expect(timer.endTime).toBe('2024-01-01T12:00:00Z');
    });

    it('should create timer without optional fields', () => {
      const timer = new Timer('timer123', 'user123', 'Test Timer', '300');

      expect(timer.id).toBe('timer123');
      expect(timer.userId).toBe('user123');
      expect(timer.name).toBe('Test Timer');
      expect(timer.totalDuration).toBe('300');
      expect(timer.remainingDuration).toBeUndefined();
      expect(timer.endTime).toBeUndefined();
    });
  });

  describe('getTimer', () => {
    it('should return timer when it exists', async () => {
      const mockItem = {
        id: { S: 'timer123' },
        user_id: { S: 'user123' },
        name: { S: 'Test Timer' },
        total_duration: { S: '300' },
        remaining_duration: { S: '150' },
        end_time: { S: '2024-01-01T12:00:00Z' }
      };

      mockClient.send.mockResolvedValue({ Item: mockItem });

      const result = await getTimer('timer123');

      expect(result).toEqual(expect.objectContaining({
        id: 'timer123',
        userId: 'user123',
        name: 'Test Timer',
        totalDuration: '300',
        remainingDuration: '150',
        endTime: '2024-01-01T12:00:00Z'
      }));
    });

    it('should return null when timer does not exist', async () => {
      mockClient.send.mockResolvedValue({ Item: null });

      const result = await getTimer('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateTimer', () => {
    it('should update timer with all fields', async () => {
      const timer = new Timer(
        'timer123',
        'user123',
        'Updated Timer',
        '600',
        '300',
        '2024-01-01T12:30:00Z'
      );

      mockClient.send.mockResolvedValue({});

      await updateTimer(timer);

      expect(PutItemCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'test-timers-table',
          Item: expect.objectContaining({
            id: { S: 'timer123' },
            user_id: { S: 'user123' },
            name: { S: 'Updated Timer' },
            total_duration: { S: '600' },
            remaining_duration: { S: '300' },
            end_time: { S: '2024-01-01T12:30:00Z' }
          })
        })
      );
    });
  });

  describe('getTimersSharedWithUser', () => {
    it('should return shared timers for user', async () => {
      const mockItems = [
        {
          shared_with_user: { S: 'testuser' },
          timer_id: { S: 'timer1' },
          created_at: { S: '2024-01-01T12:00:00Z' }
        },
        {
          shared_with_user: { S: 'testuser' },
          timer_id: { S: 'timer2' },
          created_at: { S: '2024-01-01T12:30:00Z' }
        }
      ];

      mockClient.send
        .mockResolvedValueOnce({ Items: mockItems }) // Query for shared relationships
        .mockResolvedValueOnce({ Item: { // Get timer1 details
          id: { S: 'timer1' },
          user_id: { S: 'user1' },
          name: { S: 'Shared Timer 1' },
          total_duration: { S: '300' },
          remaining_duration: { S: '150' },
          end_time: { S: '2024-01-01T12:00:00Z' },
          shared_with: { SS: ['testuser'] }
        }})
        .mockResolvedValueOnce({ Item: { // Get timer2 details
          id: { S: 'timer2' },
          user_id: { S: 'user2' },
          name: { S: 'Shared Timer 2' },
          total_duration: { S: '600' },
          remaining_duration: { S: '300' },
          end_time: { S: '2024-01-01T12:30:00Z' },
          shared_with: { SS: ['testuser', 'user3'] }
        }});

      const result = await getTimersSharedWithUser('testuser');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(expect.objectContaining({
        id: 'timer1',
        userId: 'user1',
        name: 'Shared Timer 1'
      }));
      expect(result[1]).toEqual(expect.objectContaining({
        id: 'timer2',
        userId: 'user2',
        name: 'Shared Timer 2'
      }));
    });

    it('should return empty array when no shared timers exist', async () => {
      mockClient.send.mockResolvedValue({ Items: [] });

      const result = await getTimersSharedWithUser('testuser');

      expect(result).toEqual([]);
    });
  });

  describe('addSharedTimerRelationship', () => {
    it('should add shared timer relationship', async () => {
      mockClient.send.mockResolvedValue({});

      await addSharedTimerRelationship('timer123', 'testuser');

      expect(PutItemCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'test-shared-timers-table',
          Item: expect.objectContaining({
            shared_with_user: { S: 'testuser' },
            timer_id: { S: 'timer123' },
            created_at: expect.any(Object)
          })
        })
      );
    });
  });

  describe('removeSharedTimerRelationship', () => {
    it('should remove shared timer relationship', async () => {
      mockClient.send.mockResolvedValue({});

      await removeSharedTimerRelationship('timer123', 'testuser');

      expect(DeleteItemCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'test-shared-timers-table',
          Key: {
            shared_with_user: { S: 'testuser' },
            timer_id: { S: 'timer123' }
          }
        })
      );
    });

    it('should handle database errors gracefully', async () => {
      mockClient.send.mockRejectedValue(new Error('Database error'));

      // The function should not throw, it should just log the error
      await removeSharedTimerRelationship('timer123', 'testuser');
      
      // Verify the function was called
      expect(DeleteItemCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'test-shared-timers-table',
          Key: {
            shared_with_user: { S: 'testuser' },
            timer_id: { S: 'timer123' }
          }
        })
      );
    });
  });

  describe('getSharedTimerRelationships', () => {
    it('should return shared users for a timer', async () => {
      const mockItems = [
        {
          timer_id: { S: 'timer123' },
          shared_with_user: { S: 'user1' },
          created_at: { S: '2024-01-01T12:00:00Z' }
        },
        {
          timer_id: { S: 'timer123' },
          shared_with_user: { S: 'user2' },
          created_at: { S: '2024-01-01T12:30:00Z' }
        }
      ];

      mockClient.send.mockResolvedValue({ Items: mockItems });

      const result = await getSharedTimerRelationships('timer123');

      expect(result).toEqual(['user1', 'user2']);
    });

    it('should return empty array when no relationships exist', async () => {
      mockClient.send.mockResolvedValue({ Items: [] });

      const result = await getSharedTimerRelationships('timer123');

      expect(result).toEqual([]);
    });
  });

  describe('Relationship Management', () => {
    it('should add new relationships and remove outdated ones', async () => {
      // Mock current relationships
      mockClient.send
        .mockResolvedValueOnce({ Items: [
          { timer_id: { S: 'timer123' }, shared_with_user: { S: 'user1' } },
          { timer_id: { S: 'timer123' }, shared_with_user: { S: 'user2' } },
          { timer_id: { S: 'timer123' }, shared_with_user: { S: 'user3' } }
        ]}) // getSharedTimerRelationships
        .mockResolvedValueOnce({}) // addSharedTimerRelationship for user4
        .mockResolvedValueOnce({}) // removeSharedTimerRelationship for user2
        .mockResolvedValueOnce({}); // removeSharedTimerRelationship for user3

      // Simulate the relationship management logic
      const currentSharedUsers = await getSharedTimerRelationships('timer123');
      const newSharedUsers = ['user1', 'user4']; // user2 and user3 removed, user4 added
      
      // Add new relationships
      for (const sharedUser of newSharedUsers) {
        if (!currentSharedUsers.includes(sharedUser)) {
          await addSharedTimerRelationship('timer123', sharedUser);
        }
      }
      
      // Remove outdated relationships
      for (const currentUser of currentSharedUsers) {
        if (!newSharedUsers.includes(currentUser)) {
          await removeSharedTimerRelationship('timer123', currentUser);
        }
      }

      expect(QueryCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'test-shared-timers-table',
          IndexName: 'TimerIdIndex',
          KeyConditionExpression: 'timer_id = :timerId',
          ExpressionAttributeValues: { ':timerId': { S: 'timer123' } }
        })
      );

      expect(PutItemCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'test-shared-timers-table',
          Item: expect.objectContaining({
            shared_with_user: { S: 'user4' },
            timer_id: { S: 'timer123' }
          })
        })
      );

      expect(DeleteItemCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'test-shared-timers-table',
          Key: {
            shared_with_user: { S: 'user2' },
            timer_id: { S: 'timer123' }
          }
        })
      );

      expect(DeleteItemCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'test-shared-timers-table',
          Key: {
            shared_with_user: { S: 'user3' },
            timer_id: { S: 'timer123' }
          }
        })
      );
    });
  });
}); 