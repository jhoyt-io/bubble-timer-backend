import { MonitoringLogger } from './logger';
import { MetricsManager } from './metrics';

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
    private static logger = new MonitoringLogger('PerformanceMonitor');

    /**
     * Tracks cold start performance
     */
    static trackColdStart(startTime: number): void {
        const coldStartDuration = Date.now() - startTime;
        
        this.logger.info('Cold start detected', { duration: coldStartDuration });
        
        // Record cold start metric
        MetricsManager.publishMetric(
            'ColdStartDuration',
            coldStartDuration,
            'Milliseconds',
            {
                FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'Unknown'
            }
        );
    }

    /**
     * Tracks function execution time
     */
    static async trackExecution<T>(
        operationName: string,
        operation: () => Promise<T>,
        metadata?: Record<string, any>
    ): Promise<T> {
        const startTime = Date.now();
        let success = true;
        let error: any;

        try {
            const result = await operation();
            return result;
        } catch (err) {
            success = false;
            error = err;
            throw err;
        } finally {
            const duration = Date.now() - startTime;
            
            this.logger.metric(operationName, duration, {
                success,
                error: error?.message,
                ...metadata
            });

            // Record execution metrics
            await MetricsManager.publishMetrics([
                {
                    name: 'OperationDuration',
                    value: duration,
                    unit: 'Milliseconds',
                    dimensions: {
                        Operation: operationName,
                        Success: success.toString(),
                        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'Unknown'
                    }
                },
                {
                    name: 'OperationCount',
                    value: 1,
                    unit: 'Count',
                    dimensions: {
                        Operation: operationName,
                        Success: success.toString(),
                        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'Unknown'
                    }
                }
            ]);
        }
    }

    /**
     * Tracks memory usage during operation
     */
    static async trackMemoryUsage<T>(
        operationName: string,
        operation: () => Promise<T>
    ): Promise<T> {
        const initialMemory = process.memoryUsage();
        
        try {
            const result = await operation();
            return result;
        } finally {
            const finalMemory = process.memoryUsage();
            const memoryDelta = finalMemory.heapUsed - initialMemory.heapUsed;
            
            this.logger.debug(`Memory usage for ${operationName}`, {
                initialHeapMB: Math.round(initialMemory.heapUsed / 1024 / 1024),
                finalHeapMB: Math.round(finalMemory.heapUsed / 1024 / 1024),
                deltaMB: Math.round(memoryDelta / 1024 / 1024)
            });

            // Record memory metrics
            await MetricsManager.publishMetric(
                'MemoryUsageDelta',
                Math.abs(memoryDelta),
                'Bytes',
                {
                    Operation: operationName,
                    MemoryDirection: memoryDelta > 0 ? 'increase' : 'decrease'
                }
            );
        }
    }

    /**
     * Tracks database operation performance
     */
    static async trackDatabaseOperation<T>(
        operation: string,
        tableName: string,
        dbOperation: () => Promise<T>
    ): Promise<T> {
        const startTime = Date.now();
        let success = true;
        let itemCount: number | undefined;

        try {
            const result = await dbOperation();
            
            // Try to extract item count from result
            if (result && typeof result === 'object') {
                const resultObj = result as any;
                if (resultObj.Items && Array.isArray(resultObj.Items)) {
                    itemCount = resultObj.Items.length;
                } else if (resultObj.Item) {
                    itemCount = 1;
                }
            }

            return result;
        } catch (error) {
            success = false;
            throw error;
        } finally {
            const duration = Date.now() - startTime;
            
            await MetricsManager.recordDatabaseOperation(
                operation as any,
                tableName,
                success,
                duration,
                itemCount
            );
        }
    }

    /**
     * Tracks WebSocket operation performance
     */
    static async trackWebSocketOperation<T>(
        operation: string,
        wsOperation: () => Promise<T>,
        userId?: string
    ): Promise<T> {
        const startTime = Date.now();
        let success = true;

        try {
            const result = await wsOperation();
            return result;
        } catch (error) {
            success = false;
            throw error;
        } finally {
            const duration = Date.now() - startTime;
            
            await MetricsManager.recordWebSocketConnection(
                'message',
                userId,
                duration
            );
            
            this.logger.debug(`WebSocket ${operation} completed`, {
                success,
                duration,
                userId
            });
        }
    }

    /**
     * Creates a performance timer
     */
    static createTimer(operationName: string): PerformanceTimer {
        return new PerformanceTimer(operationName);
    }

    /**
     * Tracks Lambda initialization time
     */
    static trackInitialization(): PerformanceTimer {
        return new PerformanceTimer('lambda_initialization');
    }

    /**
     * Records custom performance metrics
     */
    static async recordCustomMetric(
        metricName: string,
        value: number,
        unit: 'Count' | 'Milliseconds' | 'Bytes' | 'Percent' = 'Count',
        dimensions: Record<string, string> = {}
    ): Promise<void> {
        await MetricsManager.publishMetric(metricName, value, unit, {
            Category: 'Performance',
            FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'Unknown',
            ...dimensions
        });
    }

    /**
     * Analyzes and reports performance trends
     */
    static analyzePerformanceTrend(
        operations: Array<{ name: string; duration: number; timestamp: Date }>
    ): PerformanceTrend {
        if (operations.length === 0) {
            return {
                trend: 'stable',
                averageDuration: 0,
                operations: []
            };
        }

        const durations = operations.map(op => op.duration);
        const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
        
        // Simple trend analysis based on recent vs older operations
        const halfPoint = Math.floor(operations.length / 2);
        const recentOps = operations.slice(halfPoint);
        const olderOps = operations.slice(0, halfPoint);
        
        if (recentOps.length === 0 || olderOps.length === 0) {
            return {
                trend: 'stable',
                averageDuration,
                operations
            };
        }

        const recentAvg = recentOps.reduce((sum, op) => sum + op.duration, 0) / recentOps.length;
        const olderAvg = olderOps.reduce((sum, op) => sum + op.duration, 0) / olderOps.length;
        
        const changePercentage = ((recentAvg - olderAvg) / olderAvg) * 100;
        
        let trend: 'improving' | 'degrading' | 'stable';
        if (changePercentage < -10) {
            trend = 'improving';
        } else if (changePercentage > 10) {
            trend = 'degrading';
        } else {
            trend = 'stable';
        }

        return {
            trend,
            averageDuration,
            changePercentage,
            operations
        };
    }
}

/**
 * Performance timer class
 */
export class PerformanceTimer {
    private startTime: number;
    private operationName: string;
    private checkpoints: Array<{ name: string; time: number }> = [];

    constructor(operationName: string) {
        this.operationName = operationName;
        this.startTime = Date.now();
    }

    /**
     * Adds a checkpoint
     */
    checkpoint(name: string): void {
        this.checkpoints.push({
            name,
            time: Date.now() - this.startTime
        });
    }

    /**
     * Stops the timer and returns duration
     */
    stop(): number {
        return Date.now() - this.startTime;
    }

    /**
     * Stops the timer and logs performance data
     */
    async stopAndLog(metadata?: Record<string, any>): Promise<number> {
        const totalDuration = this.stop();
        
        PerformanceMonitor['logger'].metric(this.operationName, totalDuration, {
            checkpoints: this.checkpoints,
            ...metadata
        });

        // Record main operation metric
        await MetricsManager.publishMetric(
            'OperationDuration',
            totalDuration,
            'Milliseconds',
            {
                Operation: this.operationName,
                CheckpointCount: this.checkpoints.length.toString()
            }
        );

        // Record checkpoint metrics
        for (const checkpoint of this.checkpoints) {
            await MetricsManager.publishMetric(
                'CheckpointDuration',
                checkpoint.time,
                'Milliseconds',
                {
                    Operation: this.operationName,
                    Checkpoint: checkpoint.name
                }
            );
        }

        return totalDuration;
    }

    /**
     * Gets current duration without stopping
     */
    getCurrentDuration(): number {
        return Date.now() - this.startTime;
    }

    /**
     * Gets all checkpoints
     */
    getCheckpoints(): Array<{ name: string; time: number }> {
        return [...this.checkpoints];
    }
}

/**
 * Performance trend analysis result
 */
export interface PerformanceTrend {
    trend: 'improving' | 'degrading' | 'stable';
    averageDuration: number;
    changePercentage?: number;
    operations: Array<{ name: string; duration: number; timestamp: Date }>;
}
