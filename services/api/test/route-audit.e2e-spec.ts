import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, FakeMessages, resetDb } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildWorld, World } from './world';

/** Calls every route of the API: nothing may answer without sign-in (except the public list), and a plain rider may never use an admin route. */
const PUBLIC = new Set([
  'GET /api/v1/health',
  'POST /api/v1/auth/otp/request',
  'POST /api/v1/auth/otp/verify',
  'POST /api/v1/auth/password/login',
  'POST /api/v1/auth/password/reset',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/google',
  'GET /api/v1/public/trips/:token',
  'POST /api/v1/public/contact',
  'GET /api/v1/public/companies',
  'GET /api/v1/public/invites/:token',
  'POST /api/v1/public/invites/:token/join',
]);

describe('Route audit', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;
  let routes: { method: string; path: string }[] = [];

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'aud');
    type Layer = { route?: { path: string; methods: Record<string, boolean> } };
    const inst = app.getHttpAdapter().getInstance() as { router?: { stack: Layer[] }; _router?: { stack: Layer[] } }; // Express 5 uses .router
    const stack = (inst.router ?? inst._router)!.stack;
    for (const l of stack) if (l.route) for (const m of Object.keys(l.route.methods)) routes.push({ method: m.toUpperCase(), path: l.route.path });
  });
  afterAll(() => app.close());

  const fill = (p: string) => p.replace(/:[A-Za-z]+/g, '00000000-0000-4000-8000-000000000000');
  const call = (r: { method: string; path: string }, headers: Record<string, string> = {}) => {
    const req = request(app.getHttpServer())[r.method.toLowerCase() as 'get'](fill(r.path));
    for (const [k, v] of Object.entries(headers)) req.set(k, v);
    return r.method === 'GET' || r.method === 'DELETE' ? req : req.send({});
  };

  it('finds the routes', () => {
    expect(routes.length).toBeGreaterThan(130);
  });

  it('answers 401 to every non-public route when nobody is signed in', async () => {
    const open: string[] = [];
    for (const r of routes) {
      if (PUBLIC.has(`${r.method} ${r.path}`)) continue;
      const res = await call(r);
      if (res.status !== 401) open.push(`${r.method} ${r.path} -> ${res.status}`);
    }
    expect(open).toEqual([]);
  });

  it('never lets a plain rider use an admin or platform route', async () => {
    const leaks: string[] = [];
    // GET /admin/offices is open to every employee on purpose: riders pick pickup and drop points from it.
    for (const r of routes.filter((x) => x.path.startsWith('/api/v1/admin/') && `${x.method} ${x.path}` !== 'GET /api/v1/admin/offices')) {
      const res = await call(r, w.as('priya'));
      if (res.status < 400 || res.status === 404 || res.status >= 500) leaks.push(`${r.method} ${r.path} -> ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });

  it('never lets a person of another company reach this company: our id with their token is refused everywhere', async () => {
    const leaks: string[] = [];
    for (const r of routes.filter((x) => !PUBLIC.has(`${x.method} ${x.path}`) && !x.path.includes('/platform') && x.path !== '/api/v1/me' && !x.path.startsWith('/api/v1/auth/') && !x.path.startsWith('/api/v1/me/devices') && !x.path.startsWith('/api/v1/me/registration') && !x.path.startsWith('/api/v1/me/email') && !x.path.startsWith('/api/v1/me/settings') && !x.path.startsWith('/api/v1/me/sessions') && !x.path.startsWith('/api/v1/me/highlights') && !x.path.startsWith('/api/v1/me/emergency') && !x.path.startsWith('/api/v1/me/photo') && !x.path.startsWith('/api/v1/me/notifications') && !x.path.startsWith('/api/v1/me/memberships') && !x.path.startsWith('/api/v1/me/password') && !x.path.startsWith('/api/v1/maps'))) {
      const res = await call(r, { ...w.as('outsiderRider', w.other), 'x-org-id': w.org });
      if (res.status < 400) leaks.push(`${r.method} ${r.path} -> ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });

  it('no route answers with a server error for empty input', async () => {
    const errors: string[] = [];
    for (const r of routes.filter((x) => !PUBLIC.has(`${x.method} ${x.path}`) && !x.path.includes('/logout'))) {
      const res = await call(r, w.as('hr'));
      if (res.status >= 500) errors.push(`${r.method} ${r.path} -> ${res.status} ${JSON.stringify(res.body).slice(0, 100)}`);
    }
    expect(errors).toEqual([]);
  });
});
