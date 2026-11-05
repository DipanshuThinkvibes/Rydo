import { Global, Module } from '@nestjs/common';
import { OrgGuard } from './org.guard';
import { OrgOrPlatformGuard } from './org-or-platform.guard';
import { PlatformAdminGuard } from './platform-admin.guard';

@Global()
@Module({ providers: [OrgGuard, OrgOrPlatformGuard, PlatformAdminGuard], exports: [OrgGuard, OrgOrPlatformGuard, PlatformAdminGuard] })
export class TenancyModule {}