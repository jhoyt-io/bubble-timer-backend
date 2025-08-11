# Push Notification Infrastructure Implementation

## Description
Implement push notification support for the Bubble Timer backend using Amazon Simple Notification Service (SNS) to provide seamless integration with the existing AWS ecosystem. This will enable push notifications for timer invitations, completions, and other important events without requiring external services like Firebase.

## Status
- [x] Not Started
- [x] In Progress
- [ ] Blocked
- [ ] Completed

**Current Phase**: Phase 4 (Timer Sharing Workflow) - 🔄 READY TO START
**Next Phase**: Phase 5 (Monitoring and Observability) - Not started

## Background
The current Bubble Timer app has a task for implementing push notifications using Firebase Cloud Messaging (FCM), but the backend is built entirely on AWS services. Adding Amazon SNS for push notifications provides better integration with the existing infrastructure and eliminates the need for external dependencies.

**Note**: The timer sharing backend issue has been resolved. The backend now accepts timer data and creates timers in the database if they don't exist, preventing "Timer not found" errors when sharing locally-created timers.

## Implementation Progress

### Phase 1: AWS SNS Infrastructure Setup (CDK-Driven) ✅ COMPLETED
- **Updated CDK Stack** (`bubble-timer-backend-stack.ts`)
  - ✅ Added SNS Topic for timer sharing notifications
  - ✅ Created IAM roles and policies for SNS publishing
  - ✅ Added environment variables for SNS configuration
  - ✅ Added `device_tokens` DynamoDB table with proper indexes
  - ✅ Created setup guide for manual Platform Application creation
- **Platform Application Setup** (Manual - see `docs/SNS_PLATFORM_APPLICATION_SETUP.md`)
  - ✅ Documentation for creating SNS Platform Application via AWS CLI/Console
  - ✅ FCM server key storage in AWS Parameter Store
  - ✅ Environment-specific setup for beta/prod
  - ✅ Platform Application ARNs configured for both environments

- **Device Token Management**
  - ✅ Created Lambda functions for token registration/cleanup
  - ✅ Integrated with existing user authentication flow
  - ✅ Implemented client-side encryption for FCM tokens (see Security section)

### Phase 2: Backend Notification Service ✅ COMPLETED
- **Created Notification Service**
  - ✅ Implemented `NotificationService` class in `lib/backend/notifications.ts`
  - ✅ Added methods for timer sharing invitations only
  - ✅ Implemented device token management (register/cleanup)

- **Enhanced Timer Sharing API**
  - ✅ Extended existing `POST /timers/shared` endpoint to accept timer sharing requests
  - ✅ Request body: `{ "timerId": "string", "userIds": ["user1", "user2"] }`
  - ✅ Replaced current WebSocket-based sharing with reliable REST API
  - ✅ Implemented proper shared timer record creation (only for non-owners)
  - ✅ Trigger push notification to invitees upon successful sharing
  - ✅ Return success/failure response for client retry logic

- **Integration Points**
  - ✅ Updated `lib/backend/timers.ts` to use new sharing API
  - ✅ Maintain existing WebSocket for real-time sync after acceptance
  - ✅ Added notification preferences to user settings

### Phase 3: Android App Integration ✅ COMPLETED
- **FCM Integration**
  - ✅ Added Firebase Cloud Messaging dependency
  - ✅ Implemented `BubbleTimerFirebaseMessagingService` for token management
  - ✅ Created notification channels for timer invitations

- **Token Registration Lifecycle**
  - ✅ **App Startup**: Register FCM token when user authenticates (in `MainActivity.onCreate()`)
  - ✅ **Token Refresh**: Handle FCM token refresh and re-register with backend
  - ✅ **App Uninstall**: No cleanup needed (tokens become invalid automatically)
  - ✅ **User Logout**: Remove device token from backend (via `NotificationManager`)
  - ✅ **Device ID**: Use existing `Secure.ANDROID_ID` for device identification

### Phase 4: Timer Sharing Workflow 🔄 READY TO START
**Focus**: Frontend Android app integration with existing backend infrastructure

**Acceptance Criteria**:
- [ ] **Push Notification Reception**: Android app receives push notification when timer is shared by another user
- [ ] **Rich Notification Actions**: Notification displays Accept/Decline action buttons
- [ ] **Deep Link Navigation**: When user taps notification body (not action buttons), app navigates to "SHARED" tab to show pending invitations
- [ ] **Accept/Decline Handling**: App processes Accept/Decline actions via existing REST API endpoints
- [ ] **Existing Flow Integration**: Reuse existing timer invitation acceptance/decline flow from "SHARED" tab
- [ ] **WebSocket Behavior**: Maintain existing WebSocket connection behavior (connects when shared timers active, disconnects when none active)

### Phase 5: Monitoring and Observability
- **CloudWatch Metrics**
  - [ ] Notification delivery success/failure rates
  - [ ] Token registration and cleanup metrics
  - [ ] User engagement with notifications
  - [ ] SNS delivery status tracking

- **Logging and Error Tracking**
  - [ ] Structured logs for notification events
  - [ ] Error tracking for failed deliveries
  - [ ] User preference change tracking
  - [ ] Notification delivery latency monitoring

- **Alerting**
  - [ ] High failure rate alerts for notification delivery
  - [ ] Token registration failure alerts
  - [ ] SNS service health monitoring

## Core Requirements

### Frontend Android App Focus
- **Scope**: Implement push notification handling in Android app using existing backend infrastructure
- **Backend Ready**: All backend infrastructure (SNS, notification service, API endpoints) is complete
- **Existing Flow**: Reuse existing timer invitation acceptance/decline flow from "SHARED" tab
- **WebSocket Behavior**: Maintain existing WebSocket connection behavior (no changes needed)

### Push Notification Strategy
- **Primary Use Case**: Timer sharing invitations only
- **WebSocket Strategy**: Keep WebSocket disconnected by default, only connect when user accepts shared timer
- **Real-time Sync**: Once timer is accepted, use existing WebSocket for real-time updates
- **Timer Completion**: Device handles timer completion natively, no push notification needed
- **Offline Support**: Push notifications ensure users receive sharing invitations even when offline

### Notification Flow
1. User A shares timer with User B (via existing REST API)
2. Backend sends push notification to User B (offline/online)
3. User B receives invitation notification with Accept/Decline action buttons
4. **Accept Action**: App calls existing REST API → WebSocket connects → Real-time sync begins
5. **Decline Action**: App calls existing REST API → Timer remains unshared, no WebSocket connection
6. **Notification Tap**: App navigates to "SHARED" tab to show pending invitations

## Implementation Plan

### Phase 1: AWS SNS Infrastructure Setup (CDK-Driven)
- **Update CDK Stack** (`bubble-timer-backend-stack.ts`)
  - Add SNS platform application for Android (FCM) using CDK constructs
  - Configure FCM server key via AWS Secrets Manager or Parameter Store
  - Create IAM roles and policies for SNS publishing
  - Add environment variables for SNS configuration
  - Add `device_tokens` DynamoDB table with proper indexes

- **Device Token Management**
  - Create Lambda functions for token registration/cleanup
  - Integrate with existing user authentication flow
  - Implement client-side encryption for FCM tokens (see Security section)

### Phase 2: Backend Notification Service
- **Create Notification Service**
  - Implement `NotificationService` class in `lib/backend/notifications.ts`
  - Add methods for timer sharing invitations only
  - Implement device token management (register/cleanup)

- **Enhanced Timer Sharing API**
  - Extend existing `POST /timers/shared` endpoint to accept timer sharing requests
  - Request body: `{ "timerId": "string", "userIds": ["user1", "user2"] }`
  - Replace current WebSocket-based sharing with reliable REST API
  - Implement proper shared timer record creation (only for non-owners)
  - Trigger push notification to invitees upon successful sharing
  - Return success/failure response for client retry logic

- **Integration Points**
  - Update `lib/backend/timers.ts` to use new sharing API
  - Maintain existing WebSocket for real-time sync after acceptance
  - Add notification preferences to user settings

### Phase 3: Android App Integration
- **FCM Integration**
  - Add Firebase Cloud Messaging dependency
  - Implement `FirebaseMessagingService` for token management
  - Create notification channels for different types

- **Token Registration Lifecycle**
  - **App Startup**: Register FCM token when user authenticates (in `MainActivity.onCreate()`)
  - **Token Refresh**: Handle FCM token refresh and re-register with backend
  - **App Uninstall**: No cleanup needed (tokens become invalid automatically)
  - **User Logout**: Remove device token from backend
  - **Device ID**: Use existing `Secure.ANDROID_ID` for device identification

### Phase 4: Timer Sharing Workflow
- **Timer Invitation Notifications**
  - **Push Notification Reception**: Android app receives push notification when timer is shared by another user
  - **Rich Notification Actions**: Notification displays Accept/Decline action buttons
  - **Deep Link Navigation**: When user taps notification body (not action buttons), app navigates to "SHARED" tab to show pending invitations
  - **Accept/Decline Handling**: App processes Accept/Decline actions via existing REST API endpoints
  - **Existing Flow Integration**: Reuse existing timer invitation acceptance/decline flow from "SHARED" tab
  - **WebSocket Behavior**: Maintain existing WebSocket connection behavior (connects when shared timers active, disconnects when none active)

### Phase 5: Monitoring and Observability
- **CloudWatch Metrics**
  - Notification delivery success/failure rates
  - Token registration and cleanup metrics
  - User engagement with notifications
  - SNS delivery status tracking

- **Logging and Error Tracking**
  - Structured logs for notification events
  - Error tracking for failed deliveries
  - User preference change tracking
  - Notification delivery latency monitoring

- **Alerting**
  - High failure rate alerts for notification delivery
  - Token registration failure alerts
  - SNS service health monitoring

## Technical Architecture

### AWS Services Used
- **Amazon SNS**: Push notification delivery
- **Firebase Cloud Messaging**: Android notification transport
- **DynamoDB**: Device token storage and notification preferences
- **Lambda**: Notification processing and delivery
- **Cognito**: User authentication and device association

### Database Schema Extensions

**Device Tokens Table**
```
Partition Key: user_id (String)
Sort Key: device_id (String)
Attributes:
- fcm_token (String) - Firebase Cloud Messaging token
- platform (String) - "android" (future: "ios")
- created_at (String) - Token registration timestamp
- last_used (String) - Last successful notification timestamp
- notification_preferences (Map) - User notification settings
```

**Notification Preferences**
```json
{
  "timer_invitations": true,
  "quiet_hours_start": "22:00",
  "quiet_hours_end": "08:00"
}
```

### Notification Service API

```typescript
interface NotificationService {
  // Send timer sharing invitation notification
  sendSharingInvitation(
    targetUserId: string, 
    timerId: string, 
    sharerName: string, 
    timerName: string
  ): Promise<void>;
  
  // Register device token for user
  registerDeviceToken(userId: string, deviceId: string, fcmToken: string): Promise<void>;
  
  // Remove device token
  removeDeviceToken(userId: string, deviceId: string): Promise<void>;
  
  // Update notification preferences
  updatePreferences(userId: string, preferences: NotificationPreferences): Promise<void>;
}

interface NotificationPayload {
  title: string;
  body: string;
  data: {
    timerId: string;
    action: 'accept' | 'decline';
    sharerName: string;
    timerName: string;
  };
  priority: 'high';
  sound: true;
  vibration: true;
}
```

## Integration with Existing Systems

### WebSocket Strategy
- **Default State**: WebSocket disconnected to conserve resources
- **Connection Trigger**: Only connect when user accepts shared timer invitation
- **Real-time Sync**: Use existing WebSocket for timer updates after acceptance
- **Disconnection**: Disconnect when no shared timers are active

### Timer Sharing Workflow (Updated)
1. User A calls `POST /timers/shared` with `{ "timerId": "timer123", "userIds": ["userB", "userC"] }`
2. Backend validates permissions and creates shared timer records for each target user
3. Backend sends push notification to each invitee's devices
4. Each invitee receives invitation notification with Accept/Decline actions
5. If invitee accepts → WebSocket connects → Real-time sync begins
6. If invitee declines → Timer remains unshared for that user, no WebSocket connection

### API Endpoints
- `POST /timers/shared` - Share timer with users (synchronous)
  - Body: `{ "timerId": "string", "userIds": ["user1", "user2"] }`
- `DELETE /timers/shared` - Decline shared timer invitation (existing)
  - Body: `{ "timerId": "string" }`
- `POST /device-tokens` - Register FCM token for user
  - Body: `{ "deviceId": "string", "fcmToken": "string" }`
- `DELETE /device-tokens/{deviceId}` - Remove FCM token

## Alternative Approaches Considered

### Firebase Cloud Messaging (FCM) Direct
- **Pros**: Industry standard, extensive documentation
- **Cons**: Requires external service, additional complexity
- **Decision**: Not chosen due to AWS ecosystem preference

### Amazon Pinpoint
- **Pros**: Advanced analytics, user segmentation
- **Cons**: Overkill for simple push notifications, higher cost
- **Decision**: SNS provides sufficient functionality at lower cost

### WebSocket-Only Notifications
- **Pros**: Real-time, no additional services
- **Cons**: No offline support, unreliable delivery
- **Decision**: Push notifications provide better reliability and offline support

## Testing Strategy

### Unit Tests
- `NotificationService` methods and error handling
- Device token management and cleanup
- Notification preference validation

### Integration Tests
- End-to-end notification delivery
- Token registration and cleanup workflows
- Notification preference updates

### Manual Testing
- Push notification delivery on various Android versions
- Offline notification behavior
- Notification interaction testing

## Security Considerations

### Token Security
- **Client-side Encryption**: Encrypt FCM tokens before storing in DynamoDB
- **AWS KMS Integration**: Use AWS KMS for encryption key management
- **Token Validation**: Validate token ownership before sending notifications
- **Token Rotation**: Implement automatic token refresh and cleanup
- **Best Practices**: Follow AWS SNS security guidelines for server-side encryption

### User Privacy
- Respect notification preferences
- Implement quiet hours functionality
- Allow users to opt out of specific notification types

### Rate Limiting
- Implement notification rate limiting per user
- Prevent notification spam
- Monitor and alert on unusual notification patterns

## Performance Considerations

### SNS Optimization
- Batch notifications when possible
- Use SNS message attributes for filtering
- Implement retry logic for failed deliveries

### DynamoDB Optimization
- Use efficient queries for device token lookups
- Implement TTL for stale tokens
- Optimize notification preference queries

## Monitoring and Observability

*See Phase 5 for detailed monitoring and observability implementation.*

## Deployment Strategy

### Infrastructure Changes
- Deploy SNS platform application
- Update Lambda function permissions
- Add new DynamoDB tables

### Application Updates
- Deploy updated Lambda functions
- Update Android app with FCM integration
- Gradual rollout with feature flags

## Success Metrics

### Technical Metrics
- Notification delivery success rate > 95%
- Token registration success rate > 98%
- Average notification delivery time < 5 seconds

### User Engagement Metrics
- Notification open rates
- User preference adoption
- Reduction in missed timer completions

## Notes / Updates
- [2025-01-08] - Initial task created based on AWS ecosystem analysis
- SNS chosen over FCM direct integration for better AWS integration
- Coordinated with existing Android push notification task
- Backend-first approach to establish infrastructure before app integration
- [2025-01-08] - Updated to focus on timer sharing invitations only
- Removed timer completion notifications (device handles natively)
- Enhanced existing `/timers/shared` endpoint for synchronous timer sharing
- Clarified WebSocket strategy: disconnected by default, connect only after acceptance
- Enhanced security with client-side encryption and AWS KMS integration
- [2025-01-08] - Refined API design to reuse existing `/timers/shared` endpoint
- Clarified device token lifecycle: register on auth, refresh on token change, no cleanup on uninstall
- Use existing `Secure.ANDROID_ID` for device identification
- [2025-01-08] - Moved monitoring and observability to Phase 5 for better system health visibility
- [2025-01-08] - Platform Application ARNs configured:
  - Beta: `arn:aws:sns:us-east-1:897729117121:app/GCM/BubbleTimer-Beta`
  - Prod: `arn:aws:sns:us-east-1:586794474099:app/GCM/BubbleTimer-Prod`
- [2025-01-08] - Phase 3 Android App Integration completed:
  - Added Firebase Cloud Messaging dependencies and Google Services plugin
  - Created `BubbleTimerFirebaseMessagingService` for FCM token management
  - Implemented `FcmTokenManager` for backend token registration
  - Added FCM token registration to `MainActivity` on user authentication
  - Created notification channels for timer invitations
  - Added Firebase configuration and setup documentation
  - Fixed pre-existing test logic bugs (not regressions from our changes)
  - ✅ **VERIFIED**: Device successfully registered FCM token with backend
  - ✅ **VERIFIED**: All 330 tests passing
  - ✅ **READY**: Infrastructure foundation complete for Phase 4 implementation

## Related Files
- `lib/bubble-timer-backend-stack.ts` - Infrastructure updates
- `lib/backend/timers.ts` - Timer operation integration
- `lib/backend/connections.ts` - WebSocket integration
- `tasks/active/PUSH_NOTIFICATIONS_AND_ACKNOWLEDGMENT_MODEL.md` - Android app task
- `docs/ARCHITECTURE.md` - System integration guidelines
