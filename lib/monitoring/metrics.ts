// Temporarily disabled due to TypeScript compatibility issues
// import { CloudWatchClient, PutMetricDataCommand, MetricDatum, Dimension } from '@aws-sdk/client-cloudwatch';
import { EnvironmentManager } from '../config/environment';
import { MonitoringLogger } from './logger';

/**
 * CloudWatch metrics manager
 */
export class MetricsManager {
    private static client: any | null = null;
    private static logger = new MonitoringLogger('MetricsManager');
    private static readonly NAMESPACE = 'BubbleTimer';

    /**
     * Gets a configured CloudWatch client (temporarily disabled)
     */
    private static getClient(): any {
        // Temporarily disabled due to TypeScript compatibility issues
        if (!this.client) {
            this.logger.warn('CloudWatch client temporarily disabled due to SDK compatibility issues');
        }
        return null;
    }

    /**
     * Publishes a single metric to CloudWatch
     */
    static async publishMetric(
        metricName: string,
        value: number,
        unit: 'Count' | 'Milliseconds' | 'Bytes' | 'Percent' = 'Count',
        dimensions: Record<string, string> = {}
    ): Promise<void> {
        try {
            // Temporarily disabled - just log the metric
            this.logger.debug(`CloudWatch metric (temporarily disabled): ${metricName}`, { 
                value, 
                unit, 
                dimensions,
                namespace: this.NAMESPACE
            });
        } catch (error) {
            this.logger.error(`Failed to publish metric: ${metricName}`, error);
            // Don't throw - metrics failures shouldn't break the application
        }
    }

    /**
     * Publishes multiple metrics in a batch
     */
    static async publishMetrics(metrics: Array<{
        name: string;
        value: number;
        unit?: 'Count' | 'Milliseconds' | 'Bytes' | 'Percent';
        dimensions?: Record<string, string>;
    }>): Promise<void> {
        try {
            // Temporarily disabled - just log the metrics
            this.logger.debug(`CloudWatch metrics batch (temporarily disabled):`, {
                metricsCount: metrics.length,
                namespace: this.NAMESPACE,
                metrics: metrics.map(m => ({
                    name: m.name,
                    value: m.value,
                    unit: m.unit,
                    dimensions: m.dimensions
                }))
            });
        } catch (error) {
            this.logger.error('Failed to publish metric batch', error);
        }
    }

    /**
     * Records an API request metric
     */
    static async recordApiRequest(
        method: string,
        endpoint: string,
        statusCode: number,
        duration: number,
        userId?: string
    ): Promise<void> {
        const isSuccess = statusCode >= 200 && statusCode < 400;
        const environment = EnvironmentManager.getEnvironment();

        const metrics: Array<{
            name: string;
            value: number;
            unit: 'Count' | 'Milliseconds' | 'Bytes' | 'Percent';
            dimensions: Record<string, string>;
        }> = [
            {
                name: 'APIRequests',
                value: 1,
                unit: 'Count',
                dimensions: {
                    Environment: environment,
                    Method: method,
                    Endpoint: endpoint,
                    StatusCode: statusCode.toString(),
                    Success: isSuccess.toString()
                }
            },
            {
                name: 'APILatency',
                value: duration,
                unit: 'Milliseconds',
                dimensions: {
                    Environment: environment,
                    Method: method,
                    Endpoint: endpoint
                }
            }
        ];

        // Add user-specific metrics if userId is provided
        if (userId) {
            metrics.push({
                name: 'UserAPIRequests',
                value: 1,
                unit: 'Count',
                dimensions: {
                    Environment: environment,
                    UserId: userId,
                    Method: method,
                    Success: isSuccess.toString()
                }
            });
        }

        await this.publishMetrics(metrics);
    }

    /**
     * Records a WebSocket connection metric
     */
    static async recordWebSocketConnection(
        event: 'connect' | 'disconnect' | 'message' | 'error',
        userId?: string,
        duration?: number
    ): Promise<void> {
        const environment = EnvironmentManager.getEnvironment();
        
        const metrics: Array<{
            name: string;
            value: number;
            unit: 'Count' | 'Milliseconds' | 'Bytes' | 'Percent';
            dimensions: Record<string, string>;
        }> = [
            {
                name: 'WebSocketEvents',
                value: 1,
                unit: 'Count',
                dimensions: {
                    Environment: environment,
                    Event: event
                }
            }
        ];

        if (duration !== undefined) {
            metrics.push({
                name: 'WebSocketDuration',
                value: duration,
                unit: 'Milliseconds',
                dimensions: {
                    Environment: environment,
                    Event: event
                }
            });
        }

        if (userId) {
            metrics.push({
                name: 'UserWebSocketEvents',
                value: 1,
                unit: 'Count',
                dimensions: {
                    Environment: environment,
                    UserId: userId,
                    Event: event
                }
            });
        }

        await this.publishMetrics(metrics);
    }

    /**
     * Records a database operation metric
     */
    static async recordDatabaseOperation(
        operation: 'get' | 'put' | 'delete' | 'query' | 'scan',
        tableName: string,
        success: boolean,
        duration: number,
        itemCount?: number
    ): Promise<void> {
        const environment = EnvironmentManager.getEnvironment();
        
        const metrics: Array<{
            name: string;
            value: number;
            unit: 'Count' | 'Milliseconds' | 'Bytes' | 'Percent';
            dimensions: Record<string, string>;
        }> = [
            {
                name: 'DatabaseOperations',
                value: 1,
                unit: 'Count',
                dimensions: {
                    Environment: environment,
                    Operation: operation,
                    Table: tableName,
                    Success: success.toString()
                }
            },
            {
                name: 'DatabaseLatency',
                value: duration,
                unit: 'Milliseconds',
                dimensions: {
                    Environment: environment,
                    Operation: operation,
                    Table: tableName
                }
            }
        ];

        if (itemCount !== undefined) {
            metrics.push({
                name: 'DatabaseItemCount',
                value: itemCount,
                unit: 'Count',
                dimensions: {
                    Environment: environment,
                    Operation: operation,
                    Table: tableName,
                    Success: success.toString()
                }
            });
        }

        await this.publishMetrics(metrics);
    }

    /**
     * Records a timer operation metric
     */
    static async recordTimerOperation(
        operation: 'create' | 'update' | 'delete' | 'share' | 'stop',
        success: boolean,
        duration: number,
        userId?: string
    ): Promise<void> {
        const environment = EnvironmentManager.getEnvironment();
        
        const metrics: Array<{
            name: string;
            value: number;
            unit: 'Count' | 'Milliseconds' | 'Bytes' | 'Percent';
            dimensions: Record<string, string>;
        }> = [
            {
                name: 'TimerOperations',
                value: 1,
                unit: 'Count',
                dimensions: {
                    Environment: environment,
                    Operation: operation,
                    Success: success.toString()
                }
            },
            {
                name: 'TimerOperationLatency',
                value: duration,
                unit: 'Milliseconds',
                dimensions: {
                    Environment: environment,
                    Operation: operation
                }
            }
        ];

        if (userId) {
            metrics.push({
                name: 'UserTimerOperations',
                value: 1,
                unit: 'Count',
                dimensions: {
                    Environment: environment,
                    UserId: userId,
                    Operation: operation,
                    Success: success.toString()
                }
            });
        }

        await this.publishMetrics(metrics);
    }

    /**
     * Records application errors
     */
    static async recordError(
        errorType: string,
        context: string,
        severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
    ): Promise<void> {
        const environment = EnvironmentManager.getEnvironment();
        
        await this.publishMetric('ApplicationErrors', 1, 'Count', {
            Environment: environment,
            ErrorType: errorType,
            Context: context,
            Severity: severity
        });
    }

    /**
     * Records business metrics
     */
    static async recordBusinessMetric(
        metricName: string,
        value: number,
        dimensions: Record<string, string> = {}
    ): Promise<void> {
        const environment = EnvironmentManager.getEnvironment();
        
        await this.publishMetric(metricName, value, 'Count', {
            Environment: environment,
            ...dimensions
        });
    }

    /**
     * Utility function to chunk arrays
     */
    private static chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Resets the client (useful for testing)
     */
    static resetClient(): void {
        if (this.client) {
            this.client.destroy();
            this.client = null;
        }
    }
}
