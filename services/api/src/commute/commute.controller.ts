import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { commuteUpdateSchema, homePlaceSchema, preferredDriverSchema, waitlistCreateSchema, type CommuteUpdate, type Place, type WaitlistCreate } from '@rydo/shared';
import { ZodPipe } from '../common/zod.pipe';
import { Org, type OrgContext } from '../common/request-context';
import { OrgScoped, RequireFeature } from '../tenancy/decorators';
import { CommuteService } from './commute.service';
import { WaitlistService } from './waitlist.service';

/** Release 1.1 for riders: preferred drivers, waitlist, commute planner, home place. */
@Controller('me')
@OrgScoped()
@RequireFeature('share')
export class CommuteController {
  constructor(
    private readonly commute: CommuteService,
    private readonly waitlist: WaitlistService,
  ) {}

  @Get('preferred-drivers')
  async preferred(@Org() org: OrgContext) {
    return { data: await this.commute.preferred(org) };
  }

  @Post('preferred-drivers')
  @HttpCode(200)
  async addPreferred(@Org() org: OrgContext, @Body(new ZodPipe(preferredDriverSchema)) b: z.infer<typeof preferredDriverSchema>) {
    return { data: await this.commute.addPreferred(org, b.driverMembershipId) };
  }

  @Delete('preferred-drivers/:id')
  async removePreferred(@Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.commute.removePreferred(org, id) };
  }

  @Get('waitlist')
  async waitlistList(@Org() org: OrgContext) {
    return { data: await this.waitlist.list(org) };
  }

  @Post('waitlist')
  async join(@Org() org: OrgContext, @Body(new ZodPipe(waitlistCreateSchema)) b: WaitlistCreate) {
    return { data: await this.waitlist.create(org, b) };
  }

  @Delete('waitlist/:id')
  async leave(@Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.waitlist.remove(org, id);
    return { data: { id } };
  }

  @Get('home')
  async home(@Org() org: OrgContext) {
    return { data: await this.commute.home(org.membershipId) };
  }

  @Put('home')
  async setHome(@Org() org: OrgContext, @Body(new ZodPipe(homePlaceSchema)) b: Place) {
    return { data: await this.commute.setHome(org, b) };
  }

  @Get('commute')
  async week(@Org() org: OrgContext, @Query('days') days?: string) {
    const n = Math.max(1, Math.min(28, Number(days) || 14));
    return { data: await this.commute.week(org, n) };
  }

  @Put('commute')
  async update(@Org() org: OrgContext, @Body(new ZodPipe(commuteUpdateSchema)) b: CommuteUpdate) {
    return { data: await this.commute.update(org, b) };
  }

  @Post('commute/plan')
  @HttpCode(200)
  async plan(@Org() org: OrgContext) {
    return { data: await this.commute.plan(org, 7) };
  }
}
