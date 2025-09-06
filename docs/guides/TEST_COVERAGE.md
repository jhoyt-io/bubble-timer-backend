# Test Coverage Guide

## Overview

This project uses Jest's built-in coverage reporting to automatically track how well our tests exercise the codebase. Coverage metrics help us identify untested code paths and maintain high-quality test coverage.

## Coverage Configuration

### Jest Configuration
The coverage is configured in `package.json` with the following settings:

```json
{
  "jest": {
    "collectCoverageFrom": [
      "lib/**/*.ts",
      "!lib/**/*.d.ts",
      "!lib/bubble-timer-application.ts",
      "!lib/bubble-timer-backend-stack.ts",
      "!lib/bubble-timer-dns-stack.ts",
      "!lib/bubble-timer-pipeline-stack.ts",
      "!lib/bubble-timer-users-stack.ts"
    ],
    "coverageThreshold": {
      "global": {
        "branches": 80,
        "functions": 85,
        "lines": 80,
        "statements": 80
      },
      "./lib/backend/": {
        "branches": 90,
        "functions": 95,
        "lines": 90,
        "statements": 90
      }
    },
    "coverageReporters": [
      "text",
      "lcov",
      "html"
    ],
    "coverageDirectory": "coverage"
  }
}
```

### Coverage Thresholds

#### Global Thresholds (80% minimum)
- **Statements**: 80%
- **Branches**: 80%
- **Functions**: 85%
- **Lines**: 80%

#### Backend Layer Thresholds (90% minimum)
- **Statements**: 90%
- **Branches**: 90%
- **Functions**: 95%
- **Lines**: 90%

## Available Commands

### Basic Coverage
```bash
# Run tests with coverage
npm run test:coverage

# Run tests with coverage in watch mode
npm run test:coverage:watch

# Generate HTML coverage report
npm run test:coverage:html

# Build and test with coverage
npm run build:test:coverage
```

### Coverage Reports

#### Text Report
The default coverage command (`npm run test:coverage`) provides a detailed text report showing:
- Overall coverage percentages
- File-by-file breakdown
- Uncovered line numbers

#### HTML Report
```bash
npm run test:coverage:html
```
Generates an interactive HTML report in the `coverage/` directory that you can open in a browser for detailed analysis.

#### LCOV Report
The LCOV format is automatically generated for CI/CD integration with coverage services like CodeCov.

## Current Coverage Status

### Overall Metrics
- **Statements**: 81.05% ✅ (Target: 80%)
- **Branches**: 75.22% ❌ (Target: 80%)
- **Functions**: 100% ✅ (Target: 85%)
- **Lines**: 80.91% ✅ (Target: 80%)

### Backend Layer Metrics
- **Statements**: 88.18% ❌ (Target: 90%)
- **Branches**: 90.32% ✅ (Target: 90%)
- **Functions**: 100% ✅ (Target: 95%)
- **Lines**: 88% ❌ (Target: 90%)

## Coverage Gaps

### WebSocket Handler (`bubble-timer-backend-stack.websocket.ts`)
- **Current**: 66.37% statements, 60.34% branches
- **Gaps**: Error handling paths, edge cases in message processing
- **Action**: Add tests for error scenarios and edge cases

### Backend Layer (`lib/backend/`)
- **Current**: 88.18% statements, 88% lines
- **Gaps**: Some error handling paths in connections.ts and timers.ts
- **Action**: Add tests for database error scenarios

## Improving Coverage

### 1. Identify Gaps
Run coverage and look for:
- Files with low coverage percentages
- Uncovered line numbers in the report
- Missing branch coverage

### 2. Add Tests
Focus on:
- **Error scenarios**: Database failures, network errors
- **Edge cases**: Empty arrays, null values, boundary conditions
- **Uncovered branches**: Conditional logic that isn't tested

### 3. Example: Adding Error Coverage
```typescript
describe('Given a database error occurs', () => {
  beforeEach(() => {
    mockDynamoClient.send.mockRejectedValue(new Error('Database error'));
  });

  test('Then the error should be handled gracefully', async () => {
    // Test implementation
  });
});
```

### 4. Verify Improvements
After adding tests:
```bash
npm run test:coverage
```
Check that coverage percentages improve and thresholds are met.

## Coverage Best Practices

### 1. Focus on Critical Paths
- Prioritize testing business logic over infrastructure code
- Ensure all error handling paths are covered
- Test edge cases that could cause production issues

### 2. Maintain Thresholds
- Don't lower thresholds to meet current coverage
- Instead, add tests to improve coverage
- Use thresholds as quality gates

### 3. Review Coverage Reports
- Regularly review HTML reports to understand coverage gaps
- Look for patterns in uncovered code
- Identify areas that need more testing

### 4. Integration with Development
- Run coverage as part of the development workflow
- Use `npm run test:coverage:watch` during development
- Check coverage before committing changes

## CI/CD Integration

### GitHub Actions
Add coverage reporting to your CI pipeline:

```yaml
- name: Run tests with coverage
  run: npm run test:coverage

- name: Upload coverage to CodeCov
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage/lcov.info
```

### Coverage Services
Consider integrating with:
- **CodeCov**: Free coverage reporting for open source
- **Coveralls**: Alternative coverage service
- **GitHub Code Coverage**: Built-in GitHub coverage reporting

## Troubleshooting

### Coverage Not Updating
- Clear Jest cache: `npx jest --clearCache`
- Ensure tests are actually running the code you expect
- Check that mocks aren't preventing code execution

### Thresholds Not Met
- Review uncovered lines in the HTML report
- Add tests for missing scenarios
- Consider if uncovered code is actually needed

### Performance Issues
- Use `--coverageReporters=text` for faster reporting
- Exclude unnecessary files from coverage collection
- Consider using `--coverageDirectory` to avoid writing to disk

## Related Documentation

- [Testing Guide](TESTING.md) - General testing patterns and practices
- [Quick Reference](QUICK_REFERENCE.md) - Common commands and debugging
- [Architecture](ARCHITECTURE.md) - Understanding the codebase structure
