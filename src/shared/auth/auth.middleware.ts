import type { RequestHandler } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { AppError } from '../errors/app-error.js';
import { auth } from './auth.config.js';
import type { UserRole } from './auth.types.js';

export const requireAuth: RequestHandler = async (request, _response, next) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (!session || !session.user.isActive) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }

    request.auth = session;
    next();
  } catch (error) {
    next(error);
  }
};

export function requireRole(allowedRoles: readonly UserRole[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }

    const role = request.auth.user.role;

    if (!allowedRoles.includes(role)) {
      next(new AppError(403, 'FORBIDDEN', 'Insufficient permissions'));
      return;
    }

    next();
  };
}
