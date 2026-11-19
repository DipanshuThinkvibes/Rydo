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
import { PUSH_ADAPTER } from './push.adapter';
import { LogPushAdapter } from './log-push.adapter';
import { FcmPushAdapter } from './fcm-push.adapter';
import { GOOGLE_IDENTITY, HttpGoogleIdentity } from './google-identity.adapter';
import { env } from '../config/env';

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
    { provide: GOOGLE_IDENTITY, useClass: HttpGoogleIdentity },
    // Firebase when its three settings exist, otherwise a logger (nothing is sent).
    {
      provide: PUSH_ADAPTER,
      useFactory: () => {
        const e = env();
        return e.FCM_PROJECT_ID && e.FCM_CLIENT_EMAIL && e.FCM_PRIVATE_KEY
          ? new FcmPushAdapter({ projectId: e.FCM_PROJECT_ID, clientEmail: e.FCM_CLIENT_EMAIL, privateKey: e.FCM_PRIVATE_KEY })
          : new LogPushAdapter();
      },
    },
  ],
  exports: [MESSAGE_ADAPTER, STORAGE_ADAPTER, MAPS_ADAPTER, JOB_QUEUE, PUSH_ADAPTER, GOOGLE_IDENTITY, UsageService],
})
export class AdaptersModule {}