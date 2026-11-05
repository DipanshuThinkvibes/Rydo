import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
export const hmac = (key: string, v: string) => createHmac('sha256', key).update(v).digest('hex');
export const randomToken = (bytes = 48) => randomBytes(bytes).toString('base64url');
export const sixDigitCode = () => randomInt(0, 1_000_000).toString().padStart(6, '0');

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}