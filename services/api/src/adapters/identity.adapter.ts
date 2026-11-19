/** Who a Google sign-in belongs to, after the ID token has been checked. */
export interface GoogleIdentity {
  /** Google's stable account id. */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

/** Outside identity providers ("Continue with Google"). Feature code never talks to Google directly. */
export interface IdentityAdapter {
  /** Throws AppError INVALID_CREDENTIALS when the token is not a valid Google ID token for one of RYDO's apps. */
  verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity>;
}
export const IDENTITY_ADAPTER = Symbol('IDENTITY_ADAPTER');
