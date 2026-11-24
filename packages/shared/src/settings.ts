import { z } from 'zod';

/** What a person chooses to be told about. Inbox messages are always kept; safety and account alerts always go out. */
export const notificationPrefsSchema = z.object({
  emailUpdates: z.boolean().default(true),
  pushUpdates: z.boolean().default(true),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = notificationPrefsSchema.parse({});
export const updateSettingsSchema = z.object({ notifications: notificationPrefsSchema.partial() });
export type UpdateSettings = z.infer<typeof updateSettingsSchema>;

/** Reads stored JSON safely: unknown keys dropped, missing ones on. */
export function notificationPrefs(raw: unknown): NotificationPrefs {
  const r = notificationPrefsSchema.partial().safeParse(raw ?? {});
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(r.success ? r.data : {}) };
}

/** Messages people must not miss are never switched off: SOS and safety, and account actions like a block. */
export const isCriticalNotice = (type: string) => /^SOS/.test(type) || /^ACCOUNT_/.test(type) || /^SAFETY_/.test(type);
