import { Module } from '@nestjs/common';
import { RideGeneratorService } from './ride-generator.service';
import { RidePlansController } from './ride-plans.controller';
import { AdminRidesController } from './admin-rides.controller';
import { MatchingService } from './matching.service';
import { BookingService } from './booking.service';
import { TripsController } from './trips.controller';
import { CommuteController } from '../commute/commute.controller';
import { CommuteService } from '../commute/commute.service';
import { WaitlistService } from '../commute/waitlist.service';
import { PlacesController } from '../commute/places.controller';
import { PlacesService } from '../commute/places.service';

@Module({
  controllers: [RidePlansController, AdminRidesController, TripsController, CommuteController, PlacesController],
  providers: [RideGeneratorService, MatchingService, BookingService, WaitlistService, CommuteService, PlacesService],
  exports: [RideGeneratorService, BookingService, MatchingService, WaitlistService, CommuteService],
})
export class RidesModule {}