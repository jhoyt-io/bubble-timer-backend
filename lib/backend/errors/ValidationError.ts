/**
 * Custom error class for validation failures
 */
export class ValidationError extends Error {
    public readonly code: string;
    public readonly statusCode: number;
    public readonly field?: string;
    public readonly value?: any;

    constructor(message: string, field?: string, value?: any) {
        super(message);
        this.name = 'ValidationError';
        this.code = 'VALIDATION_ERROR';
        this.statusCode = 400;
        this.field = field;
        this.value = value;

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ValidationError);
        }
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            statusCode: this.statusCode,
            field: this.field,
            value: this.value,
            stack: this.stack
        };
    }
}

/**
 * Error for multiple validation failures
 */
export class MultipleValidationError extends Error {
    public readonly code: string;
    public readonly statusCode: number;
    public readonly errors: ValidationError[];

    constructor(errors: ValidationError[]) {
        const message = `Multiple validation errors: ${errors.map(e => e.message).join(', ')}`;
        super(message);
        this.name = 'MultipleValidationError';
        this.code = 'MULTIPLE_VALIDATION_ERRORS';
        this.statusCode = 400;
        this.errors = errors;

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, MultipleValidationError);
        }
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            statusCode: this.statusCode,
            errors: this.errors.map(e => e.toJSON()),
            stack: this.stack
        };
    }
}
