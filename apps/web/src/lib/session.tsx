"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ADMIN_ROLES, type MembershipSummary, type OrgRoleName } from "@rydo/shared";
import { api, selectedOrg } from "./api";

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
  org: MembershipSummary | null;
  /** True when the caller has any of these roles in the selected company. */
  can: (...roles: OrgRoleName[]) => boolean;
  isAdmin: boolean;
  chooseOrg: (orgId: string) => void;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(() => selectedOrg.get());

  const settle = useCallback((value: Me | null) => {
    setMe(value);
    setLoading(false);
  }, []);
  const reload = useCallback(() => api<Me>("GET", "/me").then(settle, () => settle(null)), [settle]);

  useEffect(() => {
    api<Me>("GET", "/me").then(settle, () => settle(null));
  }, [settle]);

  const orgs = useMemo(() => (me?.memberships ?? []).filter((m) => m.status === "ACTIVE"), [me]);
  const pending = useMemo(() => (me?.memberships ?? []).filter((m) => m.status === "PENDING"), [me]);
  const org = orgs.find((m) => m.organization.id === orgId) ?? orgs[0] ?? null;

  // Remember the company in use (also when it fell back to the first one).
  useEffect(() => {
    if (org) selectedOrg.set(org.organization.id);
  }, [org]);

  const can = (...roles: OrgRoleName[]) => !!org && roles.some((r) => org.roles.includes(r));
  const value: Session = {
    loading,
    me,
    orgs,
    pending,
    org,
    can,
    isAdmin: can(...ADMIN_ROLES),
    chooseOrg: (id) => {
      selectedOrg.set(id);
      setOrgId(id);
    },
    reload,
    signOut: async () => {
      await api("POST", "/auth/logout").catch(() => undefined);
      selectedOrg.clear();
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