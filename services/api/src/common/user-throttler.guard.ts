import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate limits per person, not per internet address: a whole office often shares one IP.
 * Signed in: per user. Signing in (no user yet): per IP + email, so one account can't be brute-forced
 * and 500 colleagues signing in from one office don't block each other.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    if (req.auth?.userId) return `u:${req.auth.userId}`;
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 200) : '';
    return email ? `ip:${req.ip}:${email}` : `ip:${req.ip}`;
  }
}