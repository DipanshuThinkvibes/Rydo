import { Module } from '@nestjs/common';
import { PlatformOrgsController } from './platform-orgs.controller';
import { PlatformInsightsController } from './platform-insights.controller';
import { PlatformPeopleController } from './platform-people.controller';
import { PlatformImpactController } from './platform-impact.controller';
import { PlatformLicensesController } from './platform-licenses.controller';
import { ReportsController } from './reports.controller';
import { MembersController } from './members.controller';
import { OrgController } from './org.controller';
import { StructureController } from './structure.controller';
import { InvitesController } from './invites.controller';

@Module({ controllers: [PlatformOrgsController, PlatformInsightsController, PlatformPeopleController, PlatformImpactController, PlatformLicensesController, ReportsController, MembersController, OrgController, StructureController, InvitesController] })
export class AdminModule {}