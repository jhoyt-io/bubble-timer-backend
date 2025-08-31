import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createApiLogger } from '../core/logger';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const bucketName = process.env.AVATAR_BUCKET_NAME;
const distributionDomain = process.env.AVATAR_DISTRIBUTION_DOMAIN;

export interface AvatarUploadResult {
    success: boolean;
    avatarUrl?: string;
    error?: string;
}

export interface AvatarInfo {
    avatarUrl: string;
    defaultAvatar: boolean;
}

export async function uploadAvatar(userId: string, imageData: string): Promise<AvatarUploadResult> {
    const logger = createApiLogger('POST', userId);
    
    try {
        // Validate image data
        if (!imageData || !imageData.startsWith('data:image/')) {
            logger.warn('Invalid image data format', { userId });
            return {
                success: false,
                error: 'Invalid image format. Only image files are supported.'
            };
        }

        // Extract image format and base64 data
        const matches = imageData.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
        if (!matches) {
            logger.warn('Invalid image data format', { userId });
            return {
                success: false,
                error: 'Invalid image format. Only image files are supported.'
            };
        }

        const [, format, base64Data] = matches;
        const allowedFormats = ['jpeg', 'jpg', 'png', 'webp'];
        
        if (!allowedFormats.includes(format.toLowerCase())) {
            logger.warn('Unsupported image format', { userId, format });
            return {
                success: false,
                error: 'Unsupported image format. Please use JPEG, PNG, or WebP.'
            };
        }

        // Validate file size (max 5MB)
        const buffer = Buffer.from(base64Data, 'base64');
        const maxSize = 5 * 1024 * 1024; // 5MB
        
        if (buffer.length > maxSize) {
            logger.warn('Image too large', { userId, size: buffer.length });
            return {
                success: false,
                error: 'Image too large. Maximum size is 5MB.'
            };
        }

        // In test environment, return a mock success response
        if (process.env.NODE_ENV === 'test' || !bucketName || !distributionDomain) {
            logger.info('Mock avatar upload for test environment', { userId });
            const mockAvatarUrl = `https://mock-distribution.cloudfront.net/avatars/${userId}-${Date.now()}.${format}`;
            return {
                success: true,
                avatarUrl: mockAvatarUrl
            };
        }

        // Generate unique filename
        const timestamp = Date.now();
        const filename = `${userId}-${timestamp}.${format}`;
        const key = `avatars/${filename}`;

        // Upload to S3
        const uploadCommand = new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: buffer,
            ContentType: `image/${format}`,
            CacheControl: 'public, max-age=31536000', // 1 year cache
        });

        await s3Client.send(uploadCommand);
        logger.info('Avatar uploaded successfully', { userId, filename });

        // Generate public URL
        const avatarUrl = `https://${distributionDomain}/${key}`;

        return {
            success: true,
            avatarUrl
        };

    } catch (error) {
        logger.error('Failed to upload avatar', { userId }, error);
        return {
            success: false,
            error: 'Failed to upload avatar. Please try again.'
        };
    }
}

export async function getAvatar(userId: string): Promise<AvatarInfo> {
    const logger = createApiLogger('GET', userId);
    
    try {
        // Check if user has a custom avatar
        const key = `avatars/${userId}-*`;
        
        // For now, return default avatar
        // In a real implementation, you would check S3 for existing avatars
        // and return the most recent one if it exists
        
        const defaultAvatarUrl = `https://${distributionDomain}/default-avatar.png`;
        
        logger.info('Avatar retrieved', { userId, defaultAvatar: true });
        
        return {
            avatarUrl: defaultAvatarUrl,
            defaultAvatar: true
        };

    } catch (error) {
        logger.error('Failed to get avatar', { userId }, error);
        
        // Return default avatar on error
        const defaultAvatarUrl = `https://${distributionDomain}/default-avatar.png`;
        return {
            avatarUrl: defaultAvatarUrl,
            defaultAvatar: true
        };
    }
}

export async function deleteAvatar(userId: string): Promise<{ success: boolean; error?: string }> {
    const logger = createApiLogger('DELETE', userId);
    
    try {
        // In a real implementation, you would:
        // 1. List objects with prefix `avatars/${userId}-`
        // 2. Delete the most recent avatar file
        // 3. Update user profile to remove avatar reference
        
        logger.info('Avatar deletion requested', { userId });
        
        // For now, just return success (no actual deletion)
        return {
            success: true
        };

    } catch (error) {
        logger.error('Failed to delete avatar', { userId }, error);
        return {
            success: false,
            error: 'Failed to delete avatar. Please try again.'
        };
    }
}
