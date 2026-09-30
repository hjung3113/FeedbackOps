import { useCallback, useRef, useState } from 'react';
import { mintIdempotencyKey as mintKey } from './idempotency';

/**
 * Stable Idempotency-Key per call site. Re-mints when `ifMatchEtag` or the optional
 * `payloadFingerprint` changes (BE rule: the request hash includes If-Match and the body).
 * Existing callers can omit the fingerprint. Call `markConsumed()` after a successful
 * mutation to force a fresh key for the next call.
 *
 * Key is derived SYNCHRONOUSLY in the same render where either input changes, so callers
 * that immediately trigger a mutation see the fresh key (not the stale one).
 */
export function useIdempotencyKey(ifMatchEtag?: string, payloadFingerprint?: string) {
  // A single ref allows synchronous derivation during render when either key input changes.
  const ref = useRef<{
    etag: string | undefined;
    payloadFingerprint: string | undefined;
    key: string;
  }>({
    etag: ifMatchEtag,
    payloadFingerprint,
    key: mintKey(),
  });

  // Synchronous derivation: if either input changed, mint a new key before returning.
  if (ref.current.etag !== ifMatchEtag || ref.current.payloadFingerprint !== payloadFingerprint) {
    ref.current = { etag: ifMatchEtag, payloadFingerprint, key: mintKey() };
  }

  // forceTick is only used by markConsumed to trigger a re-render so callers
  // whose effects depend on `key` will see the new value.
  const [, setForceTick] = useState(0);

  const markConsumed = useCallback(() => {
    ref.current = {
      etag: ref.current.etag,
      payloadFingerprint: ref.current.payloadFingerprint,
      key: mintKey(),
    };
    setForceTick((t) => t + 1);
  }, []);

  return { key: ref.current.key, markConsumed };
}
