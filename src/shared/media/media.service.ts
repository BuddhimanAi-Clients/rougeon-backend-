import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { fileTypeFromBuffer } from 'file-type';
import { envVariables } from '../../configs/env.config.js';
import { AppError } from '../errors/app-error.js';

const allowedImageTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

export type InspectedImage = {
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
  byteSize: number;
};

function configuredR2() {
  const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL } = envVariables;
  return R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && R2_PUBLIC_BASE_URL
    ? { endpoint: R2_ENDPOINT, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET, publicBaseUrl: R2_PUBLIC_BASE_URL }
    : undefined;
}

function requireR2() {
  const config = configuredR2();
  if (!config) {
    throw new AppError(503, 'MEDIA_STORAGE_UNAVAILABLE', 'Media storage is not configured');
  }
  return config;
}

let client: S3Client | undefined;
function r2Client() {
  const config = requireR2();
  client ??= new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return client;
}

function extensionFromFileName(name: string) {
  const extension = name.split('.').pop()?.toLowerCase();
  return extension === 'jpeg' ? 'jpg' : extension;
}

export async function inspectImage(file: Express.Multer.File, maxBytes: number): Promise<InspectedImage> {
  if (!file.buffer || file.buffer.length === 0) {
    throw new AppError(400, 'IMAGE_REQUIRED', 'An image file is required');
  }
  if (file.size > maxBytes) {
    throw new AppError(400, 'IMAGE_TOO_LARGE', `Image must not exceed ${Math.floor(maxBytes / 1024 / 1024)} MB`);
  }
  const detected = await fileTypeFromBuffer(file.buffer);
  const extension = detected?.ext === 'jpeg' ? 'jpg' : detected?.ext;
  if (!detected || !allowedImageTypes.has(detected.mime) || !extension) {
    throw new AppError(400, 'UNSUPPORTED_IMAGE_TYPE', 'Only JPEG, PNG, and WebP images are allowed');
  }
  if (file.mimetype && file.mimetype !== detected.mime) {
    throw new AppError(400, 'IMAGE_TYPE_MISMATCH', 'The uploaded file type does not match its contents');
  }
  if (extensionFromFileName(file.originalname) !== extension) {
    throw new AppError(400, 'IMAGE_EXTENSION_MISMATCH', 'The image filename extension does not match its contents');
  }
  return { buffer: file.buffer, mimeType: detected.mime as InspectedImage['mimeType'], extension: extension as InspectedImage['extension'], byteSize: file.size };
}

export function createObjectKey(prefix: string, extension: InspectedImage['extension']) {
  return `${prefix}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
}

export function publicMediaUrl(objectKey: string) {
  const { publicBaseUrl } = requireR2();
  return `${publicBaseUrl.replace(/\/$/, '')}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
}

export async function uploadImage(objectKey: string, image: InspectedImage) {
  const config = requireR2();
  try {
    await r2Client().send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: image.buffer,
      ContentType: image.mimeType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
  } catch {
    throw new AppError(502, 'MEDIA_UPLOAD_FAILED', 'The image could not be uploaded. Please try again.');
  }
}

export async function deleteObject(objectKey: string) {
  const config = requireR2();
  try {
    await r2Client().send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }));
  } catch {
    throw new AppError(502, 'MEDIA_DELETE_FAILED', 'The previous image could not be removed');
  }
}

export async function getPrivateObject(objectKey: string) {
  const config = requireR2();
  try {
    const result = await r2Client().send(new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }));
    if (!result.Body) throw new Error('Object body missing');
    return { body: result.Body, contentType: result.ContentType ?? 'application/octet-stream' };
  } catch {
    throw new AppError(404, 'MEDIA_NOT_FOUND', 'The requested media is unavailable');
  }
}

