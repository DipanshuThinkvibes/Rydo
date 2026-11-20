import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { boardSchema, locationBatchSchema, ratingSchema, resolveSosSchema, sosSchema, type RatingInput } from '@rydo/shared';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, Org, type AuthContext, type OrgContext } from '../common/request-context';
import { MembersOnly, OrgScoped, RequireFeature } from '../tenancy/decorators';
import { Public } from '../auth/public.decorator';
import { TripService } from './trip.service';

/** Live trip for the driver and riders (web now, mobile app later). */
@Controller()
@OrgScoped()
@RequireFeature('share')
@MembersOnly()
export class TripController {
  constructor(private readonly trips: TripService) {}

  @Get('rides/:id/live')
  @MembersOnly(false) // admins watch live trips
  live(@Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.trips.live(org, id).then((data) => ({ data }));
  }

  @Post('rides/:id/start')
  @HttpCode(200)
  async start(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.trips.start(org, id, auth.userId) };
  }

  /** Driver's phone (or the web simulator) sends points in small batches. */
  @Post('rides/:id/locations')
  @HttpCode(200)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async locations(@Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(locationBatchSchema)) b: z.infer<typeof locationBatchSchema>) {
    return { data: await this.trips.ingest(org, id, b.points) };
  }

  @Post('bookings/:id/arrived')
  @HttpCode(200)
  async arrived(@Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.trips.arrived(org, id) };
  }

  @Post('bookings/:id/board')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async board(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(boardSchema)) b: z.infer<typeof boardSchema>) {
    return { data: await this.trips.board(org, id, b.pin, auth.userId) };
  }

  @Post('bookings/:id/no-show')
  @HttpCode(200)
  async noShow(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.trips.noShow(org, id, auth.userId) };
  }

  @Post('rides/:id/complete')
  @HttpCode(200)
  async complete(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.trips.complete(org, id, auth.userId) };
  }

  @Post('rides/:id/ok')
  @HttpCode(200)
  async ok(@Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.trips.imOk(org, id) };
  }

  @Post('rides/:id/sos')
  async sos(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(sosSchema)) b: z.infer<typeof sosSchema>) {
    return { data: await this.trips.sos(org, id, b, auth.userId) };
  }

  @Post('rides/:id/share')
  async share(@Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.trips.share(org, id) };
  }

  @Post('rides/:id/ratings')
  async rate(@Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ratingSchema)) b: RatingInput) {
    return { data: await this.trips.rate(org, id, b) };
  }
}

/** Company admins: live board and SOS handling. */
@Controller('admin')
@OrgScoped('ORG_ADMIN', 'OPS_ADMIN', 'HR_ADMIN')
export class AdminTripController {
  constructor(private readonly trips: TripService) {}

  @Get('rides/live')
  async board(@Org() org: OrgContext) {
    return { data: await this.trips.liveBoard(org.organizationId) };
  }

  @Get('sos')
  async sosList(@Org() org: OrgContext, @Query('all') all?: string) {
    return { data: await this.trips.sosList(org.organizationId, all === 'true') };
  }

  @Post('sos/:id/ack')
  @HttpCode(200)
  async ack(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.trips.sosUpdate(org, id, 'ack', auth.userId) };
  }

  @Post('sos/:id/resolve')
  @HttpCode(200)
  async resolve(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(resolveSosSchema)) b: z.infer<typeof resolveSosSchema>) {
    return { data: await this.trips.sosUpdate(org, id, 'resolve', auth.userId, b.notes) };
  }
}

/** Family's view of a shared trip. No sign-in; the long random token is the key. */
@Controller('public/trips')
@Public()
export class PublicTripController {
  constructor(private readonly trips: TripService) {}

  @Get(':token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async view(@Param('token') token: string) {
    return { data: await this.trips.publicTrip(token.slice(0, 64)) };
  }
}
