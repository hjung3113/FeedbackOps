import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  // Connection used by the running application; should be the fops_app role
  // (INSERT/SELECT/UPDATE/DELETE on non-audit tables, INSERT/SELECT only on
  // core.audit_log per ADR-0008).
  DATABASE_URL: z.string().url().optional(),
  // Connection used exclusively by drizzle-kit migrations and operator scripts;
  // should be the fops_migrate role (ALL on every table). Kept separate so the
  // running app cannot accidentally mutate core.audit_log rows.
  DATABASE_URL_MIGRATE: z.string().url().optional(),
  AUTH_PROVIDER: z.enum(['mock', 'oidc']).default('mock'),
  WORKSPACE_ID: z.string().uuid().optional(),
  WORKSPACE_NAME: z.string().default('FeedbackOps'),
  // Slice 1 seed scope: 'core' inserts workspace + 3 baseline actors only.
  SEED_MODE: z.enum(['core']).default('core'),
  PUBLIC_ATTACHMENT_ORIGIN: z.string().default("'self'"),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  return envSchema.parse(process.env);
}
