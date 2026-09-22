// redactSensitiveQuery (issue #390).
//
// Contracts: values of sensitive query keys are replaced with '[redacted]'
// while keys, order, repetition, and non-sensitive pairs survive verbatim;
// URLs without a query pass through untouched; percent-encoded sensitive
// keys are caught. The integration-style section proves the serializer is
// actually wired into createRootLogger: a real pino logger writing to an
// in-memory stream must not emit the raw value for a /auth/callback
// request URL.

import { Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';

import { describe, expect, it } from 'vitest';

import { createRootLogger, reqLogSerializer } from '../logger.js';
import { redactSensitiveQuery } from '../redact-url.js';

describe('redactSensitiveQuery', () => {
  it('redacts sensitive values and keeps keys, order, and unrelated pairs', () => {
    expect(redactSensitiveQuery('/auth/callback?code=abc&state=xyz&keep=1')).toBe(
      '/auth/callback?code=[redacted]&state=[redacted]&keep=1',
    );
  });

  it('leaves URLs without a query untouched', () => {
    expect(redactSensitiveQuery('/health')).toBe('/health');
    expect(redactSensitiveQuery('/auth/callback')).toBe('/auth/callback');
  });

  it('handles repeated keys', () => {
    expect(redactSensitiveQuery('/cb?code=a&keep=1&code=b')).toBe(
      '/cb?code=[redacted]&keep=1&code=[redacted]',
    );
  });

  it('matches percent-encoded key names', () => {
    expect(redactSensitiveQuery('/cb?c%6Fde=abc&keep=1')).toBe(
      '/cb?c%6Fde=[redacted]&keep=1',
    );
  });

  it('covers every sensitive key', () => {
    const pairs = [
      'code=a',
      'state=s',
      'id_token=t',
      'access_token=a',
      'refresh_token=r',
      'session_state=ss',
      'error_description=ed',
      'client_secret=cs',
    ].join('&');
    const redacted = redactSensitiveQuery(`/cb?${pairs}`);
    expect(redacted).not.toContain('=a&');
    expect(redacted).toContain('code=[redacted]');
    expect(redacted).toContain('state=[redacted]');
    expect(redacted).toContain('id_token=[redacted]');
    expect(redacted).toContain('access_token=[redacted]');
    expect(redacted).toContain('refresh_token=[redacted]');
    expect(redacted).toContain('session_state=[redacted]');
    expect(redacted).toContain('error_description=[redacted]');
    expect(redacted).toContain('client_secret=[redacted]');
  });

  it('leaves valueless and non-sensitive pairs alone', () => {
    expect(redactSensitiveQuery('/cb?flag&code=abc&x=y')).toBe('/cb?flag&code=[redacted]&x=y');
  });
});

describe('createRootLogger req serializer wiring', () => {
  function collect(streamChunks: Buffer[]): Writable {
    return new Writable({
      write(chunk, _encoding, callback) {
        streamChunks.push(chunk as Buffer);
        callback();
      },
    });
  }

  it('serializes the standard Fastify req shape with a redacted url', () => {
    const out = reqLogSerializer({
      method: 'GET',
      url: '/auth/callback?code=abc&keep=1',
      headers: { 'accept-version': '1.x' },
      host: 'backend.internal',
      ip: '10.0.0.1',
      socket: { remotePort: 54321 },
    });
    expect(out).toEqual({
      method: 'GET',
      url: '/auth/callback?code=[redacted]&keep=1',
      version: '1.x',
      host: 'backend.internal',
      remoteAddress: '10.0.0.1',
      remotePort: 54321,
    });
  });

  it('a real pino logger from createRootLogger never emits the raw code', async () => {
    const chunks: Buffer[] = [];
    const logger = createRootLogger({ NODE_ENV: 'development' }, collect(chunks));
    logger.child({ reqId: 'req-1' }).info(
      {
        req: {
          method: 'GET',
          url: '/auth/callback?code=abc&state=xyz&keep=1',
          headers: {},
          host: '127.0.0.1:3011',
          ip: '127.0.0.1',
          socket: { remotePort: 40000 },
        },
      },
      'incoming request',
    );
    logger.flush();
    // Pino may hand the line to the stream asynchronously — wait briefly.
    let line = Buffer.concat(chunks).toString('utf8');
    for (let i = 0; i < 50 && line === ''; i += 1) {
      await delay(1);
      line = Buffer.concat(chunks).toString('utf8');
    }
    expect(line).toContain('incoming request');
    expect(line).toContain('code=[redacted]');
    expect(line).not.toContain('code=abc');
    expect(line).not.toContain('state=xyz');
    expect(line).toContain('keep=1');
  });
});
