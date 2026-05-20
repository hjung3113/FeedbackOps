import { useCallback, useRef, useState } from 'react';

function mintKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // RFC4122 v4 fallback for older test envs
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => (b ?? 0).toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

/**
 * Stable Idempotency-Key per call site. Re-mints automatically when `ifMatchEtag` changes
 * (BE rule: idempotency hash includes If-Match; same key + new etag → conflict.idempotency_key_reuse).
 * Call `markConsumed()` after a successful mutation to force a fresh key for the next call.
 *
 * Key is derived SYNCHRONOUSLY in the same render where ifMatchEtag changes, so callers
 * that immediately trigger a mutation see the fresh key (not the stale one).
 */
export function useIdempotencyKey(ifMatchEtag?: string) {
  // Single ref holds { etag, key } together to allow synchronous derivation during render.
  const ref = useRef<{ etag: string | undefined; key: string }>({
    etag: ifMatchEtag,
    key: mintKey(),
  });

  // Synchronous derivation: if etag changed, mint a new key before returning.
  if (ref.current.etag !== ifMatchEtag) {
    ref.current = { etag: ifMatchEtag, key: mintKey() };
  }

  // forceTick is only used by markConsumed to trigger a re-render so callers
  // whose effects depend on `key` will see the new value.
  const [, setForceTick] = useState(0);

  const markConsumed = useCallback(() => {
    ref.current = { etag: ref.current.etag, key: mintKey() };
    setForceTick((t) => t + 1);
  }, []);

  return { key: ref.current.key, markConsumed };
}
