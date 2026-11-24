import { z } from 'zod';
import { registrationSchema } from './registration';

/** How an employee's account was created in a company. */
export const JOIN_METHODS = ['SELF_SIGNUP', 'INVITE_LINK', 'ADDED_BY_ADMIN'] as const;
export type JoinMethod = (typeof JOIN_METHODS)[number];
export const JOIN_METHOD_LABEL: Record<JoinMethod, string> = {
  SELF_SIGNUP: 'Signed up on their own (HR approved)',
  INVITE_LINK: 'Invite link',
  ADDED_BY_ADMIN: 'Added by an admin',
};

/** An invite link works for this many hours, then the form closes. */
export const INVITE_HOURS = 24;
export const INVITE_MAX_USES_DEFAULT = 100;

export const createInviteSchema = z.object({ maxUses: z.number().int().min(1).max(1000).optional() });
export type CreateInvite = z.infer<typeof createInviteSchema>;

const password = z.string().min(8, 'At least 8 characters').max(200).regex(/[A-Za-z]/, 'Add a letter').regex(/\d/, 'Add a number');

/** The form behind an invite link: the usual employee details plus a work email and a password. No HR approval follows. */
export const inviteJoinSchema = registrationSchema.extend({
  email: z.string().trim().toLowerCase().email('Enter your work email').max(200),
  password,
  client: z.enum(['MOBILE', 'WEB']).default('WEB'),
});
export type InviteJoin = z.infer<typeof inviteJoinSchema>;

export interface InviteView {
  id: string;
  createdAt: string;
  expiresAt: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'FULL';
  usedCount: number;
  maxUses: number;
  createdBy: string;
}
