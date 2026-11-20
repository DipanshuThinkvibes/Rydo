import { HttpStatus, PipeTransform } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';
import { AppError } from './app-error';

/** @Body(new ZodPipe(schema)) - validates with the same schemas the apps use (@rydo/shared). */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  // Input may differ from output (e.g. "LMV,MCWG" from a multipart form becomes a list).
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value ?? {});
    if (parsed.success) return parsed.data;
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[issue.path.join('.') || '_'] = issue.message;
    throw new AppError('VALIDATION_ERROR', 'Check the highlighted fields', HttpStatus.BAD_REQUEST, fields);
  }
}