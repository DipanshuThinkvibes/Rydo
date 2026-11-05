import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AuthResult, MembershipSummary } from '@rydo/shared';
import { api, tokens } from './api';

type Me = Pick<AuthResult, 'user' | 'memberships'>;

interface Session {
  loading: boolean;
  me: Me | null;
  /** The company this person rides with (first non-rejected membership). */
  membership: MembershipSummary | null;
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

  const value: Session = {
    loading,
    me,
    membership: me?.memberships.find((m) => m.status !== 'REJECTED') ?? null,
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