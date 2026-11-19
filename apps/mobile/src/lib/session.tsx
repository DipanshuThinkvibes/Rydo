import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AuthResult, MembershipSummary, OrgRoleName } from '@rydo/shared';
import { api, setApiOrg, tokens } from './api';

type Me = Pick<AuthResult, 'user' | 'memberships'>;

const ADMIN_ROLES: OrgRoleName[] = ['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN'];

interface Session {
  loading: boolean;
  me: Me | null;
  /** The company this person rides with (first non-rejected membership). */
  membership: MembershipSummary | null;
  /** Approved and able to ride / drive. */
  active: boolean;
  roles: OrgRoleName[];
  isAdmin: boolean;
  /** Company switches (women-only rides etc.). Missing keys count as on. */
  features: Record<string, boolean>;
  signedIn: (r: AuthResult) => Promise<void>;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setMe((await tokens.hasSession()) ? await api<Me>('GET', '/me') : null);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const membership = me?.memberships.find((m) => m.status !== 'REJECTED') ?? null;
  const active = membership?.status === 'ACTIVE';
  // Company routes need the x-org-id header; set it before any screen below fetches.
  setApiOrg(active ? membership!.organization.id : null);
  const roles = active ? membership!.roles : [];

  const value: Session = {
    loading,
    me,
    membership,
    active,
    roles,
    isAdmin: roles.some((r) => ADMIN_ROLES.includes(r)),
    features: (membership?.organization.features ?? {}) as unknown as Record<string, boolean>,
    signedIn: async (r) => {
      await tokens.save(r);
      setMe({ user: r.user, memberships: r.memberships });
    },
    reload,
    signOut: async () => {
      await api('POST', '/auth/logout').catch(() => undefined);
      await tokens.clear();
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
