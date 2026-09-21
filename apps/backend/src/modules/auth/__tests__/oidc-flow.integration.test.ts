// End-to-end OIDC provider flow (issue #390) against the in-process fake
// IdP (fake-oidc-idp.ts) — DB-gated like auth.integration.test.ts: the
// suite runs only when the dev Postgres is up and WORKSPACE_ID is exported.
//
// Every negative case runs against the same server that the positive
// (happy-path) case proves works, and failure assertions check the
// observable contract: 401 `auth.session_invalid` with the generic message,
// no session cookie, no actor row — and never an echoed secret, code, or
// IdP error text.

import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { OIDC_TX_COOKIE_NAME, signOidcTx } from '../oidc-tx-cookie.js';
import { FakeOidcIdp } from './fake-oidc-idp.js';

// Structural stand-in for light-my-request's response type (light-my-request
// is not a direct dependency, so its type name is not importable here).
// Headers are widened to unknown: fastify's inject types them as
// OutgoingHttpHeaders, whose values include numbers.
interface InjectResponse {
  statusCode: number;
  headers: Record<string, unknown>;
  json(): unknown;
}

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

const CLIENT_ID = 'test-rp-client';
// Deliberate marker value: every test that must not echo the client secret
// asserts this exact string is absent from the response.
const CLIENT_SECRET = 's3cr3t-value';
const REDIRECT_URI = 'http://127.0.0.1:3011/auth/callback';
const UA = 'oidc-flow-test';
const IT_SUB = 'oidc-it-sub-1';

interface CookieEntry {
  raw: string;
  name: string;
  value: string;
  attrs: string;
}

function setCookieEntries(res: InjectResponse): CookieEntry[] {
  const header = res.headers['set-cookie'];
  const arr = Array.isArray(header)
    ? header.map(String)
    : typeof header === 'string'
      ? [header]
      : [];
  return arr.map((raw) => {
    const [pair, ...attrs] = raw.split(';');
    const eq = (pair ?? '').indexOf('=');
    return {
      raw,
      name: (pair ?? '').slice(0, eq),
      value: (pair ?? '').slice(eq + 1),
      attrs: attrs.join(';'),
    };
  });
}

function findCookie(res: InjectResponse, name: string): CookieEntry | undefined {
  return setCookieEntries(res).find((c) => c.name === name);
}

interface DriveResult {
  loginRes: InjectResponse;
  callbackRes: InjectResponse;
  authorizeUrl: string;
  code: string;
  txCookie: string;
}

/** One full login round trip: GET /auth/login → fake IdP authorize →
 * GET /auth/callback with the transaction cookie. `transform` mutates the
 * callback query (state/error tampering) after the IdP signed it. */
async function drive(
  app: FastifyInstance,
  idp: FakeOidcIdp,
  opts: {
    returnTo?: string;
    txCookieOverride?: string;
    transform?: (params: URLSearchParams) => void;
  } = {},
): Promise<DriveResult> {
  const loginUrl =
    opts.returnTo === undefined
      ? '/auth/login'
      : `/auth/login?return_to=${encodeURIComponent(opts.returnTo)}`;
  const loginRes = await app.inject({
    method: 'GET',
    url: loginUrl,
    headers: { 'user-agent': UA },
  });
  const location = loginRes.headers.location;
  expect(typeof location).toBe('string');
  const txCookie = findCookie(loginRes, OIDC_TX_COOKIE_NAME);
  expect(txCookie).toBeDefined();
  const authorizeUrl = idp.authorize(location as string);
  const callbackUrl = new URL(authorizeUrl);
  opts.transform?.(callbackUrl.searchParams);
  const cookieValue = opts.txCookieOverride ?? txCookie?.value;
  const callbackRes = await app.inject({
    method: 'GET',
    url: `/auth/callback${callbackUrl.search}`,
    headers: { cookie: `${OIDC_TX_COOKIE_NAME}=${cookieValue}`, 'user-agent': UA },
  });
  return {
    loginRes,
    callbackRes,
    authorizeUrl,
    code: callbackUrl.searchParams.get('code') ?? '',
    txCookie: txCookie?.value ?? '',
  };
}

function expectRejected(res: InjectResponse): void {
  expect(res.statusCode).toBe(401);
  const body = res.json() as { code?: string; message?: string };
  expect(body.code).toBe('auth.session_invalid');
  expect(body.message).toBe('login could not be completed');
  expect(findCookie(res, SESSION_COOKIE_NAME)).toBeUndefined();
}

describe.skipIf(!runIntegration)('OIDC provider flow (#390)', () => {
  let dbHandle: DbHandle;
  let idp: FakeOidcIdp;
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    idp = await FakeOidcIdp.start({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      redirectUri: REDIRECT_URI,
    });
    dbHandle = createDb(APP_URL);
    // loadConfig parses process.env — a developer shell exporting
    // AUTH_PROVIDER=oidc (without OIDC_* vars) would fail validation before
    // we can override, so neutralize it for the base parse.
    const savedProvider = process.env.AUTH_PROVIDER;
    delete process.env.AUTH_PROVIDER;
    const base = loadConfig();
    if (savedProvider !== undefined) process.env.AUTH_PROVIDER = savedProvider;
    app = await buildServer({
      config: {
        ...base,
        AUTH_PROVIDER: 'oidc' as const,
        NODE_ENV: 'test' as const,
        OIDC_ISSUER_URL: idp.issuer,
        OIDC_CLIENT_ID: CLIENT_ID,
        OIDC_CLIENT_SECRET: CLIENT_SECRET,
        OIDC_REDIRECT_URI: REDIRECT_URI,
        OIDC_SCOPES: 'openid email profile',
      },
      dbHandle,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await dbHandle?.close();
    await idp?.close();
  });

  beforeEach(async () => {
    await dbHandle.pool.query(
      `delete from core.sessions where actor_id in (select id from core.actors where external_id like 'oidc-it-%')`,
    );
    await dbHandle.pool.query(`delete from core.actors where external_id like 'oidc-it-%'`);
    await dbHandle.pool.query(`delete from core.rate_limits`);
  });

  async function actorRow(externalId: string): Promise<Record<string, unknown> | undefined> {
    const result = await dbHandle.pool.query(
      `select id, external_id, email, display_name, role_level, actor_type
         from core.actors where external_id = $1`,
      [externalId],
    );
    return result.rows[0];
  }

  it('happy path: login → IdP → callback → session, provisioning, /me, and a second login updating claims', async () => {
    const first = await drive(app, idp, { returnTo: '/vocs' });

    // /auth/login: 302 to the IdP with the full parameter set + tx cookie.
    expect(first.loginRes.statusCode).toBe(302);
    const authParams = new URL(first.loginRes.headers.location as string).searchParams;
    expect(authParams.get('client_id')).toBe(CLIENT_ID);
    expect(authParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(authParams.get('response_type')).toBe('code');
    expect(authParams.get('scope')).toBe('openid email profile');
    expect(authParams.get('code_challenge_method')).toBe('S256');
    expect(authParams.get('code_challenge')).toBeTruthy();
    expect(authParams.get('state')).toBeTruthy();
    expect(authParams.get('nonce')).toBeTruthy();
    const txEntry = findCookie(first.loginRes, OIDC_TX_COOKIE_NAME);
    expect(txEntry?.attrs).toContain('HttpOnly');
    expect(txEntry?.attrs).toContain('SameSite=Lax');
    expect(txEntry?.attrs).toContain('Path=/auth');
    expect(txEntry?.attrs).toContain('Max-Age=600');

    // Callback: 302 to the sanitized returnTo, session issued, tx cleared.
    const callbackRes = first.callbackRes;
    expect(callbackRes.statusCode).toBe(302);
    expect(callbackRes.headers.location).toBe('/vocs');
    const sessionEntry = findCookie(callbackRes, SESSION_COOKIE_NAME);
    expect(sessionEntry?.attrs).toContain('HttpOnly');
    expect(sessionEntry?.attrs).toContain('SameSite=Lax');
    expect(sessionEntry).toBeDefined();

    const txAfter = findCookie(callbackRes, OIDC_TX_COOKIE_NAME);
    expect(txAfter).toBeDefined();
    expect(txAfter?.value).toBe('');
    expect(txAfter?.attrs).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');

    // Provisioning at role_level user (ADR-0006 first-login rules).
    const actor = await actorRow(IT_SUB);
    expect(actor?.role_level).toBe('user');
    expect(actor?.actor_type).toBe('internal_member');
    expect(actor?.email).toBe('oidc.it.user@example.com');
    expect(actor?.display_name).toBe('Oidc IT User');

    // /me with the session cookie resolves to that actor.
    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionEntry?.value}` },
    });
    expect(me.statusCode).toBe(200);
    const meBody = me.json() as { actor: { external_id: string; role_level: string } };
    expect(meBody.actor.external_id).toBe(IT_SUB);
    expect(meBody.actor.role_level).toBe('user');

    // Second login: changed email/name claims update the SAME actor.
    idp.setProfile({ email: 'oidc.it.renamed@example.com', name: 'Renamed User' });
    const second = await drive(app, idp);
    expect(second.callbackRes.statusCode).toBe(302);
    expect(second.callbackRes.headers.location).toBe('/');
    const updated = await actorRow(IT_SUB);
    expect(updated?.id).toBe(actor?.id);
    expect(updated?.email).toBe('oidc.it.renamed@example.com');
    expect(updated?.display_name).toBe('Renamed User');
    expect(updated?.role_level).toBe('user');
  });

  it('callback without / tampered / expired transaction cookie → 401, no session, no actor', async () => {
    // Negative 1: no tx cookie at all.
    const loginRes = await app.inject({
      method: 'GET',
      url: '/auth/login',
      headers: { 'user-agent': UA },
    });
    const authorizeUrl = idp.authorize(loginRes.headers.location as string);
    const callbackUrl = new URL(authorizeUrl);
    const noCookie = await app.inject({
      method: 'GET',
      url: `/auth/callback${callbackUrl.search}`,
      headers: { 'user-agent': UA },
    });
    expectRejected(noCookie);

    // Negative 2: tampered payload (signature mismatch).
    const goodTx = findCookie(loginRes, OIDC_TX_COOKIE_NAME)?.value ?? '';
    const [payloadB64] = goodTx.split('.');
    const tampered = `${payloadB64?.slice(0, -1)}X.${goodTx.split('.')[1]}`;
    const tamperedRes = await app.inject({
      method: 'GET',
      url: `/auth/callback${callbackUrl.search}`,
      headers: { cookie: `${OIDC_TX_COOKIE_NAME}=${tampered}`, 'user-agent': UA },
    });
    expectRejected(tamperedRes);

    // Negative 3: validly signed but expired.
    const expired = signOidcTx(CLIENT_SECRET, {
      state: 'irrelevant-for-expiry',
      nonce: 'n',
      verifier: 'v',
      returnTo: '/',
      exp: Math.floor(Date.now() / 1000) - 1,
    });
    const expiredRes = await app.inject({
      method: 'GET',
      url: `/auth/callback${callbackUrl.search}`,
      headers: { cookie: `${OIDC_TX_COOKIE_NAME}=${expired}`, 'user-agent': UA },
    });
    expectRejected(expiredRes);

    // No actor row materialized by any negative attempt.
    expect(await actorRow(IT_SUB)).toBeUndefined();

    // Positive twin: the SAME untampered flow succeeds on this server.
    const twin = await drive(app, idp);
    expect(twin.callbackRes.statusCode).toBe(302);
    expect(await actorRow(IT_SUB)).toBeDefined();
  });

  it('forged transaction cookie (attacker-chosen state/nonce/verifier, wrong signing key) → 401 (login CSRF)', async () => {
    // The attack the cookie HMAC exists for: the attacker completes an IdP
    // login of THEIR OWN account with parameters they chose, then plants a
    // matching transaction cookie in the victim's browser. Every payload field
    // is consistent (state, nonce, PKCE verifier↔challenge), so ONLY the
    // signature distinguishes the forgery from a legitimate cookie.
    const verifier = randomBytes(32).toString('base64url');
    const state = 'attacker-state';
    const nonce = 'attacker-nonce';
    const authorizeParams = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    const callbackUrl = new URL(idp.authorize(`http://idp.invalid/authorize?${authorizeParams}`));
    const payload = {
      state,
      nonce,
      verifier,
      returnTo: '/',
      exp: Math.floor(Date.now() / 1000) + 300,
    };

    // Positive twin: the same forgery signed with the REAL secret is accepted,
    // proving every other field is consistent and only the signature differs.
    const validlySigned = signOidcTx(CLIENT_SECRET, payload);
    const accepted = await app.inject({
      method: 'GET',
      url: `/auth/callback${callbackUrl.search}`,
      headers: { cookie: `${OIDC_TX_COOKIE_NAME}=${validlySigned}`, 'user-agent': UA },
    });
    expect(accepted.statusCode).toBe(302);
    // Reset the account so the negative below is judged from a clean slate.
    await dbHandle.pool.query(
      'delete from core.sessions where actor_id in (select id from core.actors where external_id = $1)',
      [IT_SUB],
    );
    await dbHandle.pool.query('delete from core.actors where external_id = $1', [IT_SUB]);

    const secondCallback = new URL(
      idp.authorize(`http://idp.invalid/authorize?${authorizeParams}`),
    );
    const forged = signOidcTx('some-other-secret-the-attacker-controls', payload);
    const forgedRes = await app.inject({
      method: 'GET',
      url: `/auth/callback${secondCallback.search}`,
      headers: { cookie: `${OIDC_TX_COOKIE_NAME}=${forged}`, 'user-agent': UA },
    });
    expectRejected(forgedRes);
    expect(await actorRow(IT_SUB)).toBeUndefined();
  });

  it('an IdP that reports email_verified=false cannot provision an actor', async () => {
    // Positive twin: an explicit email_verified=true (and absence, covered by
    // the happy path) is accepted.
    idp.nextIdToken({ emailVerified: true });
    const accepted = await drive(app, idp);
    expect(accepted.callbackRes.statusCode).toBe(302);
    await dbHandle.pool.query(
      `delete from core.sessions where actor_id in (select id from core.actors where external_id like 'oidc-it-%')`,
    );
    await dbHandle.pool.query(`delete from core.actors where external_id like 'oidc-it-%'`);

    idp.nextIdToken({ emailVerified: false });
    const result = await drive(app, idp);
    expectRejected(result.callbackRes);
    expect(await actorRow(IT_SUB)).toBeUndefined();
  });

  it('an otherwise valid, correctly signed transaction cookie is rejected once expired', async () => {
    // Every field is consistent (state, nonce, PKCE verifier↔challenge, real
    // signature); ONLY the expiry differs from the accepted twin, so removing
    // the expiry check would let the expired variant through.
    const verifier = randomBytes(32).toString('base64url');
    const authorizeParams = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state: 'expiry-state',
      nonce: 'expiry-nonce',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    const payload = (exp: number) => ({
      state: 'expiry-state',
      nonce: 'expiry-nonce',
      verifier,
      returnTo: '/',
      exp,
    });
    const callback = async (exp: number) => {
      const url = new URL(idp.authorize(`http://idp.invalid/authorize?${authorizeParams}`));
      return app.inject({
        method: 'GET',
        url: `/auth/callback${url.search}`,
        headers: {
          cookie: `${OIDC_TX_COOKIE_NAME}=${signOidcTx(CLIENT_SECRET, payload(exp))}`,
          'user-agent': UA,
        },
      });
    };

    const accepted = await callback(Math.floor(Date.now() / 1000) + 300);
    expect(accepted.statusCode).toBe(302);
    await dbHandle.pool.query(
      `delete from core.sessions where actor_id in (select id from core.actors where external_id like 'oidc-it-%')`,
    );
    await dbHandle.pool.query(`delete from core.actors where external_id like 'oidc-it-%'`);

    expectRejected(await callback(Math.floor(Date.now() / 1000) - 1));
    expect(await actorRow(IT_SUB)).toBeUndefined();
  });

  it('state mismatch between callback query and transaction cookie → 401', async () => {
    const result = await drive(app, idp, {
      transform: (params) => params.set('state', 'attacker-chosen-state'),
    });
    expectRejected(result.callbackRes);
    expect(await actorRow(IT_SUB)).toBeUndefined();
  });

  it.each([
    ['wrong nonce', { nonce: 'attacker-nonce' }],
    ['wrong audience', { aud: 'another-client' }],
    ['wrong issuer', { iss: 'https://evil.example' }],
    ['expired token', { expired: true }],
    ['bad signature', { badSignature: true }],
    ['missing email', { omitEmail: true }],
  ])('ID token tampering (%s) → 401, no session, no actor', async (_label, override) => {
    idp.nextIdToken(override);
    const result = await drive(app, idp);
    expectRejected(result.callbackRes);
    expect(await actorRow(IT_SUB)).toBeUndefined();
  });

  it('IdP token endpoint failure → generic 401 that leaks no code, secret, or IdP error text', async () => {
    idp.failToken();
    const result = await drive(app, idp);
    expectRejected(result.callbackRes);
    const body = JSON.stringify(result.callbackRes.json());
    expect(body).not.toContain(result.code);
    expect(body).not.toContain(CLIENT_SECRET);
    expect(body).not.toContain('IDP-TOKEN-ENDPOINT-FAILURE-DETAIL');
  });

  it('IdP error=access_denied callback → generic 401 that never echoes error_description', async () => {
    const result = await drive(app, idp, {
      transform: (params) => {
        params.delete('code');
        params.set('error', 'access_denied');
        params.set('error_description', 'SECRET-IDP-DESCRIPTION-TEXT');
      },
    });
    expectRejected(result.callbackRes);
    expect(JSON.stringify(result.callbackRes.json())).not.toContain('SECRET-IDP-DESCRIPTION-TEXT');
    expect(await actorRow(IT_SUB)).toBeUndefined();
  });

  it.each([
    ['//evil.example', '/'],
    ['https://evil.example', '/'],
    ['\\evil.example', '/'],
    ['/\t/evil.example', '/'],
    ['/ /evil.example', '/'],
    ['/\u0000evil', '/'],
    ['/vocs', '/vocs'],
    ['/vocs?tab=high', '/vocs?tab=high'],
  ])('return_to %s redirects to %s', async (returnTo, expectedLocation) => {
    const result = await drive(app, idp, { returnTo });
    expect(result.callbackRes.statusCode).toBe(302);
    expect(result.callbackRes.headers.location).toBe(expectedLocation);
  });

  it('replaying the same code + transaction cookie fails', async () => {
    const first = await drive(app, idp);
    expect(first.callbackRes.statusCode).toBe(302);
    const replay = await app.inject({
      method: 'GET',
      url: `/auth/callback${new URL(first.authorizeUrl).search}`,
      headers: { cookie: `${OIDC_TX_COOKIE_NAME}=${first.txCookie}`, 'user-agent': UA },
    });
    expectRejected(replay);
  });
});

describe.skipIf(!runIntegration)('OIDC boot contract (#390)', () => {
  it('discovery failure rejects buildServer without leaking the secret or credentials', async () => {
    process.env.NODE_ENV = 'test';
    const deadIdp = await FakeOidcIdp.start({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      redirectUri: REDIRECT_URI,
    });
    const deadIssuer = deadIdp.issuer;
    await deadIdp.close(); // port now refuses connections

    const dbHandle = createDb(APP_URL);
    try {
      const savedProvider = process.env.AUTH_PROVIDER;
      delete process.env.AUTH_PROVIDER;
      const base = loadConfig();
      if (savedProvider !== undefined) process.env.AUTH_PROVIDER = savedProvider;
      const config = {
        ...base,
        AUTH_PROVIDER: 'oidc' as const,
        NODE_ENV: 'test' as const,
        OIDC_ISSUER_URL: deadIssuer,
        OIDC_CLIENT_ID: CLIENT_ID,
        OIDC_CLIENT_SECRET: CLIENT_SECRET,
        OIDC_REDIRECT_URI: REDIRECT_URI,
        OIDC_SCOPES: 'openid email profile',
      };
      const err = await buildServer({ config, dbHandle }).then(
        () => null,
        (e: unknown) => e,
      );
      if (!(err instanceof Error)) throw new Error('expected buildServer to reject');
      const message = err.message;
      expect(message).not.toContain(CLIENT_SECRET);
      expect(message).not.toContain('s3cr3t');
      expect(message).not.toContain(`${deadIssuer}/token`);
      // The curated message names the issuer HOST (no path/credentials).
      expect(message).toContain('127.0.0.1');
    } finally {
      await dbHandle.close();
    }
  });

  it('production + AUTH_PROVIDER=mock still refuses to boot (unchanged guard)', async () => {
    const dbHandle = createDb(APP_URL);
    try {
      const savedProvider = process.env.AUTH_PROVIDER;
      delete process.env.AUTH_PROVIDER;
      const base = loadConfig();
      if (savedProvider !== undefined) process.env.AUTH_PROVIDER = savedProvider;
      const config = {
        ...base,
        NODE_ENV: 'production' as const,
        AUTH_PROVIDER: 'mock' as const,
      };
      await expect(buildServer({ config, dbHandle })).rejects.toThrow(
        /AUTH_PROVIDER=mock is not permitted in production/,
      );
    } finally {
      process.env.NODE_ENV = 'test';
      await dbHandle.close();
    }
  });
  it.each([
    ['token_endpoint is missing', { omit: ['token_endpoint'] }],
    ['jwks_uri is missing', { omit: ['jwks_uri'] }],
    [
      'the token endpoint only supports client_secret_post',
      { tokenEndpointAuthMethods: ['client_secret_post'] },
    ],
  ])(
    'discovery metadata where %s rejects buildServer before listening',
    async (_label, discovery) => {
      process.env.NODE_ENV = 'test';
      const brokenIdp = await FakeOidcIdp.start({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        redirectUri: REDIRECT_URI,
        discovery,
      });
      const okIdp = await FakeOidcIdp.start({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        redirectUri: REDIRECT_URI,
      });
      const dbHandle = createDb(APP_URL);
      const boot = async (issuer: string) => {
        const savedProvider = process.env.AUTH_PROVIDER;
        delete process.env.AUTH_PROVIDER;
        const base = loadConfig();
        if (savedProvider !== undefined) process.env.AUTH_PROVIDER = savedProvider;
        return buildServer({
          config: {
            ...base,
            AUTH_PROVIDER: 'oidc' as const,
            NODE_ENV: 'test' as const,
            OIDC_ISSUER_URL: issuer,
            OIDC_CLIENT_ID: CLIENT_ID,
            OIDC_CLIENT_SECRET: CLIENT_SECRET,
            OIDC_REDIRECT_URI: REDIRECT_URI,
            OIDC_SCOPES: 'openid email profile',
          },
          dbHandle,
        });
      };
      try {
        // Positive twin: a well-formed IdP boots on the same code path.
        const app = await boot(okIdp.issuer);
        await app.close();

        const err = await boot(brokenIdp.issuer).then(
          () => null,
          (e: unknown) => e,
        );
        if (!(err instanceof Error)) throw new Error('expected buildServer to reject');
        expect(err.message).toContain('is unusable');
        expect(err.message).not.toContain(CLIENT_SECRET);
      } finally {
        await dbHandle.close();
        await brokenIdp.close();
        await okIdp.close();
      }
    },
  );
});
