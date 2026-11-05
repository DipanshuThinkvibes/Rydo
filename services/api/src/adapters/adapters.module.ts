import { Global, Module } from '@nestjs/common';
import { MESSAGE_ADAPTER } from './message.adapter';
import { SmtpMessageAdapter } from './smtp-message.adapter';
import { STORAGE_ADAPTER } from './storage.adapter';
import { S3StorageAdapter } from './s3-storage.adapter';
import { MAPS_ADAPTER } from './maps.adapter';
import { GoogleMapsAdapter } from './google-maps.adapter';
import { CountingMapsAdapter, UsageService } from './counting-maps.adapter';
import { JOB_QUEUE } from './job-queue';
import { PgBossJobQueue } from './pg-boss-job-queue';

/** The only place that decides which vendor sits behind each adapter. */
@Global()
@Module({
  providers: [
    { provide: MESSAGE_ADAPTER, useClass: SmtpMessageAdapter },
    { provide: STORAGE_ADAPTER, useClass: S3StorageAdapter },
    UsageService,
    GoogleMapsAdapter,
    // Google Maps, with every paid call counted for the RYDO health page.
    { provide: MAPS_ADAPTER, useFactory: (g: GoogleMapsAdapter, u: UsageService) => new CountingMapsAdapter(g, u, 'google'), inject: [GoogleMapsAdapter, UsageService] },
    { provide: JOB_QUEUE, useClass: PgBossJobQueue },
  ],
  exports: [MESSAGE_ADAPTER, STORAGE_ADAPTER, MAPS_ADAPTER, JOB_QUEUE, UsageService],
})
export class AdaptersModule {}