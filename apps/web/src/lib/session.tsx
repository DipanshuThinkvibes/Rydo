"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ADMIN_ROLES, DEFAULT_ORG_FEATURES, type MembershipSummary, type OrgFeatures, type OrgRoleName } from "@rydo/shared";
import { api, selectedOrg, supportView, type SupportView } from "./api";
import { IDLE_LIMIT_MS, SESSION_ENDED_EVENT, rememberEnd } from "./session-end";

interface Me {
  user: { id: string; email: string; name: string; isPlatformAdmin: boolean; platformRole?: "SUPER_ADMIN" | "SUPPORT" | null };
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

  // Signing out must show up straight away, even in a tab that was left open:
  // 1) the API says this sign-in is over, 2) a check every minute and whenever the tab comes back,
  // 3) nobody touched the page for 2 hours.
  const signedIn = useRef(false);
  useEffect(() => {
    signedIn.current = !!me;
  }, [me]);
  useEffect(() => {
    const ended = (reason: "ended" | "idle") => {
      if (!signedIn.current) return; // a visitor who never signed in has nothing to end
      signedIn.current = false;
      rememberEnd(reason);
      selectedOrg.clear();
      supportView.clear();
      setSupport(null);
      setMe(null);
    };
    const onEnded = () => ended("ended");
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);

    const ACTIVITY_KEY = "rydo-last-activity";
    let last = Date.now();
    let written = 0;
    const touch = () => {
      last = Date.now();
      if (last - written > 10_000) {
        written = last;
        try {
          localStorage.setItem(ACTIVITY_KEY, String(last)); // so other open tabs know you are here
        } catch {
          /* storage blocked: this tab still tracks itself */
        }
      }
    };
    const lastSeen = () => {
      try {
        return Math.max(last, Number(localStorage.getItem(ACTIVITY_KEY)) || 0);
      } catch {
        return last;
      }
    };
    const check = () => {
      if (!signedIn.current) return;
      if (Date.now() - lastSeen() > IDLE_LIMIT_MS) {
        api("POST", "/auth/logout").catch(() => undefined);
        ended("idle");
        return;
      }
      api("GET", "/me").catch(() => undefined); // a 401 here announces the end
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(check, 60_000);
    return () => {
      window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
      events.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);

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
