import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { UserThrottlerGuard } from './common/user-throttler.guard';
import { PrismaModule } from './prisma/prisma.module';
import { AdaptersModule } from './adapters/adapters.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { TenancyModule } from './tenancy/tenancy.module';
import { AuditModule } from './audit/audit.module';
import { MeModule } from './me/me.module';
import { AdminModule } from './admin/admin.module';
import { DriversModule } from './drivers/drivers.module';
import { MapsModule } from './maps/maps.module';
import { RidesModule } from './rides/rides.module';
import { JobsModule } from './jobs/jobs.module';
import { TrackingModule } from './tracking/tracking.module';
import { NotificationsModule } from './notifications/notifications.module';
import { EngagementModule } from './engagement/engagement.module';
import { InquiriesModule } from './inquiries/inquiries.module';
import { RegistrationModule } from './registration/registration.module';
import { HealthController } from './health/health.controller';
import { ApiExceptionFilter } from './common/api-exception.filter';

@Module({
  imports: [
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 120 }], skipIf: () => process.env.NODE_ENV === 'test' }),
    PrismaModule,
    AdaptersModule,
    AuditModule,
    NotificationsModule,
    AuthModule,
    TenancyModule,
    MeModule,
    AdminModule,
    DriversModule,
    MapsModule,
    RidesModule, TrackingModule,
    EngagementModule,
    InquiriesModule,
    RegistrationModule,
    JobsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Sign-in check first, so rate limits can count per person (see UserThrottlerGuard).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}