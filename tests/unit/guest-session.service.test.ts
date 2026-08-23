import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  createGuestToken,
  guestHashMatches,
  hashGuestToken,
  isValidGuestToken,
  readCookie,
} from '../../src/shared/guest-session/guest-session.service.js';

describe('guest session service', () => {
  test('creates opaque random tokens and stable one-way hashes', () => {
    const first = createGuestToken();
    const second = createGuestToken();

    assert.equal(isValidGuestToken(first), true);
    assert.equal(isValidGuestToken(second), true);
    assert.notEqual(first, second);
    assert.equal(hashGuestToken(first).length, 64);
    assert.equal(guestHashMatches(first, hashGuestToken(first)), true);
    assert.equal(guestHashMatches(second, hashGuestToken(first)), false);
  });

  test('reads only the requested cookie and tolerates malformed encoding', () => {
    assert.equal(readCookie('other=1; guest_session_id=abc_123', 'guest_session_id'), 'abc_123');
    assert.equal(readCookie('guest_session_id=%E0%A4%A', 'guest_session_id'), undefined);
    assert.equal(readCookie(undefined, 'guest_session_id'), undefined);
  });
});
