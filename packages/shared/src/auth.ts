import { z } from 'zod';
import type { OrgRoleName } from './roles';

/** Request body for POST /auth/otp/request */
export const otpRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});
export type OtpRequest = z.infer<typeof otpRequestSchema>;

/** Request body for POST /auth/otp/verify */
export const otpVerifySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  client: z.enum(['MOBILE', 'WEB']),
});
export type OtpVerify = z.infer<typeof otpVerifySchema>;

/** Request body for POST /auth/refresh (mobile; web sends the cookie) */
export const refreshSchema = z.object({ refreshToken: z.string().min(20).optional() });

export const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  gender: z.enum(['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED']).optional(),
});
export type UpdateMe = z.infer<typeof updateMeSchema>;

export interface MembershipSummary {
  id: string;
  organization: { id: string; name: string; slug: string };
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED' | 'LEFT';
  roles: OrgRoleName[];
}

export interface AuthResult {
  /** Mobile only. The web app gets httpOnly cookies instead. */
  accessToken?: string;
  refreshToken?: string;
  user: { id: string; email: string; name: string; isPlatformAdmin: boolean };
  memberships: MembershipSummary[];
}
