import { Body, Controller, Get, HttpCode, Inject, Logger, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { inquiryCreateSchema, inquiryQuerySchema, inquiryUpdateSchema, type InquiryCreate, type InquiryQuery, type InquiryUpdate } from '@rydo/shared';
import type { Prisma } from '@prisma/client';
import { ZodPipe } from '../common/zod.pipe';
import { AppError } from '../common/app-error';
import { Auth, type AuthContext } from '../common/request-context';
import { Public } from '../auth/public.decorator';
import { PlatformAdmin } from '../tenancy/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MESSAGE_ADAPTER, type MessageAdapter } from '../adapters/message.adapter';

/** Public "Contact us": a company asks to be onboarded. */
@Controller('public/contact')
export class PublicContactController {
  private readonly log = new Logger('Inquiries');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(MESSAGE_ADAPTER) private readonly messages: MessageAdapter,
  ) {}

  /** 5 requests per hour per address. A filled hidden field is a bot: we say thanks and keep nothing. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post()
  @HttpCode(200)
  async submit(@Body(new ZodPipe(inquiryCreateSchema)) b: InquiryCreate) {
    if (b.website) return { data: { received: true } };

    // The same person sending the form twice in a day is one request.
    const dup = await this.prisma.onboardingInquiry.findFirst({ where: { workEmail: b.workEmail, companyName: b.companyName, createdAt: { gt: new Date(Date.now() - 86_400_000) } }, select: { id: true } });
    if (dup) return { data: { received: true } };

    const row = await this.prisma.onboardingInquiry.create({
      data: { companyName: b.companyName, contactName: b.contactName, workEmail: b.workEmail, phone: b.phone, companySize: b.companySize, city: b.city, message: b.message },
    });
    await this.audit.log({ action: 'INQUIRY_RECEIVED', entityType: 'onboarding_inquiry', entityId: row.id, after: { companyName: b.companyName, companySize: b.companySize } });

    // Tell the RYDO team and confirm to the sender. A mail problem must not lose the request.
    try {
      const staff = await this.prisma.platformAdmin.findMany({ where: { role: 'SUPER_ADMIN' }, select: { user: { select: { id: true, email: true } } } });
      if (staff.length) {
        await this.prisma.notification.createMany({
          data: staff.map((s) => ({ userId: s.user.id, type: 'ONBOARDING_INQUIRY', title: `New onboarding request: ${b.companyName}`, body: `${b.contactName} (${b.workEmail}), ${b.companySize} people${b.city ? `, ${b.city}` : ''}.`, data: { inquiryId: row.id } })),
        });
      }
      for (const s of staff) {
        await this.messages.sendEmail({ to: s.user.email, subject: `New onboarding request: ${b.companyName}`, text: `${b.contactName} <${b.workEmail}>\nCompany: ${b.companyName}\nSize: ${b.companySize}\nCity: ${b.city ?? '-'}\nPhone: ${b.phone ?? '-'}\n\n${b.message ?? '(no message)'}\n\nOpen the RYDO owner console, Onboarding requests, to follow up.` });
      }
      await this.messages.sendEmail({
        to: b.workEmail,
        subject: 'We got your request: RYDO',
        text: `Hi ${b.contactName},\n\nThanks for your interest in RYDO for ${b.companyName}. The RYDO team will contact you within 2 working days to set up your company, offices and admins.\n\nIf you did not send this request, you can ignore this email.\n\n- RYDO`,
      });
    } catch (e) {
      this.log.warn(`Inquiry ${row.id} saved, but a notification failed: ${(e as Error).message}`);
    }
    return { data: { received: true } };
  }
}

/** The RYDO team's inbox of onboarding requests. */
@Controller('admin/platform/inquiries')
@PlatformAdmin()
export class InquiriesAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Query(new ZodPipe(inquiryQuerySchema)) q: InquiryQuery) {
    const where: Prisma.OnboardingInquiryWhereInput = q.status ? { status: q.status } : {};
    if (q.cursor) {
      const [iso, id] = q.cursor.split('|');
      const at = new Date(iso);
      if (!id || Number.isNaN(at.getTime())) throw new AppError('VALIDATION_ERROR', 'Bad cursor.', 400, { cursor: 'Invalid' });
      where.OR = [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: id } }];
    }
    const [rows, counts] = await Promise.all([
      this.prisma.onboardingInquiry.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: q.limit + 1 }),
      this.prisma.onboardingInquiry.groupBy({ by: ['status'], _count: true }),
    ]);
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
      data: page,
      meta: { nextCursor: rows.length > q.limit && last ? `${last.createdAt.toISOString()}|${last.id}` : null, counts: { NEW: 0, CONTACTED: 0, ONBOARDED: 0, CLOSED: 0, ...Object.fromEntries(counts.map((c) => [c.status, c._count])) } },
    };
  }

  @Patch(':id')
  async update(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(inquiryUpdateSchema)) b: InquiryUpdate) {
    const row = await this.prisma.onboardingInquiry.findUnique({ where: { id } });
    if (!row) throw new AppError('NOT_FOUND', 'Request not found.', 404);
    const updated = await this.prisma.onboardingInquiry.update({ where: { id }, data: { status: b.status, notes: b.notes ?? row.notes, handledById: auth.userId } });
    await this.audit.log({ actorUserId: auth.userId, action: 'INQUIRY_UPDATED', entityType: 'onboarding_inquiry', entityId: id, before: { status: row.status }, after: { status: updated.status } });
    return { data: updated };
  }
}
