export const ORG_ROLES = ['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN', 'RIDER', 'DRIVER'] as const;
export type OrgRoleName = (typeof ORG_ROLES)[number];

/** Roles that may use the web admin app. */
export const ADMIN_ROLES: OrgRoleName[] = ['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN'];

/** Header that selects the company (tenant) for a request. */
export const ORG_HEADER = 'x-org-id';