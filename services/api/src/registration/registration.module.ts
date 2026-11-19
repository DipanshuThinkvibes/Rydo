import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RegistrationController } from './registration.controller';
import { EmailVerificationController } from './email-verification.controller';

@Module({ imports: [AuthModule], controllers: [RegistrationController, EmailVerificationController] })
export class RegistrationModule {}
