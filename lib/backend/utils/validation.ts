import { ValidationError, MultipleValidationError } from '../errors/ValidationError';

/**
 * Timer validation schema
 */
export interface TimerValidationSchema {
    id: string;
    userId: string;
    name: string;
    totalDuration: string;
    remainingDuration?: string;
    endTime?: string;
}

/**
 * WebSocket message validation schema
 */
export interface WebSocketMessageSchema {
    type: string;
    data?: any;
    messageId?: string;
    timestamp?: string;
}

/**
 * Connection validation schema
 */
export interface ConnectionValidationSchema {
    userId: string;
    deviceId: string;
    connectionId?: string;
}

/**
 * Validation utility functions
 */
export class ValidationUtils {
    /**
     * Validates a timer object
     */
    static validateTimer(timer: any): TimerValidationSchema {
        const errors: ValidationError[] = [];

        if (!timer) {
            throw new ValidationError('Timer object is required');
        }

        // Validate ID
        if (!timer.id || typeof timer.id !== 'string' || timer.id.trim().length === 0) {
            errors.push(new ValidationError('Timer ID is required and must be a non-empty string', 'id', timer.id));
        }

        // Validate userId
        if (!timer.userId || typeof timer.userId !== 'string' || timer.userId.trim().length === 0) {
            errors.push(new ValidationError('User ID is required and must be a non-empty string', 'userId', timer.userId));
        }

        // Validate name
        if (!timer.name || typeof timer.name !== 'string' || timer.name.trim().length === 0) {
            errors.push(new ValidationError('Timer name is required and must be a non-empty string', 'name', timer.name));
        } else if (timer.name.length > 100) {
            errors.push(new ValidationError('Timer name must be 100 characters or less', 'name', timer.name));
        }

        // Validate totalDuration
        if (!timer.totalDuration || typeof timer.totalDuration !== 'string') {
            errors.push(new ValidationError('Total duration is required and must be a string', 'totalDuration', timer.totalDuration));
        } else if (!this.isValidDuration(timer.totalDuration)) {
            errors.push(new ValidationError('Total duration must be a valid duration format', 'totalDuration', timer.totalDuration));
        }

        // Validate remainingDuration (optional)
        if (timer.remainingDuration !== undefined) {
            if (typeof timer.remainingDuration !== 'string') {
                errors.push(new ValidationError('Remaining duration must be a string if provided', 'remainingDuration', timer.remainingDuration));
            } else if (!this.isValidDuration(timer.remainingDuration)) {
                errors.push(new ValidationError('Remaining duration must be a valid duration format', 'remainingDuration', timer.remainingDuration));
            }
        }

        // Validate endTime (optional)
        if (timer.endTime !== undefined) {
            if (typeof timer.endTime !== 'string') {
                errors.push(new ValidationError('End time must be a string if provided', 'endTime', timer.endTime));
            } else if (!this.isValidISOString(timer.endTime)) {
                errors.push(new ValidationError('End time must be a valid ISO string', 'endTime', timer.endTime));
            }
        }

        if (errors.length > 0) {
            throw new MultipleValidationError(errors);
        }

        return {
            id: timer.id.trim(),
            userId: timer.userId.trim(),
            name: timer.name.trim(),
            totalDuration: timer.totalDuration,
            remainingDuration: timer.remainingDuration,
            endTime: timer.endTime
        };
    }

    /**
     * Validates a WebSocket message
     */
    static validateWebSocketMessage(message: any): WebSocketMessageSchema {
        const errors: ValidationError[] = [];

        if (!message) {
            throw new ValidationError('Message object is required');
        }

        // Validate type
        if (!message.type || typeof message.type !== 'string' || message.type.trim().length === 0) {
            errors.push(new ValidationError('Message type is required and must be a non-empty string', 'type', message.type));
        }

        // Validate messageId (optional)
        if (message.messageId !== undefined && typeof message.messageId !== 'string') {
            errors.push(new ValidationError('Message ID must be a string if provided', 'messageId', message.messageId));
        }

        // Validate timestamp (optional) - accept both string and number
        if (message.timestamp !== undefined) {
            if (typeof message.timestamp === 'number') {
                // Convert numeric timestamp to ISO string
                try {
                    message.timestamp = new Date(message.timestamp).toISOString();
                } catch (error) {
                    errors.push(new ValidationError('Timestamp must be a valid timestamp', 'timestamp', message.timestamp));
                }
            } else if (typeof message.timestamp === 'string') {
                if (!this.isValidISOString(message.timestamp)) {
                    errors.push(new ValidationError('Timestamp must be a valid ISO string', 'timestamp', message.timestamp));
                }
            } else {
                errors.push(new ValidationError('Timestamp must be a string or number if provided', 'timestamp', message.timestamp));
            }
        }

        if (errors.length > 0) {
            throw new MultipleValidationError(errors);
        }

        return {
            type: message.type.trim(),
            data: message.data,
            messageId: message.messageId,
            timestamp: message.timestamp
        };
    }

    /**
     * Validates a connection object
     */
    static validateConnection(connection: any): ConnectionValidationSchema {
        const errors: ValidationError[] = [];

        if (!connection) {
            throw new ValidationError('Connection object is required');
        }

        // Validate userId
        if (!connection.userId || typeof connection.userId !== 'string' || connection.userId.trim().length === 0) {
            errors.push(new ValidationError('User ID is required and must be a non-empty string', 'userId', connection.userId));
        }

        // Validate deviceId
        if (!connection.deviceId || typeof connection.deviceId !== 'string' || connection.deviceId.trim().length === 0) {
            errors.push(new ValidationError('Device ID is required and must be a non-empty string', 'deviceId', connection.deviceId));
        }

        // Validate connectionId (optional)
        if (connection.connectionId !== undefined && typeof connection.connectionId !== 'string') {
            errors.push(new ValidationError('Connection ID must be a string if provided', 'connectionId', connection.connectionId));
        }

        if (errors.length > 0) {
            throw new MultipleValidationError(errors);
        }

        return {
            userId: connection.userId.trim(),
            deviceId: connection.deviceId.trim(),
            connectionId: connection.connectionId
        };
    }

    /**
     * Validates a timer ID
     */
    static validateTimerId(timerId: any): string {
        if (!timerId || typeof timerId !== 'string' || timerId.trim().length === 0) {
            throw new ValidationError('Timer ID is required and must be a non-empty string', 'timerId', timerId);
        }
        return timerId.trim();
    }

    /**
     * Validates a user ID
     */
    static validateUserId(userId: any): string {
        if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
            throw new ValidationError('User ID is required and must be a non-empty string', 'userId', userId);
        }
        return userId.trim();
    }

    /**
     * Validates an array of user IDs for sharing
     */
    static validateSharedUsers(users: any): string[] {
        if (!Array.isArray(users)) {
            throw new ValidationError('Shared users must be an array', 'shareWith', users);
        }

        const validatedUsers: string[] = [];
        const errors: ValidationError[] = [];

        users.forEach((user, index) => {
            try {
                validatedUsers.push(this.validateUserId(user));
            } catch (error) {
                if (error instanceof ValidationError) {
                    errors.push(new ValidationError(`Invalid user at index ${index}: ${error.message}`, `shareWith[${index}]`, user));
                }
            }
        });

        if (errors.length > 0) {
            throw new MultipleValidationError(errors);
        }

        return validatedUsers;
    }

    /**
     * Checks if a string is a valid duration format
     * For now, accepts any non-empty string - could be enhanced with specific format validation
     */
    private static isValidDuration(duration: string): boolean {
        return duration.trim().length > 0;
    }

    /**
     * Checks if a string is a valid ISO date string
     */
    private static isValidISOString(dateString: string): boolean {
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date.getTime()) && date.toISOString() === dateString;
    }
}
