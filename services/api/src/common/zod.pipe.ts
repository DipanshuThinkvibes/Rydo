import { HttpStatus, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { AppError } from './app-error';

/** @Body(new ZodPipe(schema)) - validates with the same schemas the apps use (@rydo/shared). */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value ?? {});
    if (parsed.success) return parsed.data;
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[issue.path.join('.') || '_'] = issue.message;
    throw new AppError('VALIDATION_ERROR', 'Check the highlighted fields', HttpStatus.BAD_REQUEST, fields);
  }
}