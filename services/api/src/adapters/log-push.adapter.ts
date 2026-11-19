import { Injectable, Logger } from '@nestjs/common';
import type { PushAdapter, PushMessage, PushResult } from './push.adapter';

/** Used until Firebase is set up: records what would have been sent. Nothing leaves the server. */
@Injectable()
export class LogPushAdapter implements PushAdapter {
  private readonly log = new Logger('Push');
  sent: { tokens: string[]; msg: PushMessage }[] = [];

  async send(tokens: string[], msg: PushMessage): Promise<PushResult> {
    this.sent.push({ tokens, msg });
    this.log.debug(`(not sent: no FCM_* settings) "${msg.title}" to ${tokens.length} device(s)`);
    return { invalidTokens: [] };
  }
}
