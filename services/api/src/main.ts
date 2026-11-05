import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { env } from './config/env';

async function main() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(env().PORT);
  console.log(`RYDO API on http://localhost:${env().PORT}/api/v1`);
}
main();