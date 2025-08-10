/**
 * Structured Logging System for Bubble Timer Backend
 * 
 * This module provides a configurable, testable logging system that replaces
 * direct console.log calls with structured logging that can be easily tested
 * and controlled in different environments.
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

export interface LogContext {
  userId?: string;
  deviceId?: string;
  connectionId?: string;
  timerId?: string;
  operation?: string;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  data?: any;
}

export interface Logger {
  debug(message: string, context?: LogContext, data?: any): void;
  info(message: string, context?: LogContext, data?: any): void;
  warn(message: string, context?: LogContext, data?: any): void;
  error(message: string, context?: LogContext, data?: any): void;
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
}

export class ConsoleLogger implements Logger {
  private level: LogLevel = LogLevel.INFO;

  constructor(initialLevel?: LogLevel) {
    if (initialLevel !== undefined) {
      this.level = initialLevel;
    } else {
      // Set default level based on environment
      const envLevel = process.env.LOG_LEVEL?.toUpperCase();
      if (envLevel && envLevel in LogLevel) {
        this.level = LogLevel[envLevel as keyof typeof LogLevel];
      }
    }
  }

  debug(message: string, context?: LogContext, data?: any): void {
    this.log(LogLevel.DEBUG, message, context, data);
  }

  info(message: string, context?: LogContext, data?: any): void {
    this.log(LogLevel.INFO, message, context, data);
  }

  warn(message: string, context?: LogContext, data?: any): void {
    this.log(LogLevel.WARN, message, context, data);
  }

  error(message: string, context?: LogContext, data?: any): void {
    this.log(LogLevel.ERROR, message, context, data);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  private log(level: LogLevel, message: string, context?: LogContext, data?: any): void {
    if (level < this.level) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      data
    };

    // Structured JSON logging for better parsing and analysis
    const logObject = {
      timestamp: entry.timestamp,
      level: LogLevel[level],
      message: entry.message,
      ...(context && { context }),
      ...(data && { data }),
      // Add AWS Lambda specific context
      ...(process.env.AWS_LAMBDA_FUNCTION_NAME && { 
        functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
        requestId: process.env.AWS_LAMBDA_REQUEST_ID 
      })
    };

    // Use JSON.stringify for structured logging, but keep console.log for CloudWatch compatibility
    console.log(JSON.stringify(logObject));
  }
}

// Global logger instance
let globalLogger: Logger = new ConsoleLogger();

/**
 * Get the global logger instance
 */
export function getLogger(): Logger {
  return globalLogger;
}

/**
 * Set the global logger instance (useful for testing)
 */
export function setLogger(logger: Logger): void {
  globalLogger = logger;
}

/**
 * Create a logger with context that will be included in all log entries
 */
export function createContextLogger(context: LogContext): Logger {
  const baseLogger = getLogger();
  
  return {
    debug: (message: string, additionalContext?: LogContext, data?: any) => 
      baseLogger.debug(message, { ...context, ...additionalContext }, data),
    info: (message: string, additionalContext?: LogContext, data?: any) => 
      baseLogger.info(message, { ...context, ...additionalContext }, data),
    warn: (message: string, additionalContext?: LogContext, data?: any) => 
      baseLogger.warn(message, { ...context, ...additionalContext }, data),
    error: (message: string, additionalContext?: LogContext, data?: any) => 
      baseLogger.error(message, { ...context, ...additionalContext }, data),
    setLevel: (level: LogLevel) => baseLogger.setLevel(level),
    getLevel: () => baseLogger.getLevel()
  };
}

/**
 * Convenience functions for common logging patterns
 */
export const log = {
  debug: (message: string, context?: LogContext, data?: any) => 
    getLogger().debug(message, context, data),
  info: (message: string, context?: LogContext, data?: any) => 
    getLogger().info(message, context, data),
  warn: (message: string, context?: LogContext, data?: any) => 
    getLogger().warn(message, context, data),
  error: (message: string, context?: LogContext, data?: any) => 
    getLogger().error(message, context, data)
};

/**
 * Create a logger for WebSocket operations
 */
export function createWebSocketLogger(connectionId?: string, userId?: string, deviceId?: string) {
  return createContextLogger({
    operation: 'websocket',
    connectionId,
    userId,
    deviceId
  });
}

/**
 * Create a logger for timer operations
 */
export function createTimerLogger(timerId?: string, userId?: string) {
  return createContextLogger({
    operation: 'timer',
    timerId,
    userId
  });
}

/**
 * Create a logger for DynamoDB operations
 */
export function createDatabaseLogger(operation?: string) {
  return createContextLogger({
    operation: 'database',
    databaseOperation: operation
  });
}

/**
 * Create a logger for API operations
 */
export function createApiLogger(operation?: string, userId?: string) {
  return createContextLogger({
    operation: 'api',
    apiOperation: operation,
    userId
  });
}
