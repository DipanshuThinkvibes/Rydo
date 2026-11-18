import { Injectable, Logger } from '@nestjs/common';
import { createSign } from 'node:crypto';
import type { PushAdapter, PushMessage, PushResult } from './push.adapter';

export interface FcmConfig {
  projectId: string;
  clientEmail: string;
  /** PEM private key from the Firebase service account (newlines may be written as \n). */
  privateKey: string;
}

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/**
 * Firebase Cloud Messaging (HTTP v1) with a service account. No Firebase package needed: a signed JWT
 * is exchanged for a short-lived access token, which is cached. Delivery to iOS goes through APNs inside FCM.
 */
@Injectable()
export class FcmPushAdapter implements PushAdapter {
  private readonly log = new Logger('Push');
  private access?: { token: string; expiresAt: number };

  constructor(private readonly cfg: FcmConfig) {}

  /** @internal exposed for tests */
  signedJwt(nowSec = Math.floor(Date.now() / 1000)) {
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({ iss: this.cfg.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: nowSec, exp: nowSec + 3600 }));
    const sig = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(this.cfg.privateKey.replace(/\\n/g, '\n'));
    return `${head}.${claims}.${b64url(sig)}`;
  }

  private async accessToken() {
    if (this.access && this.access.expiresAt > Date.now() + 60_000) return this.access.token;
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: this.signedJwt() }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`FCM sign-in failed (${res.status})`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.access = { token: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
    return this.access.token;
  }

  async send(tokens: string[], msg: PushMessage): Promise<PushResult> {
    const invalidTokens: string[] = [];
    if (!tokens.length) return { invalidTokens };
    let bearer: string;
    try {
      bearer = await this.accessToken();
    } catch (e) {
      this.log.warn(`Push skipped: ${(e as Error).message}`);
      return { invalidTokens };
    }
    const url = `https://fcm.googleapis.com/v1/projects/${this.cfg.projectId}/messages:send`;
    // A few at a time, so one slow device does not hold up the rest.
    for (let i = 0; i < tokens.length; i += 10) {
      await Promise.all(
        tokens.slice(i, i + 10).map(async (token) => {
          try {
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
              body: JSON.stringify({ message: { token, notification: { title: msg.title, body: msg.body }, data: msg.data ?? {} } }),
              signal: AbortSignal.timeout(8000),
            });
            if (res.ok) return;
            const text = await res.text();
            // 404 UNREGISTERED / 400 INVALID_ARGUMENT mean the token is dead.
            if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(text)) invalidTokens.push(token);
            else this.log.warn(`FCM ${res.status}: ${text.slice(0, 200)}`);
          } catch (e) {
            this.log.warn(`FCM send failed: ${(e as Error).message}`);
          }
        }),
      );
    }
    return { invalidTokens };
  }
}
