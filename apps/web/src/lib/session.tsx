"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ADMIN_ROLES, type MembershipSummary } from "@rydo/shared";
import { api, selectedOrg } from "./api";

interface Me {
  user: { id: string; email: string; name: string; isPlatformAdmin: boolean };
  memberships: MembershipSummary[];
}

interface Session {
  loading: boolean;
  me: Me | null;
  /** Active companies where this person holds an admin role. */
  adminOrgs: MembershipSummary[];
  org: MembershipSummary | null;
  chooseOrg: (orgId: string) => void;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setMe(await api<Me>("GET", "/me"));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setOrgId(selectedOrg.get());
    reload();
  }, [reload]);

  const adminOrgs = useMemo(
    () => (me?.memberships ?? []).filter((m) => m.status === "ACTIVE" && m.roles.some((r) => ADMIN_ROLES.includes(r))),
    [me],
  );
  const org = adminOrgs.find((m) => m.organization.id === orgId) ?? adminOrgs[0] ?? null;

  useEffect(() => {
    if (org && org.organization.id !== orgId) {
      selectedOrg.set(org.organization.id);
      setOrgId(org.organization.id);
    }
  }, [org, orgId]);

  const value: Session = {
    loading,
    me,
    adminOrgs,
    org,
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