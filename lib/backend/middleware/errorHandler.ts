import { createErrorResponse, isAppError } from '../errors';
import { Logger } from '../utils/logging';

/**
 * Error handler middleware for Lambda functions
 */
export class ErrorHandler {
    private static logger = new Logger('ErrorHandler');

    /**
     * Wraps a Lambda handler with error handling
     */
    static wrapHandler<T extends any[], R>(
        handler: (...args: T) => Promise<R>,
        handlerName: string = 'unknown'
    ) {
        return async (...args: T): Promise<R> => {
            try {
                this.logger.info(`Starting ${handlerName} handler`);
                const result = await handler(...args);
                this.logger.info(`Successfully completed ${handlerName} handler`);
                return result;
            } catch (error) {
                this.logger.error(`Error in ${handlerName} handler:`, error);
                throw this.processError(error);
            }
        };
    }

    /**
     * Creates a standardized error response for API Gateway
     */
    static createApiErrorResponse(error: unknown, requestId?: string) {
        const errorResponse = createErrorResponse(error, requestId);
        const statusCode = isAppError(error) ? error.statusCode : 500;

        return {
            isBase64Encoded: false,
            statusCode,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || 'http://localhost:4000',
                'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,PATCH,DELETE',
            },
            body: JSON.stringify(errorResponse)
        };
    }

    /**
     * Creates a standardized error response for WebSocket
     */
    static createWebSocketErrorResponse(error: unknown, requestId?: string) {
        const errorResponse = createErrorResponse(error, requestId);
        const statusCode = isAppError(error) ? error.statusCode : 500;

        return {
            isBase64Encoded: false,
            statusCode,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || 'http://localhost:4000',
                'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,PATCH,DELETE',
            },
            body: JSON.stringify(errorResponse)
        };
    }

    /**
     * Processes and enriches errors before re-throwing
     */
    private static processError(error: unknown): Error {
        // If it's already an application error, return as-is
        if (isAppError(error)) {
            return error as Error;
        }

        // Handle specific AWS SDK errors
        if (this.isAWSError(error)) {
            return this.handleAWSError(error);
        }

        // Handle unknown errors
        if (error instanceof Error) {
            this.logger.error('Unhandled error:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            return error;
        }

        // Handle non-Error objects
        const message = typeof error === 'string' ? error : 'Unknown error occurred';
        this.logger.error('Unhandled non-Error object:', error);
        return new Error(message);
    }

    /**
     * Checks if an error is from AWS SDK
     */
    private static isAWSError(error: any): boolean {
        return error && 
               (error.name?.includes('DynamoDB') || 
                error.name?.includes('Lambda') || 
                error.name?.includes('ApiGateway') ||
                error.$metadata);
    }

    /**
     * Handles AWS-specific errors
     */
    private static handleAWSError(error: any): Error {
        const { NetworkError, NetworkErrorCodes, TimerError, TimerErrorCodes } = require('../errors');

        this.logger.error('AWS Error:', {
            name: error.name,
            message: error.message,
            code: error.code,
            statusCode: error.statusCode,
            requestId: error.$metadata?.requestId
        });

        // Handle specific AWS error types
        switch (error.name) {
            case 'ResourceNotFoundException':
                return new TimerError(
                    'Resource not found',
                    TimerErrorCodes.TIMER_NOT_FOUND,
                    404,
                    { awsError: error.name, requestId: error.$metadata?.requestId }
                );

            case 'ConditionalCheckFailedException':
                return new TimerError(
                    'Operation failed due to conditional check',
                    TimerErrorCodes.TIMER_UPDATE_FAILED,
                    409,
                    { awsError: error.name, requestId: error.$metadata?.requestId }
                );

            case 'ThrottlingException':
            case 'ProvisionedThroughputExceededException':
                return new NetworkError(
                    'Service temporarily unavailable due to throttling',
                    NetworkErrorCodes.EXTERNAL_SERVICE_UNAVAILABLE,
                    503,
                    'DynamoDB',
                    true
                );

            case 'TimeoutError':
                return new NetworkError(
                    'Operation timed out',
                    NetworkErrorCodes.TIMEOUT,
                    504,
                    'AWS Service',
                    true
                );

            default:
                return new NetworkError(
                    `AWS service error: ${error.message}`,
                    NetworkErrorCodes.EXTERNAL_SERVICE_UNAVAILABLE,
                    500,
                    'AWS Service',
                    false
                );
        }
    }
}
