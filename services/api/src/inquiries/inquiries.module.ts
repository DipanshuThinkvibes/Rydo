import { Module } from '@nestjs/common';
import { InquiriesAdminController, PublicContactController } from './inquiries.controller';

@Module({ controllers: [PublicContactController, InquiriesAdminController] })
export class InquiriesModule {}
