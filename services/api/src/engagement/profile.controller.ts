import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { photoConfirmSchema, photoUploadSchema } from '@rydo/shared';
import type { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, Org, type AuthContext, type OrgContext } from '../common/request-context';
import { OrgScoped } from '../tenancy/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { STORAGE_ADAPTER, StorageAdapter } from '../adapters/storage.adapter';

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Profile photo, my own profile with ratings, and a colleague's public card (never phone or email). */
@Controller()
export class ProfileController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  private async photoUrl(key: string | null) {
    return key ? this.storage.signedReadUrl(key, 600) : null;
  }

  /** Average stars and how many ratings (from riders and drivers alike), plus the latest written comments, anonymous. */
  private async rating(organizationId: string, membershipId: string, withComments: boolean) {
    const [agg, comments] = await Promise.all([
      this.prisma.rating.aggregate({ where: { organizationId, rateeMembershipId: membershipId }, _avg: { stars: true }, _count: true }),
      withComments
        ? this.prisma.rating.findMany({ where: { organizationId, rateeMembershipId: membershipId, comment: { not: null } }, orderBy: { createdAt: 'desc' }, take: 5, select: { stars: true, comment: true, createdAt: true } })
        : Promise.resolve([]),
    ]);
    return { average: agg._avg.stars ? Math.round(agg._avg.stars * 100) / 100 : null, count: agg._count, ...(withComments ? { recentComments: comments } : {}) };
  }

  @Post('me/photo/upload-url')
  @HttpCode(200)
  async uploadUrl(@Auth() auth: AuthContext, @Body(new ZodPipe(photoUploadSchema)) b: z.infer<typeof photoUploadSchema>) {
    const key = `users/${auth.userId}/photo-${randomUUID()}.${EXT[b.contentType]}`;
    return { data: { key, uploadUrl: await this.storage.signedUploadUrl(key, b.contentType, 300), method: 'PUT', headers: { 'content-type': b.contentType }, expiresInSec: 300 } };
  }

  /** Call after the upload succeeds. Only a key issued to this person can be saved. */
  @Put('me/photo')
  async savePhoto(@Auth() auth: AuthContext, @Body(new ZodPipe(photoConfirmSchema)) b: z.infer<typeof photoConfirmSchema>) {
    const ok = new RegExp(`^users/${auth.userId}/photo-[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(b.key);
    if (!ok) throw new AppError('VALIDATION_ERROR', 'That is not one of your photo uploads.', 400, { key: 'Invalid key' });
    await this.prisma.user.update({ where: { id: auth.userId }, data: { photoKey: b.key } });
    return { data: { photoUrl: await this.photoUrl(b.key) } };
  }

  @Delete('me/photo')
  async removePhoto(@Auth() auth: AuthContext) {
    await this.prisma.user.update({ where: { id: auth.userId }, data: { photoKey: null } });
    return { data: { photoUrl: null } };
  }

  @Get('me/profile')
  @OrgScoped()
  async profile(@Auth() auth: AuthContext, @Org() org: OrgContext) {
    const [user, m, rating, asDriver, asRider, contacts] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { name: true, email: true, phone: true, gender: true, photoKey: true } }),
      this.prisma.membership.findUniqueOrThrow({ where: { id: org.membershipId }, select: { reliabilityScore: true, department: { select: { name: true } }, driver: { select: { status: true, preferences: true } } } }),
      this.rating(org.organizationId, org.membershipId, true),
      this.prisma.ride.count({ where: { organizationId: org.organizationId, driverMembershipId: org.membershipId, status: 'COMPLETED' } }),
      this.prisma.booking.count({ where: { organizationId: org.organizationId, riderMembershipId: org.membershipId, status: 'COMPLETED' } }),
      this.prisma.emergencyContact.count({ where: { userId: auth.userId } }),
    ]);
    return {
      data: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        gender: user.gender,
        photoUrl: await this.photoUrl(user.photoKey),
        department: m.department?.name ?? null,
        roles: org.roles,
        reliabilityScore: Number(m.reliabilityScore),
        rating,
        ridesCompleted: { asDriver, asRider },
        driver: m.driver ? { status: m.driver.status, preferences: m.driver.preferences } : null,
        emergencyContacts: contacts,
      },
    };
  }

  /** What one colleague may see about another: name, photo, rating, reliability and ride counts. */
  @Get('members/:membershipId/card')
  @OrgScoped()
  async card(@Org() org: OrgContext, @Param('membershipId', ParseUUIDPipe) membershipId: string) {
    const m = await this.prisma.membership.findFirst({
      where: { id: membershipId, organizationId: org.organizationId, status: 'ACTIVE' },
      select: { reliabilityScore: true, user: { select: { name: true, photoKey: true } }, department: { select: { name: true } }, driver: { select: { status: true, preferences: true, vehicles: { where: { active: true, isDefault: true }, select: { type: true, carType: true, make: true, model: true, color: true, hasAc: true }, take: 1 } } } },
    });
    if (!m) throw new AppError('NOT_FOUND', 'Person not found.', 404);
    const [rating, asDriver, asRider] = await Promise.all([
      this.rating(org.organizationId, membershipId, true),
      this.prisma.ride.count({ where: { organizationId: org.organizationId, driverMembershipId: membershipId, status: 'COMPLETED' } }),
      this.prisma.booking.count({ where: { organizationId: org.organizationId, riderMembershipId: membershipId, status: 'COMPLETED' } }),
    ]);
    return {
      data: {
        membershipId,
        name: m.user.name,
        photoUrl: await this.photoUrl(m.user.photoKey),
        department: m.department?.name ?? null,
        reliabilityScore: Number(m.reliabilityScore),
        rating,
        ridesCompleted: { asDriver, asRider },
        driver: m.driver?.status === 'VERIFIED' ? { verified: true, preferences: m.driver.preferences, vehicle: m.driver.vehicles[0] ?? null } : null,
      },
    };
  }
}
