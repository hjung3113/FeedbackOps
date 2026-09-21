// OidcAuthProvider — selected by AUTH_PROVIDER=oidc (ADR-0006, amended
// 2026-09-22, issue #390). Built on openid-client v6's functional API.
//
// Boot contract: discovery runs inside createOidcAuthProvider, which
// buildServer awaits, so an unreachable/misconfigured issuer fails the boot
// BEFORE the HTTP listener starts. The discovery error is curated: issuer
// HOST only — never the full URL (misconfigured deployments may embed
// credentials), never the secret, never the IdP response body.
//
// Login flow (authorization code + PKCE S256 + state + nonce):
//   startLogin  → state/nonce/verifier generated; a signed short-lived
//                 transaction cookie `fops_oidc_tx` (Path=/auth, HttpOnly,
//                 SameSite=Lax, Secure in production, Max-Age 600) carries
//                 them back on the callback; the route 302s to the IdP.
//   completeLogin → verify tx signature (timingSafeEqual) + expiry + state,
//                 reject IdP `error` responses generically, then run
//                 authorizationCodeGrant (which checks PKCE, state, nonce
//                 and the RS256 ID Token against the discovered JWKS).
// Every failure throws HttpError('auth.session_invalid', 401) with the
// generic message below — tokens, codes, states, secrets, and IdP error
// text must never reach the response or the logs.
//
// raw_claims are bounded to an allowlist (see RAW_CLAIM_ALLOWLIST); access
// tokens, refresh tokens, and the full ID Token payload never leave this
// module.

import {
  ClientSecretBasic,
  allowInsecureRequests,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  customFetch,
  discovery,
  enableNonRepudiationChecks,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
  type Configuration,
  type DiscoveryRequestOptions,
} from 'openid-client';

import { HttpError } from '../../lib/errors.js';
import type {
  CompleteLoginInput,
  CompleteLoginResult,
  ProviderCookie,
  StartLoginContext,
  AuthProvider,
} from './auth-provider.js';
import {
  OIDC_TX_COOKIE_NAME,
  OIDC_TX_TTL_SECONDS,
  signOidcTx,
  verifyOidcTx,
  type OidcTxPayload,
} from './oidc-tx-cookie.js';

/** Same-origin-only sanitizer for post-login redirect targets: must start
 * with '/', must not be protocol-relative ('//'), and must not carry a
 * backslash or CR/LF (browser URL parsers treat '\', CR, LF as scheme or
 * authority hints → open-redirect vectors). */
function sanitizeReturnTo(raw: string | undefined): string {
  if (raw === undefined) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  if (raw.includes('\\') || raw.includes('\r') || raw.includes('\n')) return '/';
  return raw;
}

function querySingle(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function loginFailed(): never {
  throw new HttpError('auth.session_invalid', 'login could not be completed');
}

/** Only these ID Token claims are persisted for audit — never tokens and
 * never the whole JWT payload. */
const RAW_CLAIM_ALLOWLIST = [
  'sub',
  'iss',
  'aud',
  'email',
  'email_verified',
  'name',
  'preferred_username',
] as const;

export interface OidcProviderConfig {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
}

export interface OidcAuthProviderDeps {
  oidc: OidcProviderConfig;
  nodeEnv: 'development' | 'test' | 'production';
  /** Test seam: overrides the global fetch used for discovery/token requests. */
  fetch?: typeof fetch;
}

export async function createOidcAuthProvider(deps: OidcAuthProviderDeps): Promise<AuthProvider> {
  const { issuerUrl, clientId, clientSecret, redirectUri, scopes } = deps.oidc;

  // loadConfig() normally guarantees presence via superRefine; this curated
  // guard also covers config objects assembled programmatically (tests).
  // The message names the missing VARIABLES only — never values.
  const missing = (
    [
      ['OIDC_ISSUER_URL', issuerUrl],
      ['OIDC_CLIENT_ID', clientId],
      ['OIDC_CLIENT_SECRET', clientSecret],
      ['OIDC_REDIRECT_URI', redirectUri],
    ] as const
  )
    .filter(([, value]) => value === undefined || value.trim().length === 0)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`AUTH_PROVIDER=oidc requires ${missing.join(', ')} (ADR-0006)`);
  }

  // Fail closed on a malformed redirect URI at boot rather than on the
  // first callback (config validation enforces the same rule for env).
  try {
    new URL(redirectUri);
  } catch {
    throw new Error('OIDC_REDIRECT_URI must be an absolute URL (ADR-0006)');
  }

  const issuer = new URL(issuerUrl);
  // openid-client refuses plain http unless explicitly enabled. Only ever
  // enable it for localhost/127.0.0.1 OUTSIDE production (config validation
  // enforces the same rule; recomputed here for assembled configs).
  const allowInsecure =
    issuer.protocol === 'http:' &&
    (issuer.hostname === 'localhost' || issuer.hostname === '127.0.0.1') &&
    deps.nodeEnv !== 'production';

  let clientConfig: Configuration;
  try {
    clientConfig = await discovery(
      issuer,
      clientId,
      clientSecret,
      ClientSecretBasic(clientSecret),
      {
        // oauth4webapi's CustomFetch body type (FetchBody | undefined) is
        // nominally narrower than BodyInit, so the plain `typeof fetch`
        // seam needs this one cast; at runtime the signatures match.
        ...(deps.fetch !== undefined
          ? {
              [customFetch]: deps.fetch as NonNullable<
                DiscoveryRequestOptions[typeof customFetch]
              >,
            }
          : {}),
        // Non-repudiation: verify the ID Token signature against the
        // discovered JWKS on every token response. openid-client does NOT
        // verify token-endpoint JWT signatures by default (it treats the
        // TLS channel as the trust anchor) — OIDC Core §3.1.3.7 requires
        // the client to check, and a compromised/mis-issued IdP key must
        // fail closed here.
        execute: allowInsecure
          ? [allowInsecureRequests, enableNonRepudiationChecks]
          : [enableNonRepudiationChecks],
      },
    );
  } catch {
    // Curated boot error (see file header): host only, no body, no secret.
    throw new Error(
      `OIDC discovery failed for issuer host '${issuer.host}' — verify OIDC_ISSUER_URL, ` +
        'OIDC_CLIENT_ID/OIDC_CLIENT_SECRET, and that the IdP is reachable (ADR-0006)',
    );
  }

  return {
    name: 'oidc',

    async startLogin(ctx?: StartLoginContext) {
      const state = randomState();
      const nonce = randomNonce();
      const verifier = randomPKCECodeVerifier();
      const codeChallenge = await calculatePKCECodeChallenge(verifier);
      const returnTo = sanitizeReturnTo(ctx?.returnTo);
      const payload: OidcTxPayload = {
        state,
        nonce,
        verifier,
        returnTo,
        exp: Math.floor(Date.now() / 1000) + OIDC_TX_TTL_SECONDS,
      };

      const authUrl = buildAuthorizationUrl(clientConfig, {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scopes,
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      const txCookie: ProviderCookie = {
        name: OIDC_TX_COOKIE_NAME,
        value: signOidcTx(clientSecret, payload),
        maxAgeSeconds: OIDC_TX_TTL_SECONDS,
        path: '/auth',
      };
      return { redirect: authUrl.href, cookies: [txCookie] };
    },

    async completeLogin(input: CompleteLoginInput): Promise<CompleteLoginResult> {
      const query = (input.query ?? {}) as Record<string, string | string[] | undefined>;
      const cookies = (input.cookies ?? {}) as Record<string, string | undefined>;

      // IdP rejected the user up front (error=access_denied, …). The IdP's
      // error_description is attacker/IdP-controlled text — never echoed.
      if (typeof querySingle(query.error) === 'string') return loginFailed();

      const tx = verifyOidcTx(clientSecret, cookies[OIDC_TX_COOKIE_NAME]);
      if (tx === null) return loginFailed();
      if (tx.exp < Math.floor(Date.now() / 1000)) return loginFailed();

      const state = querySingle(query.state);
      if (typeof state !== 'string' || state !== tx.state) return loginFailed();

      // Reconstruct the callback URL against the configured redirect_uri
      // (openid-client extracts code/iss from its query).
      const currentUrl = new URL(redirectUri);
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (Array.isArray(value)) {
          for (const entry of value) search.append(key, entry);
        } else if (typeof value === 'string') {
          search.append(key, value);
        }
      }
      currentUrl.search = search.toString();

      let idClaims: Record<string, unknown>;
      try {
        const tokens = await authorizationCodeGrant(clientConfig, currentUrl, {
          pkceCodeVerifier: tx.verifier,
          expectedState: tx.state,
          expectedNonce: tx.nonce,
          idTokenExpected: true,
        });
        const claims = tokens.claims();
        if (claims === undefined) return loginFailed();
        idClaims = claims as unknown as Record<string, unknown>;
      } catch {
        // The openid-client error chains carry IdP response bodies and token
        // material. Swallow entirely; the generic message below is all a
        // caller ever sees (issue #390 AC: no tokens/credentials in errors).
        return loginFailed();
      }

      const sub = idClaims['sub'];
      const email = idClaims['email'];
      if (typeof sub !== 'string' || sub.length === 0) return loginFailed();
      if (typeof email !== 'string' || email.length === 0) return loginFailed();
      const preferredUsername = idClaims['preferred_username'];
      const displayName =
        typeof idClaims['name'] === 'string'
          ? (idClaims['name'] as string)
          : typeof preferredUsername === 'string'
            ? preferredUsername
            : email.split('@')[0] ?? email;

      const raw_claims: Record<string, unknown> = {};
      for (const key of RAW_CLAIM_ALLOWLIST) {
        const value = idClaims[key];
        if (value !== undefined) raw_claims[key] = value;
      }

      return {
        sub,
        email,
        display_name: displayName,
        raw_claims,
        returnTo: sanitizeReturnTo(tx.returnTo),
        clearCookies: [{ name: OIDC_TX_COOKIE_NAME, path: '/auth' }],
      };
    },
  };
}
