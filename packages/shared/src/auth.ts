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
  organization: { id: string; name: string; slug: string; features: OrgFeatures };
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

// ---------- Self sign-up (mobile) ----------

export const ID_PROOF_TYPES = ['AADHAAR', 'PAN', 'PASSPORT', 'DRIVING_LICENSE', 'VOTER_ID'] as const;
export type IdProofType = (typeof ID_PROOF_TYPES)[number];
export const ID_PROOF_LABELS: Record<IdProofType, string> = {
  AADHAAR: 'Aadhaar',
  PAN: 'PAN card',
  PASSPORT: 'Passport',
  DRIVING_LICENSE: 'Driving licence',
  VOTER_ID: 'Voter ID',
};
/** Shape of each ID number (spaces and dashes are ignored). */
const ID_FORMATS: Record<IdProofType, { re: RegExp; hint: string }> = {
  AADHAAR: { re: /^\d{12}$/, hint: 'Aadhaar has 12 digits' },
  PAN: { re: /^[A-Z]{5}\d{4}[A-Z]$/, hint: 'PAN looks like ABCDE1234F' },
  PASSPORT: { re: /^[A-Z]\d{7}$/, hint: 'Passport number looks like A1234567' },
  DRIVING_LICENSE: { re: /^[A-Z]{2}\d{2}[A-Z0-9]{8,14}$/, hint: 'Licence number looks like KA0120190012345' },
  VOTER_ID: { re: /^[A-Z]{3}\d{7}$/, hint: 'Voter ID looks like ABC1234567' },
};
export const normalizeIdNumber = (n: string) => n.toUpperCase().replace(/[\s-]/g, '');

/** POST /auth/signup/check: is this work email's company on RYDO? */
export const signupCheckSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
export interface SignupCheck {
  registered: boolean;
  companyName: string | null;
}

/** GET /auth/companies?q= : "Find your company" (active companies only, at most 5). */
export const companySearchSchema = z.object({ q: z.string().trim().min(3, 'Type at least 3 letters').max(100) });
export interface CompanyMatch {
  id: string;
  name: string;
  /** Work email domains, e.g. ["thinkvibes.com"]. */
  domains: string[];
}
/** GET /auth/companies/:id/options : choices for the sign-up form. */
export interface SignupOptions {
  departments: { id: string; name: string }[];
  offices: { id: string; name: string }[];
}

const contactPhone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number');
/** Multipart sends text: accept true or "true". */
const checked = z.preprocess((v) => v === true || v === 'true', z.literal(true, { errorMap: () => ({ message: 'Please confirm your details and accept the terms' }) }));
const optionalId = z.preprocess((v) => (v === '' ? undefined : v), z.string().uuid().optional());

/**
 * POST /auth/signup (multipart; an ID photo as `idProof` is optional). The email is proven by the emailed
 * 6-digit `code`, or by a Google sign-in (`googleIdToken`) for the same email. It must end in the company's domain.
 */
const signupFields = z.object({
    companyId: z.string().uuid(),
    email: z.string().trim().toLowerCase().email('Enter your work email').max(254),
    code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code').optional(),
    googleIdToken: z.string().min(20).max(4096).optional(),
    name: z.string().trim().min(2, 'Enter your full name').max(100),
    phone: contactPhone,
    idProofType: z.enum(ID_PROOF_TYPES),
    idProofNumber: z.string().trim().min(4, 'Enter the ID number').max(30),
    employeeId: z.string().trim().min(1, 'Enter your employee ID').max(40),
    jobTitle: z.string().trim().min(2, 'Enter your job title').max(80),
    departmentId: optionalId,
    officeId: optionalId,
    managerName: z.string().trim().min(2, "Enter your manager's name").max(100),
    managerEmail: z.string().trim().toLowerCase().email("Enter your manager's work email").max(254),
    managerEmployeeId: z.string().trim().max(40).optional(),
    password: password.optional(),
    acceptTerms: checked,
    client: z.enum(['MOBILE', 'WEB']),
  });
const idNumberMatchesType = (v: { idProofType: IdProofType; idProofNumber: string }, ctx: z.RefinementCtx) => {
  const f = ID_FORMATS[v.idProofType];
  if (!f.re.test(normalizeIdNumber(v.idProofNumber))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: f.hint, path: ['idProofNumber'] });
};
const notOwnEmail = (v: { email: string; managerEmail: string }) => v.managerEmail !== v.email;

export const signupSchema = signupFields
  .refine((v) => !!v.code !== !!v.googleIdToken, { message: 'Confirm your email with the code or with Google', path: ['code'] })
  .refine(notOwnEmail, { message: "Use your manager's email, not yours", path: ['managerEmail'] })
  .superRefine(idNumberMatchesType);
export type SignupInput = z.infer<typeof signupSchema>;
/** The form fields before the email is verified (the app checks them before sending the code). */
export const signupDetailsSchema = signupFields
  .omit({ code: true, googleIdToken: true })
  .refine(notOwnEmail, { message: "Use your manager's email, not yours", path: ['managerEmail'] })
  .superRefine(idNumberMatchesType);

/** POST /auth/google: sign in with a Google ID token (from the app's Google sign-in). */
export const googleSignInSchema = z.object({ idToken: z.string().min(20).max(4096), client: z.enum(['MOBILE', 'WEB']) });
/** Known person: signed in. New person from a registered company: fill in the sign-up form first. */
export type GoogleSignInResult = (AuthResult & { needsSignup?: false }) | { needsSignup: true; email: string; name: string; companyId: string; companyName: string };

