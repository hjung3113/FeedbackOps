// PUBLIC_ATTACHMENT_ORIGIN validation (#402).
//
// The value flows verbatim into the CSP (server.ts img-src/connect-src), so
// only the quoted literal 'self', a strict https://host[:port] origin, or —
// outside production — http://localhost[:port] / http://127.0.0.1[:port] may
// pass. Every rejection must surface as a zod issue on exactly the
// PUBLIC_ATTACHMENT_ORIGIN path when loadConfig() parses process.env.
// Pure unit tests: no DB, no network.

import { afterEach, describe, expect, it } from 'vitest';
import { ZodError, type ZodIssue } from 'zod';

import { validateAttachmentOrigin } from '../config-attachment-origin.js';
import { loadConfig, platformReturnOriginsOf } from '../config.js';

const originalEnvironment = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

// Mimics loadConfig() with a hermetic process.env clone so unrelated
// environment variables cannot leak issues into the result.
// Returns null when the whole config parsed successfully, the attachment issue
// when it was rejected, or undefined when config failed for an unrelated reason
// (which positive cases must treat as a failure, not as acceptance).
function attachmentOriginIssue(value: string, nodeEnv: string): ZodIssue | null | undefined {
  for (const key of Object.keys(process.env)) delete process.env[key];
  process.env.NODE_ENV = nodeEnv;
  process.env.PUBLIC_ATTACHMENT_ORIGIN = value;
  try {
    loadConfig();
    return null;
  } catch (err) {
    if (!(err instanceof ZodError)) throw err;
    return err.issues.find((issue) => issue.path.includes('PUBLIC_ATTACHMENT_ORIGIN'));
  }
}

describe('validateAttachmentOrigin', () => {
  it.each([["'self'"], ['https://cdn.example.com'], ['https://cdn.example.com:8443'], ['https://cdn.example.com.']])(
    'accepts %s in production',
    (value) => {
      expect(validateAttachmentOrigin(value, 'production')).toBeNull();
      expect(attachmentOriginIssue(value, 'production')).toBeNull();
    },
  );

  it.each([['http://localhost:3001'], ['http://127.0.0.1:9000']])(
    'accepts %s outside production but rejects it in production',
    (value) => {
      expect(validateAttachmentOrigin(value, 'development')).toBeNull();
      expect(validateAttachmentOrigin(value, 'test')).toBeNull();
      expect(validateAttachmentOrigin(value, 'production')).toMatch(/outside production/);
      expect(attachmentOriginIssue(value, 'production')).toMatchObject({
        path: ['PUBLIC_ATTACHMENT_ORIGIN'],
      });
    },
  );

  it.each([
    ['https://cdn.example.com/'],
    ['https://cdn.example.com/path'],
    ['https://user:pw@cdn.example.com'],
    ['https://*.example.com'],
    ['*'],
    ['self'],
    ["'self' evil.com"],
    ['https://a.com; script-src *'],
    ['http://cdn.example.com'],
    ['ftp://x.com'],
    ['not a url'],
    [''],
    ['https://[::1]'],
    ['https://cdn_example.com'],
    ['https://CDN.example.com'],
    ['https://cdn.example.com:443'],
  ])('rejects %p', (value) => {
    for (const nodeEnv of ['development', 'test', 'production']) {
      const reason = validateAttachmentOrigin(value, nodeEnv);
      expect(reason, `expected rejection in ${nodeEnv}`).toBeTruthy();
      const issue = attachmentOriginIssue(value, nodeEnv);
      expect(issue, `expected a zod issue in ${nodeEnv}`).toBeDefined();
      expect(issue?.path).toEqual(['PUBLIC_ATTACHMENT_ORIGIN']);
    }
  });

  it('rejects credentials without echoing the password', () => {
    const reason = validateAttachmentOrigin('https://user:pw@cdn.example.com', 'production');
    expect(reason).toMatch(/must not contain credentials/);
    expect(reason).not.toContain('pw');
    const issue = attachmentOriginIssue('https://user:pw@cdn.example.com', 'production');
    expect(issue?.message).toMatch(/must not contain credentials/);
    expect(issue?.message).not.toContain('pw');
  });

  it('gives specific reasons for injection-shaped values', () => {
    expect(validateAttachmentOrigin('https://*.example.com', 'production')).toMatch(/wildcard/);
    expect(validateAttachmentOrigin("'self' evil.com", 'production')).toMatch(/whitespace/);
    expect(validateAttachmentOrigin('https://a.com; script-src *', 'production')).toMatch(
      /whitespace|;/,
    );
    expect(validateAttachmentOrigin('self', 'production')).toMatch(/quoted/);
  });
});

// PLATFORM_RETURN_ORIGINS (ADR-0071): same origin grammar, list form, own messages.
function platformOriginsIssue(
  value: string | undefined,
  nodeEnv: string,
): ZodIssue | null | undefined {
  for (const key of Object.keys(process.env)) delete process.env[key];
  process.env.NODE_ENV = nodeEnv;
  if (value !== undefined) process.env.PLATFORM_RETURN_ORIGINS = value;
  try {
    loadConfig();
    return null;
  } catch (err) {
    if (!(err instanceof ZodError)) throw err;
    return err.issues.find((issue) => issue.path.includes('PLATFORM_RETURN_ORIGINS'));
  }
}

describe('PLATFORM_RETURN_ORIGINS', () => {
  it.each([
    [undefined, 'production', []],
    ['', 'production', []],
    ['https://platform.example.com', 'production', ['https://platform.example.com']],
    [
      'https://a.example.com,https://b.example.com:8443',
      'production',
      ['https://a.example.com', 'https://b.example.com:8443'],
    ],
    [
      'http://localhost:5173,http://127.0.0.1:3000',
      'development',
      ['http://localhost:5173', 'http://127.0.0.1:3000'],
    ],
  ])('accepts %p in %s', (value, nodeEnv, expected) => {
    expect(platformOriginsIssue(value, nodeEnv)).toBeNull();
    expect(
      platformReturnOriginsOf({
        PLATFORM_RETURN_ORIGINS: value,
        NODE_ENV: nodeEnv as 'production',
      }),
    ).toEqual(expected);
  });

  it.each([
    ['http://platform.example.com', 'production'],
    ['http://localhost:5173', 'production'],
    ['https://platform.example.com/path', 'production'],
    ['https://platform.example.com/', 'production'],
    ['https://user:secret@platform.example.com', 'production'],
    ['https://*.example.com', 'production'],
    ['javascript:alert(1)', 'production'],
    ['https://a.example.com,', 'production'],
    ['https://a.example.com,,https://b.example.com', 'production'],
    ['https://a.example.com, https://b.example.com', 'production'],
    ['https://a.example.com,https://a.example.com', 'production'],
    ["'self'", 'production'],
  ])('rejects %p in %s without echoing it', (value, nodeEnv) => {
    const issue = platformOriginsIssue(value, nodeEnv);
    expect(issue?.path).toEqual(['PLATFORM_RETURN_ORIGINS']);
    expect(issue?.message).toMatch(/^PLATFORM_RETURN_ORIGINS /);
    expect(issue?.message).not.toContain('secret');
    expect(issue?.message).not.toContain(value);
    expect(issue?.message).not.toMatch(/CSP/);
  });
});
