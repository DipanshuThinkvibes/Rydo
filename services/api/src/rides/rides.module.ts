import { Module } from '@nestjs/common';
import { RideGeneratorService } from './ride-generator.service';
import { RidePlansController } from './ride-plans.controller';
import { AdminRidesController } from './admin-rides.controller';
import { MatchingService } from './matching.service';
import { BookingService } from './booking.service';
import { MismatchService } from './mismatch.service';
import { TripsController } from './trips.controller';
import { CommuteController } from '../commute/commute.controller';
import { PlacesController } from '../commute/places.controller';
import { PlacesService } from '../commute/places.service';
import { CommuteService } from '../commute/commute.service';
import { WaitlistService } from '../commute/waitlist.service';

@Module({
  controllers: [RidePlansController, AdminRidesController, TripsController, CommuteController, PlacesController],
  providers: [RideGeneratorService, MatchingService, BookingService, MismatchService, WaitlistService, CommuteService, PlacesService],
  exports: [RideGeneratorService, BookingService, MismatchService, MatchingService, WaitlistService, CommuteService],
})
export class RidesModule {}