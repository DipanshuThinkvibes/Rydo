import type { ApiError, ErrorCode } from "@rydo/shared";
import { ORG_HEADER, SUPPORT_HEADER } from "@rydo/shared";

export class RequestError extends Error {
  constructor(public code: ErrorCode, message: string, public status: number, public fields?: Record<string, string>) {
    super(message);
  }
}

const ORG_KEY = "rydo.orgId";
export const selectedOrg = {
  get: () => (typeof window === "undefined" ? null : window.localStorage.getItem(ORG_KEY)),
  set: (id: string) => window.localStorage.setItem(ORG_KEY, id),
  clear: () => window.localStorage.removeItem(ORG_KEY),
};

/** RYDO support view of one client (read-only). Lives for this browser tab only. */
export interface SupportView {
  orgId: string;
  orgName: string;
  expiresAt: string;
}
const SUPPORT_KEY = "rydo.support";
export const supportView = {
  get(): SupportView | null {
    if (typeof window === "undefined") return null;
    try {
      const v = JSON.parse(window.sessionStorage.getItem(SUPPORT_KEY) ?? "null") as SupportView | null;
      return v && new Date(v.expiresAt).getTime() > Date.now() ? v : null;
    } catch {
      return null;
    }
  },
  set: (v: SupportView) => window.sessionStorage.setItem(SUPPORT_KEY, JSON.stringify(v)),
  clear: () => window.sessionStorage.removeItem(SUPPORT_KEY),
};

function csrfToken() {
  return document.cookie.split("; ").find((c) => c.startsWith("rydo_csrf="))?.split("=")[1];
}

async function send(method: string, path: string, body?: unknown) {
  const isForm = body instanceof FormData;
  const headers: Record<string, string> = isForm ? {} : { "content-type": "application/json" };
  if (method !== "GET") {
    const csrf = csrfToken();
    if (csrf) headers["x-csrf-token"] = csrf;
  }
  const support = supportView.get();
  const org = support?.orgId ?? selectedOrg.get();
  if (org) headers[ORG_HEADER] = org;
  if (support) headers[SUPPORT_HEADER] = "1";
  return fetch(`/api/v1${path}`, { method, headers, credentials: "same-origin", body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) });
}

/** Calls the RYDO API. Refreshes the session once on 401, then throws RequestError with the API's code. */
export async function api<T>(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  return (await apiWithMeta<T>(method, path, body)).data;
}

/** Same as api(), but also returns `meta` (paging cursors, counts). */
export async function apiWithMeta<T, M = Record<string, unknown>>(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown): Promise<{ data: T; meta: M }> {
  let res = await send(method, path, body);
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const refreshed = await send("POST", "/auth/refresh", {});
    if (refreshed.ok) res = await send(method, path, body);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (json as ApiError).error ?? { code: "INTERNAL", message: "Something went wrong" };
    throw new RequestError(e.code, e.message, res.status, e.fields);
  }
  return json as { data: T; meta: M };
}
/** Downloads a file from the API (sends the company header), e.g. a CSV export. */
export async function download(path: string, fallbackName: string) {
  const res = await send("GET", path);
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as ApiError;
    throw new RequestError(j.error?.code ?? "INTERNAL", j.error?.message ?? "Download failed.", res.status);
  }
  const name = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}