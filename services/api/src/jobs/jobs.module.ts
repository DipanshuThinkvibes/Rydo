import { Inject, Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { JOB_QUEUE, JobQueue } from '../adapters/job-queue';
import { RidesModule } from '../rides/rides.module';
import { RideGeneratorService } from '../rides/ride-generator.service';
import { BookingService } from '../rides/booking.service';
import { DriversModule } from '../drivers/drivers.module';
import { DocumentExpiryService } from '../drivers/document-expiry.service';

const TZ = 'Asia/Kolkata';

/** Registers every scheduled job in one place. Times are India time. */
@Injectable()
export class JobsRegistry implements OnApplicationBootstrap {
  private readonly log = new Logger('Jobs');

  constructor(
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
    private readonly rides: RideGeneratorService,
    private readonly expiry: DocumentExpiryService,
    private readonly booking: BookingService,
  ) {}

  async onApplicationBootstrap() {
    await this.jobs.work('rides.generate', async () => this.log.log(`Generated ${await this.rides.generateAll()} rides`));
    await this.jobs.schedule('rides.generate', '30 0 * * *', TZ);
    await this.jobs.work('documents.expiry', async () => this.log.log(`Document expiry: ${JSON.stringify(await this.expiry.run())}`));
    await this.jobs.schedule('documents.expiry', '0 1 * * *', TZ);
    // Sent per request with a delay: the driver didn't answer in time.
    await this.jobs.work<{ requestId: string }>('requests.expire', (d) => this.booking.expire(d.requestId));
  }
}

@Module({ imports: [RidesModule, DriversModule], providers: [JobsRegistry] })
export class JobsModule {}