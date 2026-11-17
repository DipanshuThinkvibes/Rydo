import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { ApiError, AuthResult, ErrorCode } from '@rydo/shared';

// On a physical phone "localhost" is the phone itself. When the configured URL is local
// (or unset), use the dev machine's LAN address that Expo already gave this device.
function resolveApiUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (configured && !/localhost|127\.0\.0\.1/.test(configured)) return configured;
  if (Platform.OS !== 'web') {
    const host = Constants.expoConfig?.hostUri?.split(':')[0];
    if (host) return `http://${host}:4000`;
  }
  return configured || 'http://localhost:4000';
}

const BASE = resolveApiUrl() + '/api/v1';
const KEY = { access: 'rydo.access', refresh: 'rydo.refresh' };

// SecureStore keeps tokens in the iOS Keychain / Android Keystore. Web preview falls back to memory.
const memory = new Map<string, string>();
const store = {
  get: (k: string) => (Platform.OS === 'web' ? Promise.resolve(memory.get(k) ?? null) : SecureStore.getItemAsync(k)),
  set: (k: string, v: string) => (Platform.OS === 'web' ? Promise.resolve(void memory.set(k, v)) : SecureStore.setItemAsync(k, v)),
  del: (k: string) => (Platform.OS === 'web' ? Promise.resolve(void memory.delete(k)) : SecureStore.deleteItemAsync(k)),
};

export class RequestError extends Error {
  constructor(public code: ErrorCode, message: string, public status: number) {
    super(message);
  }
}

export const tokens = {
  save: async (t: Pick<AuthResult, 'accessToken' | 'refreshToken'>) => {
    if (t.accessToken) await store.set(KEY.access, t.accessToken);
    if (t.refreshToken) await store.set(KEY.refresh, t.refreshToken);
  },
  clear: async () => {
    await store.del(KEY.access);
    await store.del(KEY.refresh);
  },
  hasSession: async () => !!(await store.get(KEY.refresh)),
};

async function send(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const access = await store.get(KEY.access);
  if (access) headers.authorization = `Bearer ${access}`;
  return fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function refresh() {
  const refreshToken = await store.get(KEY.refresh);
  if (!refreshToken) return false;
  const res = await fetch(BASE + '/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
  if (!res.ok) return false;
  await tokens.save((await res.json()).data);
  return true;
}

/** Calls the RYDO API with the stored token; refreshes once on 401. */
export async function api<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let res = await send(method, path, body);
  if (res.status === 401 && !path.startsWith('/auth/') && (await refresh())) res = await send(method, path, body);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (json as ApiError).error ?? { code: 'INTERNAL', message: 'Something went wrong' };
    throw new RequestError(e.code, e.message, res.status);
  }
  return (json as { data: T }).data;
}