import { ValidationUtils } from '../utils/validation';
import { ValidationError } from '../errors/ValidationError';
import { Logger } from '../utils/logging';

/**
 * Validation middleware for Lambda functions
 */
export class ValidationMiddleware {
    private static logger = new Logger('ValidationMiddleware');

    /**
     * Validates timer data in request body
     */
    static validateTimerBody(body: any) {
        this.logger.debug('Validating timer body', { body });
        
        if (!body) {
            throw new ValidationError('Request body is required');
        }

        let parsedBody;
        if (typeof body === 'string') {
            try {
                parsedBody = JSON.parse(body);
            } catch (error) {
                throw new ValidationError('Invalid JSON in request body');
            }
        } else {
            parsedBody = body;
        }

        if (!parsedBody.timer) {
            throw new ValidationError('Timer object is required in request body', 'timer');
        }

        return ValidationUtils.validateTimer(parsedBody.timer);
    }

    /**
     * Validates WebSocket message
     */
    static validateWebSocketMessage(body: any) {
        this.logger.debug('Validating WebSocket message', { body });

        if (!body) {
            throw new ValidationError('Message body is required');
        }

        let parsedBody;
        if (typeof body === 'string') {
            try {
                parsedBody = JSON.parse(body);
            } catch (error) {
                throw new ValidationError('Invalid JSON in message body');
            }
        } else {
            parsedBody = body;
        }

        if (!parsedBody.data) {
            throw new ValidationError('Data object is required in message body', 'data');
        }

        return ValidationUtils.validateWebSocketMessage(parsedBody.data);
    }

    /**
     * Validates timer ID from path parameters
     */
    static validateTimerIdFromPath(event: any): string {
        this.logger.debug('Validating timer ID from path', { 
            pathParameters: event?.pathParameters,
            path: event?.path 
        });

        const timerId = event?.pathParameters?.timer;
        if (!timerId) {
            // Fallback to parsing from path
            const splitPath = event?.path?.split('/');
            const pathTimerId = splitPath?.[2];
            if (!pathTimerId) {
                throw new ValidationError('Timer ID is required in path parameters', 'timer');
            }
            return ValidationUtils.validateTimerId(pathTimerId);
        }

        return ValidationUtils.validateTimerId(timerId);
    }

    /**
     * Validates user ID from Cognito claims
     */
    static validateUserIdFromCognito(event: any): string {
        this.logger.debug('Validating user ID from Cognito', { 
            authorizer: event?.requestContext?.authorizer 
        });

        const cognitoUserName = event?.requestContext?.authorizer?.claims?.['cognito:username'];
        if (!cognitoUserName) {
            throw new ValidationError('User authentication is required', 'cognitoUsername');
        }

        return ValidationUtils.validateUserId(cognitoUserName);
    }

    /**
     * Validates device ID from headers
     */
    static validateDeviceIdFromHeaders(event: any): string {
        this.logger.debug('Validating device ID from headers', { 
            headers: event?.headers 
        });

        const deviceId = event?.headers?.DeviceId || event?.headers?.deviceId;
        if (!deviceId) {
            throw new ValidationError('Device ID is required in headers', 'DeviceId');
        }

        if (typeof deviceId !== 'string' || deviceId.trim().length === 0) {
            throw new ValidationError('Device ID must be a non-empty string', 'DeviceId', deviceId);
        }

        return deviceId.trim();
    }

    /**
     * Validates query parameters for shared timer operations
     */
    static validateSharedTimerQuery(event: any): { timerId: string } {
        this.logger.debug('Validating shared timer query parameters', { 
            queryStringParameters: event?.queryStringParameters 
        });

        const queryParams = event?.queryStringParameters;
        if (!queryParams || !queryParams.timerId) {
            throw new ValidationError('Timer ID is required as query parameter', 'timerId');
        }

        return {
            timerId: ValidationUtils.validateTimerId(queryParams.timerId)
        };
    }

    /**
     * Validates share with users array
     */
    static validateShareWithUsers(shareWith: any): string[] {
        this.logger.debug('Validating share with users', { shareWith });

        if (!shareWith) {
            return [];
        }

        return ValidationUtils.validateSharedUsers(shareWith);
    }

    /**
     * Validates HTTP method
     */
    static validateHttpMethod(event: any, allowedMethods: string[]): string {
        const method = event?.httpMethod;
        if (!method) {
            throw new ValidationError('HTTP method is required', 'httpMethod');
        }

        if (!allowedMethods.includes(method)) {
            throw new ValidationError(
                `HTTP method ${method} not allowed. Allowed methods: ${allowedMethods.join(', ')}`,
                'httpMethod',
                method
            );
        }

        return method;
    }

    /**
     * Validates WebSocket route
     */
    static validateWebSocketRoute(event: any, allowedRoutes: string[]): string {
        const routeKey = event?.requestContext?.routeKey;
        if (!routeKey) {
            throw new ValidationError('WebSocket route is required', 'routeKey');
        }

        if (!allowedRoutes.includes(routeKey)) {
            throw new ValidationError(
                `WebSocket route ${routeKey} not allowed. Allowed routes: ${allowedRoutes.join(', ')}`,
                'routeKey',
                routeKey
            );
        }

        return routeKey;
    }

    /**
     * Validates connection ID
     */
    static validateConnectionId(event: any): string {
        const connectionId = event?.requestContext?.connectionId;
        if (!connectionId) {
            throw new ValidationError('Connection ID is required', 'connectionId');
        }

        if (typeof connectionId !== 'string' || connectionId.trim().length === 0) {
            throw new ValidationError('Connection ID must be a non-empty string', 'connectionId', connectionId);
        }

        return connectionId.trim();
    }
}
