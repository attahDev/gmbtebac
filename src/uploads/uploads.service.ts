import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB
const MAX_VIDEO_BYTES = 300 * 1024 * 1024; // 300MB

/**
 * Reuses the exact same STORAGE_* env var names as
 * src/brand-identity/services/upload_service.py (the FastAPI microservice
 * already using S3 for brand assets). Point them at the same bucket with a
 * different prefix, or a separate bucket entirely via COURSE_MEDIA_BUCKET —
 * either works, this doesn't assume which.
 *
 * Required env vars: STORAGE_ENDPOINT_URL, STORAGE_ACCESS_KEY,
 * STORAGE_SECRET_KEY, STORAGE_REGION (defaults to us-east-1),
 * STORAGE_PUBLIC_URL (base URL files are served from), and either
 * COURSE_MEDIA_BUCKET or STORAGE_BUCKET.
 */
@Injectable()
export class UploadsService {
  private s3: S3Client | null = null;
  private bucket = process.env.COURSE_MEDIA_BUCKET || process.env.STORAGE_BUCKET || '';

  private client(): S3Client {
    if (!this.s3) {
      if (!process.env.STORAGE_ACCESS_KEY || !process.env.STORAGE_SECRET_KEY || !this.bucket) {
        throw new InternalServerErrorException(
          'File upload is not configured — STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY / (COURSE_MEDIA_BUCKET or STORAGE_BUCKET) missing.',
        );
      }
      this.s3 = new S3Client({
        region: process.env.STORAGE_REGION || 'us-east-1',
        endpoint: process.env.STORAGE_ENDPOINT_URL || undefined,
        // Needed for S3-compatible-but-not-AWS endpoints (MinIO, DO Spaces,
        // Backblaze B2, etc). Harmless against real AWS too.
        forcePathStyle: !!process.env.STORAGE_ENDPOINT_URL,
        credentials: {
          accessKeyId: process.env.STORAGE_ACCESS_KEY,
          secretAccessKey: process.env.STORAGE_SECRET_KEY,
        },
      });
    }
    return this.s3;
  }

  async uploadCourseMedia(file: Express.Multer.File): Promise<{ url: string; type: 'image' | 'video' }> {
    if (!file) throw new BadRequestException('No file uploaded');

    const isImage = ALLOWED_IMAGE_TYPES.has(file.mimetype);
    const isVideo = ALLOWED_VIDEO_TYPES.has(file.mimetype);
    if (!isImage && !isVideo) {
      throw new BadRequestException(
        `Unsupported file type '${file.mimetype}'. Allowed: PNG/JPEG/WEBP/GIF images, or MP4/WEBM/MOV videos.`,
      );
    }

    const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (file.size > maxBytes) {
      throw new BadRequestException(
        `File too large. Max ${Math.round(maxBytes / (1024 * 1024))}MB for ${isImage ? 'images' : 'videos'}.`,
      );
    }

    const ext = file.originalname.includes('.') ? file.originalname.split('.').pop() : undefined;
    const key = `course-content/${randomUUID()}${ext ? `.${ext}` : ''}`;

    await this.client().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
      }),
    );

    const base =
      process.env.STORAGE_PUBLIC_URL ||
      `https://${this.bucket}.s3.${process.env.STORAGE_REGION || 'us-east-1'}.amazonaws.com`;
    const url = `${base.replace(/\/$/, '')}/${key}`;

    return { url, type: isImage ? 'image' : 'video' };
  }

  /** Photo attached to a user's community post (event photos, etc). Images
   *  only, deliberately smaller cap than course media — these are phone
   *  photos, not production video assets. */
  async uploadCommunityImage(file: Express.Multer.File): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('No file uploaded');

    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type '${file.mimetype}'. Allowed: PNG, JPEG, WEBP, GIF.`,
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException(`File too large. Max ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))}MB.`);
    }

    const ext = file.originalname.includes('.') ? file.originalname.split('.').pop() : undefined;
    const key = `community-posts/${randomUUID()}${ext ? `.${ext}` : ''}`;

    await this.client().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
      }),
    );

    const base =
      process.env.STORAGE_PUBLIC_URL ||
      `https://${this.bucket}.s3.${process.env.STORAGE_REGION || 'us-east-1'}.amazonaws.com`;

    return { url: `${base.replace(/\/$/, '')}/${key}` };
  }

  /** Photo attached to a member's "Host an Event" submission. Same
   *  size/type caps as community post photos, just its own S3 prefix so
   *  event images are easy to find/manage separately. */
  async uploadEventImage(file: Express.Multer.File): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('No file uploaded');

    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type '${file.mimetype}'. Allowed: PNG, JPEG, WEBP, GIF.`,
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException(`File too large. Max ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))}MB.`);
    }

    const ext = file.originalname.includes('.') ? file.originalname.split('.').pop() : undefined;
    const key = `community-events/${randomUUID()}${ext ? `.${ext}` : ''}`;

    await this.client().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
      }),
    );

    const base =
      process.env.STORAGE_PUBLIC_URL ||
      `https://${this.bucket}.s3.${process.env.STORAGE_REGION || 'us-east-1'}.amazonaws.com`;

    return { url: `${base.replace(/\/$/, '')}/${key}` };
  }

  /** Cover photo for an admin-authored News article. Same caps as the
   *  other image uploads, own S3 prefix so news assets are easy to find. */
  async uploadNewsImage(file: Express.Multer.File): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('No file uploaded');

    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type '${file.mimetype}'. Allowed: PNG, JPEG, WEBP, GIF.`,
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException(`File too large. Max ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))}MB.`);
    }

    const ext = file.originalname.includes('.') ? file.originalname.split('.').pop() : undefined;
    const key = `news-articles/${randomUUID()}${ext ? `.${ext}` : ''}`;

    await this.client().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
      }),
    );

    const base =
      process.env.STORAGE_PUBLIC_URL ||
      `https://${this.bucket}.s3.${process.env.STORAGE_REGION || 'us-east-1'}.amazonaws.com`;

    return { url: `${base.replace(/\/$/, '')}/${key}` };
  }
}
