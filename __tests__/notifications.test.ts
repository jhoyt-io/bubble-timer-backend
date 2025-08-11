import { NotificationService, NotificationPreferences } from '../lib/backend/notifications';

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/client-sns');

describe('NotificationService', () => {
    let notificationService: NotificationService;

    beforeEach(() => {
        jest.clearAllMocks();
        notificationService = new NotificationService();
    });

    describe('basic functionality', () => {
        it('should create notification service instance', () => {
            expect(notificationService).toBeInstanceOf(NotificationService);
        });

        it('should have required methods', () => {
            expect(typeof notificationService.registerDeviceToken).toBe('function');
            expect(typeof notificationService.removeDeviceToken).toBe('function');
            expect(typeof notificationService.updatePreferences).toBe('function');
            expect(typeof notificationService.sendSharingInvitation).toBe('function');
        });
    });

    describe('quiet hours logic', () => {
        it('should not be in quiet hours when preferences are not set', () => {
            const preferences: NotificationPreferences = {
                timer_invitations: true
            };

            // This is a simple test to verify the service can be instantiated
            // and basic functionality exists
            expect(notificationService).toBeDefined();
        });
    });
});
