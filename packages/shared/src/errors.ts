/** Error codes returned as { error: { code, message, fields } }. Clients switch on code, never on message. */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INVALID_CREDENTIALS',
  'OTP_INVALID',
  'OTP_EXPIRED',
  'OTP_TOO_MANY_ATTEMPTS',
  'COMPANY_NOT_ON_RYDO',
  'ORG_REQUIRED',
  'MEMBERSHIP_NOT_ACTIVE',
  'MAPS_UNAVAILABLE',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  error: { code: ErrorCode; message: string; fields?: Record<string, string> };
}