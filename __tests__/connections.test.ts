import { DynamoDBClient, GetItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { getConnection, getConnectionById, getConnectionsByUserId, updateConnection, Connection } from '../lib/backend/connections';
import { TestLogger } from '../lib/core/test-logger';
import { setLogger, LogLevel } from '../lib/core/logger';

// Mock the DynamoDB client
jest.mock('@aws-sdk/client-dynamodb');

const mockDynamoDBClient = DynamoDBClient as jest.MockedClass<typeof DynamoDBClient>;
const mockSend = jest.fn();

describe('Connections', () => {
  let testLogger: TestLogger;

  beforeEach(() => {
    testLogger = new TestLogger();
    setLogger(testLogger);
    
    // Reset mocks
    jest.clearAllMocks();
    mockSend.mockReset();
    
    // Mock the send method properly
    mockDynamoDBClient.prototype.send = mockSend;
  });

  describe('updateConnection', () => {
    describe('Given a DynamoDB error occurs', () => {
      test('Then the error should be logged gracefully', async () => {
        // Given
        const connection = new Connection('test-user', 'test-device', 'test-connection');
        const dbError = new Error('DynamoDB connection failed');
        mockSend.mockRejectedValue(dbError);

        // When
        await updateConnection(connection);

        // Then
        expect(mockSend).toHaveBeenCalled();
        expect(testLogger.hasMessageAtLevel(/DDB Error/, LogLevel.ERROR)).toBe(true);
      });
    });

    describe('Given a successful update operation', () => {
      test('Then the response should be logged', async () => {
        // Given
        const connection = new Connection('test-user', 'test-device', 'test-connection');
        const mockResponse = { Item: { user_id: { S: 'test-user' } } };
        mockSend.mockResolvedValue(mockResponse);

        // When
        await updateConnection(connection);

        // Then
        expect(mockSend).toHaveBeenCalled();
        expect(testLogger.hasMessage(/DDB Response/)).toBe(true);
      });
    });
  });

  describe('getConnection', () => {
    describe('Given no connection exists', () => {
      test('Then null should be returned', async () => {
        // Given
        const mockResponse = { Item: undefined };
        mockSend.mockResolvedValue(mockResponse);

        // When
        const result = await getConnection('test-user', 'test-device');

        // Then
        expect(result).toBeNull();
        expect(mockSend).toHaveBeenCalled();
      });
    });

    describe('Given a DynamoDB error occurs', () => {
      test('Then null should be returned and error should be logged', async () => {
        // Given
        const dbError = new Error('DynamoDB query failed');
        mockSend.mockRejectedValue(dbError);

        // When
        const result = await getConnection('test-user', 'test-device');

        // Then
        expect(result).toBeNull();
        expect(testLogger.hasMessageAtLevel(/DDB Error/, LogLevel.ERROR)).toBe(true);
      });
    });

    describe('Given a connection exists', () => {
      test('Then the connection should be returned with correct data', async () => {
        // Given
        const mockResponse = {
          Item: {
            user_id: { S: 'test-user' },
            device_id: { S: 'test-device' },
            connection_id: { S: 'test-connection' }
          }
        };
        mockSend.mockResolvedValue(mockResponse);

        // When
        const result = await getConnection('test-user', 'test-device');

        // Then
        expect(result).toBeInstanceOf(Connection);
        expect(result?.userId).toBe('test-user');
        expect(result?.deviceId).toBe('test-device');
        expect(result?.connectionId).toBe('test-connection');
        expect(testLogger.hasMessage(/DDB Response/)).toBe(true);
      });
    });
  });

  describe('getConnectionById', () => {
    describe('Given no connection exists with the ID', () => {
      test('Then null should be returned', async () => {
        // Given
        const mockResponse = { Items: [] };
        mockSend.mockResolvedValue(mockResponse);

        // When
        const result = await getConnectionById('non-existent-connection');

        // Then
        expect(result).toBeNull();
        expect(mockSend).toHaveBeenCalled();
      });
    });

    describe('Given a DynamoDB error occurs', () => {
      test('Then null should be returned and error should be logged', async () => {
        // Given
        const dbError = new Error('DynamoDB query failed');
        mockSend.mockRejectedValue(dbError);

        // When
        const result = await getConnectionById('test-connection');

        // Then
        expect(result).toBeNull();
        expect(testLogger.hasMessageAtLevel(/DDB Error/, LogLevel.ERROR)).toBe(true);
      });
    });

    describe('Given a connection exists with the ID', () => {
      test('Then the connection should be returned with correct data', async () => {
        // Given
        const mockResponse = {
          Items: [{
            user_id: { S: 'test-user' },
            device_id: { S: 'test-device' },
            connection_id: { S: 'test-connection' }
          }]
        };
        mockSend.mockResolvedValue(mockResponse);

        // When
        const result = await getConnectionById('test-connection');

        // Then
        expect(result).toBeInstanceOf(Connection);
        expect(result?.userId).toBe('test-user');
        expect(result?.deviceId).toBe('test-device');
        expect(result?.connectionId).toBe('test-connection');
        expect(testLogger.hasMessage(/DDB Response/)).toBe(true);
      });
    });
  });

  describe('getConnectionsByUserId', () => {
    describe('Given no connections exist for the user', () => {
      test('Then an empty array should be returned', async () => {
        // Given
        const mockResponse = { Items: [] };
        mockSend.mockResolvedValue(mockResponse);

        // When
        const result = await getConnectionsByUserId('user-with-no-connections');

        // Then
        expect(result).toEqual([]);
        expect(mockSend).toHaveBeenCalled();
      });
    });

    describe('Given a DynamoDB error occurs', () => {
      test('Then null should be returned and error should be logged', async () => {
        // Given
        const dbError = new Error('DynamoDB query failed');
        mockSend.mockRejectedValue(dbError);

        // When
        const result = await getConnectionsByUserId('test-user');

        // Then
        expect(result).toBeNull();
        expect(testLogger.hasMessageAtLevel(/DDB Error/, LogLevel.ERROR)).toBe(true);
      });
    });

    describe('Given multiple connections exist for the user', () => {
      test('Then all connections should be returned with correct data', async () => {
        // Given
        const mockResponse = {
          Items: [
            {
              user_id: { S: 'test-user' },
              device_id: { S: 'device-1' },
              connection_id: { S: 'connection-1' }
            },
            {
              user_id: { S: 'test-user' },
              device_id: { S: 'device-2' },
              connection_id: { S: 'connection-2' }
            }
          ]
        };
        mockSend.mockResolvedValue(mockResponse);

        // When
        const result = await getConnectionsByUserId('test-user');

        // Then
        expect(result).toHaveLength(2);
        expect(result?.[0]).toBeInstanceOf(Connection);
        expect(result?.[0]?.userId).toBe('test-user');
        expect(result?.[0]?.deviceId).toBe('device-1');
        expect(result?.[0]?.connectionId).toBe('connection-1');
        expect(result?.[1]?.deviceId).toBe('device-2');
        expect(result?.[1]?.connectionId).toBe('connection-2');
        expect(testLogger.hasMessage(/DDB Response/)).toBe(true);
      });
    });
  });

  describe('Connection class', () => {
    describe('Given a connection with all properties', () => {
      test('Then the connection should be created with correct data', () => {
        // Given & When
        const connection = new Connection('test-user', 'test-device', 'test-connection');

        // Then
        expect(connection.userId).toBe('test-user');
        expect(connection.deviceId).toBe('test-device');
        expect(connection.connectionId).toBe('test-connection');
      });
    });

    describe('Given a connection without connection ID', () => {
      test('Then the connection should be created with undefined connection ID', () => {
        // Given & When
        const connection = new Connection('test-user', 'test-device');

        // Then
        expect(connection.userId).toBe('test-user');
        expect(connection.deviceId).toBe('test-device');
        expect(connection.connectionId).toBeUndefined();
      });
    });
  });
});
