export { TimerError, TimerErrorCodes, type TimerErrorCode } from './TimerError';
export { ValidationError, MultipleValidationError } from './ValidationError';
export { NetworkError, NetworkErrorCodes, type NetworkErrorCode } from './NetworkError';

/**
 * Base interface for all application errors
 */
export interface AppError {
    name: string;
    message: string;
    code: string;
    statusCode: number;
    stack?: string;
}

/**
 * Type guard to check if an error is an application error
 */
export function isAppError(error: any): error is AppError {
    return error && 
           typeof error.name === 'string' &&
           typeof error.message === 'string' &&
           typeof error.code === 'string' &&
           typeof error.statusCode === 'number';
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(error: unknown, requestId?: string) {
    const timestamp = new Date().toISOString();
    
    if (isAppError(error)) {
        return {
            error: {
                name: error.name,
                message: error.message,
                code: error.code,
                statusCode: error.statusCode,
                timestamp,
                requestId
            }
        };
    }

    // Handle unknown errors
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
        error: {
            name: 'UnknownError',
            message,
            code: 'UNKNOWN_ERROR',
            statusCode: 500,
            timestamp,
            requestId
        }
    };
}
