import { Module } from '@nestjs/common';
import { DriverController } from './driver.controller';
import { DriverReviewController } from './driver-review.controller';
import { DocumentExpiryService } from './document-expiry.service';

@Module({ controllers: [DriverController, DriverReviewController], providers: [DocumentExpiryService], exports: [DocumentExpiryService] })
export class DriversModule {}