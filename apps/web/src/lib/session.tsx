"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ADMIN_ROLES, DEFAULT_ORG_FEATURES, type MembershipSummary, type OrgFeatures, type OrgRoleName } from "@rydo/shared";
import { api, selectedOrg, supportView, type SupportView } from "./api";

interface Me {
  user: { id: string; email: string; name: string; isPlatformAdmin: boolean };
  memberships: MembershipSummary[];
}

interface Session {
  loading: boolean;
  me: Me | null;
  /** Companies where this person is approved (any role). */
  orgs: MembershipSummary[];
  /** Companies where they still wait for HR. */
  pending: MembershipSummary[];
  /** The company in use: a real membership, or the client RYDO support is viewing. */
  org: MembershipSummary | null;
  /** Features RYDO switched on for the company in use. */
  features: OrgFeatures;
  /** True when the caller has any of these roles in the selected company. */
  can: (...roles: OrgRoleName[]) => boolean;
  isAdmin: boolean;
  /** RYDO support is viewing a client read-only. */
  support: SupportView | null;
  startSupport: (v: SupportView) => void;
  endSupport: () => void;
  chooseOrg: (orgId: string) => void;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(() => selectedOrg.get());
  const [support, setSupport] = useState<SupportView | null>(() => supportView.get());

  const settle = useCallback((value: Me | null) => {
    setMe(value);
    setLoading(false);
  }, []);
  const reload = useCallback(() => api<Me>("GET", "/me").then(settle, () => settle(null)), [settle]);

  useEffect(() => {
    api<Me>("GET", "/me").then(settle, () => settle(null));
  }, [settle]);

  // Support sessions end by themselves; check once a minute.
  useEffect(() => {
    if (!support) return;
    const t = setInterval(() => {
      if (!supportView.get()) setSupport(null);
    }, 60_000);
    return () => clearInterval(t);
  }, [support]);

  const orgs = useMemo(() => (me?.memberships ?? []).filter((m) => m.status === "ACTIVE"), [me]);
  const pending = useMemo(() => (me?.memberships ?? []).filter((m) => m.status === "PENDING"), [me]);
  const real = orgs.find((m) => m.organization.id === orgId) ?? orgs[0] ?? null;
  const org: MembershipSummary | null =
    support && me?.user.isPlatformAdmin
      ? { id: "support", status: "ACTIVE", roles: ["ORG_ADMIN", "HR_ADMIN", "OPS_ADMIN"], organization: { id: support.orgId, name: support.orgName, slug: "", features: DEFAULT_ORG_FEATURES } }
      : real;

  // Remember the company in use (also when it fell back to the first one).
  useEffect(() => {
    if (real) selectedOrg.set(real.organization.id);
    else if (me) selectedOrg.clear(); // e.g. a RYDO admin with no company: never send a stale company id
  }, [real, me]);

  const can = (...roles: OrgRoleName[]) => !!org && roles.some((r) => org.roles.includes(r));
  const value: Session = {
    loading,
    me,
    orgs,
    pending,
    org,
    features: { ...DEFAULT_ORG_FEATURES, ...(org?.organization.features ?? {}) },
    can,
    isAdmin: can(...ADMIN_ROLES),
    support: me?.user.isPlatformAdmin ? support : null,
    startSupport: (v) => {
      supportView.set(v);
      setSupport(v);
    },
    endSupport: () => {
      supportView.clear();
      setSupport(null);
    },
    chooseOrg: (id) => {
      selectedOrg.set(id);
      setOrgId(id);
    },
    reload,
    signOut: async () => {
      await api("POST", "/auth/logout").catch(() => undefined);
      selectedOrg.clear();
      supportView.clear();
      setSupport(null);
      setMe(null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}
