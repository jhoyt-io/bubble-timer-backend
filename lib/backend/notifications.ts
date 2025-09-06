import { SNSClient, CreatePlatformEndpointCommand, DeleteEndpointCommand, PublishCommand } from "@aws-sdk/client-sns";
import { DynamoDBClient, PutItemCommand, DeleteItemCommand, QueryCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { createDatabaseLogger } from '../core/logger';

export interface NotificationPreferences {
    timer_invitations: boolean;
    quiet_hours_start?: string;
    quiet_hours_end?: string;
}

export interface NotificationPayload {
    title: string;
    body: string;
    data: {
        timerId: string;
        action: 'accept' | 'decline';
        sharerName: string;
        timerName: string;
        sharerAvatarUrl?: string;
    };
    priority: 'high';
    sound: true;
    vibration: true;
}

export class NotificationService {
    private snsClient: SNSClient;
    private dynamoClient: DynamoDBClient;
    private logger = createDatabaseLogger('NotificationService');

    constructor() {
        this.snsClient = new SNSClient({ region: "us-east-1" });
        this.dynamoClient = new DynamoDBClient({ region: "us-east-1" });
    }

    /**
     * Send timer sharing invitation notification
     */
    async sendSharingInvitation(
        targetUserId: string,
        timerId: string,
        sharerName: string,
        timerName: string,
        sharerAvatarUrl?: string
    ): Promise<void> {
        this.logger.info('Sending sharing invitation notification', {
            targetUserId,
            timerId,
            sharerName,
            timerName,
            sharerAvatarUrl
        });

        try {
            // Get all device tokens for the target user
            const deviceTokens = await this.getDeviceTokens(targetUserId);
            
            if (deviceTokens.length === 0) {
                this.logger.warn('No device tokens found for user', { targetUserId });
                return;
            }

            // Check notification preferences
            const preferences = await this.getNotificationPreferences(targetUserId);
            if (!preferences.timer_invitations) {
                this.logger.info('User has disabled timer invitation notifications', { targetUserId });
                return;
            }

            // Check quiet hours
            if (this.isInQuietHours(preferences)) {
                this.logger.info('Notification blocked due to quiet hours', { targetUserId });
                return;
            }

            // Send notification to all user devices
            const notificationPromises = deviceTokens.map(deviceToken =>
                this.sendNotificationToDevice(deviceToken, {
                    title: `Timer Invitation`,
                    body: `${sharerName} invited you to join timer "${timerName}"`,
                    data: {
                        timerId,
                        action: 'accept',
                        sharerName,
                        timerName,
                        sharerAvatarUrl: sharerAvatarUrl || ''
                    },
                    priority: 'high',
                    sound: true,
                    vibration: true
                })
            );

            const results = await Promise.allSettled(notificationPromises);
            const failures = results.filter(r => r.status === 'rejected');
            if (failures.length > 0) {
                this.logger.warn('Some notifications failed', { failures });
            }

            this.logger.info('Sharing invitation notifications sent', {
                targetUserId,
                timerId,
                deviceCount: deviceTokens.length
            });

        } catch (error) {
            this.logger.error('Failed to send sharing invitation notification', {
                targetUserId,
                timerId,
                error
            });
            throw error;
        }
    }

    /**
     * Register device token for user
     */
    async registerDeviceToken(userId: string, deviceId: string, fcmToken: string): Promise<void> {
        this.logger.info('Registering device token', { userId, deviceId });

        try {
            // Store device token in DynamoDB
            const command = new PutItemCommand({
                TableName: process.env.DEVICE_TOKENS_TABLE_NAME,
                Item: {
                    user_id: { S: userId },
                    device_id: { S: deviceId },
                    fcm_token: { S: fcmToken },
                    platform: { S: 'android' },
                    created_at: { S: new Date().toISOString() },
                    last_used: { S: new Date().toISOString() },
                    notification_preferences: {
                        M: {
                            timer_invitations: { BOOL: true }
                        }
                    }
                }
            });

            await this.dynamoClient.send(command);
            this.logger.info('Device token registered successfully', { userId, deviceId });

        } catch (error) {
            this.logger.error('Failed to register device token', { userId, deviceId, error });
            throw error;
        }
    }

    /**
     * Remove device token
     */
    async removeDeviceToken(userId: string, deviceId: string): Promise<void> {
        this.logger.info('Removing device token', { userId, deviceId });

        try {
            const command = new DeleteItemCommand({
                TableName: process.env.DEVICE_TOKENS_TABLE_NAME,
                Key: {
                    user_id: { S: userId },
                    device_id: { S: deviceId }
                }
            });

            await this.dynamoClient.send(command);
            this.logger.info('Device token removed successfully', { userId, deviceId });

        } catch (error) {
            this.logger.error('Failed to remove device token', { userId, deviceId, error });
            throw error;
        }
    }

    /**
     * Update notification preferences
     */
    async updatePreferences(userId: string, preferences: NotificationPreferences): Promise<void> {
        this.logger.info('Updating notification preferences', { userId, preferences });

        try {
            // Get existing device tokens to update all of them
            const deviceTokens = await this.getDeviceTokens(userId);
            
            const updatePromises = deviceTokens.map(deviceToken => {
                const command = new PutItemCommand({
                    TableName: process.env.DEVICE_TOKENS_TABLE_NAME,
                    Item: {
                        user_id: { S: userId },
                        device_id: { S: deviceToken.deviceId },
                        fcm_token: { S: deviceToken.fcmToken },
                        platform: { S: deviceToken.platform },
                        created_at: { S: deviceToken.createdAt },
                        last_used: { S: new Date().toISOString() },
                        notification_preferences: {
                            M: {
                                timer_invitations: { BOOL: preferences.timer_invitations },
                                ...(preferences.quiet_hours_start && {
                                    quiet_hours_start: { S: preferences.quiet_hours_start }
                                }),
                                ...(preferences.quiet_hours_end && {
                                    quiet_hours_end: { S: preferences.quiet_hours_end }
                                })
                            }
                        }
                    }
                });

                return this.dynamoClient.send(command);
            });

            await Promise.all(updatePromises);
            this.logger.info('Notification preferences updated successfully', { userId });

        } catch (error) {
            this.logger.error('Failed to update notification preferences', { userId, error });
            throw error;
        }
    }

    /**
     * Get all device tokens for a user
     */
    private async getDeviceTokens(userId: string): Promise<Array<{
        deviceId: string;
        fcmToken: string;
        platform: string;
        createdAt: string;
    }>> {
        const command = new QueryCommand({
            TableName: process.env.DEVICE_TOKENS_TABLE_NAME,
            KeyConditionExpression: "user_id = :userId",
            ExpressionAttributeValues: {
                ":userId": { S: userId }
            }
        });

        const result = await this.dynamoClient.send(command);
        
        return (result.Items || []).map(item => ({
            deviceId: item.device_id.S!,
            fcmToken: item.fcm_token.S!,
            platform: item.platform.S!,
            createdAt: item.created_at.S!
        }));
    }

    /**
     * Get notification preferences for a user
     */
    private async getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
        const deviceTokens = await this.getDeviceTokens(userId);
        
        if (deviceTokens.length === 0) {
            return { timer_invitations: true }; // Default preferences
        }

        // Get preferences from the first device (they should be synchronized)
        const command = new GetItemCommand({
            TableName: process.env.DEVICE_TOKENS_TABLE_NAME,
            Key: {
                user_id: { S: userId },
                device_id: { S: deviceTokens[0].deviceId }
            }
        });

        const result = await this.dynamoClient.send(command);
        const preferences = result.Item?.notification_preferences?.M;

        if (!preferences) {
            return { timer_invitations: true }; // Default preferences
        }

        return {
            timer_invitations: preferences.timer_invitations?.BOOL ?? true,
            quiet_hours_start: preferences.quiet_hours_start?.S,
            quiet_hours_end: preferences.quiet_hours_end?.S
        };
    }

    /**
     * Check if current time is within quiet hours
     */
    private isInQuietHours(preferences: NotificationPreferences): boolean {
        if (!preferences.quiet_hours_start || !preferences.quiet_hours_end) {
            return false;
        }

        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes(); // Minutes since midnight

        const [startHour, startMinute] = preferences.quiet_hours_start.split(':').map(Number);
        const [endHour, endMinute] = preferences.quiet_hours_end.split(':').map(Number);
        
        const startTime = startHour * 60 + startMinute;
        const endTime = endHour * 60 + endMinute;

        if (startTime <= endTime) {
            // Same day quiet hours (e.g., 22:00 to 08:00)
            return currentTime >= startTime && currentTime <= endTime;
        } else {
            // Overnight quiet hours (e.g., 22:00 to 08:00)
            return currentTime >= startTime || currentTime <= endTime;
        }
    }

    /**
     * Send notification to a specific device
     */
    private async sendNotificationToDevice(
        deviceToken: { deviceId: string; fcmToken: string; platform: string },
        payload: NotificationPayload
    ): Promise<void> {
        try {
            // Create platform endpoint for the device
            const createEndpointCommand = new CreatePlatformEndpointCommand({
                PlatformApplicationArn: process.env.SNS_PLATFORM_APPLICATION_ARN,
                Token: deviceToken.fcmToken,
                CustomUserData: deviceToken.deviceId
            });

            const endpointResult = await this.snsClient.send(createEndpointCommand);
            const endpointArn = endpointResult.EndpointArn;

            if (!endpointArn) {
                throw new Error('Failed to create platform endpoint');
            }

            // Prepare FCM message
            const fcmMessage = {
                notification: {
                    title: payload.title,
                    body: payload.body
                },
                data: {
                    timerId: payload.data.timerId,
                    action: payload.data.action,
                    sharerName: payload.data.sharerName,
                    timerName: payload.data.timerName
                },
                priority: payload.priority,
                sound: payload.sound,
                vibration: payload.vibration
            };

            // Publish to SNS endpoint
            const publishCommand = new PublishCommand({
                TargetArn: endpointArn,
                Message: JSON.stringify({
                    default: payload.body,
                    GCM: JSON.stringify(fcmMessage)
                }),
                MessageStructure: 'json'
            });

            await this.snsClient.send(publishCommand);
            
            // Update last used timestamp
            await this.updateLastUsed(deviceToken.deviceId);

            this.logger.info('Notification sent successfully', {
                deviceId: deviceToken.deviceId,
                endpointArn
            });

        } catch (error) {
            this.logger.error('Failed to send notification to device', {
                deviceId: deviceToken.deviceId,
                error
            });
            throw error;
        }
    }

    /**
     * Update last used timestamp for device token
     */
    private async updateLastUsed(deviceId: string): Promise<void> {
        try {
            // First get the user_id for this device
            const queryCommand = new QueryCommand({
                TableName: process.env.DEVICE_TOKENS_TABLE_NAME,
                IndexName: 'DeviceIdIndex',
                KeyConditionExpression: "device_id = :deviceId",
                ExpressionAttributeValues: {
                    ":deviceId": { S: deviceId }
                }
            });

            const result = await this.dynamoClient.send(queryCommand);
            const item = result.Items?.[0];

            if (!item) {
                return;
            }

            // Update the last_used timestamp
            const updateCommand = new PutItemCommand({
                TableName: process.env.DEVICE_TOKENS_TABLE_NAME,
                Item: {
                    ...item,
                    last_used: { S: new Date().toISOString() }
                }
            });

            await this.dynamoClient.send(updateCommand);

        } catch (error) {
            this.logger.error('Failed to update last used timestamp', { deviceId, error });
        }
    }
}
