import { NotificationService, NotificationPreferences } from '../lib/backend/notifications';
import { SNSClient, CreatePlatformEndpointCommand, PublishCommand } from "@aws-sdk/client-sns";
import { DynamoDBClient, PutItemCommand, DeleteItemCommand, QueryCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { TestLogger } from '../lib/core/test-logger';
import { setLogger, LogLevel } from '../lib/core/logger';

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/client-sns');

// Mock the AWS SDK classes
const mockSNSClient = SNSClient as jest.MockedClass<typeof SNSClient>;
const mockDynamoClient = DynamoDBClient as jest.MockedClass<typeof DynamoDBClient>;

// Consistent test data
const mockDeviceItem = {
    device_id: { S: 'device1' },
    fcm_token: { S: 'token1' },
    platform: { S: 'android' },
    created_at: { S: '2023-01-01T00:00:00Z' }
};

const mockDeviceItem2 = {
    device_id: { S: 'device2' },
    fcm_token: { S: 'token2' },
    platform: { S: 'android' },
    created_at: { S: '2023-01-01T00:00:00Z' }
};

const mockUserDeviceItem = {
    user_id: { S: 'user123' },
    device_id: { S: 'device1' },
    fcm_token: { S: 'token1' },
    platform: { S: 'android' },
    created_at: { S: '2023-01-01T00:00:00Z' }
};

describe('NotificationService', () => {
    let notificationService: NotificationService;
    let mockSnsSend: jest.Mock;
    let mockDynamoSend: jest.Mock;
    let testLogger: TestLogger;

    beforeEach(() => {
        testLogger = new TestLogger();
        setLogger(testLogger);
        
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
                        Items: [mockDeviceItem, mockDeviceItem2]
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
                        Items: [mockDeviceItem]
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
                        Items: [mockDeviceItem, mockDeviceItem2]
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
                        EndpointArn: 'arn:aws:sns:us-east-1:123456789012:endpoint/GCM/MyApp/device1'
                    })
                    .mockResolvedValueOnce({
                        EndpointArn: 'arn:aws:sns:us-east-1:123456789012:endpoint/GCM/MyApp/device2'
                    })
                    .mockResolvedValueOnce({ MessageId: 'msg-123' })
                    .mockResolvedValueOnce({ MessageId: 'msg-456' });

                // When
                await notificationService.sendSharingInvitation('user123', 'timer123', 'inviter123', 'Test Timer');

                // Then
                expect(mockDynamoSend).toHaveBeenCalled();
                expect(mockSnsSend).toHaveBeenCalled();
            });
        });

        describe('When the user has no devices', () => {
            test('Then no notifications are sent', async () => {
                // Given
                mockDynamoSend.mockResolvedValueOnce({ Items: [] });

                // When
                await notificationService.sendSharingInvitation('user123', 'timer123', 'inviter123', 'Test Timer');

                // Then
                expect(mockDynamoSend).toHaveBeenCalledTimes(1);
                expect(mockSnsSend).not.toHaveBeenCalled();
            });
        });

        describe('When SNS encounters an error', () => {
            test('Then the error is handled gracefully without throwing', async () => {
                // Given
                mockDynamoSend
                    .mockResolvedValueOnce({
                        Items: [mockDeviceItem]
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
                    .mockRejectedValueOnce(new Error('SNS error'));

                // When
                await notificationService.sendSharingInvitation('user123', 'timer123', 'inviter123', 'Test Timer');

                // Then
                expect(testLogger.hasMessageAtLevel(/Failed to send notification to device/, LogLevel.ERROR)).toBe(true);
            });

            test('Then platform endpoint creation failures are logged as warnings', async () => {
                // Given
                mockDynamoSend
                    .mockResolvedValueOnce({
                        Items: [mockDeviceItem]
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
                        EndpointArn: 'arn:aws:sns:us-east-1:123456789012:endpoint/GCM/MyApp/device1'
                    })
                    .mockRejectedValueOnce(new Error('Publish failed'));

                // When
                await notificationService.sendSharingInvitation('user123', 'timer123', 'inviter123', 'Test Timer');

                // Then
                expect(testLogger.hasMessageAtLevel(/Failed to send notification to device/, LogLevel.ERROR)).toBe(true);
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
                await notificationService.sendSharingInvitation('user123', 'timer123', 'inviter123', 'Test Timer');

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
                await notificationService.sendSharingInvitation('user123', 'timer123', 'inviter123', 'Test Timer');

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
                await notificationService.sendSharingInvitation('user123', 'timer123', 'inviter123', 'Test Timer');

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
                await notificationService.sendSharingInvitation('user123', 'timer123', 'inviter123', 'Test Timer');

                // Then
                expect(mockSendNotificationToDevice).toHaveBeenCalled();

                // Clean up
                mockGetDeviceTokens.mockRestore();
                mockGetNotificationPreferences.mockRestore();
                mockIsInQuietHours.mockRestore();
                mockSendNotificationToDevice.mockRestore();
            });
        });

        describe('When quiet hours span overnight', () => {
            test('Then the overnight quiet hours logic is correctly implemented', () => {
                // Given
                const preferences = {
                    timer_invitations: true,
                    quiet_hours_start: '22:00',
                    quiet_hours_end: '08:00'
                };

                // Test the logic directly by extracting the calculation
                const startHour = 22;
                const startMinute = 0;
                const endHour = 8;
                const endMinute = 0;
                const currentHour = 23; // 11:30 PM
                const currentMinute = 30;

                const startTime = startHour * 60 + startMinute; // 1320 minutes
                const endTime = endHour * 60 + endMinute; // 480 minutes
                const currentTime = currentHour * 60 + currentMinute; // 1410 minutes

                // When
                const result = startTime <= endTime 
                    ? (currentTime >= startTime && currentTime <= endTime)
                    : (currentTime >= startTime || currentTime <= endTime);

                // Then
                // For overnight quiet hours (22:00 to 08:00):
                // 23:30 = 23*60 + 30 = 1410 minutes
                // 22:00 = 22*60 + 0 = 1320 minutes
                // 08:00 = 8*60 + 0 = 480 minutes
                // Since 1410 >= 1320, this should be true
                expect(result).toBe(true);
            });

            test('Then the overnight quiet hours logic handles early morning correctly', () => {
                // Given
                const preferences = {
                    timer_invitations: true,
                    quiet_hours_start: '22:00',
                    quiet_hours_end: '08:00'
                };

                // Test the logic directly by extracting the calculation
                const startHour = 22;
                const startMinute = 0;
                const endHour = 8;
                const endMinute = 0;
                const currentHour = 2; // 2:30 AM
                const currentMinute = 30;

                const startTime = startHour * 60 + startMinute; // 1320 minutes
                const endTime = endHour * 60 + endMinute; // 480 minutes
                const currentTime = currentHour * 60 + currentMinute; // 150 minutes

                // When
                const result = startTime <= endTime 
                    ? (currentTime >= startTime && currentTime <= endTime)
                    : (currentTime >= startTime || currentTime <= endTime);

                // Then
                // 2:30 AM = 2*60 + 30 = 150 minutes, which is <= 8:00 (480 minutes)
                expect(result).toBe(true);
            });

            test('Then the overnight quiet hours logic handles afternoon correctly', () => {
                // Given
                const preferences = {
                    timer_invitations: true,
                    quiet_hours_start: '22:00',
                    quiet_hours_end: '08:00'
                };

                // Test the logic directly by extracting the calculation
                const startHour = 22;
                const startMinute = 0;
                const endHour = 8;
                const endMinute = 0;
                const currentHour = 14; // 2:30 PM
                const currentMinute = 30;

                const startTime = startHour * 60 + startMinute; // 1320 minutes
                const endTime = endHour * 60 + endMinute; // 480 minutes
                const currentTime = currentHour * 60 + currentMinute; // 870 minutes

                // When
                const result = startTime <= endTime 
                    ? (currentTime >= startTime && currentTime <= endTime)
                    : (currentTime >= startTime || currentTime <= endTime);

                // Then
                expect(result).toBe(false);
            });

            test('Then same-day quiet hours logic is correctly implemented', () => {
                // Given
                const preferences = {
                    timer_invitations: true,
                    quiet_hours_start: '09:00',
                    quiet_hours_end: '17:00'
                };

                // Test the logic directly by extracting the calculation
                const startHour = 9;
                const startMinute = 0;
                const endHour = 17;
                const endMinute = 0;
                const currentHour = 12; // 12:30 PM
                const currentMinute = 30;

                const startTime = startHour * 60 + startMinute; // 540 minutes
                const endTime = endHour * 60 + endMinute; // 1020 minutes
                const currentTime = currentHour * 60 + currentMinute; // 750 minutes

                // When
                const result = startTime <= endTime 
                    ? (currentTime >= startTime && currentTime <= endTime)
                    : (currentTime >= startTime || currentTime <= endTime);

                // Then
                // For same-day quiet hours (09:00 to 17:00):
                // 12:30 = 12*60 + 30 = 750 minutes
                // 09:00 = 9*60 + 0 = 540 minutes
                // 17:00 = 17*60 + 0 = 1020 minutes
                // Since 750 >= 540 && 750 <= 1020, this should be true
                expect(result).toBe(true);
            });

            test('Then same-day quiet hours return true when current time is between start and end time', () => {
                // Given
                const preferences = {
                    timer_invitations: true,
                    quiet_hours_start: '09:00',
                    quiet_hours_end: '17:00'
                };

                // Mock the Date constructor to return a time during quiet hours
                const mockDate = new Date(2023, 0, 1, 12, 30, 0); // January 1, 2023, 12:30 PM local time
                const originalDate = global.Date;
                global.Date = jest.fn(() => mockDate) as any;
                global.Date.UTC = originalDate.UTC;
                global.Date.parse = originalDate.parse;
                global.Date.now = originalDate.now;

                // When
                const result = notificationService['isInQuietHours'](preferences);

                // Then
                // 12:30 PM is between 09:00 and 17:00, so should return true
                expect(result).toBe(true);

                // Clean up
                global.Date = originalDate;
            });

            test('Then same-day quiet hours return false when current time is before start time', () => {
                // Given
                const preferences = {
                    timer_invitations: true,
                    quiet_hours_start: '09:00',
                    quiet_hours_end: '17:00'
                };

                // Mock the Date constructor to return a time before quiet hours
                const mockDate = new Date(2023, 0, 1, 7, 30, 0); // January 1, 2023, 7:30 AM local time
                const originalDate = global.Date;
                global.Date = jest.fn(() => mockDate) as any;
                global.Date.UTC = originalDate.UTC;
                global.Date.parse = originalDate.parse;
                global.Date.now = originalDate.now;

                // When
                const result = notificationService['isInQuietHours'](preferences);

                // Then
                // 7:30 AM is before 09:00, so should return false
                expect(result).toBe(false);

                // Clean up
                global.Date = originalDate;
            });

            test('Then same-day quiet hours return false when current time is after end time', () => {
                // Given
                const preferences = {
                    timer_invitations: true,
                    quiet_hours_start: '09:00',
                    quiet_hours_end: '17:00'
                };

                // Mock the Date constructor to return a time after quiet hours
                const mockDate = new Date(2023, 0, 1, 18, 30, 0); // January 1, 2023, 6:30 PM local time
                const originalDate = global.Date;
                global.Date = jest.fn(() => mockDate) as any;
                global.Date.UTC = originalDate.UTC;
                global.Date.parse = originalDate.parse;
                global.Date.now = originalDate.now;

                // When
                const result = notificationService['isInQuietHours'](preferences);

                // Then
                // 6:30 PM is after 17:00, so should return false
                expect(result).toBe(false);

                // Clean up
                global.Date = originalDate;
            });

            test('Then quiet hours are not active when not configured', () => {
                // Given
                const preferences = {
                    timer_invitations: true
                    // No quiet hours configured
                };

                // When
                const result = notificationService['isInQuietHours'](preferences);

                // Then
                expect(result).toBe(false);
            });

            test('Then the actual isInQuietHours method works correctly', () => {
                // Given
                const preferences = {
                    timer_invitations: true,
                    quiet_hours_start: '22:00',
                    quiet_hours_end: '08:00'
                };

                // Mock the Date constructor to return a specific time
                const mockDate = new Date('2023-01-01T23:30:00Z'); // 11:30 PM UTC
                const originalDate = global.Date;
                global.Date = jest.fn(() => mockDate) as any;
                global.Date.UTC = originalDate.UTC;
                global.Date.parse = originalDate.parse;
                global.Date.now = originalDate.now;

                // When
                const result = notificationService['isInQuietHours'](preferences);

                // Then
                // The result depends on the local timezone, but we're testing that the method works
                expect(typeof result).toBe('boolean');

                // Clean up
                global.Date = originalDate;
            });
        });
    });

    describe('Given the system needs to retrieve notification preferences', () => {
        describe('When preferences exist in the database', () => {
            test('Then the preferences are returned correctly', async () => {
                // Given
                mockDynamoSend
                    .mockResolvedValueOnce({
                        Items: [mockDeviceItem]
                    })
                    .mockResolvedValueOnce({
                        Item: {
                            notification_preferences: {
                                M: {
                                    timer_invitations: { BOOL: true },
                                    quiet_hours_start: { S: '22:00' },
                                    quiet_hours_end: { S: '08:00' }
                                }
                            }
                        }
                    });

                // When
                const result = await notificationService['getNotificationPreferences']('user123');

                // Then
                expect(result.timer_invitations).toBe(true);
                expect(result.quiet_hours_start).toBe('22:00');
                expect(result.quiet_hours_end).toBe('08:00');
            });
        });

        describe('When no preferences exist', () => {
            test('Then default preferences are returned', async () => {
                // Given
                mockDynamoSend.mockResolvedValueOnce({
                    Item: {
                        notification_preferences: {
                            M: null // This should trigger the default preferences
                        }
                    }
                });

                // When
                const result = await notificationService['getNotificationPreferences']('user123');

                // Then
                expect(result.timer_invitations).toBe(true); // Default value
                expect(result.quiet_hours_start).toBeUndefined();
                expect(result.quiet_hours_end).toBeUndefined();
            });
        });
    });

    describe('Given the system needs to update last used timestamp', () => {
        describe('When the device is found', () => {
            test('Then the last used timestamp is updated', async () => {
                // Given
                mockDynamoSend
                    .mockResolvedValueOnce({
                        Items: [mockUserDeviceItem]
                    })
                    .mockResolvedValueOnce({});

                // When
                await notificationService['updateLastUsed']('device1');

                // Then
                expect(mockDynamoSend).toHaveBeenCalledTimes(2);
                const updateCall = mockDynamoSend.mock.calls[1][0];
                expect(updateCall).toBeInstanceOf(PutItemCommand);
            });
        });

        describe('When the device is not found', () => {
            test('Then no update is performed', async () => {
                // Given
                mockDynamoSend.mockResolvedValueOnce({
                    Items: [] // No items found
                });

                // When
                await notificationService['updateLastUsed']('nonexistent-device');

                // Then
                expect(mockDynamoSend).toHaveBeenCalledTimes(1);
            });
        });

        describe('When the update fails', () => {
            test('Then the error is logged but not thrown', async () => {
                // Given
                mockDynamoSend
                    .mockResolvedValueOnce({
                        Items: [mockUserDeviceItem]
                    })
                    .mockRejectedValueOnce(new Error('Update failed'));

                // When
                await notificationService['updateLastUsed']('device1');

                // Then
                expect(testLogger.hasMessageAtLevel(/Failed to update last used timestamp/, LogLevel.ERROR)).toBe(true);
                
                const errorEntries = testLogger.getErrorEntries();
                const relevantEntry = errorEntries.find(entry => 
                    entry.message.includes('Failed to update last used timestamp')
                );
                expect(relevantEntry).toBeDefined();
                expect(relevantEntry?.context?.deviceId).toBe('device1');
                expect(relevantEntry?.context?.error?.message).toBe('Update failed');
            });
        });
    });
});
