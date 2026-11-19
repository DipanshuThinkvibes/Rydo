import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { env } from '../config/env';
import type { GoogleIdentity, IdentityAdapter } from './identity.adapter';

const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

/**
 * Checks Google ID tokens with Google's tokeninfo endpoint (HTTPS, no extra package), then that the token
 * was issued to one of RYDO's OAuth clients (GOOGLE_OAUTH_CLIENT_IDS: web, Android and iOS client ids).
 */
@Injectable()
export class GoogleIdentityAdapter implements IdentityAdapter {
  private readonly log = new Logger('GoogleIdentity');

  async verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
    const audiences = (env().GOOGLE_OAUTH_CLIENT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!audiences.length) throw new AppError('FEATURE_OFF', 'Google sign-in is not set up yet. Use your work email.', HttpStatus.SERVICE_UNAVAILABLE);
    const bad = () => new AppError('INVALID_CREDENTIALS', 'Google sign-in failed. Try again or use your work email.', 401);

    let info: Record<string, string>;
    try {
      const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw bad();
      info = (await res.json()) as Record<string, string>;
    } catch (e) {
      if (e instanceof AppError) throw e;
      this.log.warn(`tokeninfo failed: ${(e as Error).message}`);
      throw bad();
    }
    if (!ISSUERS.has(info.iss) || !audiences.includes(info.aud) || Number(info.exp) * 1000 < Date.now() || !info.sub || !info.email) throw bad();
    return { sub: info.sub, email: info.email.toLowerCase(), emailVerified: info.email_verified === 'true', name: info.name ?? null };
  }
}
