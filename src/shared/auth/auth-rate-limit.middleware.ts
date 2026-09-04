import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1_000;
const MAX_ATTEMPTS = 5;

export const authEmailRateLimit: RequestHandler = (request, _response, next) => {
  const emailEndpoints = ['/request-password-reset', '/send-verification-email'];
  if (!emailEndpoints.some((endpoint) => request.path.endsWith(endpoint))) {
    next();
    return;
  }
  const key = `${request.ip}:${request.path}`;
  const now = Date.now();
  const current = attempts.get(key);
  const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + WINDOW_MS } : current;
  entry.count += 1;
  attempts.set(key, entry);
  if (entry.count > MAX_ATTEMPTS) {
    next(new AppError(429, 'AUTH_EMAIL_RATE_LIMITED', 'Too many email requests. Please try again later.'));
    return;
  }
  next();
};
