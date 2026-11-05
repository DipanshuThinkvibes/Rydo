import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RidesModule } from '../rides/rides.module';
import { RealtimeGateway, REALTIME } from './realtime.gateway';
import { TripAccessService } from './trip-access.service';
import { TripService } from './trip.service';
import { AdminTripController, PublicTripController, TripController } from './trip.controller';

/** Phase 4: live trips, realtime, safety. Global so jobs and other modules can publish live events. */
@Global()
@Module({
  imports: [AuthModule, RidesModule],
  controllers: [TripController, AdminTripController, PublicTripController],
  providers: [TripAccessService, TripService, RealtimeGateway, { provide: REALTIME, useExisting: RealtimeGateway }],
  exports: [TripService, REALTIME],
})
export class TrackingModule {}