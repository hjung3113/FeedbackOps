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
  // Review HTTP-H-2: `trustProxy: true` is unconditional and lets clients
  // spoof `X-Forwarded-For` to reset anon rate-limit buckets and audit IPs
  // when no ingress is in front. Hop count restricts Fastify to trusting
  // only the rightmost N entries of the X-Forwarded-For chain. Set to the
  // number of trusted proxies between the client and Fastify (1 for a
  // single ingress; 0 disables trust, identical to `false`). Defaults to
  // 0 outside production so dev/test/CI cannot spoof.
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  EMBEDDING_PROVIDER: z.enum(['voyage', 'fake', 'disabled']).default('disabled'),
  EMBEDDING_API_KEY: z.string().min(1).optional(),
  EMBEDDING_VERSION: z.coerce.number().int().positive().default(1),
}).superRefine((config, context) => {
  if (config.EMBEDDING_PROVIDER === 'voyage' && !config.EMBEDDING_API_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['EMBEDDING_API_KEY'],
      message: 'EMBEDDING_API_KEY is required when EMBEDDING_PROVIDER=voyage',
    });
  }
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  return envSchema.parse(process.env);
}
