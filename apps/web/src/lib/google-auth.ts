import { api } from "./api";

/** What the server sends back after signing in (the web gets its session in cookies). */
export interface GoogleSignedIn {
  user: { id: string; email: string; name: string };
  memberships: { status: string; organization: { name: string } }[];
}

/**
 * Sends the ID token Google gave the browser to RYDO.
 * "login" signs in an existing account; "signup" creates the waiting account for the company with this email domain.
 * expectDomain makes the server refuse any Google account that is not from the company the person picked.
 */
export const googleAuth = (idToken: string, mode: "login" | "signup", expectDomain?: string) => api<GoogleSignedIn>("POST", "/auth/google", { idToken, client: "WEB", mode, expectDomain });
