import { z } from 'zod';
import { createOrgSchema, officeSchema, orgSettingsSchema } from './admin';

/**
 * RYDO owner (platform) side. Thinkvibes runs RYDO; each client company manages only its own space.
 * Features are switched on per client by RYDO, never by the client.
 */
export const orgFeaturesSchema = z.object({
  /** RYDO Share (carpool). Off = riders and drivers can't search, request or publish. */
  share: z.boolean().default(true),
  womenOnly: z.boolean().default(true),
  autoAcceptTeam: z.boolean().default(true),
  costShare: z.boolean().default(true),
  /** Later modules; stored now so a client's plan can be recorded. */
  enterprise: z.boolean().default(false),
  campus: z.boolean().default(false),
});
export type OrgFeatures = z.infer<typeof orgFeaturesSchema>;
export const DEFAULT_ORG_FEATURES: OrgFeatures = orgFeaturesSchema.parse({});

export const ORG_FEATURE_INFO: Record<keyof OrgFeatures, { label: string; hint: string; module?: boolean; soon?: boolean }> = {
  share: { label: 'RYDO Share', hint: 'Carpool between colleagues', module: true },
  enterprise: { label: 'RYDO Enterprise', hint: 'Company cabs and shuttles', module: true, soon: true },
  campus: { label: 'RYDO Campus', hint: 'School and college buses', module: true, soon: true },
  womenOnly: { label: 'Women-only rides', hint: 'Drivers can offer rides for women only' },
  autoAcceptTeam: { label: 'Auto-accept my team', hint: 'Drivers can auto-accept riders from their department' },
  costShare: { label: 'Cost-share estimate', hint: 'Show riders an estimated share of fuel cost' },
};

/** Reads the stored JSON safely: unknown keys dropped, missing keys get defaults. */
export function orgFeatures(raw: unknown): OrgFeatures {
  const r = orgFeaturesSchema.partial().safeParse(raw ?? {});
  return { ...DEFAULT_ORG_FEATURES, ...(r.success ? r.data : {}) };
}

const phone = z.string().trim().regex(/^[0-9+\-\s]{7,20}$/, 'Enter a phone number');

/** One-step client onboarding: company, contact, first admin, offices, rules, features. */
export const clientSetupSchema = z.object({
  company: createOrgSchema.extend({ timezone: z.string().trim().min(3).max(60).default('Asia/Kolkata') }),
  contact: z.object({ name: z.string().trim().min(1).max(100), email: z.string().trim().toLowerCase().email(), phone: phone.optional() }),
  admin: z.object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(200).regex(/[A-Za-z]/).regex(/\d/).optional(),
  }),
  offices: z.array(officeSchema).max(20).default([]),
  settings: orgSettingsSchema.partial().default({}),
  features: orgFeaturesSchema.partial().default({}),
  maxEmployees: z.number().int().min(1).max(1_000_000).nullable().default(null),
  sendWelcome: z.boolean().default(true),
});
export type ClientSetup = z.infer<typeof clientSetupSchema>;

/** What RYDO can change on a client after setup. */
export const platformUpdateOrgSchema = z.object({
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  emailDomains: createOrgSchema.shape.emailDomains.optional(),
  timezone: z.string().trim().min(3).max(60).optional(),
  features: orgFeaturesSchema.partial().optional(),
  maxEmployees: z.number().int().min(1).max(1_000_000).nullable().optional(),
  contactName: z.string().trim().max(100).nullable().optional(),
  contactEmail: z.string().trim().toLowerCase().email().nullable().optional(),
  contactPhone: phone.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type PlatformUpdateOrg = z.infer<typeof platformUpdateOrgSchema>;

/** RYDO support asks for read-only access to one client's admin screens. */
export const supportGrantSchema = z.object({
  reason: z.string().trim().min(5, 'Say why you need access').max(300),
  minutes: z.number().int().min(15).max(240).default(60),
});
export const SUPPORT_HEADER = 'x-rydo-support';

export const auditQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  action: z.string().trim().max(60).optional(),
  /** Platform-only actions (no company). */
  platformOnly: z.coerce.boolean().optional(),
  before: z.string().regex(/^\d+$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
