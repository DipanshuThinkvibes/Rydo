import type { CookieOptions } from 'express';
import { env } from '../config/env';

/** Web admin cookies. The mobile app sends Bearer tokens instead. */
export const COOKIE = { access: 'rydo_at', refresh: 'rydo_rt', csrf: 'rydo_csrf' } as const;
export const CSRF_HEADER = 'x-csrf-token';

export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;

export function cookieOptions(maxAgeSec: number, httpOnly = true, path = '/'): CookieOptions {
  return { httpOnly, secure: env().NODE_ENV === 'production', sameSite: 'strict', path, maxAge: maxAgeSec * 1000 };
}