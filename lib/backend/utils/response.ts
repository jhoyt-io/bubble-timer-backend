/**
 * Utility functions for creating standardized API responses
 */
export class ResponseUtils {
    /**
     * Creates a successful API Gateway response
     */
    static success(data: any, statusCode: number = 200): any {
        return {
            isBase64Encoded: false,
            statusCode,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || 'http://localhost:4000',
                'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,PATCH,DELETE',
            },
            body: JSON.stringify(data)
        };
    }

    /**
     * Creates a successful WebSocket response
     */
    static websocketSuccess(data?: any, statusCode: number = 200): any {
        return {
            isBase64Encoded: false,
            statusCode,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || 'http://localhost:4000',
                'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,PATCH,DELETE',
            },
            body: data ? JSON.stringify(data) : '{}'
        };
    }

    /**
     * Creates a paginated response
     */
    static paginated(items: any[], totalCount?: number, nextToken?: string): any {
        return this.success({
            items,
            pagination: {
                count: items.length,
                ...(totalCount !== undefined && { totalCount }),
                ...(nextToken && { nextToken })
            }
        });
    }

    /**
     * Creates a response for created resources
     */
    static created(data: any): any {
        return this.success(data, 201);
    }

    /**
     * Creates a response for updated resources
     */
    static updated(data: any): any {
        return this.success(data, 200);
    }

    /**
     * Creates a response for deleted resources
     */
    static deleted(): any {
        return this.success({ message: 'Resource deleted successfully' }, 204);
    }

    /**
     * Creates a health check response
     */
    static health(status: 'healthy' | 'unhealthy' = 'healthy', checks?: Record<string, any>): any {
        const statusCode = status === 'healthy' ? 200 : 503;
        return this.success({
            status,
            timestamp: new Date().toISOString(),
            ...(checks && { checks })
        }, statusCode);
    }

    /**
     * Creates a timer response with metadata
     */
    static timerResponse(timer: any, metadata?: Record<string, any>): any {
        return this.success({
            timer,
            ...(metadata && { metadata })
        });
    }

    /**
     * Creates a connection response
     */
    static connectionResponse(connection: any, message?: string): any {
        return this.success({
            connection,
            ...(message && { message })
        });
    }

    /**
     * Creates a WebSocket message response
     */
    static websocketMessage(type: string, data: any, messageId?: string): any {
        return {
            type,
            data,
            timestamp: new Date().toISOString(),
            ...(messageId && { messageId })
        };
    }

    /**
     * Creates an acknowledgment response for WebSocket
     */
    static acknowledgment(messageId: string, success: boolean = true): any {
        return this.websocketMessage('acknowledge', {
            messageId,
            success,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Creates a ping response for WebSocket
     */
    static pong(originalTimestamp?: string): any {
        return this.websocketMessage('pong', {
            timestamp: originalTimestamp || new Date().toISOString(),
            serverTimestamp: new Date().toISOString()
        });
    }
}
