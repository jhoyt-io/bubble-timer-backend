/**
 * Environment configuration management
 */
export enum Environment {
    DEVELOPMENT = 'development',
    STAGING = 'staging',
    PRODUCTION = 'production'
}

/**
 * Configuration interface
 */
export interface EnvironmentConfig {
    environment: Environment;
    region: string;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    cors: {
        origin: string;
        credentials: boolean;
    };
    cognito: {
        userPoolId: string;
        clientId: string;
    };
    tables: {
        timers: string;
        userConnections: string;
        sharedTimers: string;
    };
    websocket: {
        endpoint: string;
    };
}

/**
 * Environment configuration class
 */
export class EnvironmentManager {
    private static config: EnvironmentConfig | null = null;

    /**
     * Gets the current environment configuration
     */
    static getConfig(): EnvironmentConfig {
        if (!this.config) {
            this.config = this.loadConfig();
            this.validateConfig(this.config);
        }
        return this.config;
    }

    /**
     * Gets the current environment
     */
    static getEnvironment(): Environment {
        const env = process.env.NODE_ENV || process.env.ENVIRONMENT || 'development';
        switch (env.toLowerCase()) {
            case 'production':
            case 'prod':
                return Environment.PRODUCTION;
            case 'staging':
            case 'stage':
                return Environment.STAGING;
            default:
                return Environment.DEVELOPMENT;
        }
    }

    /**
     * Checks if running in development
     */
    static isDevelopment(): boolean {
        return this.getEnvironment() === Environment.DEVELOPMENT;
    }

    /**
     * Checks if running in staging
     */
    static isStaging(): boolean {
        return this.getEnvironment() === Environment.STAGING;
    }

    /**
     * Checks if running in production
     */
    static isProduction(): boolean {
        return this.getEnvironment() === Environment.PRODUCTION;
    }

    /**
     * Loads configuration from environment variables
     */
    private static loadConfig(): EnvironmentConfig {
        const environment = this.getEnvironment();

        return {
            environment,
            region: process.env.AWS_REGION || 'us-east-1',
            logLevel: this.getLogLevel(),
            cors: {
                origin: process.env.CORS_ORIGIN || this.getDefaultCorsOrigin(environment),
                credentials: true
            },
            cognito: {
                userPoolId: this.getRequiredEnvVar('COGNITO_USER_POOL_ID', 'us-east-1_cjED6eOHp'),
                clientId: this.getRequiredEnvVar('COGNITO_CLIENT_ID', '4t3c5p3875qboh3p1va2t9q63c')
            },
            tables: {
                timers: this.getRequiredEnvVar('TIMERS_TABLE_NAME'),
                userConnections: this.getRequiredEnvVar('USER_CONNECTIONS_TABLE_NAME'),
                sharedTimers: this.getRequiredEnvVar('SHARED_TIMERS_TABLE_NAME')
            },
            websocket: {
                endpoint: this.getRequiredEnvVar('WEBSOCKET_ENDPOINT', 'https://zc4ahryh1l.execute-api.us-east-1.amazonaws.com/prod/')
            }
        };
    }

    /**
     * Gets log level from environment
     */
    private static getLogLevel(): 'debug' | 'info' | 'warn' | 'error' {
        const level = process.env.LOG_LEVEL?.toLowerCase();
        switch (level) {
            case 'debug':
            case 'info':
            case 'warn':
            case 'error':
                return level;
            default:
                return this.isDevelopment() ? 'debug' : 'info';
        }
    }

    /**
     * Gets default CORS origin based on environment
     */
    private static getDefaultCorsOrigin(environment: Environment): string {
        switch (environment) {
            case Environment.PRODUCTION:
                return 'https://bubbletimer.app'; // Replace with actual production domain
            case Environment.STAGING:
                return 'https://staging.bubbletimer.app'; // Replace with actual staging domain
            default:
                return 'http://localhost:4000';
        }
    }

    /**
     * Gets required environment variable with optional default
     */
    private static getRequiredEnvVar(name: string, defaultValue?: string): string {
        const value = process.env[name] || defaultValue;
        if (!value) {
            throw new Error(`Required environment variable ${name} is not set`);
        }
        return value;
    }

    /**
     * Validates the configuration
     */
    private static validateConfig(config: EnvironmentConfig): void {
        const errors: string[] = [];

        // Validate region
        if (!config.region) {
            errors.push('AWS region is required');
        }

        // Validate Cognito config
        if (!config.cognito.userPoolId) {
            errors.push('Cognito User Pool ID is required');
        }
        if (!config.cognito.clientId) {
            errors.push('Cognito Client ID is required');
        }

        // Validate table names
        if (!config.tables.timers) {
            errors.push('Timers table name is required');
        }
        if (!config.tables.userConnections) {
            errors.push('User connections table name is required');
        }
        if (!config.tables.sharedTimers) {
            errors.push('Shared timers table name is required');
        }

        // Validate WebSocket endpoint
        if (!config.websocket.endpoint) {
            errors.push('WebSocket endpoint is required');
        }

        if (errors.length > 0) {
            throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
        }
    }

    /**
     * Resets the configuration (useful for testing)
     */
    static resetConfig(): void {
        this.config = null;
    }
}
