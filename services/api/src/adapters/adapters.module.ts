import { Global, Module } from '@nestjs/common';
import { MESSAGE_ADAPTER } from './message.adapter';
import { SmtpMessageAdapter } from './smtp-message.adapter';
import { STORAGE_ADAPTER } from './storage.adapter';
import { S3StorageAdapter } from './s3-storage.adapter';

/** The only place that decides which vendor sits behind each adapter. */
@Global()
@Module({
  providers: [
    { provide: MESSAGE_ADAPTER, useClass: SmtpMessageAdapter },
    { provide: STORAGE_ADAPTER, useClass: S3StorageAdapter },
  ],
  exports: [MESSAGE_ADAPTER, STORAGE_ADAPTER],
})
export class AdaptersModule {}