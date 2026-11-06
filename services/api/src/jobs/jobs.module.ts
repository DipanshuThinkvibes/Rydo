import { Inject, Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { JOB_QUEUE, JobQueue } from '../adapters/job-queue';
import { RidesModule } from '../rides/rides.module';
import { RideGeneratorService } from '../rides/ride-generator.service';
import { BookingService } from '../rides/booking.service';
import { DriversModule } from '../drivers/drivers.module';
import { DocumentExpiryService } from '../drivers/document-expiry.service';
import { TripService } from '../tracking/trip.service';
import { WaitlistService } from '../commute/waitlist.service';
import { CommuteService } from '../commute/commute.service';

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
    private readonly trips: TripService,
    private readonly waitlist: WaitlistService,
    private readonly commute: CommuteService,
  ) {}

  async onApplicationBootstrap() {
    await this.jobs.work('rides.generate', async () => {
      this.log.log(`Generated ${await this.rides.generateAll()} rides`);
      this.log.log(`Waitlist: ${await this.waitlist.checkAll()} matched after generation`);
    });
    // Evening: book the next two days for everyone with auto-book on (commute planner).
    await this.jobs.work('commute.autobook', async () => this.log.log(`Commute planner: ${await this.commute.planAll(2)} legs handled`));
    await this.jobs.schedule('commute.autobook', '0 19 * * *', TZ);
    await this.jobs.schedule('rides.generate', '30 0 * * *', TZ);
    await this.jobs.work('documents.expiry', async () => this.log.log(`Document expiry: ${JSON.stringify(await this.expiry.run())}`));
    await this.jobs.schedule('documents.expiry', '0 1 * * *', TZ);
    await this.jobs.work('tracking.retention', async () => this.log.log(`GPS partitions: ${JSON.stringify(await this.trips.retention())}`));
    await this.jobs.schedule('tracking.retention', '0 2 * * *', TZ);
    // Also once at start-up, so a fresh server never writes GPS points into the catch-all partition.
    await this.trips.retention().catch((e) => this.log.error(`GPS partitions: ${(e as Error).message}`));
    // Sent per request with a delay: the driver didn't answer in time.
    await this.jobs.work<{ requestId: string }>('requests.expire', (d) => this.booking.expire(d.requestId));
  }
}

@Module({ imports: [RidesModule, DriversModule], providers: [JobsRegistry] })
export class JobsModule {}