import { Body, Controller, Get, Patch } from '@nestjs/common';
import { updateMeSchema, type UpdateMe } from '@rydo/shared';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, type AuthContext } from '../common/request-context';
import { MeService } from './me.service';

@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  async get(@Auth() auth: AuthContext) {
    return { data: await this.me.summary(auth.userId) };
  }

  @Patch()
  async update(@Auth() auth: AuthContext, @Body(new ZodPipe(updateMeSchema)) body: UpdateMe) {
    return { data: await this.me.update(auth.userId, body) };
  }

  @Get('memberships')
  async memberships(@Auth() auth: AuthContext) {
    return { data: (await this.me.summary(auth.userId)).memberships };
  }
}