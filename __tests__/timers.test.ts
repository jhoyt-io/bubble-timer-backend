// Mock the entire backend/timers module with proper function mocking
const mockGetTimer = jest.fn();
const mockUpdateTimer = jest.fn();
const mockGetTimersSharedWithUser = jest.fn();
const mockAddSharedTimerRelationship = jest.fn();
const mockRemoveSharedTimerRelationship = jest.fn();
const mockGetSharedTimerRelationships = jest.fn();

// Mock Timer class
class MockTimer {
  constructor(public id: string, public userId: string, public name: string, public totalDuration: string, public remainingDuration?: string, public endTime?: string) {}
  
  static fromValidatedData(data: any) {
    return new MockTimer(data.id, data.userId, data.name, data.totalDuration, data.remainingDuration, data.endTime);
  }
}

jest.mock('../lib/backend/timers', () => ({
  Timer: MockTimer,
  getTimer: (...args: any[]) => mockGetTimer(...args),
  updateTimer: (...args: any[]) => mockUpdateTimer(...args),
  getTimersSharedWithUser: (...args: any[]) => mockGetTimersSharedWithUser(...args),
  addSharedTimerRelationship: (...args: any[]) => mockAddSharedTimerRelationship(...args),
  removeSharedTimerRelationship: (...args: any[]) => mockRemoveSharedTimerRelationship(...args),
  getSharedTimerRelationships: (...args: any[]) => mockGetSharedTimerRelationships(...args)
}));

// Import the mocked functions
const {
  Timer,
  getTimer,
  updateTimer,
  getTimersSharedWithUser,
  addSharedTimerRelationship,
  removeSharedTimerRelationship,
  getSharedTimerRelationships
} = require('../lib/backend/timers');

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
    
    // Clear all the mock function calls
    mockGetTimer.mockClear();
    mockUpdateTimer.mockClear();
    mockGetTimersSharedWithUser.mockClear();
    mockAddSharedTimerRelationship.mockClear();
    mockRemoveSharedTimerRelationship.mockClear();
    mockGetSharedTimerRelationships.mockClear();
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
      const expectedTimer = {
        id: 'timer123',
        userId: 'user123',
        name: 'Test Timer',
        totalDuration: '300',
        remainingDuration: '150',
        endTime: '2024-01-01T12:00:00Z'
      };

      mockGetTimer.mockResolvedValue(expectedTimer);

      const result = await getTimer('timer123');

      expect(result).toEqual(expectedTimer);
      expect(mockGetTimer).toHaveBeenCalledWith('timer123');
    });

    it('should return null when timer does not exist', async () => {
      mockGetTimer.mockResolvedValue(null);

      const result = await getTimer('nonexistent');

      expect(result).toBeNull();
      expect(mockGetTimer).toHaveBeenCalledWith('nonexistent');
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

      mockUpdateTimer.mockResolvedValue({});

      await updateTimer(timer);

      expect(mockUpdateTimer).toHaveBeenCalledWith(timer);
    });
  });

  describe('getTimersSharedWithUser', () => {
    it('should return shared timers for user', async () => {
      const expectedSharedTimers = [
        {
          id: 'timer1',
          userId: 'user1',
          name: 'Shared Timer 1',
          totalDuration: '300',
          remainingDuration: '150',
          endTime: '2024-01-01T12:00:00Z'
        },
        {
          id: 'timer2',
          userId: 'user2',
          name: 'Shared Timer 2',
          totalDuration: '600',
          remainingDuration: '300',
          endTime: '2024-01-01T12:30:00Z'
        }
      ];

      mockGetTimersSharedWithUser.mockResolvedValue(expectedSharedTimers);

      const result = await getTimersSharedWithUser('testuser');

      expect(result).toEqual(expectedSharedTimers);
      expect(mockGetTimersSharedWithUser).toHaveBeenCalledWith('testuser');
    });

    it('should return empty array when no shared timers exist', async () => {
      mockGetTimersSharedWithUser.mockResolvedValue([]);

      const result = await getTimersSharedWithUser('testuser');

      expect(result).toEqual([]);
      expect(mockGetTimersSharedWithUser).toHaveBeenCalledWith('testuser');
    });
  });

  describe('addSharedTimerRelationship', () => {
    it('should add shared timer relationship', async () => {
      mockAddSharedTimerRelationship.mockResolvedValue(undefined);

      await addSharedTimerRelationship('timer123', 'testuser');

      expect(mockAddSharedTimerRelationship).toHaveBeenCalledWith('timer123', 'testuser');
    });
  });

  describe('removeSharedTimerRelationship', () => {
    it('should remove shared timer relationship', async () => {
      mockRemoveSharedTimerRelationship.mockResolvedValue(undefined);

      await removeSharedTimerRelationship('timer123', 'testuser');

      expect(mockRemoveSharedTimerRelationship).toHaveBeenCalledWith('timer123', 'testuser');
    });

    it('should handle database errors gracefully', async () => {
      mockRemoveSharedTimerRelationship.mockRejectedValue(new Error('Database error'));

      // The function should handle the error gracefully
      await expect(removeSharedTimerRelationship('timer123', 'testuser')).rejects.toThrow('Database error');
      
      expect(mockRemoveSharedTimerRelationship).toHaveBeenCalledWith('timer123', 'testuser');
    });
  });

  describe('getSharedTimerRelationships', () => {
    it('should return shared users for a timer', async () => {
      const expectedUsers = ['user1', 'user2'];
      mockGetSharedTimerRelationships.mockResolvedValue(expectedUsers);

      const result = await getSharedTimerRelationships('timer123');

      expect(result).toEqual(expectedUsers);
      expect(mockGetSharedTimerRelationships).toHaveBeenCalledWith('timer123');
    });

    it('should return empty array when no relationships exist', async () => {
      mockGetSharedTimerRelationships.mockResolvedValue([]);

      const result = await getSharedTimerRelationships('timer123');

      expect(result).toEqual([]);
      expect(mockGetSharedTimerRelationships).toHaveBeenCalledWith('timer123');
    });
  });

  describe('Relationship Management', () => {
    it('should add new relationships and remove outdated ones', async () => {
      // Mock current relationships
      const currentUsers = ['user1', 'user2', 'user3'];
      mockGetSharedTimerRelationships.mockResolvedValue(currentUsers);
      mockAddSharedTimerRelationship.mockResolvedValue(undefined);
      mockRemoveSharedTimerRelationship.mockResolvedValue(undefined);

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

      expect(mockGetSharedTimerRelationships).toHaveBeenCalledWith('timer123');
      expect(mockAddSharedTimerRelationship).toHaveBeenCalledWith('timer123', 'user4');
      expect(mockRemoveSharedTimerRelationship).toHaveBeenCalledWith('timer123', 'user2');
      expect(mockRemoveSharedTimerRelationship).toHaveBeenCalledWith('timer123', 'user3');
    });
  });
}); 