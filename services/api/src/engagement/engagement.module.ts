import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { AnnouncementsController, SurveysController } from './surveys.controller';
import { SurveysService } from './surveys.service';
import { BlocksController, EmergencyContactsController, ShareToContactsController } from './safety.controller';
import { ProfileController } from './profile.controller';

/**
 * Everything about people talking to each other and to their company: issue reports, ride chat, feedback,
 * surveys, announcements, push devices, safety contacts, blocks and profile cards. All free to use.
 * (TrackingModule is global, so ChatService and ShareToContactsController get its access rules and TripService from there.)
 */
@Module({
  controllers: [DevicesController, IssuesController, ChatController, FeedbackController, SurveysController, AnnouncementsController, EmergencyContactsController, BlocksController, ShareToContactsController, ProfileController],
  providers: [IssuesService, ChatService, FeedbackService, SurveysService],
})
export class EngagementModule {}
