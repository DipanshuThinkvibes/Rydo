import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { chatHistorySchema, chatMessageSchema, type ChatHistoryQuery, type ChatMessageInput } from '@rydo/shared';
import { ZodPipe } from '../common/zod.pipe';
import { Org, type OrgContext } from '../common/request-context';
import { MembersOnly, OrgScoped, RequireFeature } from '../tenancy/decorators';
import { ChatService } from './chat.service';

/**
 * Ride chat. :riderId is the rider's membership id, or "me" when the rider opens their own thread.
 * Live messages arrive on the socket: send { rideId, riderMembershipId } to "chat.subscribe", then listen for "chat.message".
 */
@Controller()
@OrgScoped()
@RequireFeature('share')
@MembersOnly()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('me/chat/unread')
  async unread(@Org() org: OrgContext) {
    return { data: await this.chat.unread(org) };
  }

  @Get('rides/:rideId/chat')
  async threads(@Org() org: OrgContext, @Param('rideId', ParseUUIDPipe) rideId: string) {
    return { data: await this.chat.threads(org, rideId) };
  }

  @Get('rides/:rideId/chat/:riderId/messages')
  async history(@Org() org: OrgContext, @Param('rideId', ParseUUIDPipe) rideId: string, @Param('riderId') riderId: string, @Query(new ZodPipe(chatHistorySchema)) q: ChatHistoryQuery) {
    return this.chat.history(org, rideId, riderId, q);
  }

  @Post('rides/:rideId/chat/:riderId/messages')
  @HttpCode(200)
  async send(@Org() org: OrgContext, @Param('rideId', ParseUUIDPipe) rideId: string, @Param('riderId') riderId: string, @Body(new ZodPipe(chatMessageSchema)) b: ChatMessageInput) {
    return { data: await this.chat.send(org, rideId, riderId, b) };
  }
}
