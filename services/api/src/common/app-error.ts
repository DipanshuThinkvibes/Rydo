import { HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@rydo/shared';

/** Throw this from services. The filter turns it into { error: { code, message, fields } }. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}