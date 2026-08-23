import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const GUEST_SESSION_COOKIE = 'guest_session_id';
export const GUEST_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;

const guestTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function createGuestToken() {
  return randomBytes(32).toString('base64url');
}

export function isValidGuestToken(value: string | undefined): value is string {
  return value !== undefined && guestTokenPattern.test(value);
}

export function hashGuestToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function guestHashMatches(token: string, storedHash: string) {
  const suppliedHash = Buffer.from(hashGuestToken(token), 'hex');
  const expectedHash = Buffer.from(storedHash, 'hex');

  return (
    suppliedHash.length === expectedHash.length &&
    timingSafeEqual(suppliedHash, expectedHash)
  );
}

export function readCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) {
      continue;
    }

    const encodedValue = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(encodedValue);
    } catch {
      return undefined;
    }
  }

  return undefined;
}
