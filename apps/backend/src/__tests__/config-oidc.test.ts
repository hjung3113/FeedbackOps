// OIDC env validation (issue #390).
//
// Contracts: AUTH_PROVIDER=mock ignores the OIDC_* vars entirely;
// AUTH_PROVIDER=oidc requires all four, pins issuer/redirect URI rules, and
// surfaces one zod issue per violated variable at exactly that variable's
// path. Validation messages must NEVER echo a value — the tests use a
// distinctive secret and a credentialed URL and assert their absence from
// the serialized issues. Pure unit tests: no DB, no network.

import { afterEach, describe, expect, it } from 'vitest';
import { ZodError, type ZodIssue } from 'zod';

import { loadConfig } from '../config.js';

const originalEnvironment = { ...process.env };

const SECRET = 's3cr3t-value';
const CREDENTIALED_URL = 'https://hunter2:hunter2@idp.example.com';

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

interface ParsedIssue {
  path: string;
  message: string;
}

// Mimics loadConfig() with a hermetic process.env clone. Returns the OIDC
// issues (possibly empty = config accepted), or throws when parsing failed
// for reasons outside the OIDC surface — positive cases must treat that as
// a failure, not as acceptance.
function oidcIssues(env: Record<string, string>): ParsedIssue[] | undefined {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, env);
  try {
    loadConfig();
    return [];
  } catch (err) {
    if (!(err instanceof ZodError)) throw err;
    const oidcPaths = new Set([
      'OIDC_ISSUER_URL',
      'OIDC_CLIENT_ID',
      'OIDC_CLIENT_SECRET',
      'OIDC_REDIRECT_URI',
      'OIDC_SCOPES',
    ]);
    const issues = err.issues.filter(
      (issue: ZodIssue) => issue.path.length === 1 && oidcPaths.has(String(issue.path[0])),
    );
    if (issues.length !== err.issues.length) return undefined; // unrelated failure
    return issues.map((issue: ZodIssue) => ({
      path: String(issue.path[0]),
      message: issue.message,
    }));
  }
}

function oidcEnv(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    NODE_ENV: 'test',
    AUTH_PROVIDER: 'oidc',
    OIDC_ISSUER_URL: 'https://idp.example.com',
    OIDC_CLIENT_ID: 'test-rp-client',
    OIDC_CLIENT_SECRET: SECRET,
    OIDC_REDIRECT_URI: 'https://feedbackops.example.com/auth/callback',
    OIDC_SCOPES: 'openid email profile',
    ...overrides,
  };
}

describe('validateOidcConfig via loadConfig', () => {
  it('mock provider ignores OIDC vars — even invalid ones', () => {
    const issues = oidcIssues({
      NODE_ENV: 'test',
      AUTH_PROVIDER: 'mock',
      OIDC_ISSUER_URL: CREDENTIALED_URL,
      OIDC_REDIRECT_URI: 'https://feedbackops.example.com/auth/callback',
    });
    expect(issues).toEqual([]);
  });

  it('accepts a fully valid oidc configuration', () => {
    expect(oidcIssues(oidcEnv())).toEqual([]);
  });

  it('accepts http localhost issuer + redirect outside production', () => {
    const issues = oidcIssues(
      oidcEnv({
        OIDC_ISSUER_URL: 'http://localhost:8080',
        OIDC_REDIRECT_URI: 'http://127.0.0.1:3011/auth/callback',
      }),
    );
    expect(issues).toEqual([]);
  });

  it.each(['OIDC_ISSUER_URL', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'OIDC_REDIRECT_URI'])(
    'missing %s → one issue naming exactly that variable',
    (variable) => {
      const env = oidcEnv();
      delete env[variable];
      const issues = oidcIssues(env);
      expect(issues).toHaveLength(1);
      expect(issues?.[0]?.path).toBe(variable);
      expect(issues?.[0]?.message).toBe(`${variable} is required when AUTH_PROVIDER=oidc`);
    },
  );

  it('rejects an https issuer in production only for http (localhost stays allowed outside)', () => {
    const prod = oidcIssues(
      oidcEnv({ NODE_ENV: 'production', OIDC_ISSUER_URL: 'http://localhost:8080' }),
    );
    expect(prod).toHaveLength(1);
    expect(prod?.[0]?.path).toBe('OIDC_ISSUER_URL');

    const outside = oidcIssues(
      oidcEnv({ NODE_ENV: 'development', OIDC_ISSUER_URL: 'http://10.0.0.8:8080' }),
    );
    expect(outside).toHaveLength(1);
    expect(outside?.[0]?.path).toBe('OIDC_ISSUER_URL');
  });

  it.each([
    ['https://idp.example.com/.well-known/openid-configuration?x=1', 'query'],
    ['https://idp.example.com/#fragment', 'fragment'],
    [CREDENTIALED_URL, 'credentials'],
    ['not-a-url', 'relative garbage'],
  ])('rejects issuer %s (%s) without echoing the value', (issuer) => {
    const issues = oidcIssues(oidcEnv({ OIDC_ISSUER_URL: issuer }));
    expect(issues?.[0]?.path).toBe('OIDC_ISSUER_URL');
    expect(JSON.stringify(issues)).not.toContain(issuer);
    expect(JSON.stringify(issues)).not.toContain('hunter2');
    expect(JSON.stringify(issues)).not.toContain('idp.example.com');
  });

  it.each([
    ['https://feedbackops.example.com/cb', 'wrong path'],
    ['https://feedbackops.example.com/auth/callback#f', 'fragment'],
    ['https://feedbackops.example.com/auth/callback/extra', 'extra path segment'],
    ['https://feedbackops.example.com/auth/callback?tenant=x', 'query string'],
    ['https://feedbackops.example.com/auth/callback?', 'empty query delimiter'],
  ])('rejects redirect_uri with %s', (redirectUri) => {
    const issues = oidcIssues(oidcEnv({ OIDC_REDIRECT_URI: redirectUri }));
    expect(issues?.[0]?.path).toBe('OIDC_REDIRECT_URI');
    expect(JSON.stringify(issues)).not.toContain(redirectUri);
  });

  it('rejects http redirect_uri in production but allows it for localhost outside', () => {
    const prod = oidcIssues(
      oidcEnv({
        NODE_ENV: 'production',
        OIDC_REDIRECT_URI: 'https://feedbackops.example.com/auth/callback',
        OIDC_ISSUER_URL: 'https://idp.example.com',
      }),
    );
    expect(prod).toEqual([]);

    const httpInProd = oidcIssues(
      oidcEnv({
        NODE_ENV: 'production',
        OIDC_REDIRECT_URI: 'http://127.0.0.1:3011/auth/callback',
      }),
    );
    expect(httpInProd?.[0]?.path).toBe('OIDC_REDIRECT_URI');
  });

  it('rejects blank client credentials without echoing them', () => {
    const issues = oidcIssues(oidcEnv({ OIDC_CLIENT_SECRET: '   ' }));
    expect(issues?.[0]?.path).toBe('OIDC_CLIENT_SECRET');
    expect(JSON.stringify(issues)).not.toContain(SECRET);
  });

  it('rejects scopes without openid', () => {
    const issues = oidcIssues(oidcEnv({ OIDC_SCOPES: 'email profile' }));
    expect(issues?.[0]?.path).toBe('OIDC_SCOPES');
  });

  it.each([
    ['openid\nemail', 'newline'],
    ['openid\temail', 'tab'],
    ['openid  email', 'double space'],
    ['openid "email"', 'double quote'],
    ['openid email\\profile', 'backslash'],
    ['openid email\n', 'trailing newline'],
    [' openid email', 'leading space'],
  ])('rejects scope list with %j (%s): it would be sent verbatim to the IdP', (scopes) => {
    // Positive twin: the default scope list is accepted by the same helper.
    expect(oidcIssues(oidcEnv({ OIDC_SCOPES: 'openid email profile' }))).toEqual([]);
    const issues = oidcIssues(oidcEnv({ OIDC_SCOPES: scopes }));
    expect(issues?.[0]?.path).toBe('OIDC_SCOPES');
  });

  it('never echoes the secret or URL values anywhere in the issue list', () => {
    const issues = oidcIssues(
      oidcEnv({
        OIDC_ISSUER_URL: CREDENTIALED_URL,
        OIDC_CLIENT_ID: '   ',
      }),
    );
    expect(issues?.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(issues);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('idp.example.com');
  });
});
