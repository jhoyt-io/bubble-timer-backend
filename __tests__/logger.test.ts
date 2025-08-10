/**
 * Logger System Tests
 * 
 * Tests for the structured logging system and its testability features.
 */

import { ConsoleLogger, LogLevel, setLogger, getLogger, createContextLogger, log, createWebSocketLogger, createTimerLogger, createDatabaseLogger, createApiLogger } from '../lib/core/logger';
import { TestLogger } from '../lib/core/test-logger';

describe('Logger System', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Reset to default logger
    setLogger(new ConsoleLogger());
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('ConsoleLogger', () => {
    describe('Given environment variables are set', () => {
      describe('When LOG_LEVEL is set to DEBUG', () => {
        test('Then the logger should use DEBUG level', () => {
          process.env.LOG_LEVEL = 'DEBUG';
          const logger = new ConsoleLogger();
          expect(logger.getLevel()).toBe(LogLevel.DEBUG);
        });
      });

      describe('When LOG_LEVEL is set to error (case insensitive)', () => {
        test('Then the logger should use ERROR level', () => {
          process.env.LOG_LEVEL = 'error';
          const logger = new ConsoleLogger();
          expect(logger.getLevel()).toBe(LogLevel.ERROR);
        });
      });

      describe('When LOG_LEVEL is set to an invalid value', () => {
        test('Then the logger should use default INFO level', () => {
          process.env.LOG_LEVEL = 'INVALID_LEVEL';
          const logger = new ConsoleLogger();
          expect(logger.getLevel()).toBe(LogLevel.INFO);
        });
      });

      describe('When no LOG_LEVEL environment variable is set', () => {
        test('Then the logger should use default INFO level', () => {
          delete process.env.LOG_LEVEL;
          const logger = new ConsoleLogger();
          expect(logger.getLevel()).toBe(LogLevel.INFO);
        });
      });

      describe('When both environment variable and constructor parameter are provided', () => {
        test('Then the constructor parameter should take precedence', () => {
          process.env.LOG_LEVEL = 'DEBUG';
          const logger = new ConsoleLogger(LogLevel.ERROR);
          expect(logger.getLevel()).toBe(LogLevel.ERROR);
        });
      });
    });

    describe('Given log level filtering is enabled', () => {
      let logger: ConsoleLogger;
      let consoleSpy: jest.SpyInstance;

      beforeEach(() => {
        logger = new ConsoleLogger(LogLevel.WARN);
        consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      });

      afterEach(() => {
        consoleSpy.mockRestore();
      });

      describe('When logging a debug message with WARN level', () => {
        test('Then the message should not be logged', () => {
          logger.debug('Debug message');
          expect(consoleSpy).not.toHaveBeenCalled();
        });
      });

      describe('When logging an info message with WARN level', () => {
        test('Then the message should not be logged', () => {
          logger.info('Info message');
          expect(consoleSpy).not.toHaveBeenCalled();
        });
      });

      describe('When logging a warn message with WARN level', () => {
        test('Then the message should be logged', () => {
          logger.warn('Warning message');
          expect(consoleSpy).toHaveBeenCalled();
        });
      });

      describe('When logging an error message with WARN level', () => {
        test('Then the message should be logged', () => {
          logger.error('Error message');
          expect(consoleSpy).toHaveBeenCalled();
        });
      });

      describe('When log level is set to NONE', () => {
        test('Then no messages should be logged', () => {
          logger.setLevel(LogLevel.NONE);
          logger.error('Error message');
          expect(consoleSpy).not.toHaveBeenCalled();
        });
      });
    });

    describe('Given AWS Lambda context is available', () => {
      let logger: ConsoleLogger;
      let consoleSpy: jest.SpyInstance;

      beforeEach(() => {
        logger = new ConsoleLogger();
        consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      });

      afterEach(() => {
        consoleSpy.mockRestore();
        delete process.env.AWS_LAMBDA_FUNCTION_NAME;
        delete process.env.AWS_LAMBDA_REQUEST_ID;
      });

      describe('When AWS Lambda function name is set', () => {
        test('Then the log should include function name', () => {
          process.env.AWS_LAMBDA_FUNCTION_NAME = 'test-function';
          logger.info('Test message');
          
          const logCall = consoleSpy.mock.calls[0][0];
          const logData = JSON.parse(logCall);
          expect(logData.functionName).toBe('test-function');
        });
      });

      describe('When AWS Lambda request ID is set', () => {
        test('Then the log should include request ID', () => {
          process.env.AWS_LAMBDA_FUNCTION_NAME = 'test-function';
          process.env.AWS_LAMBDA_REQUEST_ID = 'test-request-id';
          logger.info('Test message');
          
          const logCall = consoleSpy.mock.calls[0][0];
          const logData = JSON.parse(logCall);
          expect(logData.requestId).toBe('test-request-id');
        });
      });

      describe('When AWS Lambda context is not available', () => {
        test('Then the log should not include function name or request ID', () => {
          logger.info('Test message');
          
          const logCall = consoleSpy.mock.calls[0][0];
          const logData = JSON.parse(logCall);
          expect(logData.functionName).toBeUndefined();
          expect(logData.requestId).toBeUndefined();
        });
      });
    });
  });

  describe('TestLogger', () => {
    let testLogger: TestLogger;

    beforeEach(() => {
      testLogger = new TestLogger();
    });

    describe('Given log entries are added', () => {
      beforeEach(() => {
        testLogger.info('Info message', { context: 'test' });
        testLogger.warn('Warning message', { context: 'test' });
        testLogger.error('Error message', { context: 'test' });
      });

      describe('When filtering by message content', () => {
        describe('When using string filter', () => {
          test('Then matching entries should be returned', () => {
            const entries = testLogger.getEntriesByMessage('Info');
            expect(entries).toHaveLength(1);
            expect(entries[0].message).toBe('Info message');
          });
        });

        describe('When using regex filter', () => {
          test('Then matching entries should be returned', () => {
            const entries = testLogger.getEntriesByMessage(/Warning|Error/);
            expect(entries).toHaveLength(2);
          });
        });
      });

      describe('When filtering by context', () => {
        test('Then entries with matching context should be returned', () => {
          const entries = testLogger.getEntriesByContext({ context: 'test' });
          expect(entries).toHaveLength(3);
        });
      });

      describe('When checking for message existence', () => {
        test('Then hasMessage should return true for existing messages', () => {
          expect(testLogger.hasMessage('Info message')).toBe(true);
          expect(testLogger.hasMessage('Non-existent')).toBe(false);
        });

        test('Then hasMessageAtLevel should return true for matching messages', () => {
          expect(testLogger.hasMessageAtLevel('Info message', LogLevel.INFO)).toBe(true);
          expect(testLogger.hasMessageAtLevel('Info message', LogLevel.ERROR)).toBe(false);
        });
      });

      describe('When getting the last entry', () => {
        test('Then the most recent entry should be returned', () => {
          const lastEntry = testLogger.getLastEntry();
          expect(lastEntry?.message).toBe('Error message');
          expect(lastEntry?.level).toBe(LogLevel.ERROR);
        });
      });

      describe('When clearing entries', () => {
        test('Then all entries should be removed', () => {
          testLogger.clear();
          expect(testLogger.getEntryCount()).toBe(0);
        });
      });

      describe('When getting entry count', () => {
        test('Then the correct count should be returned', () => {
          expect(testLogger.getEntryCount()).toBe(3);
        });
      });

      describe('When getting entries by level', () => {
        test('Then level-specific methods should return correct entries', () => {
          expect(testLogger.getInfoEntries()).toHaveLength(1);
          expect(testLogger.getWarnEntries()).toHaveLength(1);
          expect(testLogger.getErrorEntries()).toHaveLength(1);
          expect(testLogger.getDebugEntries()).toHaveLength(0);
        });
      });
    });

    describe('Given log level filtering is enabled', () => {
      beforeEach(() => {
        testLogger.setLevel(LogLevel.WARN);
      });

      describe('When logging messages below the set level', () => {
        test('Then debug and info messages should be filtered out', () => {
          testLogger.debug('Debug message');
          testLogger.info('Info message');
          testLogger.warn('Warning message');
          testLogger.error('Error message');

          expect(testLogger.getDebugEntries()).toHaveLength(0);
          expect(testLogger.getInfoEntries()).toHaveLength(0);
          expect(testLogger.getWarnEntries()).toHaveLength(1);
          expect(testLogger.getErrorEntries()).toHaveLength(1);
        });
      });
    });
  });

  describe('Global Logger Functions', () => {
    let testLogger: TestLogger;

    beforeEach(() => {
      testLogger = new TestLogger();
      setLogger(testLogger);
    });

    describe('Given the global logger is set', () => {
      describe('When using log function', () => {
        test('Then messages should be logged through the global logger', () => {
          log.info('Test message', { context: 'test' });
          
          expect(testLogger.hasMessage('Test message')).toBe(true);
          expect(testLogger.getLastEntry()?.level).toBe(LogLevel.INFO);
        });
      });

      describe('When using getLogger function', () => {
        test('Then the current global logger should be returned', () => {
          const logger = getLogger();
          expect(logger).toBe(testLogger);
        });
      });
    });
  });

  describe('Context Logger Creation', () => {
    let testLogger: TestLogger;

    beforeEach(() => {
      testLogger = new TestLogger();
      setLogger(testLogger);
    });

    describe('Given context loggers are created', () => {
      describe('When creating a WebSocket logger', () => {
        test('Then it should include WebSocket context', () => {
          const wsLogger = createWebSocketLogger('test-conn');
          wsLogger.info('WebSocket message');
          
          const entry = testLogger.getLastEntry();
          expect(entry?.context?.operation).toBe('websocket');
          expect(entry?.context?.connectionId).toBe('test-conn');
        });
      });

      describe('When creating a timer logger', () => {
        test('Then it should include timer context', () => {
          const timerLogger = createTimerLogger('test-timer');
          timerLogger.info('Timer update');
          
          const entry = testLogger.getLastEntry();
          expect(entry?.context?.operation).toBe('timer');
          expect(entry?.context?.timerId).toBe('test-timer');
        });
      });

      describe('When creating a database logger', () => {
        test('Then it should include database context', () => {
          const dbLogger = createDatabaseLogger('getTimer');
          dbLogger.info('Database operation');
          
          const entry = testLogger.getLastEntry();
          expect(entry?.context?.operation).toBe('database');
          expect(entry?.context?.databaseOperation).toBe('getTimer');
        });
      });

      describe('When creating an API logger', () => {
        test('Then it should include API context', () => {
          const apiLogger = createApiLogger('POST', 'test-user');
          apiLogger.info('API request');
          
          const entry = testLogger.getLastEntry();
          expect(entry?.context?.operation).toBe('api');
          expect(entry?.context?.apiOperation).toBe('POST');
          expect(entry?.context?.userId).toBe('test-user');
        });
      });

      describe('When creating a custom context logger', () => {
        test('Then it should include custom context', () => {
          const customLogger = createContextLogger({ operation: 'custom', userId: 'test-user' });
          customLogger.info('Custom operation');
          
          const entry = testLogger.getLastEntry();
          expect(entry?.context?.operation).toBe('custom');
          expect(entry?.context?.userId).toBe('test-user');
        });
      });
    });
  });
});
