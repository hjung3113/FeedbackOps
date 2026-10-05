import { Writable } from 'node:stream';

import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { registerHttpErrorHandler } from '../http-error-handler.js';

const malformedRequestEnvelope = {
  code: 'validation.malformed_request',
  message: 'malformed request',
};

const framework4xxCases = [
  { name: 'malformed JSON', payload: '{bad' },
  { name: 'empty JSON body', payload: '' },
  { name: 'unsupported media type', contentType: 'application/xml', payload: '<body />' },
  { name: 'body over the limit', bodyLimit: 8, payload: '{"value":"long"}' },
  {
    name: 'content length smaller than the body',
    contentLength: '1',
    payload: '{"value":true}',
  },
];

describe('registerHttpErrorHandler', () => {
  it.each(framework4xxCases)(
    'maps $name to validation.malformed_request without error logging',
    async ({ contentLength, contentType, bodyLimit, payload }) => {
      const chunks: Buffer[] = [];
      const stream = new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(Buffer.from(chunk));
          callback();
        },
      });
      const app = Fastify({
        ...(bodyLimit === undefined ? {} : { bodyLimit }),
        logger: { level: 'trace', stream },
      });
      registerHttpErrorHandler(app);
      app.post('/requests', async () => ({ accepted: true }));

      const headers: Record<string, string> = {
        'content-type': contentType ?? 'application/json',
      };
      if (contentLength !== undefined) headers['content-length'] = contentLength;

      try {
        const response = await app.inject({
          method: 'POST',
          url: '/requests',
          headers,
          payload,
        });
        const logLines = chunks
          .join('')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as { level?: unknown });

        expect(response.statusCode).toBe(422);
        expect(response.json()).toEqual(malformedRequestEnvelope);
        expect(
          logLines.filter((line) => typeof line.level === 'number' && line.level >= 50),
        ).toEqual([]);
        if (payload) expect(chunks.join('')).not.toContain(payload);
      } finally {
        await app.close();
      }
    },
  );

  it('keeps errors without a 4xx status on the internal 500 path', async () => {
    const app = Fastify({ logger: false });
    registerHttpErrorHandler(app);
    app.post('/requests', async () => {
      throw new Error('unexpected failure');
    });

    try {
      const response = await app.inject({ method: 'POST', url: '/requests' });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        code: 'internal.unexpected',
        message: 'internal server error',
      });
    } finally {
      await app.close();
    }
  });
});
