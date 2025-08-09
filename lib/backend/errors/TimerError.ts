/**
 * Custom error class for timer-related operations
 */
export class TimerError extends Error {
    public readonly code: string;
    public readonly statusCode: number;
    public readonly details?: any;

    constructor(message: string, code: string, statusCode: number = 500, details?: any) {
        super(message);
        this.name = 'TimerError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, TimerError);
        }
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            statusCode: this.statusCode,
            details: this.details,
            stack: this.stack
        };
    }
}

// Specific timer error codes
export const TimerErrorCodes = {
    TIMER_NOT_FOUND: 'TIMER_NOT_FOUND',
    TIMER_ALREADY_EXISTS: 'TIMER_ALREADY_EXISTS',
    TIMER_UPDATE_FAILED: 'TIMER_UPDATE_FAILED',
    TIMER_DELETE_FAILED: 'TIMER_DELETE_FAILED',
    TIMER_INVALID_STATE: 'TIMER_INVALID_STATE',
    TIMER_ACCESS_DENIED: 'TIMER_ACCESS_DENIED',
    TIMER_SHARING_FAILED: 'TIMER_SHARING_FAILED'
} as const;

export type TimerErrorCode = typeof TimerErrorCodes[keyof typeof TimerErrorCodes];
