import type { OrgFeatures } from './platform';
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

const password = z.string().min(8, 'At least 8 characters').max(200).regex(/[A-Za-z]/, 'Add a letter').regex(/\d/, 'Add a number');

/** Request body for POST /auth/password/login */
export const passwordLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1, 'Enter your password').max(200),
  client: z.enum(['MOBILE', 'WEB']),
});
export type PasswordLogin = z.infer<typeof passwordLoginSchema>;

/** Request body for POST /auth/password/reset (code comes from POST /auth/otp/request) */
export const passwordResetSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  newPassword: password,
});
export type PasswordReset = z.infer<typeof passwordResetSchema>;

/** Request body for POST /me/password */
export const setPasswordSchema = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: password,
});
export type SetPassword = z.infer<typeof setPasswordSchema>;

/** Request body for POST /auth/refresh (mobile; web sends the cookie) */
export const refreshSchema = z.object({ refreshToken: z.string().min(20).optional() });

export const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  gender: z.enum(['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED']).optional(),
  /** Never shown to other people. null clears it. */
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number').nullable().optional(),
});
export type UpdateMe = z.infer<typeof updateMeSchema>;

export interface MembershipSummary {
  id: string;
  /** `features` already reflects the licences: a product is on only while its licence is valid. */
  organization: { id: string; name: string; slug: string; features: OrgFeatures; licenses?: { product: string; state: string; expiresAt: string | null; daysLeft: number | null }[] };
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED' | 'LEFT';
  roles: OrgRoleName[];
}

export interface AuthResult {
  /** Mobile only. The web app gets httpOnly cookies instead. */
  accessToken?: string;
  refreshToken?: string;
  /** `platformRole` is set for RYDO staff: SUPER_ADMIN runs the owner console, SUPPORT is the support team. */
  user: { id: string; email: string; name: string; emailVerified?: boolean; isPlatformAdmin: boolean; platformRole?: 'SUPER_ADMIN' | 'SUPPORT' | null; /** Every account needs a profile photo. */ hasPhoto?: boolean };
  memberships: MembershipSummary[];
}
