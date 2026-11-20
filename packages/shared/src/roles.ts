export const ORG_ROLES = ['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN', 'RIDER', 'DRIVER'] as const;
export type OrgRoleName = (typeof ORG_ROLES)[number];

/** Roles that may use the web admin app. */
export const ADMIN_ROLES: OrgRoleName[] = ['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN'];

/**
 * Admin accounts (company, HR and ride desk admins) only run the company: they can't ride or drive.
 * An admin who wants to carpool signs up separately with their own work email.
 */
export const isAdminAccount = (roles: readonly OrgRoleName[]) => roles.some((r) => ADMIN_ROLES.includes(r));

/** Header that selects the company (tenant) for a request. */
export const ORG_HEADER = 'x-org-id';