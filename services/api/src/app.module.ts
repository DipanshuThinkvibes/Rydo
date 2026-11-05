import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { NotificationsModule } from './notifications/notifications.module';
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
    RidesModule,
    JobsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}