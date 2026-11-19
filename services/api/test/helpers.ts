import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { configureRealtime } from '../src/realtime-adapter';
import { PrismaService } from '../src/prisma/prisma.service';
import { MESSAGE_ADAPTER, MessageAdapter } from '../src/adapters/message.adapter';
import { STORAGE_ADAPTER, StorageAdapter } from '../src/adapters/storage.adapter';
import { MAPS_ADAPTER, MapsAdapter } from '../src/adapters/maps.adapter';
import { GOOGLE_IDENTITY, GoogleIdentityAdapter, GoogleProfile } from '../src/adapters/google-identity.adapter';
import { AppError } from '../src/common/app-error';
import type { LatLng } from '@rydo/shared';

/** Captures emails instead of sending them, so tests can read OTP codes. */
export class FakeMessages implements MessageAdapter {
  sent: { to: string; subject: string; text: string }[] = [];
  async sendEmail(m: { to: string; subject: string; text: string }) {
    this.sent.push(m);
  }
  lastCode(email: string) {
    const msg = [...this.sent].reverse().find((m) => m.to === email && /(sign-in|email verification) code/.test(m.subject));
    return msg?.subject.match(/\d{6}/)?.[0];
  }
}

/** Stands in for Google: a token looks like "gtest|email|Name|verified" (use gtoken()). Anything else is refused. */
export const gtoken = (email: string, opts: { name?: string; verified?: boolean } = {}) => `gtest|${email}|${opts.name ?? ''}|${opts.verified === false ? 'no' : 'yes'}`;
export class FakeGoogle implements GoogleIdentityAdapter {
  async verify(idToken: string): Promise<GoogleProfile> {
    const [tag, email, name, verified] = idToken.split("|");
    if (tag !== "gtest" || !email) throw new AppError("UNAUTHENTICATED", "Google could not confirm this sign-in. Please try again.", 401);
    return { email: email.toLowerCase(), emailVerified: verified === "yes", name: name || undefined, subject: "sub-" + email };
  }
}

/** In-memory file store, so tests (and CI) need no S3 server. */
export class FakeStorage implements StorageAdapter {
  files = new Map<string, { body: Buffer; contentType: string }>();
  async put(key: string, body: Buffer, contentType: string) {
    this.files.set(key, { body, contentType });
  }
  async signedUploadUrl(key: string) {
    return `https://files.test/upload/${key}`;
  }
  async signedReadUrl(key: string) {
    return `https://files.test/${key}`;
  }
}

/** Straight-line "roads" so tests need no Google key. */
export class FakeMaps implements MapsAdapter {
  calls = 0;
  async autocomplete(query: string) {
    return [{ placeId: 'fake-1', main: query, secondary: 'Bengaluru, Karnataka' }];
  }
  async place(placeId: string) {
    return { placeId, label: 'Fake place', address: 'Fake address, Bengaluru', lat: 12.93, lng: 77.62 };
  }
  async route(a: LatLng, b: LatLng) {
    this.calls++;
    const r = 6371000, rad = (d: number) => (d * Math.PI) / 180;
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
    const distanceMeters = Math.round(2 * r * Math.asin(Math.sqrt(h)));
    const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    return { distanceMeters, durationSeconds: Math.round(distanceMeters / 8), path: [a, mid, b] };
  }
}

export async function createApp() {
  const messages = new FakeMessages();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MESSAGE_ADAPTER)
    .useValue(messages)
    .overrideProvider(STORAGE_ADAPTER)
    .useValue(new FakeStorage())
    .overrideProvider(MAPS_ADAPTER)
    .useValue(new FakeMaps())
    .overrideProvider(GOOGLE_IDENTITY)
    .useValue(new FakeGoogle())
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await configureRealtime(app);
  await app.init();
  return { app, messages, prisma: app.get(PrismaService) };
}

export async function resetDb(prisma: PrismaService) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'spatial_ref_sys')`;
  if (tables.length) await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
}

export const api = (app: INestApplication) => request(app.getHttpServer());

/** Full OTP sign-in as the mobile app does it. Returns the AuthResult. */
export async function signIn(app: INestApplication, messages: FakeMessages, email: string) {
  await api(app).post('/api/v1/auth/otp/request').send({ email }).expect(200);
  const code = messages.lastCode(email);
  const res = await api(app).post('/api/v1/auth/otp/verify').send({ email, code, client: 'MOBILE' }).expect(200);
  return res.body.data as { accessToken: string; refreshToken: string; user: { id: string }; memberships: { id: string; status: string; roles: string[] }[] };
}