/**
 * Custom error class for network-related operations
 */
export class NetworkError extends Error {
    public readonly code: string;
    public readonly statusCode: number;
    public readonly operation?: string;
    public readonly retryable: boolean;

    constructor(message: string, code: string, statusCode: number = 500, operation?: string, retryable: boolean = false) {
        super(message);
        this.name = 'NetworkError';
        this.code = code;
        this.statusCode = statusCode;
        this.operation = operation;
        this.retryable = retryable;

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, NetworkError);
        }
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            statusCode: this.statusCode,
            operation: this.operation,
            retryable: this.retryable,
            stack: this.stack
        };
    }
}

// Specific network error codes
export const NetworkErrorCodes = {
    CONNECTION_FAILED: 'CONNECTION_FAILED',
    TIMEOUT: 'TIMEOUT',
    WEBSOCKET_SEND_FAILED: 'WEBSOCKET_SEND_FAILED',
    DATABASE_CONNECTION_FAILED: 'DATABASE_CONNECTION_FAILED',
    EXTERNAL_SERVICE_UNAVAILABLE: 'EXTERNAL_SERVICE_UNAVAILABLE'
} as const;

export type NetworkErrorCode = typeof NetworkErrorCodes[keyof typeof NetworkErrorCodes];
