import { z } from 'zod';

/**
 * Sign in or sign up with a Google account. The browser sends the ID token Google gave it; the server checks it with Google.
 * mode "signup" creates the waiting account for a company on RYDO; "login" only signs in someone who already has one.
 * expectDomain is the company's email domain the person picked on the sign-up screen: any other Google account is refused.
 */
export const googleAuthSchema = z.object({
  idToken: z.string().min(20).max(4096),
  client: z.enum(['MOBILE', 'WEB']),
  mode: z.enum(['login', 'signup']).default('login'),
  expectDomain: z.string().trim().toLowerCase().max(120).optional(),
});
export type GoogleAuth = z.infer<typeof googleAuthSchema>;
