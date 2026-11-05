import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { env } from './config/env';

/** Shared by main.ts and the e2e tests so both run the same app. */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api/v1');
  const express = app as NestExpressApplication;
  if (env().TRUST_PROXY === 'true') express.set('trust proxy', 1);
  express.disable('x-powered-by');
  express.useBodyParser('json', { limit: env().BODY_LIMIT });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env().WEB_ORIGIN.split(','), credentials: true });
}