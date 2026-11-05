import type { ApiError, ErrorCode } from "@rydo/shared";
import { ORG_HEADER } from "@rydo/shared";

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
  const org = selectedOrg.get();
  if (org) headers[ORG_HEADER] = org;
  return fetch(`/api/v1${path}`, { method, headers, credentials: "same-origin", body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) });
}

/** Calls the RYDO API. Refreshes the session once on 401, then throws RequestError with the API's code. */
export async function api<T>(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
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
  return (json as { data: T }).data;
}