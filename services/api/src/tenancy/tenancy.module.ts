import { Global, Module } from '@nestjs/common';
import { OrgGuard } from './org.guard';
import { PlatformAdminGuard } from './platform-admin.guard';

@Global()
@Module({ providers: [OrgGuard, PlatformAdminGuard], exports: [OrgGuard, PlatformAdminGuard] })
export class TenancyModule {}