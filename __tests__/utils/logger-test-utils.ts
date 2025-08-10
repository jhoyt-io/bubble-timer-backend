/**
 * Logger Testing Utilities
 * 
 * This module provides utilities for testing logging behavior
 * and setting up test loggers in unit and integration tests.
 */

import { TestLogger } from '../../lib/core/test-logger';
import { setLogger, LogLevel } from '../../lib/core/logger';

/**
 * Setup a test logger for a test suite
 */
export function setupTestLogger(): TestLogger {
  const testLogger = new TestLogger();
  setLogger(testLogger);
  return testLogger;
}

/**
 * Setup a test logger with a specific log level
 */
export function setupTestLoggerWithLevel(level: LogLevel): TestLogger {
  const testLogger = new TestLogger();
  testLogger.setLevel(level);
  setLogger(testLogger);
  return testLogger;
}

/**
 * Clean up test logger after a test
 */
export function cleanupTestLogger(): void {
  // Reset to default console logger
  const { ConsoleLogger } = require('../../lib/core/logger');
  setLogger(new ConsoleLogger());
}

/**
 * Assert that a specific message was logged
 */
export function expectLogMessage(
  testLogger: TestLogger,
  message: string | RegExp,
  level?: LogLevel
): void {
  if (level !== undefined) {
    expect(testLogger.hasMessageAtLevel(message, level)).toBe(true);
  } else {
    expect(testLogger.hasMessage(message)).toBe(true);
  }
}

/**
 * Assert that a specific message was NOT logged
 */
export function expectNoLogMessage(
  testLogger: TestLogger,
  message: string | RegExp,
  level?: LogLevel
): void {
  if (level !== undefined) {
    expect(testLogger.hasMessageAtLevel(message, level)).toBe(false);
  } else {
    expect(testLogger.hasMessage(message)).toBe(false);
  }
}

/**
 * Assert that a specific number of log entries were created
 */
export function expectLogEntryCount(testLogger: TestLogger, count: number): void {
  expect(testLogger.getEntryCount()).toBe(count);
}

/**
 * Assert that a specific number of log entries were created at a specific level
 */
export function expectLogEntryCountAtLevel(
  testLogger: TestLogger,
  level: LogLevel,
  count: number
): void {
  expect(testLogger.getEntriesByLevel(level).length).toBe(count);
}

/**
 * Assert that the last log entry contains specific content
 */
export function expectLastLogEntry(
  testLogger: TestLogger,
  expectedMessage?: string | RegExp,
  expectedLevel?: LogLevel,
  expectedContext?: any
): void {
  const lastEntry = testLogger.getLastEntry();
  expect(lastEntry).toBeDefined();

  if (expectedMessage) {
    if (typeof expectedMessage === 'string') {
      expect(lastEntry!.message).toContain(expectedMessage);
    } else {
      expect(lastEntry!.message).toMatch(expectedMessage);
    }
  }

  if (expectedLevel) {
    expect(lastEntry!.level).toBe(expectedLevel);
  }

  if (expectedContext) {
    expect(lastEntry!.context).toMatchObject(expectedContext);
  }
}

/**
 * Assert that log entries contain specific context
 */
export function expectLogEntriesWithContext(
  testLogger: TestLogger,
  contextFilter: any,
  count?: number
): void {
  const entries = testLogger.getEntriesByContext(contextFilter);
  
  if (count !== undefined) {
    expect(entries.length).toBe(count);
  } else {
    expect(entries.length).toBeGreaterThan(0);
  }
}

/**
 * Setup Jest matchers for logging assertions
 */
export function setupLogMatchers(): void {
  expect.extend({
    toHaveLoggedMessage: function(
      this: any,
      received: TestLogger, 
      message: string | RegExp, 
      level?: LogLevel
    ) {
      const pass = level !== undefined 
        ? received.hasMessageAtLevel(message, level)
        : received.hasMessage(message);
      
      return {
        pass,
        message: () => 
          `Expected ${pass ? 'not ' : ''}to have logged message "${message}"${level ? ` at level ${LogLevel[level]}` : ''}`
      };
    },

    toHaveLoggedEntryCount: function(
      this: any,
      received: TestLogger, 
      count: number
    ) {
      const actualCount = received.getEntryCount();
      const pass = actualCount === count;
      
      return {
        pass,
        message: () => 
          `Expected ${count} log entries, but got ${actualCount}`
      };
    },

    toHaveLoggedEntryCountAtLevel: function(
      this: any,
      received: TestLogger, 
      level: LogLevel, 
      count: number
    ) {
      const actualCount = received.getEntriesByLevel(level).length;
      const pass = actualCount === count;
      
      return {
        pass,
        message: () => 
          `Expected ${count} log entries at level ${LogLevel[level]}, but got ${actualCount}`
      };
    }
  });
}

// Extend Jest types for the custom matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveLoggedMessage(message: string | RegExp, level?: LogLevel): R;
      toHaveLoggedEntryCount(count: number): R;
      toHaveLoggedEntryCountAtLevel(level: LogLevel, count: number): R;
    }
  }
}
