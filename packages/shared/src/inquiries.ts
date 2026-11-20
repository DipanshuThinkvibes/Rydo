import { z } from 'zod';

/** "Contact us" form: a company asks RYDO to be set up. Public, so it is strict and has a spam trap. */
/** An empty box means "not given". */
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const COMPANY_SIZES = ['1-50', '51-200', '201-1000', '1000+'] as const;
export const INQUIRY_STATUSES = ['NEW', 'CONTACTED', 'ONBOARDED', 'CLOSED'] as const;
export type InquiryStatusName = (typeof INQUIRY_STATUSES)[number];

export const inquiryCreateSchema = z.object({
  companyName: z.string().trim().min(2, 'Enter your company name').max(120),
  contactName: z.string().trim().min(2, 'Enter your name').max(100),
  workEmail: z.string().trim().toLowerCase().email('Enter a valid work email').max(200),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number').optional().or(z.literal('').transform(() => undefined)),
  companySize: z.enum(COMPANY_SIZES, { message: 'Choose your company size' }),
  city: z.preprocess(blankToUndefined, z.string().trim().max(80).optional()),
  message: z.preprocess(blankToUndefined, z.string().trim().max(1500).optional()),
  /** Spam trap: real people never fill this hidden field. */
  website: z.string().max(200).optional(),
  consent: z.boolean({ message: 'Please agree so we can contact you' }).refine((v) => v === true, { message: 'Please agree so we can contact you' }),
});
export type InquiryCreate = z.infer<typeof inquiryCreateSchema>;

export const inquiryUpdateSchema = z
  .object({ status: z.enum(INQUIRY_STATUSES).optional(), notes: z.string().trim().max(2000).optional() })
  .refine((v) => v.status !== undefined || v.notes !== undefined, { message: 'Nothing to change' });
export type InquiryUpdate = z.infer<typeof inquiryUpdateSchema>;

export const inquiryQuerySchema = z.object({
  status: z.enum(INQUIRY_STATUSES).optional(),
  cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type InquiryQuery = z.infer<typeof inquiryQuerySchema>;
