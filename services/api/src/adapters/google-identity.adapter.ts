import { HttpStatus, Injectable } from '@nestjs/common';
import { env } from '../config/env';
import { AppError } from '../common/app-error';

/** What Google vouches for after a person signs in with their Google account. */
export interface GoogleProfile {
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
  /** Google's own id for this person. */
  subject: string;
}

/** Feature code depends on this, not on Google's web address. */
export interface GoogleIdentityAdapter {
  /** Throws an AppError when the token is not valid for this app. */
  verify(idToken: string): Promise<GoogleProfile>;
}
export const GOOGLE_IDENTITY = Symbol('GOOGLE_IDENTITY');

/** Asks Google to check the ID token (signature, expiry), then checks it was issued for this app. No extra package needed. */
@Injectable()
export class HttpGoogleIdentity implements GoogleIdentityAdapter {
  async verify(idToken: string): Promise<GoogleProfile> {
    const clientId = env().GOOGLE_CLIENT_ID;
    if (!clientId) throw new AppError('GOOGLE_UNAVAILABLE', 'Google sign-in is not set up yet. Use your email code instead.', HttpStatus.SERVICE_UNAVAILABLE);

    let res: Response;
    try {
      res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, { signal: AbortSignal.timeout(8000) });
    } catch {
      throw new AppError('GOOGLE_UNAVAILABLE', 'We could not reach Google. Please try again in a moment.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const bad = () => new AppError('UNAUTHENTICATED', 'Google could not confirm this sign-in. Please try again.', HttpStatus.UNAUTHORIZED);
    if (!res.ok) throw bad();
    const t = (await res.json()) as Record<string, string>;
    if (t.aud !== clientId) throw bad(); // a token made for some other app
    if (t.iss !== 'accounts.google.com' && t.iss !== 'https://accounts.google.com') throw bad();
    if (!t.email || !t.sub) throw bad();
    return { email: t.email.toLowerCase(), emailVerified: t.email_verified === 'true', name: t.name, picture: t.picture, subject: t.sub };
  }
}
