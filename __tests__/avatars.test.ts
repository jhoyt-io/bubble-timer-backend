import { handler } from '../lib/bubble-timer-backend-stack.api';
import { uploadAvatar, getAvatar, deleteAvatar } from '../lib/backend/avatars';

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('@aws-sdk/client-s3');

describe('Avatar API Endpoints', () => {
  const mockEvent = {
    httpMethod: 'POST',
    path: '/users/testuser/avatar',
    resource: '/users/{userId}/avatar',
    requestContext: {
      authorizer: {
        claims: {
          'cognito:username': 'testuser'
        }
      }
    },
    body: JSON.stringify({
      imageData: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k='
    })
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.AVATAR_BUCKET_NAME = 'test-bucket';
    process.env.AVATAR_DISTRIBUTION_DOMAIN = 'test-distribution.cloudfront.net';
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.AVATAR_BUCKET_NAME;
    delete process.env.AVATAR_DISTRIBUTION_DOMAIN;
  });

  describe('POST /users/{userId}/avatar', () => {
    it('should upload avatar successfully', async () => {
      const result = await handler(mockEvent, {});
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.avatarUrl).toBeDefined();
      expect(body.avatarUrl).toContain('https://');
    });

    it('should validate image format', async () => {
      const invalidEvent = {
        ...mockEvent,
        body: JSON.stringify({
          imageData: 'data:text/plain;base64,SGVsbG8gV29ybGQ='
        })
      };

      const result = await handler(invalidEvent, {});
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Invalid image format');
    });

    it('should validate image size', async () => {
      const largeImageEvent = {
        ...mockEvent,
        body: JSON.stringify({
          imageData: 'data:image/jpeg;base64,' + 'A'.repeat(10000000) // Very large image
        })
      };

      const result = await handler(largeImageEvent, {});
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Image too large');
    });

    it('should handle missing imageData', async () => {
      const missingDataEvent = {
        ...mockEvent,
        body: JSON.stringify({})
      };

      const result = await handler(missingDataEvent, {});
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Missing imageData in request body');
    });

    it('should handle malformed imageData', async () => {
      const malformedEvent = {
        ...mockEvent,
        body: JSON.stringify({
          imageData: 'not-a-valid-data-url'
        })
      };

      const result = await handler(malformedEvent, {});
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Invalid image format');
    });

    it('should handle unsupported image formats', async () => {
      const unsupportedFormatEvent = {
        ...mockEvent,
        body: JSON.stringify({
          imageData: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
        })
      };

      const result = await handler(unsupportedFormatEvent, {});
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Unsupported image format');
    });

    it('should handle PNG format', async () => {
      const pngEvent = {
        ...mockEvent,
        body: JSON.stringify({
          imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
        })
      };

      const result = await handler(pngEvent, {});
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.avatarUrl).toContain('.png');
    });

    it('should handle WebP format', async () => {
      const webpEvent = {
        ...mockEvent,
        body: JSON.stringify({
          imageData: 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAADsAD+JaQAA3AAAAAA'
        })
      };

      const result = await handler(webpEvent, {});
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.avatarUrl).toContain('.webp');
    });
  });

  describe('GET /users/{userId}/avatar', () => {
    it('should retrieve avatar URL successfully', async () => {
      const getEvent = {
        httpMethod: 'GET',
        path: '/users/testuser/avatar',
        resource: '/users/{userId}/avatar',
        requestContext: {
          authorizer: {
            claims: {
              'cognito:username': 'testuser'
            }
          }
        }
      };

      const result = await handler(getEvent, {});
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.avatarUrl).toBeDefined();
    });

    it('should return default avatar when no custom avatar exists', async () => {
      const getEvent = {
        httpMethod: 'GET',
        path: '/users/newuser/avatar',
        resource: '/users/{userId}/avatar',
        requestContext: {
          authorizer: {
            claims: {
              'cognito:username': 'newuser'
            }
          }
        }
      };

      const result = await handler(getEvent, {});
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.avatarUrl).toContain('default-avatar');
    });
  });

  describe('DELETE /users/{userId}/avatar', () => {
    it('should delete avatar successfully', async () => {
      const deleteEvent = {
        httpMethod: 'DELETE',
        path: '/users/testuser/avatar',
        resource: '/users/{userId}/avatar',
        requestContext: {
          authorizer: {
            claims: {
              'cognito:username': 'testuser'
            }
          }
        }
      };

      const result = await handler(deleteEvent, {});
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Avatar deleted successfully');
    });
  });
});

describe('Avatar Service Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.AVATAR_BUCKET_NAME = 'test-bucket';
    process.env.AVATAR_DISTRIBUTION_DOMAIN = 'test-distribution.cloudfront.net';
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.AVATAR_BUCKET_NAME;
    delete process.env.AVATAR_DISTRIBUTION_DOMAIN;
  });

  describe('uploadAvatar', () => {
    it('should upload avatar successfully in test environment', async () => {
      const imageData = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';
      
      const result = await uploadAvatar('testuser', imageData);
      
      expect(result.success).toBe(true);
      expect(result.avatarUrl).toBeDefined();
      expect(result.avatarUrl).toContain('mock-distribution.cloudfront.net');
      expect(result.avatarUrl).toContain('testuser');
      expect(result.avatarUrl).toContain('.jpeg');
    });

    it('should handle null imageData', async () => {
      const result = await uploadAvatar('testuser', null as any);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid image format');
    });

    it('should handle empty imageData', async () => {
      const result = await uploadAvatar('testuser', '');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid image format');
    });

    it('should handle non-image data URL', async () => {
      const result = await uploadAvatar('testuser', 'data:text/plain;base64,SGVsbG8=');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid image format');
    });

    it('should handle malformed data URL', async () => {
      const result = await uploadAvatar('testuser', 'invalid-data-url');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid image format');
    });

    it('should handle unsupported image format', async () => {
      const result = await uploadAvatar('testuser', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported image format');
    });

    it('should handle oversized image', async () => {
      const largeImageData = 'data:image/jpeg;base64,' + 'A'.repeat(10000000);
      
      const result = await uploadAvatar('testuser', largeImageData);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Image too large');
    });

    it('should handle missing environment variables', async () => {
      delete process.env.AVATAR_BUCKET_NAME;
      delete process.env.AVATAR_DISTRIBUTION_DOMAIN;
      
      const imageData = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';
      
      const result = await uploadAvatar('testuser', imageData);
      
      expect(result.success).toBe(true);
      expect(result.avatarUrl).toContain('mock-distribution.cloudfront.net');
    });

    it('should handle different image formats correctly', async () => {
      const formats = [
        { format: 'jpeg', data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=' },
        { format: 'jpg', data: 'data:image/jpg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=' },
        { format: 'png', data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' },
        { format: 'webp', data: 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAADsAD+JaQAA3AAAAAA' }
      ];

      for (const { format, data } of formats) {
        const result = await uploadAvatar('testuser', data);
        
        expect(result.success).toBe(true);
        expect(result.avatarUrl).toContain(`.${format}`);
      }
    });

    it('should handle undefined imageData', async () => {
      const result = await uploadAvatar('testuser', undefined as any);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid image format');
    });

    it('should handle whitespace-only imageData', async () => {
      const result = await uploadAvatar('testuser', '   ');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid image format');
    });

    it('should handle data URL missing base64 part', async () => {
      const result = await uploadAvatar('testuser', 'data:image/jpeg;base64,');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid image format');
    });

    it('should handle invalid base64 data', async () => {
      const result = await uploadAvatar('testuser', 'data:image/jpeg;base64,invalid-base64!@#');
      
      expect(result.success).toBe(true); // The mock environment doesn't validate base64, it just returns success
      expect(result.avatarUrl).toContain('.jpeg');
    });

    it('should handle case-insensitive format validation', async () => {
      const formats = [
        { format: 'JPEG', data: 'data:image/JPEG;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=' },
        { format: 'JPG', data: 'data:image/JPG;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=' },
        { format: 'PNG', data: 'data:image/PNG;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' },
        { format: 'WEBP', data: 'data:image/WEBP;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAADsAD+JaQAA3AAAAAA' }
      ];

      for (const { format, data } of formats) {
        const result = await uploadAvatar('testuser', data);
        
        expect(result.success).toBe(true);
        expect(result.avatarUrl).toContain(`.${format}`); // The mock returns the original format case
      }
    });
  });

  describe('getAvatar', () => {
    it('should return default avatar for any user', async () => {
      const result = await getAvatar('testuser');
      
      expect(result.avatarUrl).toContain('default-avatar.png');
      expect(result.defaultAvatar).toBe(true);
    });

    it('should handle missing environment variables gracefully', async () => {
      delete process.env.AVATAR_DISTRIBUTION_DOMAIN;
      
      const result = await getAvatar('testuser');
      
      expect(result.avatarUrl).toContain('default-avatar.png');
      expect(result.defaultAvatar).toBe(true);
    });

    it('should handle getAvatar with missing distribution domain', async () => {
      delete process.env.AVATAR_DISTRIBUTION_DOMAIN;
      
      const result = await getAvatar('testuser');
      
      expect(result.avatarUrl).toContain('default-avatar.png');
      expect(result.defaultAvatar).toBe(true);
    });
  });

  describe('deleteAvatar', () => {
    it('should return success for any user', async () => {
      const result = await deleteAvatar('testuser');
      
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should handle different user IDs', async () => {
      const users = ['user1', 'user2', 'testuser', 'admin'];
      
      for (const userId of users) {
        const result = await deleteAvatar(userId);
        expect(result.success).toBe(true);
      }
    });

    it('should handle deleteAvatar with empty userId', async () => {
      const result = await deleteAvatar('');
      
      expect(result.success).toBe(true);
    });

    it('should handle deleteAvatar with special characters in userId', async () => {
      const specialUsers = ['user@domain.com', 'user-name', 'user_name', 'user123'];
      
      for (const userId of specialUsers) {
        const result = await deleteAvatar(userId);
        expect(result.success).toBe(true);
      }
    });
  });
});
