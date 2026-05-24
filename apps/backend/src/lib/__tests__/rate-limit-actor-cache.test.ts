import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createRateLimitActorCache,
  hashSessionTokenForRateLimit,
} from '../rate-limit-actor-cache.js';

const actorOne = {
  workspace_id: '00000000-0000-4000-8000-000000000025',
  actor_id: '10000000-0000-4000-8000-000000000001',
};

const actorTwo = {
  workspace_id: '00000000-0000-4000-8000-000000000025',
  actor_id: '10000000-0000-4000-8000-000000000002',
};

const actorThree = {
  workspace_id: '00000000-0000-4000-8000-000000000025',
  actor_id: '10000000-0000-4000-8000-000000000003',
};

describe('rate-limit actor cache', () => {
  it('uses sha256 token hashes as cache keys', () => {
    const token = 'session-token-that-must-not-be-a-key';
    const expectedHash = createHash('sha256').update(token).digest('hex');
    const cache = createRateLimitActorCache({ maxEntries: 2, ttlMs: 30_000 });

    cache.set(token, actorOne);

    expect(hashSessionTokenForRateLimit(token)).toBe(expectedHash);
    expect(cache.keys()).toEqual([expectedHash]);
    expect(cache.keys()).not.toContain(token);
  });

  it('expires entries after the configured ttl', () => {
    let now = 1_000;
    const cache = createRateLimitActorCache({
      maxEntries: 2,
      ttlMs: 30_000,
      now: () => now,
    });

    cache.set('session-a', actorOne);

    now += 29_999;
    expect(cache.get('session-a')).toEqual(actorOne);

    now += 2;
    expect(cache.get('session-a')).toBeUndefined();
  });

  it('evicts the oldest entry when the cache exceeds the size cap', () => {
    const cache = createRateLimitActorCache({ maxEntries: 2, ttlMs: 30_000 });

    cache.set('session-a', actorOne);
    cache.set('session-b', actorTwo);
    cache.set('session-c', actorThree);

    expect(cache.get('session-a')).toBeUndefined();
    expect(cache.get('session-b')).toEqual(actorTwo);
    expect(cache.get('session-c')).toEqual(actorThree);
    expect(cache.keys()).toHaveLength(2);
  });
});
