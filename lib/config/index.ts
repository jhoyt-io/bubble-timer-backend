/**
 * Central configuration exports
 */
export { EnvironmentManager, Environment, type EnvironmentConfig } from './environment';
export { DatabaseConfig } from './database';
export { ApiConfig } from './api';
export { WebSocketConfig } from './websocket';

// Import for internal use
import { EnvironmentManager } from './environment';
import { DatabaseConfig } from './database';
import { ApiConfig } from './api';
import { WebSocketConfig } from './websocket';

/**
 * Configuration factory for easy access
 */
export class Config {
    /**
     * Gets environment configuration
     */
    static get environment() {
        return EnvironmentManager.getConfig();
    }

    /**
     * Gets database client
     */
    static get database() {
        return DatabaseConfig.getClient();
    }

    /**
     * Gets database table names
     */
    static get tables() {
        return DatabaseConfig.getTableNames();
    }

    /**
     * Gets WebSocket client
     */
    static get websocket() {
        return WebSocketConfig.getClient();
    }

    /**
     * Gets API configuration
     */
    static get api() {
        return {
            cors: ApiConfig.getCorsConfig(),
            headers: ApiConfig.getResponseHeaders(),
            rateLimit: ApiConfig.getRateLimitConfig(),
            timeout: ApiConfig.getTimeoutConfig(),
            pagination: ApiConfig.getPaginationConfig(),
            validation: ApiConfig.getValidationConfig()
        };
    }

    /**
     * Gets WebSocket configuration
     */
    static get ws() {
        return {
            endpoint: WebSocketConfig.getEndpointConfig(),
            routing: WebSocketConfig.getRoutingConfig(),
            connection: WebSocketConfig.getConnectionConfig(),
            auth: WebSocketConfig.getAuthConfig()
        };
    }

    /**
     * Performs health checks on all services
     */
    static async healthCheck(): Promise<{
        overall: boolean;
        services: {
            database: { healthy: boolean; error?: string };
            websocket: { healthy: boolean; error?: string };
        };
    }> {
        const [databaseHealth, websocketHealth] = await Promise.all([
            DatabaseConfig.healthCheck(),
            WebSocketConfig.healthCheck()
        ]);

        return {
            overall: databaseHealth.healthy && websocketHealth.healthy,
            services: {
                database: databaseHealth,
                websocket: websocketHealth
            }
        };
    }

    /**
     * Resets all configurations (useful for testing)
     */
    static reset(): void {
        EnvironmentManager.resetConfig();
        DatabaseConfig.resetClient();
        WebSocketConfig.resetClient();
    }
}
