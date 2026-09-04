import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';

export function imageUpload(maxBytes: number, maxFiles: number) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: maxFiles },
  });
}

export function mediaUploadError(error: unknown, _request: Request, _response: Response, next: NextFunction) {
  if (error instanceof multer.MulterError) {
    next(new AppError(400, 'INVALID_MEDIA_UPLOAD', error.code === 'LIMIT_FILE_SIZE' ? 'Uploaded image is too large' : 'Invalid image upload'));
    return;
  }
  next(error);
}
