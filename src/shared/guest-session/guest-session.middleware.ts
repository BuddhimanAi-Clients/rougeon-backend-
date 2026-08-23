import type { RequestHandler } from 'express';
import { envVariables } from '../../configs/env.config.js';
import { AppError } from '../errors/app-error.js';
import {
  createGuestToken,
  GUEST_SESSION_COOKIE,
  GUEST_SESSION_MAX_AGE_MS,
  hashGuestToken,
  isValidGuestToken,
  readCookie,
} from './guest-session.service.js';

export const resolveWebsiteContext: RequestHandler = (request, response, next) => {
  const authenticatedUser = request.auth?.user;
  if (authenticatedUser && authenticatedUser.role !== 'customer') {
    next(
      new AppError(
        403,
        'CUSTOMER_ACCESS_REQUIRED',
        'This Website operation is available to customers only',
      ),
    );
    return;
  }

  const existingToken = readCookie(request.headers.cookie, GUEST_SESSION_COOKIE);
  let guestToken = isValidGuestToken(existingToken) ? existingToken : undefined;

  if (!authenticatedUser && !guestToken) {
    guestToken = createGuestToken();
    response.cookie(GUEST_SESSION_COOKIE, guestToken, {
      httpOnly: true,
      secure: envVariables.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: GUEST_SESSION_MAX_AGE_MS,
    });
  }

  request.websiteContext = {
    ...(authenticatedUser ? { userId: authenticatedUser.id } : {}),
    ...(guestToken ? { guestSessionHash: hashGuestToken(guestToken) } : {}),
  };
  next();
};

export function websiteOwner(request: Express.Request) {
  const context = request.websiteContext;
  if (context?.userId) {
    return { userId: context.userId } as const;
  }
  if (context?.guestSessionHash) {
    return { sessionId: context.guestSessionHash } as const;
  }
  throw new AppError(401, 'WEBSITE_CONTEXT_REQUIRED', 'Website identity is required');
}
