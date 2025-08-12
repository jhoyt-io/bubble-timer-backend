import { NotificationService, NotificationPreferences } from '../lib/backend/notifications';
import { SNSClient, CreatePlatformEndpointCommand, PublishCommand } from "@aws-sdk/client-sns";
import { DynamoDBClient, PutItemCommand, DeleteItemCommand, QueryCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/client-sns');
jest.mock('../lib/core/logger', () => ({
    createDatabaseLogger: jest.fn(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));

// Mock the AWS SDK classes
const mockSNSClient = SNSClient as jest.MockedClass<typeof SNSClient>;
const mockDynamoClient = DynamoDBClient as jest.MockedClass<typeof DynamoDBClient>;

describe('NotificationService', () => {
    let notificationService: NotificationService;
    let mockSnsSend: jest.Mock;
    let mockDynamoSend: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Setup environment variables
        process.env.DEVICE_TOKENS_TABLE_NAME = 'test-device-tokens-table';
        process.env.SNS_PLATFORM_APPLICATION_ARN = 'arn:aws:sns:us-east-1:123456789012:app/GCM/MyApp';
        
        // Setup mocks
        mockSnsSend = jest.fn();
        mockDynamoSend = jest.fn();
        
        // Mock the send method for both clients
        mockSNSClient.prototype.send = mockSnsSend;
        mockDynamoClient.prototype.send = mockDynamoSend;
        
        notificationService = new NotificationService();
    });

    afterEach(() => {
        delete process.env.DEVICE_TOKENS_TABLE_NAME;
        delete process.env.SNS_PLATFORM_APPLICATION_ARN;
    });

    describe('Given a new NotificationService instance', () => {
        describe('When creating the service', () => {
            test('Then AWS clients are initialized with correct configuration', () => {
                expect(notificationService).toBeInstanceOf(NotificationService);
                expect(mockSNSClient).toHaveBeenCalledWith({ region: "us-east-1" });
                expect(mockDynamoClient).toHaveBeenCalledWith({ region: "us-east-1" });
            });
        });
    });

    describe('Given a user wants to register a device token', () => {
        describe('When the registration succeeds', () => {
            test('Then the device token is stored in DynamoDB', async () => {
                // Given
                mockDynamoSend.mockResolvedValueOnce({});

                // When
                await notificationService.registerDeviceToken('user123', 'device456', 'fcm-token-789');

                // Then
                expect(mockDynamoSend).toHaveBeenCalledTimes(1);
                const callArgs = mockDynamoSend.mock.calls[0][0];
                expect(callArgs).toBeInstanceOf(PutItemCommand);
            });
        });

        describe('When the registration fails', () => {
            test('Then an error is thrown with the failure details', async () => {
                // Given
                const error = new Error('DynamoDB error');
                mockDynamoSend.mockRejectedValueOnce(error);

                // When & Then
                await expect(
                    notificationService.registerDeviceToken('user123', 'device456', 'fcm-token-789')
                ).rejects.toThrow('DynamoDB error');

                expect(mockDynamoSend).toHaveBeenCalled();
            });
        });
    });

    describe('Given a user wants to remove a device token', () => {
        describe('When the removal succeeds', () => {
            test('Then the device token is deleted from DynamoDB', async () => {
                // Given
                mockDynamoSend.mockResolvedValueOnce({});

                // When
                await notificationService.removeDeviceToken('user123', 'device456');

                // Then
                expect(mockDynamoSend).toHaveBeenCalledTimes(1);
                const callArgs = mockDynamoSend.mock.calls[0][0];
                expect(callArgs).toBeInstanceOf(DeleteItemCommand);
            });
        });

        describe('When the removal fails', () => {
            test('Then an error is thrown with the failure details', async () => {
                // Given
                const error = new Error('DynamoDB error');
                mockDynamoSend.mockRejectedValueOnce(error);

                // When & Then
                await expect(
                    notificationService.removeDeviceToken('user123', 'device456')
                ).rejects.toThrow('DynamoDB error');
            });
        });
    });

    describe('Given a user wants to update notification preferences', () => {
        describe('When the user has multiple devices', () => {
            test('Then preferences are updated for all devices', async () => {
                // Given
                mockDynamoSend
                    .mockResolvedValueOnce({
                        Items: [
                            {
                                device_id: { S: 'device1' },
                                fcm_token: { S: 'token1' },
                                platform: { S: 'android' },
                                created_at: { S: '2023-01-01T00:00:00Z' }
                            },
                            {
                                device_id: { S: 'device2' },
                                fcm_token: { S: 'token2' },
                                platform: { S: 'android' },
                                created_at: { S: '2023-01-01T00:00:00Z' }
                            }
                        ]
                    })
                    .mockResolvedValueOnce({}) // First PutItemCommand
                    .mockResolvedValueOnce({}); // Second PutItemCommand

                const preferences: NotificationPreferences = {
                    timer_invitations: false,
                    quiet_hours_start: '22:00',
                    quiet_hours_end: '08:00'
                };

                // When
                await notificationService.updatePreferences('user123', preferences);

                // Then
                expect(mockDynamoSend).toHaveBeenCalledTimes(3);
                
                // Check that PutItemCommand was called for updates
                const firstUpdateCall = mockDynamoSend.mock.calls[1][0];
                const secondUpdateCall = mockDynamoSend.mock.calls[2][0];
                expect(firstUpdateCall).toBeInstanceOf(PutItemCommand);
                expect(secondUpdateCall).toBeInstanceOf(PutItemCommand);
            });
        });

        describe('When the user has no devices', () => {
            test('Then no updates are performed', async () => {
                // Given
                mockDynamoSend.mockResolvedValueOnce({ Items: [] });

                const preferences: NotificationPreferences = {
                    timer_invitations: true
                };

                // When
                await notificationService.updatePreferences('user123', preferences);

                // Then
                expect(mockDynamoSend).toHaveBeenCalledTimes(1);
            });
        });

        describe('When the update fails', () => {
            test('Then an error is thrown with the failure details', async () => {
                // Given
                mockDynamoSend
                    .mockResolvedValueOnce({
                        Items: [
                            {
                                device_id: { S: 'device1' },
                                fcm_token: { S: 'token1' },
                                platform: { S: 'android' },
                                created_at: { S: '2023-01-01T00:00:00Z' }
                            }
                        ]
                    })
                    .mockRejectedValueOnce(new Error('Update failed'));

                const preferences: NotificationPreferences = {
                    timer_invitations: false
                };

                // When & Then
                await expect(
                    notificationService.updatePreferences('user123', preferences)
                ).rejects.toThrow('Update failed');
            });
        });
    });

    describe('Given a user receives a timer sharing invitation', () => {
        describe('When the user has registered devices and allows notifications', () => {
            test('Then a push notification is sent to all devices', async () => {
                // Given
                mockDynamoSend
                    .mockResolvedValueOnce({
                        Items: [
                            {
                                device_id: { S: 'device1' },
                                fcm_token: { S: 'token1' },
                                platform: { S: 'android' },
                                created_at: { S: '2023-01-01T00:00:00Z' }
                            }
                        ]
                    })
                    .mockResolvedValueOnce({
                        Item: {
                            notification_preferences: {
                                M: {
                                    timer_invitations: { BOOL: true }
                                }
                            }
                        }
                    })
                    .mockResolvedValueOnce({
                        Items: [
                            {
                                user_id: { S: 'user123' },
                                device_id: { S: 'device1' }
                            }
                        ]
                    })
                    .mockResolvedValueOnce({});

                mockSnsSend
                    .mockResolvedValueOnce({
                        EndpointArn: 'arn:aws:sns:us-east-1:123456789012:endpoint/GCM/MyApp/device1'
                    })
                    .mockResolvedValueOnce({});

                // When
                await notificationService.sendSharingInvitation(
                    'user123',
                    'timer456',
                    'John Doe',
                    'My Timer'
                );

                // Then
                expect(mockSnsSend).toHaveBeenCalledTimes(2);
                
                // Verify SNS endpoint creation
                const endpointCall = mockSnsSend.mock.calls[0][0];
                expect(endpointCall).toBeInstanceOf(CreatePlatformEndpointCommand);

                // Verify SNS publish
                const publishCall = mockSnsSend.mock.calls[1][0];
                expect(publishCall).toBeInstanceOf(PublishCommand);
            });
        });

        describe('When the user has no registered devices', () => {
            test('Then no notification is sent', async () => {
                // Given
                mockDynamoSend.mockResolvedValueOnce({ Items: [] });

                // When
                await notificationService.sendSharingInvitation(
                    'user123',
                    'timer456',
                    'John Doe',
                    'My Timer'
                );

                // Then
                expect(mockSnsSend).not.toHaveBeenCalled();
            });
        });

        describe('When the user has disabled timer invitations', () => {
            test('Then no notification is sent', async () => {
                // Given
                const mockGetDeviceTokens = jest.spyOn(notificationService as any, 'getDeviceTokens');
                const mockGetNotificationPreferences = jest.spyOn(notificationService as any, 'getNotificationPreferences');
                
                mockGetDeviceTokens.mockResolvedValue([
                    {
                        device_id: 'device1',
                        fcm_token: 'token1',
                        platform: 'android',
                        created_at: '2023-01-01T00:00:00Z'
                    }
                ]);
                
                mockGetNotificationPreferences.mockResolvedValue({
                    timer_invitations: false
                });

                // When
                await notificationService.sendSharingInvitation(
                    'user123',
                    'timer456',
                    'John Doe',
                    'My Timer'
                );

                // Then
                expect(mockSnsSend).not.toHaveBeenCalled();
                expect(mockGetDeviceTokens).toHaveBeenCalledWith('user123');
                expect(mockGetNotificationPreferences).toHaveBeenCalledWith('user123');
                
                // Clean up
                mockGetDeviceTokens.mockRestore();
                mockGetNotificationPreferences.mockRestore();
            });
        });

        describe('When the user is in quiet hours', () => {
            test('Then no notification is sent', async () => {
                // Given
                const mockGetDeviceTokens = jest.spyOn(notificationService as any, 'getDeviceTokens');
                const mockGetNotificationPreferences = jest.spyOn(notificationService as any, 'getNotificationPreferences');
                const mockIsInQuietHours = jest.spyOn(notificationService as any, 'isInQuietHours');
                
                mockGetDeviceTokens.mockResolvedValue([
                    {
                        device_id: 'device1',
                        fcm_token: 'token1',
                        platform: 'android',
                        created_at: '2023-01-01T00:00:00Z'
                    }
                ]);
                
                mockGetNotificationPreferences.mockResolvedValue({
                    timer_invitations: true,
                    quiet_hours_start: '22:00',
                    quiet_hours_end: '08:00'
                });
                
                mockIsInQuietHours.mockReturnValue(true);

                // When
                await notificationService.sendSharingInvitation(
                    'user123',
                    'timer456',
                    'John Doe',
                    'My Timer'
                );

                // Then
                expect(mockSnsSend).not.toHaveBeenCalled();
                expect(mockGetDeviceTokens).toHaveBeenCalledWith('user123');
                expect(mockGetNotificationPreferences).toHaveBeenCalledWith('user123');
                expect(mockIsInQuietHours).toHaveBeenCalled();
                
                // Clean up
                mockGetDeviceTokens.mockRestore();
                mockGetNotificationPreferences.mockRestore();
                mockIsInQuietHours.mockRestore();
            });
        });

        describe('When SNS encounters an error', () => {
            test('Then the error is handled gracefully without throwing', async () => {
                // Given
                mockDynamoSend
                    .mockResolvedValueOnce({
                        Items: [
                            {
                                device_id: { S: 'device1' },
                                fcm_token: { S: 'token1' },
                                platform: { S: 'android' },
                                created_at: { S: '2023-01-01T00:00:00Z' }
                            }
                        ]
                    })
                    .mockResolvedValueOnce({
                        Item: {
                            notification_preferences: {
                                M: {
                                    timer_invitations: { BOOL: true }
                                }
                            }
                        }
                    });

                mockSnsSend
                    .mockResolvedValueOnce({
                        EndpointArn: 'arn:aws:sns:us-east-1:123456789012:endpoint/GCM/MyApp/device1'
                    })
                    .mockRejectedValueOnce(new Error('SNS error'));

                // When & Then
                await expect(
                    notificationService.sendSharingInvitation(
                        'user123',
                        'timer456',
                        'John Doe',
                        'My Timer'
                    )
                ).resolves.toBeUndefined();

                expect(mockSnsSend).toHaveBeenCalled();
            });
        });
    });

    describe('Given a user has quiet hours configured', () => {
        describe('When the current time is during quiet hours', () => {
            test('Then notifications are blocked', async () => {
                // Given
                const mockGetDeviceTokens = jest.spyOn(notificationService as any, 'getDeviceTokens');
                const mockGetNotificationPreferences = jest.spyOn(notificationService as any, 'getNotificationPreferences');
                const mockIsInQuietHours = jest.spyOn(notificationService as any, 'isInQuietHours');
                
                mockGetDeviceTokens.mockResolvedValue([
                    {
                        device_id: 'device1',
                        fcm_token: 'token1',
                        platform: 'android',
                        created_at: '2023-01-01T00:00:00Z'
                    }
                ]);
                
                mockGetNotificationPreferences.mockResolvedValue({
                    timer_invitations: true,
                    quiet_hours_start: '22:00',
                    quiet_hours_end: '08:00'
                });
                
                mockIsInQuietHours.mockReturnValue(true);

                // When
                await notificationService.sendSharingInvitation(
                    'user123',
                    'timer456',
                    'John Doe',
                    'My Timer'
                );

                // Then
                expect(mockSnsSend).not.toHaveBeenCalled();

                // Clean up
                mockGetDeviceTokens.mockRestore();
                mockGetNotificationPreferences.mockRestore();
                mockIsInQuietHours.mockRestore();
            });
        });

        describe('When the current time is outside quiet hours', () => {
            test('Then notifications are allowed', async () => {
                // Given
                const mockGetDeviceTokens = jest.spyOn(notificationService as any, 'getDeviceTokens');
                const mockGetNotificationPreferences = jest.spyOn(notificationService as any, 'getNotificationPreferences');
                const mockIsInQuietHours = jest.spyOn(notificationService as any, 'isInQuietHours');
                const mockSendNotificationToDevice = jest.spyOn(notificationService as any, 'sendNotificationToDevice');
                
                mockGetDeviceTokens.mockResolvedValue([
                    {
                        device_id: 'device1',
                        fcm_token: 'token1',
                        platform: 'android',
                        created_at: '2023-01-01T00:00:00Z'
                    }
                ]);
                
                mockGetNotificationPreferences.mockResolvedValue({
                    timer_invitations: true,
                    quiet_hours_start: '22:00',
                    quiet_hours_end: '08:00'
                });
                
                mockIsInQuietHours.mockReturnValue(false);
                mockSendNotificationToDevice.mockResolvedValue(undefined);

                // When
                await notificationService.sendSharingInvitation(
                    'user123',
                    'timer456',
                    'John Doe',
                    'My Timer'
                );

                // Then
                expect(mockSendNotificationToDevice).toHaveBeenCalled();

                // Clean up
                mockGetDeviceTokens.mockRestore();
                mockGetNotificationPreferences.mockRestore();
                mockIsInQuietHours.mockRestore();
                mockSendNotificationToDevice.mockRestore();
            });
        });
    });

    describe('Given the system needs to retrieve device tokens', () => {
        describe('When the user has multiple devices', () => {
            test('Then all device tokens are returned', async () => {
                // Given
                mockDynamoSend.mockResolvedValueOnce({
                    Items: [
                        {
                            device_id: { S: 'device1' },
                            fcm_token: { S: 'token1' },
                            platform: { S: 'android' },
                            created_at: { S: '2023-01-01T00:00:00Z' }
                        },
                        {
                            device_id: { S: 'device2' },
                            fcm_token: { S: 'token2' },
                            platform: { S: 'ios' },
                            created_at: { S: '2023-01-02T00:00:00Z' }
                        }
                    ]
                });

                // When
                await notificationService.updatePreferences('user123', { timer_invitations: true });

                // Then
                expect(mockDynamoSend).toHaveBeenCalledTimes(3);
                const queryCall = mockDynamoSend.mock.calls[0][0];
                expect(queryCall).toBeInstanceOf(QueryCommand);
            });
        });

        describe('When the user has no devices', () => {
            test('Then an empty list is returned', async () => {
                // Given
                mockDynamoSend.mockResolvedValueOnce({ Items: [] });

                // When
                await notificationService.updatePreferences('user123', { timer_invitations: true });

                // Then
                expect(mockDynamoSend).toHaveBeenCalledTimes(1);
            });
        });

        describe('When DynamoDB returns an error', () => {
            test('Then the error is propagated', async () => {
                // Given
                mockDynamoSend.mockRejectedValueOnce(new Error('DynamoDB error'));

                // When & Then
                await expect(
                    notificationService.updatePreferences('user123', { timer_invitations: true })
                ).rejects.toThrow('DynamoDB error');
            });
        });
    });

    describe('Given the system needs to retrieve notification preferences', () => {
        describe('When the user has no devices', () => {
            test('Then default preferences are returned', async () => {
                // Given
                mockDynamoSend.mockResolvedValueOnce({ Items: [] });

                // When
                await notificationService.sendSharingInvitation(
                    'user123',
                    'timer456',
                    'John Doe',
                    'My Timer'
                );

                // Then
                expect(mockSnsSend).not.toHaveBeenCalled();
            });
        });

        describe('When the user has disabled timer invitations', () => {
            test('Then notifications are blocked', async () => {
                // Given
                const mockGetDeviceTokens = jest.spyOn(notificationService as any, 'getDeviceTokens');
                const mockGetNotificationPreferences = jest.spyOn(notificationService as any, 'getNotificationPreferences');
                
                mockGetDeviceTokens.mockResolvedValue([
                    {
                        device_id: 'device1',
                        fcm_token: 'token1',
                        platform: 'android',
                        created_at: '2023-01-01T00:00:00Z'
                    }
                ]);
                
                mockGetNotificationPreferences.mockResolvedValue({
                    timer_invitations: false
                });

                // When
                await notificationService.sendSharingInvitation(
                    'user123',
                    'timer456',
                    'John Doe',
                    'My Timer'
                );

                // Then
                expect(mockSnsSend).not.toHaveBeenCalled();
                
                // Clean up
                mockGetDeviceTokens.mockRestore();
                mockGetNotificationPreferences.mockRestore();
            });
        });

        describe('When no preferences are stored', () => {
            test('Then default preferences allow notifications', async () => {
                // Given
                mockDynamoSend
                    .mockResolvedValueOnce({
                        Items: [
                            {
                                device_id: { S: 'device1' },
                                fcm_token: { S: 'token1' },
                                platform: { S: 'android' },
                                created_at: { S: '2023-01-01T00:00:00Z' }
                            }
                        ]
                    })
                    .mockResolvedValueOnce({
                        Item: {} // No notification_preferences
                    })
                    .mockResolvedValueOnce({
                        Items: [
                            {
                                user_id: { S: 'user123' },
                                device_id: { S: 'device1' }
                            }
                        ]
                    })
                    .mockResolvedValueOnce({});

                mockSnsSend
                    .mockResolvedValueOnce({
                        EndpointArn: 'arn:aws:sns:us-east-1:123456789012:endpoint/GCM/MyApp/device1'
                    })
                    .mockResolvedValueOnce({});

                // When
                await notificationService.sendSharingInvitation(
                    'user123',
                    'timer456',
                    'John Doe',
                    'My Timer'
                );

                // Then
                expect(mockSnsSend).toHaveBeenCalled();
            });
        });

        describe('When DynamoDB returns an error', () => {
            test('Then the error is propagated', async () => {
                // Given
                mockDynamoSend
                    .mockResolvedValueOnce({
                        Items: [
                            {
                                device_id: { S: 'device1' },
                                fcm_token: { S: 'token1' },
                                platform: { S: 'android' },
                                created_at: { S: '2023-01-01T00:00:00Z' }
                            }
                        ]
                    })
                    .mockRejectedValueOnce(new Error('DynamoDB error'));

                // When & Then
                await expect(
                    notificationService.sendSharingInvitation(
                        'user123',
                        'timer456',
                        'John Doe',
                        'My Timer'
                    )
                ).rejects.toThrow('DynamoDB error');
            });
        });

        describe('When preferences are missing the timer_invitations field', () => {
            test('Then default preferences allow notifications', async () => {
                // Given
                mockDynamoSend
                    .mockResolvedValueOnce({
                        Items: [
                            {
                                device_id: { S: 'device1' },
                                fcm_token: { S: 'token1' },
                                platform: { S: 'android' },
                                created_at: { S: '2023-01-01T00:00:00Z' }
                            }
                        ]
                    })
                    .mockResolvedValueOnce({
                        Item: {
                            notification_preferences: {
                                M: {
                                    // No timer_invitations field
                                    quiet_hours_start: { S: '22:00' }
                                }
                            }
                        }
                    })
                    .mockResolvedValueOnce({
                        Items: [
                            {
                                user_id: { S: 'user123' },
                                device_id: { S: 'device1' }
                            }
                        ]
                    })
                    .mockResolvedValueOnce({});

                mockSnsSend
                    .mockResolvedValueOnce({
                        EndpointArn: 'arn:aws:sns:us-east-1:123456789012:endpoint/GCM/MyApp/device1'
                    })
                    .mockResolvedValueOnce({});

                // When
                await notificationService.sendSharingInvitation(
                    'user123',
                    'timer456',
                    'John Doe',
                    'My Timer'
                );

                // Then
                expect(mockSnsSend).toHaveBeenCalled();
            });
        });
    });
});
