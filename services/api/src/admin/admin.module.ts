import { Module } from '@nestjs/common';
import { PlatformOrgsController } from './platform-orgs.controller';
import { MembersController } from './members.controller';
import { OrgController } from './org.controller';
import { StructureController } from './structure.controller';

@Module({ controllers: [PlatformOrgsController, MembersController, OrgController, StructureController] })
export class AdminModule {}