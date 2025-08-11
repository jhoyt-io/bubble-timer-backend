# Timer Sharing Backend Creation Fix

## Problem
The backend was failing to share timers that only existed in the Android app's local database but not in the backend DynamoDB table. The error logs showed:

```
2025-08-11T18:00:34.748Z 556450b1-f88c-427a-9e4f-5a20aa3a2265 INFO {"timestamp":"2025-08-11T18:00:34.748Z","level":"ERROR","message":"Timer not found","context":{"operation":"database","databaseOperation":"shareTimerWithUsers","timerId":"8f6b3286-866a-4ed8-bb05-3013f8b4780a"},"functionName":"Beta-BubbleTimerBackend-apiC8550315-KHDtDtZoOx9R"}
```

## Root Cause
The `shareTimerWithUsers` function was trying to find the timer in the backend database using `getTimer(timerId)`, but the timer with ID `8f6b3286-866a-4ed8-bb05-3013f8b4780a` only existed locally in the Android app and had never been synced to the backend.

This can happen when:
1. The timer was created locally but the WebSocket connection wasn't established to sync it
2. The timer was created during a period when the backend was unavailable
3. There's a mismatch between the frontend and backend timer management

## Solution
Modified the timer sharing API to accept full timer data and create the timer in the backend if it doesn't exist.

### Backend Changes

#### 1. Enhanced `shareTimerWithUsers` Function (`lib/backend/timers.ts`)
- **Added optional `timerData` parameter**: Accepts timer data for backend creation
- **Timer creation logic**: If timer doesn't exist but timer data is provided, create it in the backend
- **Fallback behavior**: Still throws error if timer doesn't exist and no timer data provided

```typescript
async function shareTimerWithUsers(timerId: string, sharerUserId: string, targetUserIds: string[], timerData?: any): Promise<{
    success: string[];
    failed: string[];
}> {
    // Get timer details for notification
    let timer = await getTimer(timerId);
    
    // If timer doesn't exist but we have timer data, create it
    if (!timer && timerData) {
        logger.info('Timer not found in backend, creating from provided data', { timerId });
        try {
            timer = new Timer(
                timerData.id || timerId,
                timerData.userId || sharerUserId,
                timerData.name || 'Shared Timer',
                timerData.totalDuration || 'PT30M',
                timerData.remainingDuration,
                timerData.endTime
            );
            
            await updateTimer(timer);
            logger.info('Successfully created timer in backend', { timerId });
        } catch (error) {
            logger.error('Failed to create timer in backend', { timerId, error });
            throw new Error('Failed to create timer in backend');
        }
    }
    
    if (!timer) {
        logger.error('Timer not found and no timer data provided', { timerId });
        throw new Error('Timer not found');
    }
    
    // ... rest of sharing logic
}
```

#### 2. Updated API Handler (`lib/bubble-timer-backend-stack.api.ts`)
- **Enhanced request parsing**: Extract `timer` data from request body
- **Pass timer data**: Forward timer data to `shareTimerWithUsers` function

```typescript
const { timerId, userIds, timer } = body;
const result = await shareTimerWithUsers(timerId, cognitoUserName, userIds, timer);
```

### Frontend Changes

#### 1. Enhanced `ShareTimerRequest` Class (`app/src/main/java/io/jhoyt/bubbletimer/service/ApiService.java`)
- **Added `timer` field**: Map to store timer data for backend creation
- **New constructor**: Accepts timer data parameter

```java
class ShareTimerRequest {
    public String timerId;
    public List<String> userIds;
    public Map<String, Object> timer; // Timer data for backend creation if needed
    
    public ShareTimerRequest(String timerId, List<String> userIds, Map<String, Object> timer) {
        this.timerId = timerId;
        this.userIds = userIds;
        this.timer = timer;
    }
}
```

#### 2. Enhanced `TimerSharingService` (`app/src/main/java/io/jhoyt/bubbletimer/service/TimerSharingService.java`)
- **New overloaded method**: Accepts timer data parameter
- **Backward compatibility**: Original method calls new method with null timer data

```java
public void shareTimerWithUsers(String timerId, Set<String> userIds, Map<String, Object> timerData, SharingCallback callback) {
    // ... implementation with timer data
}
```

#### 3. Updated Sharing Logic (`app/src/main/java/io/jhoyt/bubbletimer/overlay/touch/TouchEventHandler.java`)
- **Timer data extraction**: Extract timer data from `TimerView`
- **Data mapping**: Map timer fields to backend-compatible format
- **API call**: Pass timer data to sharing service

```java
// Get the timer data to send to backend
Timer timer = timerView.getTimer();
Map<String, Object> timerData = new HashMap<>();
timerData.put("id", timer.getId());
timerData.put("userId", timer.getUserId());
timerData.put("name", timer.getName());
timerData.put("totalDuration", timer.getTotalDuration().toString());
if (timer.getRemainingDuration() != null) {
    timerData.put("remainingDuration", timer.getRemainingDuration().toString());
}
if (timer.getTimerEnd() != null) {
    timerData.put("endTime", timer.getTimerEnd().toString());
}

sharingService.shareTimerWithUsers(timerId, sharedWith, timerData, callback);
```

## Testing

### New Test Cases (`__tests__/timers.test.ts`)
Added comprehensive tests for the new functionality:

1. **Timer exists in backend**: Normal sharing flow
2. **Timer doesn't exist but timer data provided**: Backend creation + sharing
3. **Timer doesn't exist and no timer data**: Error handling

### Test Results
- ✅ All 121 tests passing
- ✅ New functionality properly tested
- ✅ Backward compatibility maintained

## API Changes

### Request Format
The `POST /timers/shared` endpoint now accepts an optional `timer` field:

```json
{
  "timerId": "timer123",
  "userIds": ["user1", "user2"],
  "timer": {
    "id": "timer123",
    "userId": "creator123",
    "name": "My Timer",
    "totalDuration": "PT30M",
    "remainingDuration": "PT15M",
    "endTime": "2024-01-01T12:30:00Z"
  }
}
```

### Response Format
Unchanged - still returns success/failure arrays:

```json
{
  "result": "shared",
  "success": ["user1", "user2"],
  "failed": []
}
```

## Benefits

1. **Resilient Sharing**: Timers can be shared even if they only exist locally
2. **Backward Compatibility**: Existing API calls continue to work
3. **Automatic Sync**: Local timers get synced to backend when shared
4. **Error Prevention**: Reduces "Timer not found" errors in production
5. **Better UX**: Users can share timers immediately without waiting for sync

## Deployment Notes

- **No breaking changes**: Existing API calls continue to work
- **Optional enhancement**: Timer data is optional in requests
- **Gradual adoption**: Frontend can be updated independently
- **Monitoring**: Watch for "Timer not found in backend, creating from provided data" logs

## Related Files
- `lib/backend/timers.ts` - Enhanced sharing function
- `lib/bubble-timer-backend-stack.api.ts` - Updated API handler
- `app/src/main/java/io/jhoyt/bubbletimer/service/ApiService.java` - Enhanced request class
- `app/src/main/java/io/jhoyt/bubbletimer/service/TimerSharingService.java` - Enhanced sharing service
- `app/src/main/java/io/jhoyt/bubbletimer/overlay/touch/TouchEventHandler.java` - Updated sharing logic
- `__tests__/timers.test.ts` - New test cases
