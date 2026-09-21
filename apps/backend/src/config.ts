import { z } from 'zod';

import { validateAttachmentOrigin } from './config-attachment-origin.js';
import { validateOidcConfig } from './config-oidc.js';

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
  // OIDC env contract (issue #390, ADR-0006 amended 2026-09-22). Ignored
  // (not required, not validated) when AUTH_PROVIDER=mock; required and
  // rule-checked in superRefine when AUTH_PROVIDER=oidc. Validation
  // messages never echo values (the secret, URLs that may carry
  // credentials) — variable names and rule descriptions only.
  OIDC_ISSUER_URL: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_REDIRECT_URI: z.string().optional(),
  OIDC_SCOPES: z.string().default('openid email profile'),
  WORKSPACE_ID: z.string().uuid().optional(),
  WORKSPACE_NAME: z.string().default('FeedbackOps'),
  // `personas` layers black-box test actors and grants over the core seed.
  SEED_MODE: z.enum(['core', 'personas']).default('core'),
  // CSP `img-src`/`connect-src` origin for public attachment URLs (#402).
  // Accepted: the quoted literal `'self'` (default, everything same-origin) or
  // a bare origin `https://host[:port]`; outside production also
  // `http://localhost[:port]` / `http://127.0.0.1[:port]`. Anything else —
  // paths, query, credentials, wildcards, whitespace/separators, other
  // schemes — fails config load via validateAttachmentOrigin.
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
  const originIssue = validateAttachmentOrigin(config.PUBLIC_ATTACHMENT_ORIGIN, config.NODE_ENV);
  if (originIssue) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['PUBLIC_ATTACHMENT_ORIGIN'],
      message: originIssue,
    });
  }
  for (const oidcIssue of validateOidcConfig({
    authProvider: config.AUTH_PROVIDER,
    nodeEnv: config.NODE_ENV,
    issuerUrl: config.OIDC_ISSUER_URL,
    clientId: config.OIDC_CLIENT_ID,
    clientSecret: config.OIDC_CLIENT_SECRET,
    redirectUri: config.OIDC_REDIRECT_URI,
    scopes: config.OIDC_SCOPES,
  }) ?? []) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [oidcIssue.path],
      message: oidcIssue.message,
    });
  }
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
