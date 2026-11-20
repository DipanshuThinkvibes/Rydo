import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RegistrationController } from './registration.controller';
import { EmailVerificationController } from './email-verification.controller';
import { PublicCompaniesController } from './companies.controller';

@Module({ imports: [AuthModule], controllers: [RegistrationController, EmailVerificationController, PublicCompaniesController] })
export class RegistrationModule {}
