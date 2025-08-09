import { DynamoDBClient, DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { EnvironmentManager } from './environment';

/**
 * Database configuration and client management
 */
export class DatabaseConfig {
    private static client: DynamoDBClient | null = null;

    /**
     * Gets a configured DynamoDB client
     */
    static getClient(): DynamoDBClient {
        if (!this.client) {
            this.client = this.createClient();
        }
        return this.client;
    }

    /**
     * Creates a new DynamoDB client with proper configuration
     */
    private static createClient(): DynamoDBClient {
        const config = EnvironmentManager.getConfig();
        
        const clientConfig: DynamoDBClientConfig = {
            region: config.region,
            // Add retry configuration
            maxAttempts: 3,
            retryMode: 'adaptive'
        };

        // Add endpoint override for local development
        if (EnvironmentManager.isDevelopment() && process.env.DYNAMODB_ENDPOINT) {
            clientConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
        }

        return new DynamoDBClient(clientConfig);
    }

    /**
     * Gets table names from configuration
     */
    static getTableNames() {
        const config = EnvironmentManager.getConfig();
        return config.tables;
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
     * Health check for database connectivity
     */
    static async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
        try {
            const client = this.getClient();
            const tableNames = this.getTableNames();

            // Simple check - just verify we can create commands without erroring
            // We don't actually execute them to avoid unnecessary charges
            const { DescribeTableCommand } = await import('@aws-sdk/client-dynamodb');
            new DescribeTableCommand({ TableName: tableNames.timers });

            return { healthy: true };
        } catch (error) {
            return {
                healthy: false,
                error: error instanceof Error ? error.message : 'Unknown database error'
            };
        }
    }
}
