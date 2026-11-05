import type { OrgFeatures, OrgSettings } from "@rydo/shared";

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
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
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
export const actionLabel = (a: string) => a.charAt(0) + a.slice(1).toLowerCase().replace(/_/g, " ");

export const statusTone = (s: string) => (s === "ACTIVE" ? "success" : s === "SUSPENDED" ? "warning" : "neutral") as "success" | "warning" | "neutral";
