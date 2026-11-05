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
});
export const setRolesSchema = z.object({ roles: z.array(z.enum(ORG_ROLES)).min(1) });
export const memberListQuerySchema = z.object({
  status: z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'LEFT']).optional(),
});