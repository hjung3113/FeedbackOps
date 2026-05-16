import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url().optional(),
  AUTH_PROVIDER: z.enum(['mock', 'oidc']).default('mock'),
  WORKSPACE_ID: z.string().uuid().optional(),
  PUBLIC_ATTACHMENT_ORIGIN: z.string().default("'self'"),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  return envSchema.parse(process.env);
}
