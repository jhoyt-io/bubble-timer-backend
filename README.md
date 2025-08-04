# Bubble Timer Backend

This is the backend infrastructure for the Bubble Timer app, built with AWS CDK and TypeScript.

## Features

- **REST API**: Timer management endpoints with Cognito authentication
- **WebSocket API**: Real-time timer updates and sharing
- **DynamoDB**: Scalable timer storage with efficient querying
- **Shared Timers**: New feature for discovering and managing shared timers

## Development

### Prerequisites

- Node.js 18+
- AWS CLI configured
- AWS CDK installed globally

### Setup

```bash
npm install
```

### Building

```bash
npm run build
```

### Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Build and test
npm run build:test
```

### Deployment

```bash
# Deploy to AWS
cdk deploy
```

## API Endpoints

### Timer Management
- `GET /timers/{timer}` - Get a specific timer
- `POST /timers/{timer}` - Update a timer

### Shared Timers (New)
- `GET /timers/shared` - Get all timers shared with the authenticated user

## Database Schema

### Main Timers Table
- `id` (partition key) - Timer identifier
- `user_id` - Owner of the timer
- `name` - Timer name
- `total_duration` - Total duration in seconds
- `remaining_duration` - Remaining time when paused
- `end_time` - Expected end time
- `shared_with` - Set of usernames the timer is shared with

### Shared Timers Table (New)
- `shared_with_user` (partition key) - Username receiving the shared timer
- `timer_id` (sort key) - Timer identifier
- `created_at` - When the relationship was created

### User Connections Table
- `user_id` (partition key) - Cognito username
- `device_id` (sort key) - Device identifier
- `connection_id` - WebSocket connection ID

## Testing

The project includes comprehensive tests covering:

- **API Endpoints**: All REST API functionality
- **Database Operations**: Timer CRUD operations and shared timer queries
- **Error Handling**: Edge cases and error scenarios
- **Authentication**: Cognito integration

### Test Structure

```
__tests__/
├── api.test.ts      # API endpoint tests
└── timers.test.ts   # Database operation tests
```

### Running Tests

```bash
# All tests
npm test

# Specific test file
npm test -- api.test.ts

# With coverage
npm run test:coverage
```

## Architecture

- **API Gateway**: REST and WebSocket APIs
- **Lambda Functions**: Serverless compute for API and WebSocket handlers
- **DynamoDB**: NoSQL database for timer storage
- **Cognito**: User authentication and authorization
- **CDK**: Infrastructure as code

## Performance

- **Efficient Queries**: Uses DynamoDB Query operations instead of Scans
- **Scalable Design**: Separate tables for different access patterns
- **Real-time Updates**: WebSocket connections for live timer updates
- **Cost Optimized**: Pay-per-request DynamoDB billing