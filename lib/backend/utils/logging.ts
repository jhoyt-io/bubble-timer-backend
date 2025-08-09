/**
 * Structured logging utility for Lambda functions
 */
export class Logger {
    private context: string;
    private metadata: Record<string, any>;

    constructor(context: string, metadata: Record<string, any> = {}) {
        this.context = context;
        this.metadata = metadata;
    }

    /**
     * Creates a child logger with additional context
     */
    child(additionalContext: string, additionalMetadata: Record<string, any> = {}): Logger {
        return new Logger(
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
     * Logs an error message
     */
    error(message: string, error?: any): void {
        const errorData = this.processError(error);
        this.log('ERROR', message, errorData);
    }

    /**
     * Logs a debug message (only in development)
     */
    debug(message: string, data?: any): void {
        if (process.env.NODE_ENV === 'development' || process.env.LOG_LEVEL === 'debug') {
            this.log('DEBUG', message, data);
        }
    }

    /**
     * Logs performance metrics
     */
    metric(operation: string, duration: number, data?: any): void {
        this.log('METRIC', `${operation} completed`, {
            operation,
            duration,
            ...data
        });
    }

    /**
     * Times an operation and logs the result
     */
    async time<T>(operation: string, fn: () => Promise<T>, data?: any): Promise<T> {
        const start = Date.now();
        try {
            const result = await fn();
            const duration = Date.now() - start;
            this.metric(operation, duration, { success: true, ...data });
            return result;
        } catch (error) {
            const duration = Date.now() - start;
            this.metric(operation, duration, { success: false, ...data });
            this.error(`${operation} failed`, error);
            throw error;
        }
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
            environment: process.env.NODE_ENV || 'unknown',
            requestId: this.getRequestId(),
            lambdaRequestId: process.env.AWS_REQUEST_ID,
            function: process.env.AWS_LAMBDA_FUNCTION_NAME,
            version: process.env.AWS_LAMBDA_FUNCTION_VERSION
        };

        // Use console.log for CloudWatch
        console.log(JSON.stringify(logEntry));
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
                // Stringify any non-serializable properties
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
        // Try to get from AWS context first
        if (process.env.AWS_REQUEST_ID) {
            return process.env.AWS_REQUEST_ID;
        }

        // Try to get from metadata
        if (this.metadata.requestId) {
            return this.metadata.requestId;
        }

        return undefined;
    }
}

/**
 * Creates a timer utility for measuring operation duration
 */
export class Timer {
    private start: number;
    private operation: string;

    constructor(operation: string) {
        this.start = Date.now();
        this.operation = operation;
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
    stopAndLog(logger: Logger, data?: any): number {
        const duration = this.stop();
        logger.metric(this.operation, duration, data);
        return duration;
    }
}

/**
 * Default logger instance
 */
export const defaultLogger = new Logger('BubbleTimer');
