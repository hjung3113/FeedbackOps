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
 */
export function useIdempotencyKey(ifMatchEtag?: string) {
  const [key, setKey] = useState<string>(() => mintKey());
  const prevEtagRef = useRef<string | undefined>(ifMatchEtag);

  if (prevEtagRef.current !== ifMatchEtag) {
    // Etag changed → mint fresh on this render. Safe: state setter inside render guarded by ref check.
    prevEtagRef.current = ifMatchEtag;
    const next = mintKey();
    queueMicrotask(() => setKey(next));
  }

  const markConsumed = useCallback(() => {
    setKey(mintKey());
  }, []);

  return { key, markConsumed };
}
