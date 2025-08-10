// Jest setup file to configure environment variables for tests

// Set up test environment variables before any modules are imported
process.env.NODE_ENV = 'test';
process.env.TIMERS_TABLE_NAME = 'test-timers-table';
process.env.USER_CONNECTIONS_TABLE_NAME = 'test-user-connections-table';
process.env.SHARED_TIMERS_TABLE_NAME = 'test-shared-timers-table';
process.env.COGNITO_USER_POOL_ID = 'us-east-1_test123';
process.env.COGNITO_CLIENT_ID = 'test-client-id';
process.env.WEBSOCKET_ENDPOINT = 'https://test.execute-api.us-east-1.amazonaws.com/prod/';
process.env.CORS_ORIGIN = 'http://localhost:4000';
process.env.LOG_LEVEL = 'debug';
process.env.AWS_REGION = 'us-east-1';

// Mock AWS SDK modules globally for tests
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
    destroy: jest.fn()
  })),
  GetItemCommand: jest.fn(),
  UpdateItemCommand: jest.fn(),
  QueryCommand: jest.fn(),
  PutItemCommand: jest.fn(),
  DeleteItemCommand: jest.fn(),
  ScanCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
  ApiGatewayManagementApiClient: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
    destroy: jest.fn()
  })),
  PostToConnectionCommand: jest.fn()
}));

// Mock the CognitoJwtVerifier
jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn().mockReturnValue({
      verify: jest.fn().mockResolvedValue({
        'cognito:username': 'test-user',
        sub: 'test-sub',
        token_use: 'id'
      })
    })
  }
}));

// Mock the Config module
jest.mock('./lib/config', () => ({
  Config: {
    database: {
      send: jest.fn(),
      destroy: jest.fn()
    },
    tables: {
      timers: 'test-timers-table',
      userConnections: 'test-user-connections-table',
      sharedTimers: 'test-shared-timers-table'
    },
    websocket: {
      send: jest.fn(),
      destroy: jest.fn()
    },
    ws: {
      auth: {
        cognito: {
          userPoolId: 'us-east-1_test123',
          clientId: 'test-client-id'
        }
      },
      endpoint: {
        endpoint: 'https://test.execute-api.us-east-1.amazonaws.com/prod/'
      }
    },
    environment: {
      environment: 'test',
      region: 'us-east-1'
    }
  },
  EnvironmentManager: {
    getConfig: jest.fn().mockReturnValue({
      environment: 'test',
      region: 'us-east-1',
      logLevel: 'debug',
      cors: {
        origin: 'http://localhost:4000',
        credentials: true
      },
      cognito: {
        userPoolId: 'us-east-1_test123',
        clientId: 'test-client-id'
      },
      tables: {
        timers: 'test-timers-table',
        userConnections: 'test-user-connections-table',
        sharedTimers: 'test-shared-timers-table'
      },
      websocket: {
        endpoint: 'https://test.execute-api.us-east-1.amazonaws.com/prod/'
      }
    }),
    getEnvironment: jest.fn().mockReturnValue('test'),
    isDevelopment: jest.fn().mockReturnValue(false),
    isStaging: jest.fn().mockReturnValue(false),
    isProduction: jest.fn().mockReturnValue(false)
  }
}));

// Mock the Monitoring module
jest.mock('./lib/monitoring', () => ({
  MonitoringLogger: jest.fn().mockImplementation(() => ({
    child: jest.fn().mockReturnThis(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    metric: jest.fn()
  })),
  PerformanceMonitor: {
    trackDatabaseOperation: jest.fn().mockImplementation((operation, table, fn) => {
      // Just call the function directly without any wrapper
      return fn();
    }),
    trackExecution: jest.fn().mockImplementation((name, fn) => {
      return fn();
    }),
    createTimer: jest.fn().mockReturnValue({
      stop: jest.fn().mockReturnValue(100)
    })
  },
  Monitoring: {
    timer: jest.fn().mockReturnValue({
      stop: jest.fn().mockReturnValue(100)
    }),
    time: jest.fn().mockImplementation(async (name, fn) => await fn()),
    apiRequest: jest.fn(),
    error: jest.fn(),
    timerOperation: jest.fn(),
    businessMetric: jest.fn(),
    websocketEvent: jest.fn()
  }
}));

// Mock console methods to avoid cluttering test output
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};
