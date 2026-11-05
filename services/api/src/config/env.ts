import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  JWT_SECRET: z.string().min(32),
  OTP_PEPPER: z.string().min(16),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('RYDO <no-reply@rydo.local>'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('ap-south-1'),
  S3_ACCESS_KEY: z.string().default(''),
  S3_SECRET_KEY: z.string().default(''),
  S3_BUCKET: z.string().default('rydo-documents'),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  /** Background jobs (pg-boss). Off in tests, which call the job code directly. */
  JOBS_ENABLED: z.enum(['true', 'false']).default('true'),
});

export type Env = z.infer<typeof schema>;
let cached: Env | undefined;

/** Validated environment. Fails fast at startup when something is missing. */
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error('Invalid environment: ' + JSON.stringify(parsed.error.flatten().fieldErrors));
    }
    cached = parsed.data;
  }
  return cached;
}