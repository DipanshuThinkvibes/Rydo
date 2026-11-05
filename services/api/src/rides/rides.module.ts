import { Module } from '@nestjs/common';
import { RideGeneratorService } from './ride-generator.service';
import { RidePlansController } from './ride-plans.controller';
import { AdminRidesController } from './admin-rides.controller';
import { MatchingService } from './matching.service';
import { BookingService } from './booking.service';
import { TripsController } from './trips.controller';

@Module({ controllers: [RidePlansController, AdminRidesController, TripsController], providers: [RideGeneratorService, MatchingService, BookingService], exports: [RideGeneratorService, BookingService] })
export class RidesModule {}