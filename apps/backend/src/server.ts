import helmet from '@fastify/helmet';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppConfig } from './config.js';

export async function buildServer(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'silent' : 'info',
      // ADR-0013: logs-first observability via stdout JSON.
    },
    disableRequestLogging: config.NODE_ENV === 'test',
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // ADR-0015 security headers. CSP placeholder uses PUBLIC_ATTACHMENT_ORIGIN.
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', config.PUBLIC_ATTACHMENT_ORIGIN],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", config.PUBLIC_ATTACHMENT_ORIGIN],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
  });

  app.route({
    method: 'GET',
    url: '/health',
    schema: {
      response: {
        200: z.object({
          status: z.literal('ok'),
          ts: z.string().datetime(),
        }),
      },
    },
    handler: async () => ({ status: 'ok' as const, ts: new Date().toISOString() }),
  });

  return app;
}
