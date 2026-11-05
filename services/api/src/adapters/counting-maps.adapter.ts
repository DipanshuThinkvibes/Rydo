import { Injectable } from '@nestjs/common';
import type { LatLng } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { MapsAdapter } from './maps.adapter';

/** Counts paid vendor calls per day (India date) for the RYDO health page. Never blocks or fails the call. */
@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  hit(provider: string, sku: string) {
    this.prisma.$executeRaw`
      INSERT INTO usage_daily (day, provider, sku, count)
      VALUES ((now() AT TIME ZONE 'Asia/Kolkata')::date, ${provider}, ${sku}, 1)
      ON CONFLICT (day, provider, sku) DO UPDATE SET count = usage_daily.count + 1`.catch(() => undefined);
  }
}

/** Wraps any MapsAdapter and records each call. Vendor-neutral: works for whichever maps vendor sits inside. */
export class CountingMapsAdapter implements MapsAdapter {
  constructor(
    private readonly inner: MapsAdapter,
    private readonly usage: UsageService,
    private readonly provider: string,
  ) {}

  autocomplete(query: string, sessionToken: string, near?: LatLng) {
    this.usage.hit(this.provider, 'autocomplete');
    return this.inner.autocomplete(query, sessionToken, near);
  }

  place(placeId: string, sessionToken: string) {
    this.usage.hit(this.provider, 'place_details');
    return this.inner.place(placeId, sessionToken);
  }

  route(origin: LatLng, destination: LatLng, stops?: LatLng[]) {
    this.usage.hit(this.provider, 'routes');
    return this.inner.route(origin, destination, stops);
  }
}
