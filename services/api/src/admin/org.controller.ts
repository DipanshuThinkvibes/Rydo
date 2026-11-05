import { Body, Controller, Get, HttpStatus, Inject, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Prisma } from '@prisma/client';
import { DEFAULT_ORG_SETTINGS, orgSettingsSchema, updateOrgSchema, type UpdateOrg } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, Org, type AuthContext, type OrgContext } from '../common/request-context';
import { OrgScoped } from '../tenancy/decorators';
import { STORAGE_ADAPTER, StorageAdapter } from '../adapters/storage.adapter';
import { randomToken } from '../auth/crypto';

const LOGO_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const LOGO_MAX_BYTES = 1024 * 1024;

/** The caller's own company: name, email domains, logo and ride rules. */
@Controller('admin/org')
export class OrgController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  private async view(organizationId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    // Stored settings may miss keys added later; parsing fills every default.
    const settings = orgSettingsSchema.parse({ ...DEFAULT_ORG_SETTINGS, ...(org.settings as object) });
    const logoUrl = org.logoKey ? await this.storage.signedReadUrl(org.logoKey, 3600).catch(() => null) : null;
    return { id: org.id, name: org.name, slug: org.slug, emailDomains: org.emailDomains, status: org.status, settings, logoUrl };
  }

  @Get()
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN')
  async get(@Org() org: OrgContext) {
    return { data: await this.view(org.organizationId) };
  }

  @Patch()
  @OrgScoped('ORG_ADMIN')
  async update(@Auth() auth: AuthContext, @Org() org: OrgContext, @Body(new ZodPipe(updateOrgSchema)) body: UpdateOrg) {
    const before = await this.prisma.organization.findUniqueOrThrow({ where: { id: org.organizationId } });
    if (body.emailDomains) {
      const clash = await this.prisma.organization.findFirst({ where: { id: { not: org.organizationId }, emailDomains: { hasSome: body.emailDomains } } });
      if (clash) throw new AppError('CONFLICT', 'Another company on RYDO already uses one of these email domains.', 409, { emailDomains: 'Already used by another company' });
    }
    const settings = body.settings ? { ...(before.settings as object), ...body.settings } : undefined;
    await this.prisma.organization.update({
      where: { id: org.organizationId },
      data: { name: body.name, emailDomains: body.emailDomains, settings: settings as Prisma.InputJsonValue | undefined },
    });
    await this.audit.log({
      organizationId: org.organizationId, actorUserId: auth.userId, action: 'ORG_UPDATED', entityType: 'organization', entityId: org.organizationId,
      before: { name: before.name, emailDomains: before.emailDomains, settings: before.settings }, after: body,
    });
    return { data: await this.view(org.organizationId) };
  }

  @Post('logo')
  @OrgScoped('ORG_ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: LOGO_MAX_BYTES } }))
  async uploadLogo(@Auth() auth: AuthContext, @Org() org: OrgContext, @UploadedFile() file?: Express.Multer.File) {
    const ext = file && LOGO_TYPES[file.mimetype];
    if (!file || !ext) throw new AppError('VALIDATION_ERROR', 'Upload a PNG, JPG or WebP image up to 1 MB.', HttpStatus.BAD_REQUEST, { file: 'PNG, JPG or WebP, max 1 MB' });
    const key = `orgs/${org.organizationId}/logo-${randomToken(9)}.${ext}`;
    await this.storage.put(key, file.buffer, file.mimetype);
    await this.prisma.organization.update({ where: { id: org.organizationId }, data: { logoKey: key } });
    await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'ORG_LOGO_CHANGED', entityType: 'organization', entityId: org.organizationId, after: { key } });
    return { data: await this.view(org.organizationId) };
  }
}