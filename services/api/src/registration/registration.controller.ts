import { Body, Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import { registrationSchema, type RegistrationInput } from '@rydo/shared';
import { ZodPipe } from '../common/zod.pipe';
import { AppError } from '../common/app-error';
import { Auth, type AuthContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MESSAGE_ADAPTER, type MessageAdapter } from '../adapters/message.adapter';

/**
 * New employee sign-up, step after verifying the email: save what they told us and ask their company's HR to approve.
 * Works for a signed-in person whose membership is still waiting (they cannot use company routes yet).
 */
@Controller('me/registration')
export class RegistrationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
    @Inject(MESSAGE_ADAPTER) private readonly messages: MessageAdapter,
  ) {}

  /** Where the person's sign-up stands, so the screen can resume after a refresh. */
  @Get()
  async status(@Auth() auth: AuthContext) {
    const ms = await this.prisma.membership.findMany({ where: { userId: auth.userId, status: { in: ['PENDING', 'ACTIVE', 'REJECTED'] } }, include: { organization: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 1 });
    const m = ms[0];
    if (!m) return { data: { status: 'NONE' as const } };
    const reg = await this.prisma.employeeRegistration.findUnique({ where: { membershipId: m.id }, select: { createdAt: true } });
    return { data: { status: m.status, company: m.organization.name, submittedAt: reg?.createdAt ?? null } };
  }

  @Post()
  @HttpCode(200)
  async submit(@Auth() auth: AuthContext, @Body(new ZodPipe(registrationSchema)) b: RegistrationInput) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { email: true } });
    const m = await this.prisma.membership.findFirst({ where: { userId: auth.userId, status: 'PENDING' }, include: { organization: { select: { id: true, name: true, emailDomains: true } } } });
    if (!m) {
      const active = await this.prisma.membership.findFirst({ where: { userId: auth.userId, status: 'ACTIVE' }, select: { id: true } });
      if (active) throw new AppError('CONFLICT', 'You are already registered with your company.', 409);
      throw new AppError('NOT_FOUND', 'There is no sign-up waiting for this email. Your company may not be on RYDO yet.', 404);
    }
    const org = m.organization;

    const domain = b.managerEmail.split('@')[1];
    if (!org.emailDomains.includes(domain)) throw new AppError('VALIDATION_ERROR', `Your manager's email should end with @${org.emailDomains[0]}.`, 400, { managerEmail: `Use a @${org.emailDomains[0]} address` });
    if (b.managerEmail === user.email.toLowerCase()) throw new AppError('VALIDATION_ERROR', 'Your manager cannot be you.', 400, { managerEmail: 'Use your manager\'s email' });

    const data = { organizationId: org.id, userId: auth.userId, fullName: b.fullName, phone: b.phone, idType: b.idType, idLast4: b.idLast4, employeeId: b.employeeId, designation: b.designation, department: b.department, office: b.office, managerName: b.managerName, managerEmail: b.managerEmail };
    const reg = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: auth.userId }, data: { name: b.fullName, phone: b.phone, gender: b.gender } });
      await tx.membership.update({ where: { id: m.id }, data: { employeeCode: b.employeeId } });
      return tx.employeeRegistration.upsert({ where: { membershipId: m.id }, create: { ...data, membershipId: m.id }, update: data });
    });

    // Ask HR once. Editing the details later does not send the request again.
    let told = 0;
    if (!reg.notifiedAt) {
      try {
        told = await this.notify.notifyAdmins(
          org.id,
          {
            type: 'REGISTRATION_REQUEST',
            title: `${b.fullName} is waiting for your approval`,
            body: `${b.fullName} (${user.email}) wants to join ${org.name} on RYDO.\nEmployee ID: ${b.employeeId}\nJob title: ${b.designation}\nDepartment: ${b.department}\nOffice: ${b.office}\nReporting manager: ${b.managerName} (${b.managerEmail})\n\nOpen RYDO, Employees, "Waiting for approval", to approve or reject.`,
            data: { membershipId: m.id },
            email: true,
          },
          ['ORG_ADMIN', 'HR_ADMIN'],
        );
        await this.prisma.employeeRegistration.update({ where: { id: reg.id }, data: { notifiedAt: new Date() } });
        await this.messages.sendEmail({
          to: user.email,
          subject: `Your RYDO request was sent to ${org.name}`,
          text: `Hi ${b.fullName.split(' ')[0]},\n\nThank you for registering. Your request was sent to the HR team at ${org.name}. When they approve your account we will email you, and you can start finding and offering rides.\n\n- RYDO`,
        });
      } catch {
        // The request is saved either way; HR still sees it in the Employees list.
      }
    }
    await this.audit.log({ organizationId: org.id, actorUserId: auth.userId, action: 'REGISTRATION_SUBMITTED', entityType: 'membership', entityId: m.id, after: { employeeId: b.employeeId, department: b.department } });
    return { data: { status: 'PENDING' as const, company: org.name, notifiedAdmins: told } };
  }
}
