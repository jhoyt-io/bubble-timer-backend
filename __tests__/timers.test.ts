import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { 
  getTimer, 
  updateTimer, 
  stopTimer, 
  getTimersSharedWithUser, 
  addSharedTimerRelationship, 
  removeSharedTimerRelationship, 
  getSharedTimerRelationships,
  Timer 
} from '../lib/backend/timers';
import { TestLogger } from '../lib/core/test-logger';
import { setLogger, LogLevel } from '../lib/core/logger';

// Mock the DynamoDB client
jest.mock('@aws-sdk/client-dynamodb');

const mockDynamoDBClient = DynamoDBClient as jest.MockedClass<typeof DynamoDBClient>;
const mockSend = jest.fn();

describe('Timers Module', () => {
  let testLogger: TestLogger;

  beforeEach(() => {
    testLogger = new TestLogger();
    setLogger(testLogger);
    
    // Reset mocks
    jest.clearAllMocks();
    mockSend.mockReset();
    
    // Mock the send method
    mockDynamoDBClient.prototype.send = mockSend;
    
    // Set up environment variables
    process.env.TIMERS_TABLE_NAME = 'test-timers-table';
    process.env.SHARED_TIMERS_TABLE_NAME = 'test-shared-timers-table';
  });

  describe('Timer Class', () => {
    describe('Given a timer with all fields', () => {
      test('Then the timer should be created with correct data', () => {
        // Given & When
        const timer = new Timer(
          'timer123',
          'user123',
          'Test Timer',
          '300',
          '150',
          '2024-01-01T12:00:00Z'
        );

        // Then
        expect(timer.id).toBe('timer123');
        expect(timer.userId).toBe('user123');
        expect(timer.name).toBe('Test Timer');
        expect(timer.totalDuration).toBe('300');
        expect(timer.remainingDuration).toBe('150');
        expect(timer.endTime).toBe('2024-01-01T12:00:00Z');
      });
    });

    describe('Given a timer without optional fields', () => {
      test('Then the timer should be created with undefined optional fields', () => {
        // Given & When
        const timer = new Timer('timer123', 'user123', 'Test Timer', '300');

        // Then
        expect(timer.id).toBe('timer123');
        expect(timer.userId).toBe('user123');
        expect(timer.name).toBe('Test Timer');
        expect(timer.totalDuration).toBe('300');
        expect(timer.remainingDuration).toBeUndefined();
        expect(timer.endTime).toBeUndefined();
      });
    });
  });

  describe('getTimer', () => {
    describe('Given a timer exists in the database', () => {
      test('Then the timer should be returned with correct data', async () => {
        // Given
        const mockItem = {
          id: { S: 'timer123' },
          user_id: { S: 'user123' },
          name: { S: 'Test Timer' },
          total_duration: { S: '300' },
          remaining_duration: { S: '150' },
          end_time: { S: '2024-01-01T12:00:00Z' }
        };

        mockSend.mockResolvedValue({ Item: mockItem });

        // When
        const result = await getTimer('timer123');

        // Then
        expect(result).toEqual(expect.objectContaining({
          id: 'timer123',
          userId: 'user123',
          name: 'Test Timer',
          totalDuration: '300',
          remainingDuration: '150',
          endTime: '2024-01-01T12:00:00Z'
        }));
        expect(testLogger.hasMessage(/DDB Response/)).toBe(true);
      });
    });

    describe('Given a timer does not exist', () => {
      test('Then null should be returned', async () => {
        // Given
        mockSend.mockResolvedValue({ Item: null });

        // When
        const result = await getTimer('nonexistent');

        // Then
        expect(result).toBeNull();
        expect(testLogger.hasMessage(/DDB Response/)).toBe(true);
      });
    });

    describe('Given a DynamoDB error occurs', () => {
      test('Then null should be returned and error should be logged', async () => {
        // Given
        const dbError = new Error('DynamoDB query failed');
        mockSend.mockRejectedValue(dbError);

        // When
        const result = await getTimer('test-timer');

        // Then
        expect(result).toBeNull();
        expect(testLogger.hasMessageAtLevel(/DDB Error/, LogLevel.ERROR)).toBe(true);
      });
    });
  });

  describe('updateTimer', () => {
    describe('Given a timer update operation', () => {
      test('Then the timer should be updated successfully', async () => {
        // Given
        const timer = new Timer(
          'timer123',
          'user123',
          'Updated Timer',
          '600',
          '300',
          '2024-01-01T12:30:00Z'
        );

        mockSend.mockResolvedValue({});

        // When
        await updateTimer(timer);

        // Then
        expect(mockSend).toHaveBeenCalled();
        expect(testLogger.hasMessage(/DDB Response/)).toBe(true);
      });
    });

    describe('Given a DynamoDB error occurs', () => {
      test('Then the error should be logged gracefully', async () => {
        // Given
        const timer = new Timer('test-timer', 'test-user', 'Test Timer', '1800', '1200', '2024-01-01T12:30:00Z');
        const dbError = new Error('DynamoDB update failed');
        mockSend.mockRejectedValue(dbError);

        // When
        await updateTimer(timer);

        // Then
        expect(mockSend).toHaveBeenCalled();
        expect(testLogger.hasMessageAtLevel(/DDB Error/, LogLevel.ERROR)).toBe(true);
      });
    });
  });

  describe('getTimersSharedWithUser', () => {
    describe('Given shared timers exist for the user', () => {
      test('Then all shared timers should be returned', async () => {
        // Given
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

        mockSend
          .mockResolvedValueOnce({ Items: mockItems }) // Query for shared relationships
          .mockResolvedValueOnce({ Item: { // Get timer1 details
            id: { S: 'timer1' },
            user_id: { S: 'user1' },
            name: { S: 'Shared Timer 1' },
            total_duration: { S: '300' },
            remaining_duration: { S: '150' },
            end_time: { S: '2024-01-01T12:00:00Z' }
          }})
          .mockResolvedValueOnce({ Item: { // Get timer2 details
            id: { S: 'timer2' },
            user_id: { S: 'user2' },
            name: { S: 'Shared Timer 2' },
            total_duration: { S: '600' },
            remaining_duration: { S: '300' },
            end_time: { S: '2024-01-01T12:30:00Z' }
          }});

        // When
        const result = await getTimersSharedWithUser('testuser');

        // Then
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
    });

    describe('Given no shared timers exist for the user', () => {
      test('Then an empty array should be returned', async () => {
        // Given
        mockSend.mockResolvedValue({ Items: [] });

        // When
        const result = await getTimersSharedWithUser('testuser');

        // Then
        expect(result).toEqual([]);
      });
    });

    describe('Given a DynamoDB error occurs', () => {
      test('Then an empty array should be returned and error should be logged', async () => {
        // Given
        const dbError = new Error('DynamoDB query failed');
        mockSend.mockRejectedValue(dbError);

        // When
        const result = await getTimersSharedWithUser('test-user');

        // Then
        expect(result).toEqual([]);
        expect(testLogger.hasMessageAtLevel(/DDB Error getting shared timers/, LogLevel.ERROR)).toBe(true);
      });
    });

    describe('Given some timers are null when fetched', () => {
      test('Then only valid timers should be returned', async () => {
        // Given
        const mockResponse = {
          Items: [
            { timer_id: { S: 'timer-1' } },
            { timer_id: { S: 'timer-2' } }
          ]
        };
        
        // Mock the first call to getTimersSharedWithUser
        mockSend.mockResolvedValueOnce(mockResponse);
        
        // Mock the subsequent calls to getTimer
        mockSend
          .mockResolvedValueOnce({ Item: { id: { S: 'timer-1' }, user_id: { S: 'user-1' }, name: { S: 'Timer 1' }, total_duration: { S: '1800' } } })
          .mockResolvedValueOnce({ Item: undefined });

        // When
        const result = await getTimersSharedWithUser('test-user');

        // Then
        expect(result).toHaveLength(1);
        expect(result[0]?.id).toBe('timer-1');
      });
    });
  });

  describe('addSharedTimerRelationship', () => {
    describe('Given a successful relationship addition', () => {
      test('Then the relationship should be added and logged', async () => {
        // Given
        mockSend.mockResolvedValue({});

        // When
        await addSharedTimerRelationship('timer123', 'testuser');

        // Then
        expect(mockSend).toHaveBeenCalled();
        expect(testLogger.hasMessage(/Added shared timer relationship: timer123 -> testuser/)).toBe(true);
      });
    });

    describe('Given a DynamoDB error occurs', () => {
      test('Then the error should be logged gracefully', async () => {
        // Given
        const dbError = new Error('DynamoDB put failed');
        mockSend.mockRejectedValue(dbError);

        // When
        await addSharedTimerRelationship('test-timer', 'test-user');

        // Then
        expect(mockSend).toHaveBeenCalled();
        expect(testLogger.hasMessageAtLevel(/DDB Error adding shared timer relationship/, LogLevel.ERROR)).toBe(true);
      });
    });
  });

  describe('removeSharedTimerRelationship', () => {
    describe('Given a successful relationship removal', () => {
      test('Then the relationship should be removed and logged', async () => {
        // Given
        mockSend.mockResolvedValue({});

        // When
        await removeSharedTimerRelationship('timer123', 'testuser');

        // Then
        expect(mockSend).toHaveBeenCalled();
        expect(testLogger.hasMessage(/Removed shared timer relationship: timer123 -> testuser/)).toBe(true);
      });
    });

    describe('Given a DynamoDB error occurs', () => {
      test('Then the error should be logged gracefully', async () => {
        // Given
        mockSend.mockRejectedValue(new Error('Database error'));

        // When
        await removeSharedTimerRelationship('timer123', 'testuser');
        
        // Then
        expect(mockSend).toHaveBeenCalled();
        expect(testLogger.hasMessageAtLevel(/DDB Error removing shared timer relationship/, LogLevel.ERROR)).toBe(true);
      });
    });
  });

  describe('getSharedTimerRelationships', () => {
    describe('Given shared relationships exist for a timer', () => {
      test('Then all shared users should be returned', async () => {
        // Given
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

        mockSend.mockResolvedValue({ Items: mockItems });

        // When
        const result = await getSharedTimerRelationships('timer123');

        // Then
        expect(result).toEqual(['user1', 'user2']);
        expect(testLogger.hasMessage(/DDB Shared Relationships Response/)).toBe(true);
      });
    });

    describe('Given no shared relationships exist for a timer', () => {
      test('Then an empty array should be returned', async () => {
        // Given
        mockSend.mockResolvedValue({ Items: [] });

        // When
        const result = await getSharedTimerRelationships('timer123');

        // Then
        expect(result).toEqual([]);
      });
    });

    describe('Given a DynamoDB error occurs', () => {
      test('Then an empty array should be returned and error should be logged', async () => {
        // Given
        const dbError = new Error('DynamoDB query failed');
        mockSend.mockRejectedValue(dbError);

        // When
        const result = await getSharedTimerRelationships('test-timer');

        // Then
        expect(result).toEqual([]);
        expect(testLogger.hasMessageAtLevel(/DDB Error getting shared relationships/, LogLevel.ERROR)).toBe(true);
      });
    });
  });

  describe('stopTimer', () => {
    describe('Given a successful timer stop operation', () => {
      test('Then the timer should be stopped and logged', async () => {
        // Given
        mockSend.mockResolvedValue({});

        // When
        await stopTimer('timer123');

        // Then
        expect(mockSend).toHaveBeenCalled();
        expect(testLogger.hasMessage(/DDB Response/)).toBe(true);
      });
    });

    describe('Given a DynamoDB error occurs', () => {
      test('Then the error should be logged gracefully', async () => {
        // Given
        const dbError = new Error('DynamoDB delete failed');
        mockSend.mockRejectedValue(dbError);

        // When
        await stopTimer('test-timer');

        // Then
        expect(mockSend).toHaveBeenCalled();
        expect(testLogger.hasMessageAtLevel(/DDB Error/, LogLevel.ERROR)).toBe(true);
      });
    });
  });

  describe('Relationship Management', () => {
    describe('Given current relationships need to be updated', () => {
      test('Then new relationships should be added and outdated ones removed', async () => {
        // Given
        // Mock current relationships
        mockSend
          .mockResolvedValueOnce({ Items: [
            { timer_id: { S: 'timer123' }, shared_with_user: { S: 'user1' } },
            { timer_id: { S: 'timer123' }, shared_with_user: { S: 'user2' } },
            { timer_id: { S: 'timer123' }, shared_with_user: { S: 'user3' } }
          ]}) // getSharedTimerRelationships
          .mockResolvedValueOnce({}) // addSharedTimerRelationship for user4
          .mockResolvedValueOnce({}) // removeSharedTimerRelationship for user2
          .mockResolvedValueOnce({}); // removeSharedTimerRelationship for user3

        // When
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

        // Then
        expect(mockSend).toHaveBeenCalledTimes(4);
        expect(testLogger.hasMessage(/Added shared timer relationship: timer123 -> user4/)).toBe(true);
        expect(testLogger.hasMessage(/Removed shared timer relationship: timer123 -> user2/)).toBe(true);
        expect(testLogger.hasMessage(/Removed shared timer relationship: timer123 -> user3/)).toBe(true);
      });
    });
  });
}); 