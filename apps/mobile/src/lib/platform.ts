import type { LicenseProduct, LicenseState, OrgFeatures, OrgSettings } from '@rydo/shared';

/** Owner console shapes and helpers, same as the web (apps/web/src/lib/platform-types.ts and lib/licenses.ts). */
export interface ClientStats {
  activeMembers: number;
  pendingMembers: number;
  verifiedDrivers: number;
  pendingDrivers: number;
  ridesNext7: number;
  ridesLast7: number;
  bookingsLast7: number;
  lastActivityAt: string | null;
}
export interface Client {
  id: string;
  name: string;
  slug: string;
  emailDomains: string[];
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  timezone: string;
  createdAt: string;
  features: OrgFeatures;
  maxEmployees: number | null;
  contact: { name: string | null; email: string | null; phone: string | null };
  stats: ClientStats | null;
}
export interface ClientDetail extends Client {
  settings: OrgSettings;
  notes: string | null;
  admins: { membershipId: string; name: string; email: string; status: string; roles: string[]; hasPassword: boolean }[];
  offices: { id: string; name: string; address: string; lat: number; lng: number; isDefault: boolean }[];
  series: { day: string; rides: number; bookings: number }[];
  recent: { id: string; action: string; entityType: string; createdAt: string; actor: { name: string; email: string } | null }[];
  support: { grantId: string; expiresAt: string; reason: string } | null;
}
export interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
  organization: { id: string; name: string | null } | null;
  actor: { name: string | null; email: string | null } | null;
}

/** "MEMBER_APPROVED" → "Member approved" */
export const actionLabel = (a: string) => a.charAt(0) + a.slice(1).toLowerCase().replace(/_/g, ' ');
export const statusTone = (st: string) => (st === 'ACTIVE' ? 'success' : st === 'SUSPENDED' ? 'warning' : 'neutral') as 'success' | 'warning' | 'neutral';

/** One licence as the owner console receives it. `NONE` = never issued. */
export interface LicenseRow {
  id?: string;
  organizationId?: string;
  product: LicenseProduct;
  state: LicenseState | 'NONE';
  startsAt?: string;
  expiresAt?: string | null;
  daysLeft?: number | null;
  notes?: string | null;
  statusReason?: string | null;
  organization?: { id: string; name: string; status: string };
}
export interface LicenseSummary {
  total: number;
  active: number;
  expiringSoon: number;
  expired: number;
  suspended: number;
  revoked: number;
  byProduct: { product: LicenseProduct; active: number }[];
  clientsWithoutShare: number;
  expiringDays: number;
}
export const STATE_LABEL: Record<LicenseRow['state'], string> = {
  ACTIVE: 'Active',
  SCHEDULED: 'Starts later',
  EXPIRED: 'Expired',
  SUSPENDED: 'Paused',
  REVOKED: 'Revoked',
  NONE: 'Not issued',
};
export const stateTone = (st: LicenseRow['state'], daysLeft?: number | null) =>
  (st === 'ACTIVE' ? (daysLeft != null && daysLeft <= 30 ? 'warning' : 'success') : st === 'NONE' || st === 'SCHEDULED' ? 'neutral' : 'warning') as 'success' | 'warning' | 'neutral';
/** "2027-03-31" from today plus some days. */
export const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayLabel = (iso: string | null | undefined) => {
  if (!iso) return 'No end date';
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
export const leftLabel = (l: Pick<LicenseRow, 'state' | 'daysLeft'>) =>
  l.state !== 'ACTIVE' || l.daysLeft == null ? '' : l.daysLeft <= 0 ? 'ends today' : l.daysLeft === 1 ? '1 day left' : `${l.daysLeft} days left`;
export const num = (n: number | undefined | null) => (n ?? 0).toLocaleString('en-IN');
