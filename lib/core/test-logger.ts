/**
 * Test Logger Implementation
 * 
 * This module provides a testable logger that captures log entries
 * for verification in unit and integration tests.
 */

import { Logger, LogLevel, LogEntry, LogContext } from './logger';

export class TestLogger implements Logger {
  private entries: LogEntry[] = [];
  private level: LogLevel = LogLevel.DEBUG;

  debug(message: string, context?: LogContext, data?: any): void {
    this.addEntry(LogLevel.DEBUG, message, context, data);
  }

  info(message: string, context?: LogContext, data?: any): void {
    this.addEntry(LogLevel.INFO, message, context, data);
  }

  warn(message: string, context?: LogContext, data?: any): void {
    this.addEntry(LogLevel.WARN, message, context, data);
  }

  error(message: string, context?: LogContext, data?: any): void {
    this.addEntry(LogLevel.ERROR, message, context, data);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  private addEntry(level: LogLevel, message: string, context?: LogContext, data?: any): void {
    if (level < this.level) {
      return;
    }

    this.entries.push({
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      data
    });
  }

  /**
   * Get all log entries
   */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /**
   * Get log entries filtered by level
   */
  getEntriesByLevel(level: LogLevel): LogEntry[] {
    return this.entries.filter(entry => entry.level === level);
  }

  /**
   * Get log entries filtered by message content
   */
  getEntriesByMessage(message: string | RegExp): LogEntry[] {
    return this.entries.filter(entry => {
      if (typeof message === 'string') {
        return entry.message.includes(message);
      }
      if (message instanceof RegExp) {
        return message.test(entry.message);
      }
      return false;
    });
  }

  /**
   * Get log entries filtered by context
   */
  getEntriesByContext(contextFilter: Partial<LogContext>): LogEntry[] {
    return this.entries.filter(entry => {
      if (!entry.context) return false;
      
      return Object.entries(contextFilter).every(([key, value]) => {
        return entry.context![key] === value;
      });
    });
  }

  /**
   * Clear all log entries
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Get the count of log entries
   */
  getEntryCount(): number {
    return this.entries.length;
  }

  /**
   * Check if a specific message was logged
   */
  hasMessage(message: string | RegExp): boolean {
    return this.getEntriesByMessage(message).length > 0;
  }

  /**
   * Check if a specific message was logged at a specific level
   */
  hasMessageAtLevel(message: string | RegExp, level: LogLevel): boolean {
    return this.getEntriesByMessage(message).some(entry => entry.level === level);
  }

  /**
   * Get the last log entry
   */
  getLastEntry(): LogEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  /**
   * Get debug entries
   */
  getDebugEntries(): LogEntry[] {
    return this.getEntriesByLevel(LogLevel.DEBUG);
  }

  /**
   * Get info entries
   */
  getInfoEntries(): LogEntry[] {
    return this.getEntriesByLevel(LogLevel.INFO);
  }

  /**
   * Get warning entries
   */
  getWarnEntries(): LogEntry[] {
    return this.getEntriesByLevel(LogLevel.WARN);
  }

  /**
   * Get error entries
   */
  getErrorEntries(): LogEntry[] {
    return this.getEntriesByLevel(LogLevel.ERROR);
  }
}
