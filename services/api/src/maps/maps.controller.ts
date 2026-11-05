import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { autocompleteQuerySchema } from '@rydo/shared';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { OrgScoped } from '../tenancy/decorators';
import { MAPS_ADAPTER, MapsAdapter } from '../adapters/maps.adapter';

/**
 * Address search for both apps. Keeps the Google key on the server.
 * Pass the same `session` for the typing and the final pick: Google bills that as one search.
 */
@Controller('maps')
@OrgScoped()
export class MapsController {
  constructor(@Inject(MAPS_ADAPTER) private readonly maps: MapsAdapter) {}

  @Get('autocomplete')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async autocomplete(@Query(new ZodPipe(autocompleteQuerySchema)) q: z.infer<typeof autocompleteQuerySchema>) {
    const near = q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : undefined;
    return { data: await this.maps.autocomplete(q.q, q.session, near) };
  }

  @Get('places/:placeId')
  async place(@Param('placeId') placeId: string, @Query('session') session = '') {
    return { data: await this.maps.place(placeId.slice(0, 300), session.slice(0, 64)) };
  }
}