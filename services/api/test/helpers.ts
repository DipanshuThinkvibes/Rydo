import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { MESSAGE_ADAPTER, MessageAdapter } from '../src/adapters/message.adapter';

/** Captures emails instead of sending them, so tests can read OTP codes. */
export class FakeMessages implements MessageAdapter {
  sent: { to: string; subject: string; text: string }[] = [];
  async sendEmail(m: { to: string; subject: string; text: string }) {
    this.sent.push(m);
  }
  lastCode(email: string) {
    const msg = [...this.sent].reverse().find((m) => m.to === email && /sign-in code/.test(m.subject));
    return msg?.subject.match(/\d{6}/)?.[0];
  }
}

export async function createApp() {
  const messages = new FakeMessages();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MESSAGE_ADAPTER)
    .useValue(messages)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
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