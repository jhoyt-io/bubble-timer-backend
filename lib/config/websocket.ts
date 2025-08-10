import { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi';
import { EnvironmentManager } from './environment';

/**
 * WebSocket configuration and client management
 */
export class WebSocketConfig {
    private static client: ApiGatewayManagementApiClient | null = null;

    /**
     * Gets a configured API Gateway Management client
     */
    static getClient(): ApiGatewayManagementApiClient {
        if (!this.client) {
            this.client = this.createClient();
        }
        return this.client;
    }

    /**
     * Creates a new API Gateway Management client
     */
    private static createClient(): ApiGatewayManagementApiClient {
        const config = EnvironmentManager.getConfig();
        
        return new ApiGatewayManagementApiClient({
            region: config.region,
            endpoint: config.websocket.endpoint,
            maxAttempts: 5, // Increased from 3 for better resilience
            retryMode: 'adaptive',
            requestHandler: {
                httpOptions: {
                    timeout: 10000, // 10 seconds
                    connectTimeout: 5000 // 5 seconds
                }
            }
        });
    }

    /**
     * Gets WebSocket endpoint configuration
     */
    static getEndpointConfig() {
        const config = EnvironmentManager.getConfig();
        return {
            endpoint: config.websocket.endpoint,
            region: config.region
        };
    }

    /**
     * Gets message routing configuration
     */
    static getRoutingConfig() {
        return {
            routes: {
                connect: '$connect',
                disconnect: '$disconnect',
                default: '$default',
                sendMessage: 'sendmessage'
            },
            messageTypes: {
                ping: 'ping',
                pong: 'pong',
                acknowledge: 'acknowledge',
                activeTimerList: 'activeTimerList',
                updateTimer: 'updateTimer',
                stopTimer: 'stopTimer'
            }
        };
    }

    /**
     * Gets connection management configuration
     */
    static getConnectionConfig() {
        const environment = EnvironmentManager.getEnvironment();
        
        return {
            // Connection timeout in seconds
            timeout: EnvironmentManager.isDevelopment() ? 300 : 1800, // 5 min dev, 30 min prod
            
            // Ping interval in seconds
            pingInterval: 30,
            
            // Max connections per user
            maxConnectionsPerUser: environment === 'production' ? 10 : 5,
            
            // Message retry configuration
            retryAttempts: 3,
            retryDelay: 1000, // ms
            
            // Message size limits
            maxMessageSize: 32 * 1024, // 32KB (API Gateway limit)
            
            // Batch processing
            batchSize: 100,
            batchTimeout: 1000 // ms
        };
    }

    /**
     * Gets authentication configuration
     */
    static getAuthConfig() {
        const config = EnvironmentManager.getConfig();
        
        return {
            cognito: {
                userPoolId: config.cognito.userPoolId,
                clientId: config.cognito.clientId,
                region: config.region
            },
            tokenValidation: {
                cacheTimeout: 300, // 5 minutes
                clockTolerance: 300 // 5 minutes
            }
        };
    }

    /**
     * Resets the client (useful for testing)
     */
    static resetClient(): void {
        if (this.client) {
            this.client.destroy();
            this.client = null;
        }
    }

    /**
     * Health check for WebSocket service
     */
    static async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
        try {
            const client = this.getClient();
            // Simple check - verify client can be created
            return { healthy: true };
        } catch (error) {
            return {
                healthy: false,
                error: error instanceof Error ? error.message : 'Unknown WebSocket error'
            };
        }
    }
}
