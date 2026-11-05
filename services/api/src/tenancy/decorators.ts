import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import type { OrgRoleName } from '@rydo/shared';
import { ORG_ROLES_KEY, OrgGuard } from './org.guard';
import { PlatformAdminGuard } from './platform-admin.guard';

/** Route runs inside one company (X-Org-Id). With roles: caller needs at least one of them. */
export const OrgScoped = (...roles: OrgRoleName[]) => applyDecorators(SetMetadata(ORG_ROLES_KEY, roles), UseGuards(OrgGuard));

/** Route is for RYDO Super Admins only. */
export const PlatformAdmin = () => UseGuards(PlatformAdminGuard);