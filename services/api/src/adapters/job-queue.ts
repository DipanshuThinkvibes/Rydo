/** Background work. Feature code only uses this interface; Release 1 runs it on pg-boss inside PostgreSQL. */
export interface JobQueue {
  send(name: string, data?: object, options?: { startAfterSeconds?: number; singletonKey?: string }): Promise<void>;
  /** Cron in the given time zone, e.g. '30 0 * * *' = 00:30 every day. */
  schedule(name: string, cron: string, tz: string): Promise<void>;
  work<T extends object>(name: string, handler: (data: T) => Promise<void>): Promise<void>;
}
export const JOB_QUEUE = Symbol('JOB_QUEUE');