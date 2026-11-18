import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, resetDb } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildWorld, World } from './world';

/** Feedback form, admin feedback dashboard, surveys and announcements. */
describe('Feedback, surveys and announcements', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'fb');
  });
  afterAll(() => app.close());

  // ───────── Feedback form ─────────

  describe('feedback form', () => {
    let firstId: string;

    it('anyone in the company can send feedback in a category, with an optional star rating', async () => {
      const res = await api(app).post('/api/v1/me/feedback').set(w.as('priya')).send({ category: 'MATCHING', rating: 4, comment: 'Matching suggestions were mostly right, but the pickup spot was far.' }).expect(200);
      firstId = res.body.data.id;
      expect(res.body.data).toMatchObject({ category: 'MATCHING', rating: 4, status: 'NEW' });
      await api(app).post('/api/v1/me/feedback').set(w.as('arjun')).send({ category: 'USABILITY', comment: 'The app is easy to use. Pickup selection could be faster.' }).expect(200);
      await api(app).post('/api/v1/me/feedback').set(w.as('kiran')).send({ category: 'COMMUNICATION', rating: 2, comment: 'Chat notifications arrive late, pickup messages especially.' }).expect(200);
    });

    it('checks the form', async () => {
      await api(app).post('/api/v1/me/feedback').set(w.as('priya')).send({ category: 'PAYMENTS', comment: 'There is no such category.' }).expect(400);
      await api(app).post('/api/v1/me/feedback').set(w.as('priya')).send({ category: 'GENERAL', rating: 6, comment: 'Rating out of range.' }).expect(400);
      await api(app).post('/api/v1/me/feedback').set(w.as('priya')).send({ category: 'GENERAL', comment: '' }).expect(400);
      expect((await api(app).get('/api/v1/me/feedback').set(w.as('priya')).expect(200)).body.data).toHaveLength(1);
    });

    it('only admins read all feedback; the list is categorised and pageable', async () => {
      await api(app).get('/api/v1/admin/feedback').set(w.as('priya')).expect(403);
      const all = (await api(app).get('/api/v1/admin/feedback').set(w.as('hr')).expect(200)).body;
      expect(all.data).toHaveLength(3);
      expect(all.meta.categories).toEqual({ MATCHING: 1, USABILITY: 1, COMMUNICATION: 1 });
      expect(all.data.find((f: { id: string }) => f.id === firstId)).toMatchObject({ categoryLabel: 'Ride matching and suggestions', from: { name: 'priya person' } });
      const p1 = (await api(app).get('/api/v1/admin/feedback?limit=2').set(w.as('hr')).expect(200)).body;
      expect(p1.meta.nextCursor).toBeTruthy();
      const p2 = (await api(app).get(`/api/v1/admin/feedback?limit=2&cursor=${encodeURIComponent(p1.meta.nextCursor)}`).set(w.as('hr')).expect(200)).body;
      expect(p1.data.length + p2.data.length).toBe(3);
      expect((await api(app).get('/api/v1/admin/feedback?category=USABILITY').set(w.as('ops')).expect(200)).body.data).toHaveLength(1);
    });

    it('an admin reviews feedback; this is recorded', async () => {
      const done = (await api(app).patch(`/api/v1/admin/feedback/${firstId}`).set(w.as('hr')).send({ status: 'REVIEWED', adminNote: 'Passed to the matching team.' }).expect(200)).body.data;
      expect(done).toMatchObject({ status: 'REVIEWED', adminNote: 'Passed to the matching team.' });
      expect(done.reviewedAt).toBeTruthy();
      await api(app).patch(`/api/v1/admin/feedback/${firstId}`).set(w.as('priya')).send({ status: 'CLOSED' }).expect(403);
      await api(app).patch(`/api/v1/admin/feedback/${firstId}`).set(w.as('hr')).send({}).expect(400);
      expect(await prisma.auditLog.count({ where: { action: 'FEEDBACK_UPDATED', entityId: firstId } })).toBe(1);
    });

    it('exports everything as a CSV that is safe to open in Excel', async () => {
      await api(app).post('/api/v1/me/feedback').set(w.as('stranger')).send({ category: 'GENERAL', comment: '=HYPERLINK("http://evil.example","click")' }).expect(200);
      const res = await api(app).get('/api/v1/admin/feedback/export.csv').set(w.as('hr')).expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('rydo-feedback.csv');
      expect(res.text.startsWith('﻿"Date","Category"')).toBe(true);
      expect(res.text).toContain(`"'=HYPERLINK(`); // a formula is defused
      expect(res.text).not.toMatch(/,"=HYPERLINK/);
      await api(app).get('/api/v1/admin/feedback/export.csv').set(w.as('priya')).expect(403);
      expect(await prisma.auditLog.count({ where: { action: 'FEEDBACK_EXPORTED' } })).toBe(1);
    });

    it('insights: rating trend, feedback and issue breakdowns, resolution times and recurring words', async () => {
      const rate = (rater: string, ratee: string, stars: number, comment: string | null, daysAgo: number) =>
        prisma.rating.create({ data: { organizationId: w.org, rideId: w.rideId, raterMembershipId: w.ms[rater], rateeMembershipId: w.ms[ratee], stars, comment, createdAt: new Date(Date.now() - daysAgo * 86_400_000) } });
      await rate('priya', 'driver', 5, 'Great', 20);
      await rate('arjun', 'driver', 3, null, 10);
      await rate('driver', 'priya', 4, null, 2);
      // two resolved issues: 10h and 2h to resolve
      const mk = (hoursToResolve: number, daysAgo: number) =>
        prisma.issueReport.create({ data: { organizationId: w.org, reporterMembershipId: w.ms.priya, category: 'LATE_OR_NO_SHOW', description: 'Driver was late for pickup again.', status: 'RESOLVED', createdAt: new Date(Date.now() - daysAgo * 86_400_000), resolvedAt: new Date(Date.now() - daysAgo * 86_400_000 + hoursToResolve * 3_600_000) } });
      await mk(10, 5);
      await mk(2, 3);

      const i = (await api(app).get('/api/v1/admin/feedback/insights?days=90').set(w.as('hr')).expect(200)).body.data;
      expect(i.rides).toMatchObject({ ratings: 3, averageRating: 4 });
      expect(i.rides.trend.length).toBeGreaterThanOrEqual(2);
      expect(i.feedback.total).toBe(4);
      expect(i.feedback.byCategory.find((c: { category: string }) => c.category === 'COMMUNICATION')).toMatchObject({ count: 1, averageRating: 2 });
      expect(i.feedback.byStatus).toMatchObject({ NEW: 3, REVIEWED: 1 });
      expect(i.issues).toMatchObject({ resolved: 2, avgHours: 6 });
      expect(i.issues.byCategory[0]).toMatchObject({ category: 'LATE_OR_NO_SHOW', total: 2, resolved: 2, avgHours: 6 });
      expect(i.issues.resolutionTrend.length).toBeGreaterThanOrEqual(1);
      expect(i.themes.map((t: { word: string }) => t.word)).toEqual(expect.arrayContaining(['pickup']));
      // narrower window leaves out the 20-day-old rating
      expect((await api(app).get('/api/v1/admin/feedback/insights?days=7').set(w.as('hr')).expect(200)).body.data.rides.ratings).toBe(1);
      await api(app).get('/api/v1/admin/feedback/insights?days=3').set(w.as('hr')).expect(400);
      await api(app).get('/api/v1/admin/feedback/insights').set(w.as('priya')).expect(403);
    });

    it('keeps companies apart', async () => {
      expect((await api(app).get('/api/v1/admin/feedback').set(w.as('outsider', w.other)).expect(200)).body.data).toHaveLength(0);
      await api(app).patch(`/api/v1/admin/feedback/${firstId}`).set(w.as('outsider', w.other)).send({ status: 'CLOSED' }).expect(404);
      const csv = await api(app).get('/api/v1/admin/feedback/export.csv').set(w.as('outsider', w.other)).expect(200);
      expect(csv.text).not.toContain('Matching suggestions');
      const ins = (await api(app).get('/api/v1/admin/feedback/insights').set(w.as('outsider', w.other)).expect(200)).body.data;
      expect(ins.feedback.total).toBe(0);
      expect(ins.rides.ratings).toBe(0);
    });
  });

  // ───────── Surveys ─────────

  describe('surveys', () => {
    let surveyId: string;
    const questions = [
      { id: 'overall', type: 'RATING', text: 'How satisfied are you with RYDO?' },
      { id: 'goal', type: 'CHOICE', text: 'What would help you most?', options: ['More rides', 'Better routes', 'Faster approvals'] },
      { id: 'idea', type: 'TEXT', text: 'Any feature ideas?' },
    ];

    it('an admin drafts a survey; the rules are checked', async () => {
      await api(app).post('/api/v1/admin/surveys').set(w.as('priya')).send({ title: 'Commute survey', questions }).expect(403);
      await api(app).post('/api/v1/admin/surveys').set(w.as('hr')).send({ title: 'x', questions }).expect(400);
      await api(app).post('/api/v1/admin/surveys').set(w.as('hr')).send({ title: 'Commute survey', questions: [questions[0], questions[0]] }).expect(400);
      await api(app).post('/api/v1/admin/surveys').set(w.as('hr')).send({ title: 'Commute survey', questions: [{ id: 'q', type: 'CHOICE', text: 'Pick one please', options: ['Only one'] }] }).expect(400);
      await api(app).post('/api/v1/admin/surveys').set(w.as('hr')).send({ title: 'Commute survey', questions, closesAt: '2020-01-01T00:00:00Z' }).expect(400);
      await api(app).post('/api/v1/admin/surveys').set(w.as('hr')).send({ title: 'Commute survey', questions, audience: { departmentIds: ['6f1f2c0a-3b5f-4c3e-9d58-0d6b1a2f3c4d'] } }).expect(400); // not one of our departments
      const res = await api(app).post('/api/v1/admin/surveys').set(w.as('hr')).send({ title: 'Commute survey', description: 'Tell us how commuting is going.', questions, audience: { roles: ['DRIVER'] } }).expect(200);
      surveyId = res.body.data.id;
      expect(res.body.data).toMatchObject({ status: 'DRAFT', audienceSize: 0, responses: 0 });
    });

    it('a draft is invisible to employees and cannot be answered', async () => {
      expect((await api(app).get('/api/v1/me/surveys').set(w.as('driver')).expect(200)).body.data).toHaveLength(0);
      await api(app).post(`/api/v1/me/surveys/${surveyId}/responses`).set(w.as('driver')).send({ answers: { overall: 5, goal: 'More rides' } }).expect(404);
    });

    it('publishing tells exactly the audience (here: drivers) and fixes the response-rate denominator', async () => {
      const before = await prisma.notification.count({ where: { type: 'SURVEY' } });
      const pub = (await api(app).post(`/api/v1/admin/surveys/${surveyId}/publish`).set(w.as('hr')).expect(200)).body.data;
      expect(pub).toMatchObject({ status: 'PUBLISHED', audienceSize: 1, responses: 0, responseRate: 0 });
      const told = await prisma.notification.findMany({ where: { type: 'SURVEY' } });
      expect(told.length - before).toBe(1);
      expect(told[0].userId).toBe(w.users.driver);
      await api(app).post(`/api/v1/admin/surveys/${surveyId}/publish`).set(w.as('hr')).expect(409); // already published
      await api(app).delete(`/api/v1/admin/surveys/${surveyId}`).set(w.as('hr')).expect(409); // only drafts can be deleted
    });

    it('only the audience sees and answers it; answers are validated; once only', async () => {
      expect((await api(app).get('/api/v1/me/surveys').set(w.as('priya')).expect(200)).body.data).toHaveLength(0); // a rider is not in the audience
      await api(app).post(`/api/v1/me/surveys/${surveyId}/responses`).set(w.as('priya')).send({ answers: { overall: 5, goal: 'More rides' } }).expect(403);
      const mine = (await api(app).get('/api/v1/me/surveys').set(w.as('driver')).expect(200)).body.data;
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ id: surveyId, answered: false });

      const bad = await api(app).post(`/api/v1/me/surveys/${surveyId}/responses`).set(w.as('driver')).send({ answers: { overall: 7, goal: 'Free pizza' } }).expect(400);
      expect(Object.keys(bad.body.error.fields).sort()).toEqual(['goal', 'overall']);
      const missing = await api(app).post(`/api/v1/me/surveys/${surveyId}/responses`).set(w.as('driver')).send({ answers: { overall: 4 } }).expect(400);
      expect(missing.body.error.fields.goal).toBeDefined();

      await api(app).post(`/api/v1/me/surveys/${surveyId}/responses`).set(w.as('driver')).send({ answers: { overall: 4, goal: 'Better routes', idea: 'Show my carbon savings' } }).expect(200);
      await api(app).post(`/api/v1/me/surveys/${surveyId}/responses`).set(w.as('driver')).send({ answers: { overall: 5, goal: 'More rides' } }).expect(409);
      expect((await api(app).get('/api/v1/me/surveys').set(w.as('driver')).expect(200)).body.data[0].answered).toBe(true);
    });

    it('results show the response rate and per-question summaries, without names', async () => {
      await api(app).get(`/api/v1/admin/surveys/${surveyId}`).set(w.as('driver')).expect(403);
      const r = (await api(app).get(`/api/v1/admin/surveys/${surveyId}`).set(w.as('ops')).expect(200)).body.data;
      expect(r).toMatchObject({ responses: 1, audienceSize: 1, responseRate: 1 });
      expect(r.perQuestion[0]).toMatchObject({ id: 'overall', answered: 1, average: 4, distribution: { 4: 1, 5: 0 } });
      expect(r.perQuestion[1]).toMatchObject({ counts: { 'Better routes': 1, 'More rides': 0, 'Faster approvals': 0 } });
      expect(r.perQuestion[2].answers).toEqual(['Show my carbon savings']);
      expect(JSON.stringify(r)).not.toContain(w.ms.driver);
      expect(JSON.stringify(r)).not.toContain('driver person');
      const list = (await api(app).get('/api/v1/admin/surveys').set(w.as('hr')).expect(200)).body.data;
      expect(list[0]).toMatchObject({ id: surveyId, responses: 1 });
    });

    it('closing stops answers; other companies see nothing', async () => {
      await api(app).get(`/api/v1/admin/surveys/${surveyId}`).set(w.as('outsider', w.other)).expect(404);
      await api(app).post(`/api/v1/admin/surveys/${surveyId}/publish`).set(w.as('outsider', w.other)).expect(404);
      expect((await api(app).get('/api/v1/admin/surveys').set(w.as('outsider', w.other)).expect(200)).body.data).toHaveLength(0);
      expect((await api(app).post(`/api/v1/admin/surveys/${surveyId}/close`).set(w.as('hr')).expect(200)).body.data.status).toBe('CLOSED');
      await api(app).post(`/api/v1/admin/surveys/${surveyId}/close`).set(w.as('hr')).expect(409);
      expect((await api(app).get('/api/v1/me/surveys').set(w.as('driver')).expect(200)).body.data).toHaveLength(0);
      await api(app).post(`/api/v1/me/surveys/${surveyId}/responses`).set(w.as('driver')).send({ answers: { overall: 1, goal: 'More rides' } }).expect(404);
    });

    it('a draft can be deleted; a survey for everyone reaches every active person', async () => {
      const draft = (await api(app).post('/api/v1/admin/surveys').set(w.as('hr')).send({ title: 'Pulse check', questions: [questions[0]] }).expect(200)).body.data.id;
      await api(app).delete(`/api/v1/admin/surveys/${draft}`).set(w.as('hr')).expect(200);
      await api(app).get(`/api/v1/admin/surveys/${draft}`).set(w.as('hr')).expect(404);
      const all = (await api(app).post('/api/v1/admin/surveys').set(w.as('hr')).send({ title: 'Pulse check', questions: [questions[0]] }).expect(200)).body.data.id;
      const pub = (await api(app).post(`/api/v1/admin/surveys/${all}/publish`).set(w.as('hr')).expect(200)).body.data;
      expect(pub.audienceSize).toBe(6); // 7 active people in the company, minus the admin who published it
      expect((await api(app).get('/api/v1/me/surveys').set(w.as('kiran')).expect(200)).body.data).toHaveLength(1);
    });
  });

  // ───────── Announcements ─────────

  describe('announcements', () => {
    it('HR sends one to everyone; each active person gets an inbox notice, and email if asked', async () => {
      const mailsBefore = messages.sent.length;
      const res = await api(app).post('/api/v1/admin/announcements').set(w.as('hr')).send({ title: 'Office closed Friday', body: 'Carpooling is paused on Friday.', email: true }).expect(200);
      expect(res.body.data.recipients).toBe(7);
      expect(await prisma.notification.count({ where: { type: 'ANNOUNCEMENT', organizationId: w.org } })).toBe(7);
      expect(messages.sent.slice(mailsBefore).filter((m) => m.subject === 'Office closed Friday')).toHaveLength(7);
      expect(await prisma.notification.count({ where: { type: 'ANNOUNCEMENT', organizationId: w.other } })).toBe(0);
    });

    it('can target drivers only; riders and Ops admins cannot send; unknown departments are refused', async () => {
      const res = await api(app).post('/api/v1/admin/announcements').set(w.as('hr')).send({ title: 'Driver tips', body: 'Please keep your documents up to date.', audience: { roles: ['DRIVER'] } }).expect(200);
      expect(res.body.data.recipients).toBe(1);
      await api(app).post('/api/v1/admin/announcements').set(w.as('priya')).send({ title: 'Free lunch', body: 'Everyone come.' }).expect(403);
      await api(app).post('/api/v1/admin/announcements').set(w.as('ops')).send({ title: 'Free lunch', body: 'Everyone come.' }).expect(403);
      await api(app).post('/api/v1/admin/announcements').set(w.as('hr')).send({ title: 'Hi', body: 'x' }).expect(400);
      await api(app).post('/api/v1/admin/announcements').set(w.as('hr')).send({ title: 'Team news', body: 'Hello team.', audience: { departmentIds: ['6f1f2c0a-3b5f-4c3e-9d58-0d6b1a2f3c4d'] } }).expect(400);
    });

    it('is listed in history for admins of that company only', async () => {
      const h = (await api(app).get('/api/v1/admin/announcements').set(w.as('ops')).expect(200)).body.data;
      expect(h.map((a: { title: string }) => a.title)).toEqual(['Driver tips', 'Office closed Friday']);
      expect(h[1]).toMatchObject({ recipients: 7, email: true });
      expect((await api(app).get('/api/v1/admin/announcements').set(w.as('outsider', w.other)).expect(200)).body.data).toHaveLength(0);
      await api(app).get('/api/v1/admin/announcements').set(w.as('priya')).expect(403);
    });
  });
});
