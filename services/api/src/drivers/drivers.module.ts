import { Module } from '@nestjs/common';
import { DriverController } from './driver.controller';
import { DriverReviewController } from './driver-review.controller';
import { DocumentExpiryService } from './document-expiry.service';
import { DriverApplicationService } from './driver-application.service';

@Module({ controllers: [DriverController, DriverReviewController], providers: [DocumentExpiryService, DriverApplicationService], exports: [DocumentExpiryService] })
export class DriversModule {}