import { Module } from '@nestjs/common';
import { PlatformOrgsController } from './platform-orgs.controller';
import { MembersController } from './members.controller';

@Module({ controllers: [PlatformOrgsController, MembersController] })
export class AdminModule {}