import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import PgBoss from 'pg-boss';
import { env } from '../config/env';
import { JobQueue } from './job-queue';

/** pg-boss keeps jobs in a `pgboss` schema of the main database. Does nothing when JOBS_ENABLED=false. */
@Injectable()
export class PgBossJobQueue implements JobQueue, OnModuleDestroy {
  private readonly log = new Logger('Jobs');
  private boss?: PgBoss;
  private starting?: Promise<PgBoss | undefined>;

  private get enabled() {
    return env().JOBS_ENABLED === 'true';
  }

  private start() {
    if (!this.enabled) return Promise.resolve(undefined);
    this.starting ??= (async () => {
      const boss = new PgBoss(env().DATABASE_URL);
      boss.on('error', (e) => this.log.error(e.message));
      await boss.start();
      this.boss = boss;
      return boss;
    })();
    return this.starting;
  }

  private async queue(name: string) {
    const boss = await this.start();
    if (boss) await boss.createQueue(name);
    return boss;
  }

  async send(name: string, data: object = {}, options: { startAfterSeconds?: number; singletonKey?: string } = {}) {
    const boss = await this.queue(name);
    await boss?.send(name, data, { startAfter: options.startAfterSeconds, singletonKey: options.singletonKey });
  }

  async schedule(name: string, cron: string, tz: string) {
    const boss = await this.queue(name);
    await boss?.schedule(name, cron, {}, { tz });
  }

  async work<T extends object>(name: string, handler: (data: T) => Promise<void>) {
    const boss = await this.queue(name);
    await boss?.work<T>(name, async (jobs) => {
      for (const job of jobs) {
        try {
          await handler(job.data);
        } catch (e) {
          this.log.error(`${name} failed: ${(e as Error).message}`);
          throw e;
        }
      }
    });
  }

  async onModuleDestroy() {
    await this.boss?.stop({ graceful: true, wait: false }).catch(() => undefined);
  }
}