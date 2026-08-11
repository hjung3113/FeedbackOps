// Single source of Idempotency-Key minting.
//
// ADR-0015:72 locks the header to a client-generated UUIDv4, and every mutation
// route rejects anything else with `validation.malformed_idempotency_key`. That
// makes the *fallback* path load-bearing rather than cosmetic: `crypto.randomUUID`
// exists only in a secure context, so any origin that is not https and not
// localhost — a LAN IP during device testing, for instance — falls through to it
// on every POST/PATCH/DELETE.
//
// This module exists because there used to be two fallbacks. `client.ts` minted
// `Math.random().toString(36) + Date.now().toString(36)`, which is not a UUID at
// all, so every mutation that let the client auto-mint failed outright in exactly
// those environments while the ones passing a key from `useIdempotencyKey` (which
// had a correct fallback) kept working.

/** A UUIDv4 suitable for the `Idempotency-Key` header, in any browser context. */
export function mintIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();

  // RFC4122 §4.4 — random bits with the version and variant nibbles pinned.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => (b ?? 0).toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}
