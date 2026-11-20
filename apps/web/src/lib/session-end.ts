/**
 * Why a person was sent back to sign in, remembered for the sign-in page.
 * "idle" = away too long, "ended" = the sign-in was ended (signed out elsewhere, expired, or removed).
 */
export type EndReason = "idle" | "ended";
const KEY = "rydo-session-end";
export const SESSION_ENDED_EVENT = "rydo:session-ended";
/** The website signs out after this long without use (the server enforces the same 2 hours). */
export const IDLE_LIMIT_MS = 2 * 60 * 60 * 1000;

export function rememberEnd(reason: EndReason) {
  try {
    sessionStorage.setItem(KEY, reason);
  } catch {
    /* private mode: the sign-in page just will not explain why */
  }
}
export function readEnd(): EndReason | null {
  try {
    const v = sessionStorage.getItem(KEY);
    return v === "idle" || v === "ended" ? v : null;
  } catch {
    return null;
  }
}
export function clearEnd() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
/** Tells the app that the server no longer accepts this sign-in. */
export function announceSessionEnded() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_ENDED_EVENT));
}
