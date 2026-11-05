import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import type { ApiError, ErrorCode } from '@rydo/shared';
import { AppError } from './app-error';

const byStatus: Record<number, ErrorCode> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger('Errors');

  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ApiError = { error: { code: 'INTERNAL', message: 'Something went wrong' } };

    if (err instanceof AppError) {
      status = err.status;
      body = { error: { code: err.code, message: err.message, fields: err.fields } };
    } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      status = 409;
      body = { error: { code: 'CONFLICT', message: 'That already exists.' } };
    } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      status = 404;
      body = { error: { code: 'NOT_FOUND', message: 'Not found.' } };
    } else if (err instanceof ThrottlerException) {
      status = 429;
      body = { error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.' } };
    } else if (err instanceof HttpException) {
      status = err.getStatus();
      body = { error: { code: byStatus[status] ?? 'INTERNAL', message: err.message } };
    } else {
      this.log.error(err instanceof Error ? `${err.message}\n${err.stack}` : String(err));
    }
    res.status(status).json(body);
  }
}