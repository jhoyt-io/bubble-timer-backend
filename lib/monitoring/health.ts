import { Config, DatabaseConfig, WebSocketConfig } from '../config';
import { MonitoringLogger } from './logger';
import { MetricsManager } from './metrics';

/**
 * Health check interface
 */
export interface HealthCheck {
    name: string;
    status: 'healthy' | 'unhealthy' | 'degraded';
    responseTime: number;
    error?: string;
    details?: Record<string, any>;
}

/**
 * Overall health status
 */
export interface HealthStatus {
    status: 'healthy' | 'unhealthy' | 'degraded';
    timestamp: string;
    version?: string;
    environment: string;
    region: string;
    checks: HealthCheck[];
    responseTime: number;
}

/**
 * Health monitoring service
 */
export class HealthMonitor {
    private static logger = new MonitoringLogger('HealthMonitor');

    /**
     * Performs comprehensive health check
     */
    static async performHealthCheck(): Promise<HealthStatus> {
        const startTime = Date.now();
        const config = Config.environment;
        
        this.logger.info('Starting health check');

        try {
            // Run all health checks in parallel
            const [
                databaseCheck,
                websocketCheck,
                configCheck,
                memoryCheck
            ] = await Promise.allSettled([
                this.checkDatabase(),
                this.checkWebSocket(),
                this.checkConfiguration(),
                this.checkMemoryUsage()
            ]);

            const checks: HealthCheck[] = [
                this.extractHealthCheck(databaseCheck, 'database'),
                this.extractHealthCheck(websocketCheck, 'websocket'),
                this.extractHealthCheck(configCheck, 'configuration'),
                this.extractHealthCheck(memoryCheck, 'memory')
            ];

            const responseTime = Date.now() - startTime;
            const overallStatus = this.determineOverallStatus(checks);

            const healthStatus: HealthStatus = {
                status: overallStatus,
                timestamp: new Date().toISOString(),
                version: process.env.AWS_LAMBDA_FUNCTION_VERSION,
                environment: config.environment,
                region: config.region,
                checks,
                responseTime
            };

            // Record health check metrics
            await this.recordHealthMetrics(healthStatus);

            this.logger.info('Health check completed', {
                status: overallStatus,
                responseTime,
                checksCount: checks.length
            });

            return healthStatus;
        } catch (error) {
            this.logger.error('Health check failed', error);
            
            const responseTime = Date.now() - startTime;
            const healthStatus: HealthStatus = {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                environment: config.environment,
                region: config.region,
                checks: [{
                    name: 'health_check_system',
                    status: 'unhealthy',
                    responseTime,
                    error: error instanceof Error ? error.message : 'Unknown error'
                }],
                responseTime
            };

            await this.recordHealthMetrics(healthStatus);
            return healthStatus;
        }
    }

    /**
     * Checks database connectivity and performance
     */
    private static async checkDatabase(): Promise<HealthCheck> {
        const startTime = Date.now();
        
        try {
            const healthResult = await DatabaseConfig.healthCheck();
            const responseTime = Date.now() - startTime;

            return {
                name: 'database',
                status: healthResult.healthy ? 'healthy' : 'unhealthy',
                responseTime,
                error: healthResult.error,
                details: {
                    tablesConfigured: Object.keys(Config.tables).length,
                    region: Config.environment.region
                }
            };
        } catch (error) {
            const responseTime = Date.now() - startTime;
            return {
                name: 'database',
                status: 'unhealthy',
                responseTime,
                error: error instanceof Error ? error.message : 'Database check failed'
            };
        }
    }

    /**
     * Checks WebSocket service health
     */
    private static async checkWebSocket(): Promise<HealthCheck> {
        const startTime = Date.now();
        
        try {
            const healthResult = await WebSocketConfig.healthCheck();
            const responseTime = Date.now() - startTime;

            return {
                name: 'websocket',
                status: healthResult.healthy ? 'healthy' : 'unhealthy',
                responseTime,
                error: healthResult.error,
                details: {
                    endpoint: Config.ws.endpoint.endpoint,
                    region: Config.ws.endpoint.region
                }
            };
        } catch (error) {
            const responseTime = Date.now() - startTime;
            return {
                name: 'websocket',
                status: 'unhealthy',
                responseTime,
                error: error instanceof Error ? error.message : 'WebSocket check failed'
            };
        }
    }

    /**
     * Checks configuration validity
     */
    private static async checkConfiguration(): Promise<HealthCheck> {
        const startTime = Date.now();
        
        try {
            const config = Config.environment;
            const responseTime = Date.now() - startTime;

            // Basic configuration validation
            const issues: string[] = [];
            
            if (!config.cognito.userPoolId) issues.push('Missing Cognito User Pool ID');
            if (!config.tables.timers) issues.push('Missing timers table name');
            if (!config.tables.userConnections) issues.push('Missing user connections table name');
            if (!config.tables.sharedTimers) issues.push('Missing shared timers table name');

            const status = issues.length === 0 ? 'healthy' : 'degraded';

            return {
                name: 'configuration',
                status,
                responseTime,
                error: issues.length > 0 ? `Configuration issues: ${issues.join(', ')}` : undefined,
                details: {
                    environment: config.environment,
                    region: config.region,
                    logLevel: config.logLevel,
                    issuesCount: issues.length
                }
            };
        } catch (error) {
            const responseTime = Date.now() - startTime;
            return {
                name: 'configuration',
                status: 'unhealthy',
                responseTime,
                error: error instanceof Error ? error.message : 'Configuration check failed'
            };
        }
    }

    /**
     * Checks memory usage
     */
    private static async checkMemoryUsage(): Promise<HealthCheck> {
        const startTime = Date.now();
        
        try {
            const memoryUsage = process.memoryUsage();
            const responseTime = Date.now() - startTime;

            // Convert bytes to MB
            const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
            const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
            const externalMB = Math.round(memoryUsage.external / 1024 / 1024);

            // Define thresholds (adjust based on Lambda memory allocation)
            const warningThreshold = 80; // 80% of allocated memory
            const criticalThreshold = 90; // 90% of allocated memory
            
            // Estimate Lambda memory limit (this is approximate)
            const estimatedLimitMB = parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '1024');
            const usagePercentage = (heapUsedMB / estimatedLimitMB) * 100;

            let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
            let error: string | undefined;

            if (usagePercentage > criticalThreshold) {
                status = 'unhealthy';
                error = `Memory usage critical: ${usagePercentage.toFixed(1)}%`;
            } else if (usagePercentage > warningThreshold) {
                status = 'degraded';
                error = `Memory usage high: ${usagePercentage.toFixed(1)}%`;
            }

            return {
                name: 'memory',
                status,
                responseTime,
                error,
                details: {
                    heapUsedMB,
                    heapTotalMB,
                    externalMB,
                    usagePercentage: Math.round(usagePercentage),
                    estimatedLimitMB
                }
            };
        } catch (error) {
            const responseTime = Date.now() - startTime;
            return {
                name: 'memory',
                status: 'unhealthy',
                responseTime,
                error: error instanceof Error ? error.message : 'Memory check failed'
            };
        }
    }

    /**
     * Extracts health check from promise result
     */
    private static extractHealthCheck(
        result: PromiseSettledResult<HealthCheck>,
        fallbackName: string
    ): HealthCheck {
        if (result.status === 'fulfilled') {
            return result.value;
        } else {
            return {
                name: fallbackName,
                status: 'unhealthy',
                responseTime: 0,
                error: result.reason instanceof Error ? result.reason.message : 'Check failed'
            };
        }
    }

    /**
     * Determines overall status based on individual checks
     */
    private static determineOverallStatus(checks: HealthCheck[]): 'healthy' | 'unhealthy' | 'degraded' {
        const statuses = checks.map(check => check.status);
        
        if (statuses.includes('unhealthy')) {
            return 'unhealthy';
        }
        
        if (statuses.includes('degraded')) {
            return 'degraded';
        }
        
        return 'healthy';
    }

    /**
     * Records health check metrics
     */
    private static async recordHealthMetrics(healthStatus: HealthStatus): Promise<void> {
        try {
            // Record overall health metric
            await MetricsManager.publishMetric(
                'HealthStatus',
                healthStatus.status === 'healthy' ? 1 : 0,
                'Count',
                {
                    Environment: healthStatus.environment,
                    Status: healthStatus.status
                }
            );

            // Record health check response time
            await MetricsManager.publishMetric(
                'HealthCheckDuration',
                healthStatus.responseTime,
                'Milliseconds',
                {
                    Environment: healthStatus.environment
                }
            );

            // Record individual check metrics
            for (const check of healthStatus.checks) {
                await MetricsManager.publishMetric(
                    'HealthCheckStatus',
                    check.status === 'healthy' ? 1 : 0,
                    'Count',
                    {
                        Environment: healthStatus.environment,
                        CheckName: check.name,
                        Status: check.status
                    }
                );

                await MetricsManager.publishMetric(
                    'HealthCheckDuration',
                    check.responseTime,
                    'Milliseconds',
                    {
                        Environment: healthStatus.environment,
                        CheckName: check.name
                    }
                );
            }
        } catch (error) {
            this.logger.error('Failed to record health metrics', error);
        }
    }

    /**
     * Creates a simple health endpoint response
     */
    static createHealthResponse(healthStatus: HealthStatus) {
        const statusCode = healthStatus.status === 'healthy' ? 200 : 
                          healthStatus.status === 'degraded' ? 200 : 503;

        return {
            isBase64Encoded: false,
            statusCode,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            },
            body: JSON.stringify(healthStatus)
        };
    }
}
