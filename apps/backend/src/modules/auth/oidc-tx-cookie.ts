// Signed short-lived transaction cookie for the OIDC login flow (issue
// #390). `startLogin` stores state/nonce/PKCE verifier/returnTo in a cookie
// the IdP callback sends back — OAuth "transaction data in a cookie" so no
// server-side pre-login storage is needed.
//
// Value format:
//   base64url(JSON payload) + '.' + base64url(HMAC-SHA256(key, label.payloadB64))
// with the key derived from the client secret
// (`createHmac('sha256', clientSecret)` over the `fops-oidc-tx-v1` domain
// separation label) — the browser cannot mint or modify a payload without
// the secret. Signature comparison is timing-safe (verifyOidcTx).

import { createHmac, timingSafeEqual } from 'node:crypto';

export const OIDC_TX_COOKIE_NAME = 'fops_oidc_tx';
export const OIDC_TX_TTL_SECONDS = 600;

/** Payload carried by the transaction cookie. */
export interface OidcTxPayload {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  /** Epoch seconds after which the transaction is dead. */
  exp: number;
}

const TX_LABEL = 'fops-oidc-tx-v1';

function txSigningKey(clientSecret: string): Buffer {
  return createHmac('sha256', clientSecret).update(TX_LABEL).digest();
}

function txSignature(clientSecret: string, payloadB64: string): string {
  return createHmac('sha256', txSigningKey(clientSecret))
    .update(`oidc-tx-v1.${payloadB64}`)
    .digest('base64url');
}

export function signOidcTx(clientSecret: string, payload: OidcTxPayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${payloadB64}.${txSignature(clientSecret, payloadB64)}`;
}

/** Returns null for missing/malformed/forged cookies. Expiry is checked by
 * the caller against its own clock. */
export function verifyOidcTx(clientSecret: string, value: string | undefined): OidcTxPayload | null {
  if (value === undefined) return null;
  const dot = value.indexOf('.');
  if (dot === -1) return null;
  const payloadB64 = value.slice(0, dot);
  const sigBuf = Buffer.from(value.slice(dot + 1));
  const expectedBuf = Buffer.from(txSignature(clientSecret, payloadB64));
  // timingSafeEqual throws on length mismatch — guard first.
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (
      typeof candidate.state !== 'string' ||
      typeof candidate.nonce !== 'string' ||
      typeof candidate.verifier !== 'string' ||
      typeof candidate.returnTo !== 'string' ||
      typeof candidate.exp !== 'number'
    ) {
      return null;
    }
    return {
      state: candidate.state,
      nonce: candidate.nonce,
      verifier: candidate.verifier,
      returnTo: candidate.returnTo,
      exp: candidate.exp,
    };
  } catch {
    return null;
  }
}
