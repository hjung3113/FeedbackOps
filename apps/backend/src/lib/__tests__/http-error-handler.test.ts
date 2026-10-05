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

function buildApp(options: { bodyLimit?: number; route?: () => Promise<unknown> } = {}) {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  const app = Fastify({
    ...(options.bodyLimit === undefined ? {} : { bodyLimit: options.bodyLimit }),
    logger: { level: 'trace', stream },
  });
  registerHttpErrorHandler(app);
  app.post('/requests', options.route ?? (async () => ({ accepted: true })));
  const logText = () => chunks.join('');
  const errorLogLines = () =>
    logText()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { level?: unknown })
      .filter((line) => typeof line.level === 'number' && line.level >= 50);
  return { app, logText, errorLogLines };
}

describe('registerHttpErrorHandler', () => {
  it.each(framework4xxCases)(
    'maps $name to validation.malformed_request without error logging',
    async ({ contentLength, contentType, bodyLimit, payload }) => {
      const { app, errorLogLines } = buildApp(bodyLimit === undefined ? {} : { bodyLimit });
      const headers: Record<string, string> = {
        'content-type': contentType ?? 'application/json',
      };
      if (contentLength !== undefined) headers['content-length'] = contentLength;

      try {
        const response = await app.inject({ method: 'POST', url: '/requests', headers, payload });

        expect(response.statusCode).toBe(422);
        expect(response.json()).toEqual(malformedRequestEnvelope);
        expect(errorLogLines()).toEqual([]);
      } finally {
        await app.close();
      }
    },
  );

  it('never echoes the request body into the log or the response', async () => {
    // V8 copies this payload into the SyntaxError message ("secret-marker" is
    // not valid JSON), so logging or returning `err.message` would leak it.
    const { app, logText } = buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/requests',
        headers: { 'content-type': 'application/json' },
        payload: 'secret-marker',
      });

      expect(response.statusCode).toBe(422);
      expect(response.body).not.toContain('secret-marker');
      expect(logText()).not.toContain('secret-marker');
    } finally {
      await app.close();
    }
  });

  it.each([
    { name: 'no statusCode', error: () => new Error('unexpected failure') },
    {
      name: 'a 5xx statusCode',
      error: () => Object.assign(new Error('serialization failed'), { statusCode: 500 }),
    },
  ])('keeps an error with $name on the internal 500 path', async ({ error }) => {
    const { app, errorLogLines } = buildApp({
      route: async () => {
        throw error();
      },
    });

    try {
      const response = await app.inject({ method: 'POST', url: '/requests' });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        code: 'internal.unexpected',
        message: 'internal server error',
      });
      expect(errorLogLines()).toHaveLength(1);
    } finally {
      await app.close();
    }
  });
});
