import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/** Every admin action is written here. Rows are never updated or deleted by the app. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(e: AuditEntry, tx: Prisma.TransactionClient = this.prisma) {
    await tx.auditLog.create({
      data: {
        organizationId: e.organizationId ?? null,
        actorUserId: e.actorUserId ?? null,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        before: (e.before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (e.after ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}