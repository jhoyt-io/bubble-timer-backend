# Testing Guide

This document provides guidelines and best practices for testing the Bubble Timer backend.

## Test Organization and Naming

### Given/When/Then Pattern

We use the **Given/When/Then** pattern for organizing and naming our tests. This pattern provides better readability and makes tests more maintainable by clearly separating the setup, action, and verification phases.

#### Why Given/When/Then?

The Given/When/Then pattern offers several advantages over traditional "it should" naming:

1. **Better Readability**: Tests read like user stories and are easier to understand
2. **Clearer Structure**: Each test has a clear setup (Given), action (When), and verification (Then) phase
3. **Better Documentation**: Test names serve as living documentation of system behavior
4. **Easier Maintenance**: When requirements change, it's easier to identify which tests need updates

#### Pattern Structure

```typescript
describe('Feature Name', () => {
  describe('Given [initial condition]', () => {
    describe('When [action occurs]', () => {
      test('Then [expected outcome]', () => {
        // Given - Setup the test conditions
        const mockData = { /* ... */ };
        mockFunction.mockResolvedValue(mockData);

        // When - Execute the action being tested
        const result = await functionUnderTest(input);

        // Then - Verify the expected outcome
        expect(result).toEqual(expectedValue);
        expect(mockFunction).toHaveBeenCalledWith(expectedInput);
      });
    });
  });
});
```

#### Examples

**Before (it should pattern):**
```typescript
it('should return timer when it exists', async () => {
  // test implementation
});
```

**After (Given/When/Then pattern):**
```typescript
describe('Given a timer exists', () => {
  test('Then the timer should be returned', async () => {
    // test implementation
  });
});
```

**Complex scenarios:**
```typescript
describe('Timer Sharing Workflow', () => {
  describe('Given User A creates and shares a timer with User B and User C', () => {
    describe('When User A updates the timer', () => {
      test('Then all shared users should receive the update notification', async () => {
        // test implementation
      });
    });

    describe('When User A stops the timer', () => {
      test('Then all shared users should receive the stop notification', async () => {
        // test implementation
      });
    });
  });
});
```

#### Guidelines

1. **Use descriptive context**: The "Given" should clearly describe the initial state
2. **Focus on behavior**: The "When" should describe the specific action being tested
3. **Be specific about outcomes**: The "Then" should describe the exact expected result
4. **Nest appropriately**: Use nested `describe` blocks to group related scenarios
5. **Keep it readable**: Test names should be self-documenting

#### Benefits in Practice

- **Easier Debugging**: When tests fail, the error message clearly shows what scenario failed
- **Better Coverage**: The pattern encourages thinking about different scenarios and edge cases
- **Improved Collaboration**: Non-technical stakeholders can understand what's being tested
- **Reduced Maintenance**: Changes to requirements are easier to map to specific tests

## Test Categories

### Unit Tests
- Test individual functions and classes in isolation
- Use mocks for external dependencies
- Focus on business logic and edge cases

### Integration Tests
- Test interactions between multiple components
- Use real or mocked external services
- Verify data flow and error handling

### End-to-End Tests
- Test complete user workflows
- Simulate real-world scenarios
- Verify system behavior under various conditions

## Mocking Guidelines

### When to Mock
- External services (databases, APIs, file systems)
- Time-dependent operations
- Expensive operations
- Network calls

### Mocking Best Practices
- Mock at the right level (interface boundaries)
- Use descriptive mock names
- Reset mocks between tests
- Verify mock interactions when relevant

## Test Data Management

### Test Data Factories
Use factory functions to create consistent test data:

```typescript
const createTestTimer = (overrides: any = {}) => ({
  id: 'test-timer-id',
  userId: 'test-user',
  name: 'Test Timer',
  totalDuration: 'PT30M',
  ...overrides
});
```

### Test Data Cleanup
- Clean up test data after each test
- Use `beforeEach` and `afterEach` hooks appropriately
- Avoid test data pollution between tests

## Error Testing

### Error Scenarios
Always test error conditions:
- Invalid input data
- Network failures
- Database errors
- Authentication failures
- Authorization failures

### Error Testing Patterns
```typescript
describe('Given invalid input data', () => {
  test('Then an appropriate error should be returned', async () => {
    // test implementation
  });
});

describe('Given a database error occurs', () => {
  test('Then the error should be handled gracefully', async () => {
    // test implementation
  });
});
```

## Performance Testing

### Test Performance
- Keep tests fast and focused
- Use appropriate timeouts
- Avoid unnecessary setup/teardown overhead

### Coverage Goals
- Aim for high test coverage (90%+)
- Focus on critical business logic
- Test error paths and edge cases

## Running Tests

### Test Commands
```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- --testPathPattern="filename.test.ts"

# Run tests in watch mode
npm test -- --watch
```

### Test Configuration
- Jest configuration is in `package.json`
- Coverage thresholds are set to maintain quality
- Test environment is configured for Node.js

## Continuous Integration

### CI/CD Integration
- Tests run automatically on every commit
- Coverage reports are generated
- Failed tests block deployment
- Test results are reported in pull requests

### Quality Gates
- All tests must pass
- Coverage thresholds must be met
- No new uncovered lines in critical paths
- Performance benchmarks must be maintained
