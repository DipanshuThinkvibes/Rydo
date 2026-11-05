import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import type { OrgFeatures, OrgRoleName } from '@rydo/shared';
import { ORG_FEATURE_KEY, ORG_ROLES_KEY, OrgGuard } from './org.guard';
import { PlatformAdminGuard } from './platform-admin.guard';
import { OrgOrPlatformGuard } from './org-or-platform.guard';

/** Route runs inside one company (X-Org-Id). With roles: caller needs at least one of them. */
export const OrgScoped = (...roles: OrgRoleName[]) => applyDecorators(SetMetadata(ORG_ROLES_KEY, roles), UseGuards(OrgGuard));

/** Route is for RYDO Super Admins only. */
export const PlatformAdmin = () => UseGuards(PlatformAdminGuard);
/** Route only works when RYDO has switched this feature on for the company (set with @OrgScoped). */
export const RequireFeature = (feature: keyof OrgFeatures) => SetMetadata(ORG_FEATURE_KEY, feature);

/** Works inside a company, and for RYDO Super Admins without one (owner console). */
export const OrgOrPlatform = () => UseGuards(OrgOrPlatformGuard);
