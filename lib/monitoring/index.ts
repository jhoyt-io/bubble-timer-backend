/**
 * Monitoring module exports
 */
export { MonitoringLogger, Timer, defaultLogger, type LogMetadata, type MetricData } from './logger';
export { MetricsManager } from './metrics';
export { HealthMonitor, type HealthCheck, type HealthStatus } from './health';
export { PerformanceMonitor, PerformanceTimer, type PerformanceTrend } from './performance';

// Import for internal use
import { MonitoringLogger } from './logger';
import { MetricsManager } from './metrics';
import { HealthMonitor } from './health';
import { PerformanceMonitor } from './performance';

/**
 * Convenience monitoring facade
 */
export class Monitoring {
    /**
     * Creates a logger with context
     */
    static logger(context: string) {
        return new MonitoringLogger(context);
    }

    /**
     * Records a metric
     */
    static async metric(
        name: string,
        value: number,
        unit: 'Count' | 'Milliseconds' | 'Bytes' | 'Percent' = 'Count',
        dimensions: Record<string, string> = {}
    ) {
        return MetricsManager.publishMetric(name, value, unit, dimensions);
    }

    /**
     * Records multiple metrics
     */
    static async metrics(metrics: Array<{
        name: string;
        value: number;
        unit?: 'Count' | 'Milliseconds' | 'Bytes' | 'Percent';
        dimensions?: Record<string, string>;
    }>) {
        return MetricsManager.publishMetrics(metrics);
    }

    /**
     * Performs health check
     */
    static async health() {
        return HealthMonitor.performHealthCheck();
    }

    /**
     * Times an operation
     */
    static async time<T>(
        operationName: string,
        operation: () => Promise<T>,
        metadata?: Record<string, any>
    ): Promise<T> {
        return PerformanceMonitor.trackExecution(operationName, operation, metadata);
    }

    /**
     * Creates a performance timer
     */
    static timer(operationName: string) {
        return PerformanceMonitor.createTimer(operationName);
    }

    /**
     * Records an error
     */
    static async error(
        errorType: string,
        context: string,
        severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
    ) {
        return MetricsManager.recordError(errorType, context, severity);
    }

    /**
     * Records API request metrics
     */
    static async apiRequest(
        method: string,
        endpoint: string,
        statusCode: number,
        duration: number,
        userId?: string
    ) {
        return MetricsManager.recordApiRequest(method, endpoint, statusCode, duration, userId);
    }

    /**
     * Records WebSocket event metrics
     */
    static async websocketEvent(
        event: 'connect' | 'disconnect' | 'message' | 'error',
        userId?: string,
        duration?: number
    ) {
        return MetricsManager.recordWebSocketConnection(event, userId, duration);
    }

    /**
     * Records database operation metrics
     */
    static async databaseOperation(
        operation: 'get' | 'put' | 'delete' | 'query' | 'scan',
        tableName: string,
        success: boolean,
        duration: number,
        itemCount?: number
    ) {
        return MetricsManager.recordDatabaseOperation(operation, tableName, success, duration, itemCount);
    }

    /**
     * Records timer operation metrics
     */
    static async timerOperation(
        operation: 'create' | 'update' | 'delete' | 'share' | 'stop',
        success: boolean,
        duration: number,
        userId?: string
    ) {
        return MetricsManager.recordTimerOperation(operation, success, duration, userId);
    }

    /**
     * Records business metrics
     */
    static async businessMetric(
        metricName: string,
        value: number,
        dimensions: Record<string, string> = {}
    ) {
        return MetricsManager.recordBusinessMetric(metricName, value, dimensions);
    }
}
