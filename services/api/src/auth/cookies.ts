import type { CookieOptions } from 'express';
import { env } from '../config/env';

/** Web admin cookies. The mobile app sends Bearer tokens instead. */
export const COOKIE = { access: 'rydo_at', refresh: 'rydo_rt', csrf: 'rydo_csrf' } as const;
export const CSRF_HEADER = 'x-csrf-token';

export const ACCESS_TTL_SEC = 15 * 60;
/**
 * How long a sign-in lasts.
 * - The mobile app: 14 days from signing in, then it must sign in again (using the app does not extend it).
 * - The website: 2 hours without use; every use starts the 2 hours again.
 */
export const MOBILE_SESSION_SEC = 14 * 24 * 60 * 60;
export const WEB_IDLE_SEC = 2 * 60 * 60;
/** Cookies live as long as the website's idle window; each refresh sets them again. */
export const REFRESH_TTL_SEC = WEB_IDLE_SEC;
/** Activity is written to the database at most this often per session. */
export const ACTIVITY_WRITE_SEC = 60;

export function cookieOptions(maxAgeSec: number, httpOnly = true, path = '/'): CookieOptions {
  return { httpOnly, secure: env().NODE_ENV === 'production', sameSite: 'strict', path, maxAge: maxAgeSec * 1000 };
}