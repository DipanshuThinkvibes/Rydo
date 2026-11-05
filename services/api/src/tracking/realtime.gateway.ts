import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { REALTIME_PATH } from '@rydo/shared';
import { TokensService } from '../auth/tokens.service';
import { COOKIE } from '../auth/cookies';
import { env } from '../config/env';
import { TripAccessService } from './trip-access.service';

/** Publishes live events. Feature code depends on this interface, not on Socket.IO. */
export interface RealtimePublisher {
  publish(room: string, event: string, data: unknown): void;
}
export const REALTIME = Symbol('REALTIME');
export const rideRoom = (rideId: string) => `ride:${rideId}`;
export const opsRoom = (orgId: string) => `ops:${orgId}`;

function cookie(header: string | undefined, name: string) {
  return header?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
}

/**
 * Socket.IO (current choice; one process). Before running several API servers, add the Redis adapter here.
 * Web signs in with its cookie; the mobile app passes { auth: { token } }. Rooms are joined only after an access check.
 */
@WebSocketGateway({ path: REALTIME_PATH, cors: { origin: env().WEB_ORIGIN.split(','), credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, RealtimePublisher {
  @WebSocketServer() server?: Server;
  private readonly log = new Logger('Realtime');

  constructor(
    private readonly tokens: TokensService,
    private readonly access: TripAccessService,
  ) {}

  async handleConnection(socket: Socket) {
    const token = (socket.handshake.auth?.token as string | undefined) ?? cookie(socket.handshake.headers.cookie, COOKIE.access);
    try {
      if (!token) throw new Error('no token');
      socket.data.userId = (await this.tokens.verifyAccess(token)).sub;
    } catch {
      socket.emit('rydo.error', { code: 'UNAUTHENTICATED' });
      socket.disconnect(true);
    }
  }

  @SubscribeMessage('subscribe')
  async subscribe(@ConnectedSocket() socket: Socket, @MessageBody() body: { rideId?: string; opsOrgId?: string }) {
    const userId = socket.data.userId as string | undefined;
    if (!userId || !body || typeof body !== 'object') return { ok: false };
    try {
      if (typeof body.rideId === 'string' && (await this.access.forUser(userId, body.rideId))) {
        await socket.join(rideRoom(body.rideId));
        return { ok: true };
      }
      if (typeof body.opsOrgId === 'string' && (await this.access.isOrgAdmin(userId, body.opsOrgId))) {
        await socket.join(opsRoom(body.opsOrgId));
        return { ok: true };
      }
    } catch (e) {
      this.log.warn(`subscribe failed: ${(e as Error).message}`);
    }
    return { ok: false };
  }

  @SubscribeMessage('unsubscribe')
  async unsubscribe(@ConnectedSocket() socket: Socket, @MessageBody() body: { rideId?: string; opsOrgId?: string }) {
    if (body?.rideId) await socket.leave(rideRoom(body.rideId));
    if (body?.opsOrgId) await socket.leave(opsRoom(body.opsOrgId));
    return { ok: true };
  }

  publish(room: string, event: string, data: unknown) {
    this.server?.to(room).emit(event, data);
  }
}
