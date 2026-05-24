import { createHash } from 'node:crypto';

import type { RateLimitActorIdentity } from '../modules/auth/session-service.js';

const DEFAULT_TTL_MS = 30_000;
const DEFAULT_MAX_ENTRIES = 1_000;

type CacheEntry = {
  identity: RateLimitActorIdentity;
  expiresAt: number;
};

type RateLimitActorCacheOptions = {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
};

export function hashSessionTokenForRateLimit(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createRateLimitActorCache(opts: RateLimitActorCacheOptions = {}) {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const now = opts.now ?? Date.now;
  const entries = new Map<string, CacheEntry>();

  return {
    get(token: string): RateLimitActorIdentity | undefined {
      const key = hashSessionTokenForRateLimit(token);
      const entry = entries.get(key);
      if (!entry) return undefined;

      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }

      entries.delete(key);
      entries.set(key, entry);
      return entry.identity;
    },

    set(token: string, identity: RateLimitActorIdentity): void {
      if (maxEntries <= 0) return;

      const key = hashSessionTokenForRateLimit(token);
      entries.delete(key);
      entries.set(key, { identity, expiresAt: now() + ttlMs });

      while (entries.size > maxEntries) {
        const oldestKey = entries.keys().next().value;
        if (typeof oldestKey !== 'string') return;
        entries.delete(oldestKey);
      }
    },

    keys(): string[] {
      return [...entries.keys()];
    },
  };
}
