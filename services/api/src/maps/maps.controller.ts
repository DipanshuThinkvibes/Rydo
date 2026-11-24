import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { autocompleteQuerySchema, encodePolyline, reverseQuerySchema, routeQuerySchema, type ReverseGeocode, type RoutePreview } from '@rydo/shared';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { OrgOrPlatform } from '../tenancy/decorators';
import { MAPS_ADAPTER, MapsAdapter } from '../adapters/maps.adapter';

/**
 * Address search for both apps. Keeps the Google key on the server.
 * Pass the same `session` for the typing and the final pick: Google bills that as one search.
 */
@Controller('maps')
@OrgOrPlatform()
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

  /** The address under the movable pin (marking an exact gate or doorstep). Called once the pin stops moving. */
  @Get('reverse')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async reverse(@Query(new ZodPipe(reverseQuerySchema)) q: z.infer<typeof reverseQuerySchema>): Promise<{ data: ReverseGeocode }> {
    return { data: { label: await this.maps.reverse({ lat: q.lat, lng: q.lng }) } };
  }

  /** Road route preview (driver publishing a ride). Returned as an encoded polyline. */
  @Get('route')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async route(@Query(new ZodPipe(routeQuerySchema)) q: z.infer<typeof routeQuerySchema>): Promise<{ data: RoutePreview }> {
    const r = await this.maps.route({ lat: q.fromLat, lng: q.fromLng }, { lat: q.toLat, lng: q.toLng });
    return { data: { route: encodePolyline(r.path), distanceMeters: r.distanceMeters, durationSeconds: r.durationSeconds } };
  }
}