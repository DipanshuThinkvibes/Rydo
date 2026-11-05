import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { departmentSchema, officeSchema, type OfficeInput } from '@rydo/shared';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, Org, type AuthContext, type OrgContext } from '../common/request-context';
import { OrgScoped } from '../tenancy/decorators';

interface OfficeRow {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  isDefault: boolean;
}

/** Company offices (with a map point) and departments. Every query is limited to the caller's company. */
@Controller('admin')
export class StructureController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Offices ──

  /** Every employee can see the offices (for picking pickup/drop); only admins change them. */
  @Get('offices')
  @OrgScoped()
  async offices(@Org() org: OrgContext) {
    const rows = await this.prisma.$queryRaw<OfficeRow[]>`
      SELECT id, name, address, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng, is_default AS "isDefault"
      FROM offices WHERE organization_id = ${org.organizationId}::uuid ORDER BY is_default DESC, name`;
    return { data: rows };
  }

  @Post('offices')
  @OrgScoped('ORG_ADMIN')
  async createOffice(@Auth() auth: AuthContext, @Org() org: OrgContext, @Body(new ZodPipe(officeSchema)) b: OfficeInput) {
    const id = await this.prisma.$transaction(async (tx) => {
      if (b.isDefault) await tx.office.updateMany({ where: { organizationId: org.organizationId }, data: { isDefault: false } });
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO offices (id, organization_id, name, address, location, is_default)
        VALUES (gen_random_uuid(), ${org.organizationId}::uuid, ${b.name}, ${b.address}, ST_SetSRID(ST_MakePoint(${b.lng}, ${b.lat}), 4326)::geography, ${b.isDefault})
        RETURNING id`;
      await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'OFFICE_CREATED', entityType: 'office', entityId: row.id, after: b }, tx);
      return row.id;
    });
    return { data: { id } };
  }

  @Patch('offices/:id')
  @OrgScoped('ORG_ADMIN')
  async updateOffice(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(officeSchema)) b: OfficeInput) {
    await this.prisma.$transaction(async (tx) => {
      if (b.isDefault) await tx.office.updateMany({ where: { organizationId: org.organizationId }, data: { isDefault: false } });
      const n = await tx.$executeRaw`
        UPDATE offices SET name = ${b.name}, address = ${b.address}, is_default = ${b.isDefault},
          location = ST_SetSRID(ST_MakePoint(${b.lng}, ${b.lat}), 4326)::geography
        WHERE id = ${id}::uuid AND organization_id = ${org.organizationId}::uuid`;
      if (!n) throw new AppError('NOT_FOUND', 'Office not found.', 404);
      await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'OFFICE_UPDATED', entityType: 'office', entityId: id, after: b }, tx);
    });
    return { data: { id } };
  }

  @Delete('offices/:id')
  @HttpCode(200)
  @OrgScoped('ORG_ADMIN')
  async deleteOffice(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    const { count } = await this.prisma.office.deleteMany({ where: { id, organizationId: org.organizationId } });
    if (!count) throw new AppError('NOT_FOUND', 'Office not found.', 404);
    await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'OFFICE_DELETED', entityType: 'office', entityId: id });
    return { data: { id } };
  }

  // ── Departments ──

  @Get('departments')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN')
  async departments(@Org() org: OrgContext) {
    const rows = await this.prisma.department.findMany({
      where: { organizationId: org.organizationId },
      include: { _count: { select: { memberships: true } } },
      orderBy: { name: 'asc' },
    });
    return { data: rows.map((d) => ({ id: d.id, name: d.name, members: d._count.memberships })) };
  }

  @Post('departments')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN')
  async createDepartment(@Auth() auth: AuthContext, @Org() org: OrgContext, @Body(new ZodPipe(departmentSchema)) b: z.infer<typeof departmentSchema>) {
    const d = await this.prisma.department.create({ data: { organizationId: org.organizationId, name: b.name } });
    await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'DEPARTMENT_CREATED', entityType: 'department', entityId: d.id, after: b });
    return { data: { id: d.id, name: d.name, members: 0 } };
  }

  @Patch('departments/:id')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN')
  async renameDepartment(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(departmentSchema)) b: z.infer<typeof departmentSchema>) {
    const { count } = await this.prisma.department.updateMany({ where: { id, organizationId: org.organizationId }, data: { name: b.name } });
    if (!count) throw new AppError('NOT_FOUND', 'Department not found.', 404);
    await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'DEPARTMENT_RENAMED', entityType: 'department', entityId: id, after: b });
    return { data: { id, name: b.name } };
  }

  @Delete('departments/:id')
  @HttpCode(200)
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN')
  async deleteDepartment(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.$transaction(async (tx) => {
      const d = await tx.department.findFirst({ where: { id, organizationId: org.organizationId } });
      if (!d) throw new AppError('NOT_FOUND', 'Department not found.', 404);
      await tx.membership.updateMany({ where: { departmentId: id }, data: { departmentId: null } });
      await tx.department.delete({ where: { id } });
      await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'DEPARTMENT_DELETED', entityType: 'department', entityId: id, before: { name: d.name } }, tx);
    });
    return { data: { id } };
  }
}