import { z } from 'zod';

/** The ID proofs a new employee can choose. The server only ever receives the last 4 characters of the number. */
export const ID_PROOF_TYPES = ['AADHAAR', 'PAN', 'PASSPORT', 'DRIVING_LICENCE', 'VOTER_ID'] as const;
export type IdProofType = (typeof ID_PROOF_TYPES)[number];

/**
 * A new employee's sign-up details, sent after their email is verified.
 * The full ID number never leaves the browser: only the last 4 characters are sent and kept.
 */
export const registrationSchema = z.object({
  fullName: z.string().trim().regex(/^\p{L}[\p{L} .'-]{1,79}$/u, 'Enter your full name'),
  phone: z
    .string()
    .transform((s) => s.replace(/\D/g, '').slice(-10))
    .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number')),
  idType: z.enum(ID_PROOF_TYPES, { message: 'Choose your ID proof' }),
  idLast4: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4}$/, 'Send the last 4 characters only'),
  employeeId: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9\-_/.]{1,19}$/, 'Enter your employee ID'),
  designation: z.string().trim().min(2, 'Enter your job title').max(80),
  department: z.string().trim().min(1, 'Choose your department').max(80),
  office: z.string().trim().min(1, 'Choose your office').max(120),
  managerName: z.string().trim().regex(/^\p{L}[\p{L} .'-]{1,79}$/u, "Enter your manager's name"),
  managerEmail: z.string().trim().toLowerCase().email("Enter your manager's work email").max(200),
});
export type RegistrationInput = z.infer<typeof registrationSchema>;

/** Plain names for the ID proofs, used by the screens and emails. */
export const ID_PROOF_LABEL: Record<IdProofType, string> = {
  AADHAAR: 'Aadhaar',
  PAN: 'PAN card',
  PASSPORT: 'Passport',
  DRIVING_LICENCE: 'Driving licence',
  VOTER_ID: 'Voter ID',
};

/** Email verification from the account page. */
export const emailVerifySchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') });
export type EmailVerifyInput = z.infer<typeof emailVerifySchema>;
