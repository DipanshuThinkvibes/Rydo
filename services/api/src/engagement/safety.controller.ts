import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { MAX_EMERGENCY_CONTACTS, blockSchema, emergencyContactSchema, shareToContactsSchema, type BlockInput, type EmergencyContactInput, type ShareToContacts } from '@rydo/shared';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, Org, type AuthContext, type OrgContext } from '../common/request-context';
import { OrgScoped, RequireFeature } from '../tenancy/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { MESSAGE_ADAPTER, MessageAdapter } from '../adapters/message.adapter';
import { TripService } from '../tracking/trip.service';

const shape = (c: { id: string; name: string; phone: string; email: string | null; relation: string | null }) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, relation: c.relation });

/** People to tell when something goes wrong. Belong to the person, not to a company. */
@Controller('me/emergency-contacts')
export class EmergencyContactsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Auth() auth: AuthContext) {
    return { data: (await this.prisma.emergencyContact.findMany({ where: { userId: auth.userId }, orderBy: { createdAt: 'asc' } })).map(shape) };
  }

  @Post()
  @HttpCode(200)
  async add(@Auth() auth: AuthContext, @Body(new ZodPipe(emergencyContactSchema)) b: EmergencyContactInput) {
    const mine = await this.prisma.emergencyContact.findMany({ where: { userId: auth.userId }, select: { phone: true } });
    if (mine.length >= MAX_EMERGENCY_CONTACTS) throw new AppError('CONFLICT', `You can keep up to ${MAX_EMERGENCY_CONTACTS} emergency contacts.`, 409);
    if (mine.some((c) => c.phone === b.phone)) throw new AppError('CONFLICT', 'You already added this phone number.', 409);
    return { data: shape(await this.prisma.emergencyContact.create({ data: { userId: auth.userId, name: b.name, phone: b.phone, email: b.email, relation: b.relation } })) };
  }

  @Patch(':id')
  async update(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(emergencyContactSchema)) b: EmergencyContactInput) {
    const { count } = await this.prisma.emergencyContact.updateMany({ where: { id, userId: auth.userId }, data: { name: b.name, phone: b.phone, email: b.email ?? null, relation: b.relation ?? null } });
    if (!count) throw new AppError('NOT_FOUND', 'Contact not found.', 404);
    return { data: shape(await this.prisma.emergencyContact.findUniqueOrThrow({ where: { id } })) };
  }

  @Delete(':id')
  async remove(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    const { count } = await this.prisma.emergencyContact.deleteMany({ where: { id, userId: auth.userId } });
    if (!count) throw new AppError('NOT_FOUND', 'Contact not found.', 404);
    return { data: { id } };
  }
}

/** Block a colleague: they stop appearing in each other's ride search and can't message each other. */
@Controller('me/blocks')
@OrgScoped()
export class BlocksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async list(org: OrgContext) {
    const rows = await this.prisma.userBlock.findMany({ where: { organizationId: org.organizationId, blockerId: org.membershipId }, orderBy: { createdAt: 'desc' } });
    const people = await this.prisma.membership.findMany({ where: { id: { in: rows.map((r) => r.blockedId) } }, select: { id: true, user: { select: { name: true } } } });
    const name = new Map(people.map((p) => [p.id, p.user.name]));
    return rows.map((r) => ({ membershipId: r.blockedId, name: name.get(r.blockedId) ?? 'Former member', blockedAt: r.createdAt }));
  }

  @Get()
  async mine(@Org() org: OrgContext) {
    return { data: await this.list(org) };
  }

  @Post()
  @HttpCode(200)
  async block(@Auth() auth: AuthContext, @Org() org: OrgContext, @Body(new ZodPipe(blockSchema)) b: BlockInput) {
    if (b.membershipId === org.membershipId) throw new AppError('VALIDATION_ERROR', "You can't block yourself.", 400, { membershipId: 'Pick someone else' });
    const other = await this.prisma.membership.findFirst({ where: { id: b.membershipId, organizationId: org.organizationId }, select: { id: true } });
    if (!other) throw new AppError('NOT_FOUND', 'That person is not in your company.', 404);
    await this.prisma.userBlock.createMany({ data: [{ organizationId: org.organizationId, blockerId: org.membershipId, blockedId: b.membershipId }], skipDuplicates: true });
    await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'USER_BLOCKED', entityType: 'membership', entityId: b.membershipId });
    return { data: await this.list(org) };
  }

  @Delete(':membershipId')
  async unblock(@Org() org: OrgContext, @Param('membershipId', ParseUUIDPipe) membershipId: string) {
    await this.prisma.userBlock.deleteMany({ where: { organizationId: org.organizationId, blockerId: org.membershipId, blockedId: membershipId } });
    return { data: await this.list(org) };
  }
}

/** After pickup a rider can send the live-trip link to chosen emergency contacts. */
@Controller('rides')
@OrgScoped()
@RequireFeature('share')
export class ShareToContactsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripService,
    private readonly audit: AuditService,
    @Inject(MESSAGE_ADAPTER) private readonly messages: MessageAdapter,
  ) {}

  @Post(':rideId/share/contacts')
  @HttpCode(200)
  async share(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('rideId', ParseUUIDPipe) rideId: string, @Body(new ZodPipe(shareToContactsSchema)) b: ShareToContacts) {
    const ids = [...new Set(b.contactIds)];
    const contacts = await this.prisma.emergencyContact.findMany({ where: { id: { in: ids }, userId: auth.userId } });
    if (contacts.length !== ids.length) throw new AppError('NOT_FOUND', 'One of those contacts was not found.', 404);
    const reachable = contacts.filter((c) => c.email);
    if (!reachable.length) throw new AppError('CONFLICT', 'None of these contacts has an email address. Add one first.', 409);

    const link = await this.trips.share(org, rideId); // refuses anyone who is not a booked rider on this ride
    const me = (await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { name: true } })).name;
    for (const c of reachable) {
      await this.messages.sendEmail({
        to: c.email!,
        subject: `${me} shared their live RYDO trip with you`,
        text: `Hi ${c.name},\n\n${me} is on a shared ride to or from work and chose to share it with you.\nFollow the trip live here until it ends:\n${link.url}\n\nThe link shows the route, the vehicle and the live position. It never shows phone numbers or email addresses, and it stops working a few hours after the ride.\n\n- RYDO`,
      });
    }
    await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'TRIP_SHARED_TO_CONTACTS', entityType: 'ride', entityId: rideId, after: { contacts: reachable.length } });
    return {
      data: {
        url: link.url,
        expiresAt: link.expiresAt,
        sentTo: reachable.map((c) => ({ id: c.id, name: c.name })),
        skippedNoEmail: contacts.filter((c) => !c.email).map((c) => ({ id: c.id, name: c.name })),
      },
    };
  }
}
