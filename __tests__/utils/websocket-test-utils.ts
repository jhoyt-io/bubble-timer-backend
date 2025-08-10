/**
 * WebSocket Testing Utilities
 * 
 * This module provides utilities for testing WebSocket functionality
 * following the Given/When/Then pattern and ensuring comprehensive coverage.
 */

export interface WebSocketEventOptions {
  connectionId?: string;
  routeKey?: string;
  eventType?: string;
  authorization?: string;
  deviceId?: string;
  body?: any;
}

export interface MockConnection {
  userId: string;
  deviceId: string;
  connectionId: string;
}

export interface MockTimer {
  id: string;
  userId: string;
  name: string;
  totalDuration: string;
  remainingDuration?: string;
  endTime?: string;
}

/**
 * Creates a mock WebSocket event for testing
 */
export function createMockWebSocketEvent(options: WebSocketEventOptions = {}): any {
  const {
    connectionId = 'test-connection-id',
    routeKey = 'sendmessage',
    eventType = 'MESSAGE',
    authorization = 'mock-jwt-token',
    deviceId = 'test-device-id',
    body = {}
  } = options;

  return {
    requestContext: {
      connectionId,
      routeKey,
      eventType
    },
    headers: {
      Authorization: authorization,
      DeviceId: deviceId
    },
    body: JSON.stringify(body)
  };
}

/**
 * Creates a mock WebSocket event for timer operations
 */
export function createTimerWebSocketEvent(
  operation: 'updateTimer' | 'stopTimer' | 'shareTimer',
  data: any,
  options: WebSocketEventOptions = {}
): any {
  const body = {
    data: {
      type: operation,
      ...data
    }
  };

  return createMockWebSocketEvent({
    ...options,
    body
  });
}

/**
 * Creates a mock WebSocket event for updateTimer operation
 */
export function createUpdateTimerEvent(
  timer: MockTimer,
  shareWith: string[] = [],
  options: WebSocketEventOptions = {}
): any {
  return createTimerWebSocketEvent('updateTimer', {
    timer,
    shareWith
  }, options);
}

/**
 * Creates a mock WebSocket event for stopTimer operation
 */
export function createStopTimerEvent(
  timerId: string,
  options: WebSocketEventOptions = {}
): any {
  return createTimerWebSocketEvent('stopTimer', {
    timerId
  }, options);
}

/**
 * Creates mock connection data for testing
 */
export function createMockConnection(
  userId: string = 'test-user',
  deviceId: string = 'test-device-id',
  connectionId: string = 'test-connection-id'
): MockConnection {
  return {
    userId,
    deviceId,
    connectionId
  };
}

/**
 * Creates mock timer data for testing
 */
export function createMockTimer(
  id: string = 'test-timer-id',
  userId: string = 'test-user',
  name: string = 'Test Timer',
  totalDuration: string = 'PT30M',
  remainingDuration?: string,
  endTime?: string
): MockTimer {
  return {
    id,
    userId,
    name,
    totalDuration,
    remainingDuration,
    endTime
  };
}

/**
 * Creates multiple mock connections for a user
 */
export function createMockUserConnections(
  userId: string,
  deviceCount: number = 2
): MockConnection[] {
  return Array.from({ length: deviceCount }, (_, index) =>
    createMockConnection(
      userId,
      `device-${index + 1}`,
      `connection-${userId}-${index + 1}`
    )
  );
}

/**
 * Creates mock shared timer relationships
 */
export function createMockSharedRelationships(
  timerId: string,
  sharedUsers: string[]
): Array<{ timer_id: string; shared_with_user: string; created_at: string }> {
  return sharedUsers.map(user => ({
    timer_id: timerId,
    shared_with_user: user,
    created_at: new Date().toISOString()
  }));
}

/**
 * Validates WebSocket response structure
 */
export function validateWebSocketResponse(response: any): void {
  expect(response).toHaveProperty('isBase64Encoded');
  expect(response).toHaveProperty('statusCode');
  expect(typeof response.isBase64Encoded).toBe('boolean');
  expect(typeof response.statusCode).toBe('number');
}

/**
 * Validates successful WebSocket response
 */
export function validateSuccessfulWebSocketResponse(response: any): void {
  validateWebSocketResponse(response);
  expect(response.statusCode).toBe(200);
}

/**
 * Validates error WebSocket response
 */
export function validateErrorWebSocketResponse(response: any, expectedStatusCode: number = 500): void {
  validateWebSocketResponse(response);
  expect(response.statusCode).toBe(expectedStatusCode);
}

/**
 * Validates WebSocket response body
 */
export function validateWebSocketResponseBody(response: any, expectedBody: any): void {
  validateWebSocketResponse(response);
  const body = JSON.parse(response.body);
  expect(body).toEqual(expectedBody);
}

/**
 * Test data factories for common scenarios
 */
export const TestData = {
  // Timer scenarios
  activeTimer: () => createMockTimer('active-timer', 'user1', 'Active Timer', 'PT30M', 'PT25M', '2024-01-01T12:30:00Z'),
  pausedTimer: () => createMockTimer('paused-timer', 'user1', 'Paused Timer', 'PT20M', 'PT15M'),
  completedTimer: () => createMockTimer('completed-timer', 'user1', 'Completed Timer', 'PT10M', 'PT0M'),
  
  // User scenarios
  singleUser: () => createMockConnection('user1', 'device1', 'conn-user1-device1'),
  multiDeviceUser: () => createMockUserConnections('user1', 3),
  multipleUsers: () => [
    createMockConnection('user1', 'device1', 'conn-user1-device1'),
    createMockConnection('user2', 'device1', 'conn-user2-device1'),
    createMockConnection('user3', 'device1', 'conn-user3-device1')
  ],
  
  // Sharing scenarios
  sharedWithMultipleUsers: () => ['user2', 'user3', 'user4'],
  sharedWithSingleUser: () => ['user2'],
  noSharedUsers: () => [],
  
  // Error scenarios
  invalidTimerId: () => 'invalid-timer-id',
  nonExistentUser: () => 'non-existent-user',
  invalidJWT: () => 'invalid-jwt-token',
  expiredJWT: () => 'expired-jwt-token'
};

/**
 * Common test assertions for WebSocket operations
 */
export const WebSocketAssertions = {
  /**
   * Asserts that a timer was updated in the database
   */
  timerWasUpdated: (mockUpdateTimer: jest.Mock, timerId: string, expectedData?: any) => {
    expect(mockUpdateTimer).toHaveBeenCalledWith(timerId, expectedData);
  },
  
  /**
   * Asserts that a timer was stopped
   */
  timerWasStopped: (mockStopTimer: jest.Mock, timerId: string) => {
    expect(mockStopTimer).toHaveBeenCalledWith(timerId);
  },
  
  /**
   * Asserts that shared relationships were managed correctly
   */
  sharedRelationshipsWereManaged: (
    mockAddRelationship: jest.Mock,
    mockRemoveRelationship: jest.Mock,
    timerId: string,
    expectedAdded: string[],
    expectedRemoved: string[]
  ) => {
    expectedAdded.forEach(user => {
      expect(mockAddRelationship).toHaveBeenCalledWith(timerId, user);
    });
    
    expectedRemoved.forEach(user => {
      expect(mockRemoveRelationship).toHaveBeenCalledWith(timerId, user);
    });
  },
  
  /**
   * Asserts that connections were looked up correctly
   */
  connectionsWereLookedUp: (mockGetConnections: jest.Mock, userId: string) => {
    expect(mockGetConnections).toHaveBeenCalledWith(userId);
  },
  
  /**
   * Asserts that messages were broadcast to users
   */
  messagesWereBroadcast: (mockSendToUser: jest.Mock, expectedUsers: string[]) => {
    expectedUsers.forEach(user => {
      expect(mockSendToUser).toHaveBeenCalledWith(user, expect.any(Object));
    });
  }
};

/**
 * Common test setup for WebSocket tests
 */
export function setupWebSocketTest() {
  // Clear all mocks
  jest.clearAllMocks();
  
  // Set up environment variables
  process.env.TIMERS_TABLE_NAME = 'test-timers-table';
  process.env.SHARED_TIMERS_TABLE_NAME = 'test-shared-timers-table';
  process.env.USER_CONNECTIONS_TABLE_NAME = 'test-user-connections-table';
}

/**
 * Common test cleanup for WebSocket tests
 */
export function cleanupWebSocketTest() {
  // Reset environment variables
  delete process.env.TIMERS_TABLE_NAME;
  delete process.env.SHARED_TIMERS_TABLE_NAME;
  delete process.env.USER_CONNECTIONS_TABLE_NAME;
}
