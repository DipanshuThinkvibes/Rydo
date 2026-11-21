export const ORG_ROLES = ['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN', 'RIDER', 'DRIVER'] as const;
export type OrgRoleName = (typeof ORG_ROLES)[number];

/** Roles that may use the web admin app. */
export const ADMIN_ROLES: OrgRoleName[] = ['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN'];

/** Roles for people who ride or drive. */
export const EMPLOYEE_ROLES: OrgRoleName[] = ['RIDER', 'DRIVER'];

/** An admin account runs the company; it does not ride or drive. Riding and driving belong to separate employee accounts. */
export const isAdminAccount = (roles: readonly string[]) => roles.some((r) => (ADMIN_ROLES as string[]).includes(r));
export const ADMIN_ACCOUNT_MESSAGE = "This is an admin account. Riding and driving are for employee accounts. Sign in with your employee account for that.";

/** Header that selects the company (tenant) for a request. */
export const ORG_HEADER = 'x-org-id';