import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { env } from '../config/env';
import { MeModule } from '../me/me.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { TokensService } from './tokens.service';

@Module({
  imports: [JwtModule.registerAsync({ useFactory: () => ({ secret: env().JWT_SECRET }) }), MeModule],
  controllers: [AuthController],
  providers: [AuthService, OtpService, TokensService],
  exports: [TokensService],
})
export class AuthModule {}