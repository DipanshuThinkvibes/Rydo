import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { ServerOptions } from 'socket.io';
import { env } from './config/env';

/** Socket.IO through Redis, so an event published on one API server reaches sockets on every server. */
class RedisIoAdapter extends IoAdapter {
  private adapter?: ReturnType<typeof createAdapter>;
  private clients: ReturnType<typeof createClient>[] = [];

  async connect(url: string) {
    const pub = createClient({ url });
    const sub = pub.duplicate();
    await Promise.all([pub.connect(), sub.connect()]);
    this.clients = [pub, sub];
    this.adapter = createAdapter(pub, sub);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapter) server.adapter(this.adapter);
    return server;
  }

  /** Nest calls this on app.close(); also close the Redis connections so the process can exit. */
  async close(server: Parameters<IoAdapter['close']>[0]) {
    await super.close(server);
    await Promise.all(this.clients.map((c) => c.quit().catch(() => undefined)));
    this.clients = [];
  }
}

/** Uses Redis for realtime when REDIS_URL is set (several API servers); one server needs nothing. */
export async function configureRealtime(app: INestApplication) {
  const url = env().REDIS_URL;
  if (!url) return;
  const adapter = new RedisIoAdapter(app);
  await adapter.connect(url);
  app.useWebSocketAdapter(adapter);
}