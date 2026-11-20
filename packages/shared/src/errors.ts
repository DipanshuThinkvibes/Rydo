/** Error codes returned as { error: { code, message, fields } }. Clients switch on code, never on message. */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'INVALID_CREDENTIALS',
  'OTP_INVALID',
  'OTP_EXPIRED',
  'OTP_TOO_MANY_ATTEMPTS',
  'COMPANY_NOT_ON_RYDO',
  'ORG_REQUIRED',
  'MEMBERSHIP_NOT_ACTIVE',
  'MAPS_UNAVAILABLE',
  'FEATURE_OFF',
  'DOMAIN_MISMATCH',
  'GOOGLE_UNAVAILABLE',
  'SEAT_LIMIT',
  'SUPPORT_READ_ONLY',
  'PIN_WRONG',
  'TOO_EARLY',
  'RIDE_NOT_LIVE',
  // Government records did not match a driver document; HR can verify anyway after looking (ignoreFailedChecks).
  'CHECK_FAILED',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  error: { code: ErrorCode; message: string; fields?: Record<string, string> };
}