import type { LicenseProduct, LicenseState } from "@rydo/shared";

/** One licence as the owner console receives it. `NONE` = never issued. */
export interface LicenseRow {
  id?: string;
  organizationId?: string;
  product: LicenseProduct;
  state: LicenseState | "NONE";
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

export const STATE_LABEL: Record<LicenseRow["state"], string> = {
  ACTIVE: "Active",
  SCHEDULED: "Starts later",
  EXPIRED: "Expired",
  SUSPENDED: "Paused",
  REVOKED: "Revoked",
  NONE: "Not issued",
};

export const stateTone = (s: LicenseRow["state"], daysLeft?: number | null) =>
  (s === "ACTIVE" ? (daysLeft != null && daysLeft <= 30 ? "warning" : "success") : s === "NONE" || s === "SCHEDULED" ? "neutral" : "warning") as "success" | "warning" | "neutral";

/** "2027-03-31" for a date input, from today plus some days. */
export const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export const dayLabel = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(iso)) : "No end date";

export const leftLabel = (l: Pick<LicenseRow, "state" | "daysLeft">) =>
  l.state !== "ACTIVE" || l.daysLeft == null ? "" : l.daysLeft <= 0 ? "ends today" : l.daysLeft === 1 ? "1 day left" : `${l.daysLeft} days left`;
