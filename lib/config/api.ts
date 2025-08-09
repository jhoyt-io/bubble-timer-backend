import { EnvironmentManager } from './environment';

/**
 * API configuration settings
 */
export class ApiConfig {
    /**
     * Gets CORS configuration
     */
    static getCorsConfig() {
        const config = EnvironmentManager.getConfig();
        return {
            allowHeaders: [
                'Content-Type',
                'X-Amz-Date',
                'Authorization',
                'X-Api-Key',
                'X-Amz-Security-Token',
                'DeviceId'
            ],
            allowMethods: ['OPTIONS', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
            allowCredentials: config.cors.credentials,
            allowOrigins: [config.cors.origin]
        };
    }

    /**
     * Gets standard response headers
     */
    static getResponseHeaders() {
        const corsConfig = this.getCorsConfig();
        return {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Headers': corsConfig.allowHeaders.join(','),
            'Access-Control-Allow-Origin': corsConfig.allowOrigins[0],
            'Access-Control-Allow-Methods': corsConfig.allowMethods.join(','),
            'Access-Control-Allow-Credentials': corsConfig.allowCredentials.toString()
        };
    }

    /**
     * Gets rate limiting configuration
     */
    static getRateLimitConfig() {
        const environment = EnvironmentManager.getEnvironment();
        
        // Adjust limits based on environment
        switch (environment) {
            case 'production':
                return {
                    requests: 1000,
                    window: 900, // 15 minutes
                    burst: 50
                };
            case 'staging':
                return {
                    requests: 500,
                    window: 900,
                    burst: 25
                };
            default:
                return {
                    requests: 100,
                    window: 60, // 1 minute
                    burst: 10
                };
        }
    }

    /**
     * Gets timeout configuration
     */
    static getTimeoutConfig() {
        const environment = EnvironmentManager.getEnvironment();
        
        return {
            // API Gateway timeout is 30 seconds max
            api: EnvironmentManager.isDevelopment() ? 10000 : 15000, // ms
            database: 5000, // ms
            websocket: 2000 // ms
        };
    }

    /**
     * Gets pagination configuration
     */
    static getPaginationConfig() {
        return {
            defaultLimit: 20,
            maxLimit: 100,
            maxScanLimit: 1000 // For DynamoDB scans
        };
    }

    /**
     * Gets validation configuration
     */
    static getValidationConfig() {
        return {
            maxTimerNameLength: 100,
            maxShareWithUsers: 50,
            allowedMessageTypes: [
                'ping',
                'pong',
                'acknowledge',
                'activeTimerList',
                'updateTimer',
                'stopTimer'
            ],
            allowedHttpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedWebSocketRoutes: ['$connect', '$disconnect', '$default', 'sendmessage']
        };
    }
}
