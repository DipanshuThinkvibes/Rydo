import { Module } from '@nestjs/common';
import { PlatformOrgsController } from './platform-orgs.controller';
import { PlatformInsightsController } from './platform-insights.controller';
import { ReportsController } from './reports.controller';
import { MembersController } from './members.controller';
import { OrgController } from './org.controller';
import { StructureController } from './structure.controller';

@Module({ controllers: [PlatformOrgsController, PlatformInsightsController, ReportsController, MembersController, OrgController, StructureController] })
export class AdminModule {}