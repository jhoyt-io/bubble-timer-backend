/**
 * Enhanced structured logging with monitoring integration
 */
import { EnvironmentManager } from '../config/environment';

export interface LogMetadata {
    requestId?: string;
    userId?: string;
    operation?: string;
    duration?: number;
    statusCode?: number;
    error?: any;
    [key: string]: any;
}

export interface MetricData {
    name: string;
    value: number;
    unit: 'Count' | 'Milliseconds' | 'Bytes' | 'Percent';
    dimensions?: Record<string, string>;
    timestamp?: Date;
}

/**
 * Enhanced logger with CloudWatch metrics support
 */
export class MonitoringLogger {
    private context: string;
    private metadata: LogMetadata;
    private config: any;

    constructor(context: string, metadata: LogMetadata = {}) {
        this.context = context;
        try {
            this.config = EnvironmentManager.getConfig();
            this.metadata = {
                ...metadata,
                environment: this.config.environment,
                region: this.config.region
            };
        } catch (error) {
            // Fallback for testing - use default values if config fails to load
            this.metadata = {
                ...metadata,
                environment: 'test',
                region: 'us-east-1'
            };
        }
    }

    /**
     * Creates a child logger with additional context
     */
    child(additionalContext: string, additionalMetadata: LogMetadata = {}): MonitoringLogger {
        return new MonitoringLogger(
            `${this.context}:${additionalContext}`,
            { ...this.metadata, ...additionalMetadata }
        );
    }

    /**
     * Logs an info message
     */
    info(message: string, data?: any): void {
        this.log('INFO', message, data);
    }

    /**
     * Logs a warning message
     */
    warn(message: string, data?: any): void {
        this.log('WARN', message, data);
    }

    /**
     * Logs an error message and emits error metrics
     */
    error(message: string, error?: any): void {
        const errorData = this.processError(error);
        this.log('ERROR', message, errorData);
        
        // Emit error metric
        this.emitMetric({
            name: 'ErrorCount',
            value: 1,
            unit: 'Count',
            dimensions: {
                Service: 'BubbleTimer',
                Context: this.context,
                ErrorType: errorData?.name || 'Unknown'
            }
        });
    }

    /**
     * Logs a debug message
     */
    debug(message: string, data?: any): void {
        if (this.config.logLevel === 'debug') {
            this.log('DEBUG', message, data);
        }
    }

    /**
     * Logs performance metrics
     */
    metric(operation: string, duration: number, data?: any): void {
        const logData = {
            operation,
            duration,
            success: !data?.error,
            ...data
        };

        this.log('METRIC', `${operation} completed`, logData);

        // Emit duration metric
        this.emitMetric({
            name: 'OperationDuration',
            value: duration,
            unit: 'Milliseconds',
            dimensions: {
                Service: 'BubbleTimer',
                Operation: operation,
                Success: logData.success.toString()
            }
        });

        // Emit operation count metric
        this.emitMetric({
            name: 'OperationCount',
            value: 1,
            unit: 'Count',
            dimensions: {
                Service: 'BubbleTimer',
                Operation: operation,
                Success: logData.success.toString()
            }
        });
    }

    /**
     * Times an operation and logs the result with metrics
     */
    async time<T>(operation: string, fn: () => Promise<T>, data?: any): Promise<T> {
        const start = Date.now();
        const timer = this.startTimer(operation);
        
        try {
            this.debug(`Starting ${operation}`);
            const result = await fn();
            const duration = Date.now() - start;
            
            this.metric(operation, duration, { success: true, ...data });
            this.info(`${operation} completed successfully`, { duration });
            
            return result;
        } catch (error) {
            const duration = Date.now() - start;
            this.metric(operation, duration, { success: false, error, ...data });
            this.error(`${operation} failed`, error);
            throw error;
        } finally {
            timer.stop();
        }
    }

    /**
     * Starts a timer for tracking operation duration
     */
    startTimer(operation: string): Timer {
        return new Timer(operation, this);
    }

    /**
     * Emits custom metrics
     */
    emitMetric(metric: MetricData): void {
        // Log the metric in a format that CloudWatch can parse
        const metricLog = {
            timestamp: new Date().toISOString(),
            level: 'METRIC',
            context: this.context,
            metric: {
                name: metric.name,
                value: metric.value,
                unit: metric.unit,
                dimensions: metric.dimensions || {},
                namespace: 'BubbleTimer',
                timestamp: metric.timestamp || new Date()
            },
            metadata: this.metadata
        };

        console.log(JSON.stringify(metricLog));
    }

    /**
     * Logs API request/response information
     */
    apiLog(method: string, path: string, statusCode: number, duration: number, data?: any): void {
        const logData = {
            method,
            path,
            statusCode,
            duration,
            success: statusCode >= 200 && statusCode < 400,
            ...data
        };

        this.log('API', `${method} ${path} ${statusCode}`, logData);

        // Emit API metrics
        this.emitMetric({
            name: 'APIRequests',
            value: 1,
            unit: 'Count',
            dimensions: {
                Service: 'BubbleTimer',
                Method: method,
                StatusCode: statusCode.toString(),
                Success: logData.success.toString()
            }
        });

        this.emitMetric({
            name: 'APILatency',
            value: duration,
            unit: 'Milliseconds',
            dimensions: {
                Service: 'BubbleTimer',
                Method: method,
                Endpoint: path
            }
        });
    }

    /**
     * Logs WebSocket connection events
     */
    websocketLog(event: 'connect' | 'disconnect' | 'message', connectionId: string, data?: any): void {
        const logData = {
            event,
            connectionId,
            ...data
        };

        this.log('WEBSOCKET', `WebSocket ${event}`, logData);

        // Emit WebSocket metrics
        this.emitMetric({
            name: 'WebSocketEvents',
            value: 1,
            unit: 'Count',
            dimensions: {
                Service: 'BubbleTimer',
                Event: event,
                Success: data?.error ? 'false' : 'true'
            }
        });
    }

    /**
     * Core logging method
     */
    private log(level: string, message: string, data?: any): void {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            context: this.context,
            message,
            metadata: this.metadata,
            ...(data && { data }),
            environment: this.config.environment,
            region: this.config.region,
            requestId: this.getRequestId(),
            lambdaRequestId: process.env.AWS_REQUEST_ID,
            function: process.env.AWS_LAMBDA_FUNCTION_NAME,
            version: process.env.AWS_LAMBDA_FUNCTION_VERSION
        };

        // Filter logs based on level
        if (this.shouldLog(level)) {
            console.log(JSON.stringify(logEntry));
        }
    }

    /**
     * Determines if a log should be written based on current log level
     */
    private shouldLog(level: string): boolean {
        const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
        const currentLevelIndex = levels.indexOf(this.config.logLevel.toUpperCase());
        const messageLevelIndex = levels.indexOf(level);
        
        return messageLevelIndex >= currentLevelIndex;
    }

    /**
     * Processes error objects for logging
     */
    private processError(error?: any): any {
        if (!error) return undefined;

        if (error instanceof Error) {
            return {
                name: error.name,
                message: error.message,
                stack: error.stack,
                ...(this.isAppError(error) && {
                    code: (error as any).code,
                    statusCode: (error as any).statusCode,
                    details: (error as any).details
                })
            };
        }

        if (typeof error === 'object') {
            return {
                ...error,
                toString: error.toString?.()
            };
        }

        return { value: error, type: typeof error };
    }

    /**
     * Checks if an error is an application error
     */
    private isAppError(error: any): boolean {
        return error && 
               typeof error.name === 'string' &&
               typeof error.message === 'string' &&
               typeof error.code === 'string' &&
               typeof error.statusCode === 'number';
    }

    /**
     * Extracts request ID from various sources
     */
    private getRequestId(): string | undefined {
        return process.env.AWS_REQUEST_ID || 
               this.metadata.requestId || 
               undefined;
    }
}

/**
 * Timer utility for measuring operation duration
 */
export class Timer {
    private start: number;
    private operation: string;
    private logger: MonitoringLogger;

    constructor(operation: string, logger: MonitoringLogger) {
        this.start = Date.now();
        this.operation = operation;
        this.logger = logger;
    }

    /**
     * Stops the timer and returns the duration
     */
    stop(): number {
        return Date.now() - this.start;
    }

    /**
     * Stops the timer and logs the result
     */
    stopAndLog(data?: any): number {
        const duration = this.stop();
        this.logger.metric(this.operation, duration, data);
        return duration;
    }
}

/**
 * Default monitoring logger instance
 */
export const defaultLogger = new MonitoringLogger('BubbleTimer');
