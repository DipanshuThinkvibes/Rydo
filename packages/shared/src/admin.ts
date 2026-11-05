import { z } from 'zod';
import { ORG_ROLES } from './roles';

const domain = z.string().trim().toLowerCase().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'Enter a domain like acme.com');

export const createOrgSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, 'Lowercase letters, digits and dashes'),
  emailDomains: z.array(domain).min(1).max(10),
});
export const updateOrgStatusSchema = z.object({ status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']) });
export const addOrgAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(100),
  /** Optional first password so the admin can sign in to the web right away. */
  password: z.string().min(8).max(200).regex(/[A-Za-z]/).regex(/\d/).optional(),
});
export const setRolesSchema = z.object({ roles: z.array(z.enum(ORG_ROLES)).min(1) });
export const memberListQuerySchema = z.object({
  status: z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'LEFT']).optional(),
  q: z.string().trim().max(100).optional(),
});

export const updateMemberSchema = z.object({ departmentId: z.string().uuid().nullable() });

/** Company ride rules (organizations.settings). Every key has a default; see docs/phase-0/01-data-model.md section 5. */
export const orgSettingsSchema = z.object({
  freeCancelHours: z.number().int().min(0).max(48).default(2),
  driverPopupSeconds: z.number().int().min(10).max(120).default(20),
  requestTimeoutMinutes: z.number().int().min(1).max(120).default(15),
  waitFreeMinutes: z.number().int().min(0).max(15).default(3),
  noShowAfterMinutes: z.number().int().min(1).max(15).default(3),
  pickupRadiusMeters: z.number().int().min(100).max(5000).default(1000),
  maxDetourMinutes: z.number().int().min(1).max(30).default(10),
  longStopMinutes: z.number().int().min(1).max(30).default(4),
  womenOnlyEnabled: z.boolean().default(true),
  costPerKmEstimate: z.number().min(0).max(100).nullable().default(null),
});
export type OrgSettings = z.infer<typeof orgSettingsSchema>;
export const DEFAULT_ORG_SETTINGS: OrgSettings = orgSettingsSchema.parse({});

export const updateOrgSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  emailDomains: z.array(domain).min(1).max(10).optional(),
  settings: orgSettingsSchema.partial().optional(),
});
export type UpdateOrg = z.infer<typeof updateOrgSchema>;

export const officeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().min(3).max(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  isDefault: z.boolean().default(false),
});
export type OfficeInput = z.infer<typeof officeSchema>;

export const departmentSchema = z.object({ name: z.string().trim().min(2).max(80) });