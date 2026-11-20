import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_ORG_FEATURES, type AuthResult, type MembershipSummary, type OrgRoleName } from '@rydo/shared';
import { activeSupport, api, onSessionEnded, setApiOrg, setApiSupport, tokens, type SupportView } from './api';

type Me = Pick<AuthResult, 'user' | 'memberships'>;

const ADMIN_ROLES: OrgRoleName[] = ['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN'];
const ORG_KEY = 'rydo.org';

export type ShareLicence = { state: string; daysLeft: number | null; expiresAt: string | null };

interface Session {
  loading: boolean;
  me: Me | null;
  /** The company this person is using now (chosen like the web's company switch; first approved one by default). */
  membership: MembershipSummary | null;
  /** Approved companies, for the company switch (web header). */
  orgs: MembershipSummary[];
  chooseOrg: (orgId: string) => Promise<void>;
  /** Approved and able to ride / drive. */
  active: boolean;
  roles: OrgRoleName[];
  isAdmin: boolean;
  /** RYDO staff (owner console). */
  isPlatformAdmin: boolean;
  platformRole: 'SUPER_ADMIN' | 'SUPPORT' | null;
  /** Company switches after licences (share = carpool). Missing keys count as on. */
  features: Record<string, boolean>;
  /** The RYDO Share licence of the company in use (web shows a banner when it stopped or ends soon). */
  shareLicence: ShareLicence | null;
  /** The last sign-in ended by itself (14 days, or removed on another device): sign-in explains why. */
  sessionEnded: boolean;
  /** RYDO support is viewing a client read-only (web support view). */
  support: SupportView | null;
  startSupport: (v: SupportView) => void;
  endSupport: () => void;
  signedIn: (r: AuthResult) => Promise<void>;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

const saved = {
  get: () => (Platform.OS === 'web' ? Promise.resolve(null) : SecureStore.getItemAsync(ORG_KEY).catch(() => null)),
  set: (v: string) => (Platform.OS === 'web' ? Promise.resolve() : SecureStore.setItemAsync(ORG_KEY, v).catch(() => undefined)),
};

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [supportState, setSupportState] = useState<SupportView | null>(null);

  const reload = useCallback(async () => {
    try {
      const had = await tokens.hasSession();
      if (!orgId) setOrgId(await saved.get());
      setMe(had ? await api<Me>('GET', '/me') : null);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onSessionEnded(() => {
      setSessionEnded(true);
      setMe(null);
    });
    return () => onSessionEnded(null);
  }, []);

  // Support sessions end by themselves; check once a minute.
  useEffect(() => {
    if (!supportState) return;
    const t = setInterval(() => {
      if (!activeSupport()) setSupportState(null);
    }, 60_000);
    return () => clearInterval(t);
  }, [supportState]);
  const support = me?.user.isPlatformAdmin && supportState && new Date(supportState.expiresAt).getTime() > Date.now() ? supportState : null;
  setApiSupport(support);
  const supportMembership = support
    ? ({ id: 'support', status: 'ACTIVE', roles: ['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN'], organization: { id: support.orgId, name: support.orgName, slug: '', features: DEFAULT_ORG_FEATURES } } as unknown as MembershipSummary)
    : null;

  const approved = me?.memberships.filter((m) => m.status === 'ACTIVE') ?? [];
  const membership = supportMembership ?? approved.find((m) => m.organization.id === orgId) ?? approved[0] ?? me?.memberships.find((m) => m.status !== 'REJECTED') ?? null;
  const active = membership?.status === 'ACTIVE';
  // Company routes need the x-org-id header; set it before any screen below fetches.
  setApiOrg(active && !support ? membership!.organization.id : null);
  const roles = active ? membership!.roles : [];
  const share = active ? membership!.organization.licenses?.find((l) => l.product === 'SHARE') : undefined;

  const value: Session = {
    loading,
    me,
    membership,
    orgs: approved,
    chooseOrg: async (id) => {
      setOrgId(id);
      await saved.set(id);
    },
    active,
    roles,
    isAdmin: roles.some((r) => ADMIN_ROLES.includes(r)),
    isPlatformAdmin: !!me?.user.isPlatformAdmin,
    platformRole: me?.user.platformRole ?? (me?.user.isPlatformAdmin ? 'SUPER_ADMIN' : null),
    features: (membership?.organization.features ?? {}) as unknown as Record<string, boolean>,
    shareLicence: share ? { state: share.state, daysLeft: share.daysLeft, expiresAt: share.expiresAt } : null,
    sessionEnded,
    support,
    startSupport: (v) => {
      setApiSupport(v);
      setSupportState(v);
    },
    endSupport: () => {
      if (support) api('POST', `/admin/platform/organizations/${support.orgId}/support/end`).catch(() => undefined);
      setApiSupport(null);
      setSupportState(null);
    },
    signedIn: async (r) => {
      await tokens.save(r);
      setSessionEnded(false);
      setMe({ user: r.user, memberships: r.memberships });
    },
    reload,
    signOut: async () => {
      await api('POST', '/auth/logout').catch(() => undefined);
      await tokens.clear();
      setApiSupport(null);
      setSupportState(null);
      setMe(null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
