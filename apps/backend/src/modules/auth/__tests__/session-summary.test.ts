// F-008: ADR-0006:38 `created_ip_summary` / `created_user_agent_summary`
// must be derived summaries, not raw values. These pure-function tests do
// not require Postgres, so they run on every developer machine.

import { describe, expect, test } from 'vitest';

import type { Db } from '../../../db/client.js';
import { createSessionService, summarizeIp, summarizeUserAgent } from '../session-service.js';

describe('summarizeIp', () => {
  test('IPv4 → 16-char hash of /24 prefix', () => {
    const a = summarizeIp('192.168.1.42');
    const b = summarizeIp('192.168.1.99');
    const c = summarizeIp('192.168.2.42');
    expect(a).not.toBeNull();
    expect(a).toHaveLength(16);
    // Same /24 → same summary.
    expect(a).toBe(b);
    // Different /24 → different summary.
    expect(a).not.toBe(c);
  });

  test('IPv6 → 16-char hash of /48 prefix', () => {
    const a = summarizeIp('2001:db8:1::42');
    const b = summarizeIp('2001:db8:1::99');
    const c = summarizeIp('2001:db8:2::42');
    expect(a).not.toBeNull();
    expect(a).toHaveLength(16);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  test('IPv4-mapped IPv6 collapses to v4 /24', () => {
    expect(summarizeIp('::ffff:192.168.1.1')).toBe(summarizeIp('192.168.1.99'));
  });

  test('empty / undefined → null', () => {
    expect(summarizeIp(undefined)).toBeNull();
    expect(summarizeIp('')).toBeNull();
  });

  test('output never contains the raw last octet', () => {
    const out = summarizeIp('203.0.113.77');
    expect(out).not.toBeNull();
    expect(out).not.toMatch(/77/);
  });
});

describe('summarizeUserAgent', () => {
  test('Mozilla full UA → "Mozilla"', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    expect(summarizeUserAgent(ua)).toBe('Mozilla');
  });

  test('curl → "curl"', () => {
    expect(summarizeUserAgent('curl/8.4.0')).toBe('curl');
  });

  test('integration-test (no separators) → returned as-is', () => {
    expect(summarizeUserAgent('integration-test')).toBe('integration-test');
  });

  test('empty / undefined → null', () => {
    expect(summarizeUserAgent(undefined)).toBeNull();
    expect(summarizeUserAgent('')).toBeNull();
  });

  test('truncates at 64 chars', () => {
    const out = summarizeUserAgent('x'.repeat(200));
    expect(out).not.toBeNull();
    expect((out ?? '').length).toBeLessThanOrEqual(64);
  });
});

describe('lookupActorIdByToken', () => {
  test('returns actor and workspace identifiers for an active session', async () => {
    const service = createSessionService({
      db: {
        execute: async () => ({
          rows: [{ actor_id: 'actor-1', workspace_id: 'workspace-1' }],
        }),
      } as unknown as Db,
      workspaceId: 'workspace-1',
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(service.lookupActorIdByToken('session-1')).resolves.toEqual({
      actor_id: 'actor-1',
      workspace_id: 'workspace-1',
    });
  });
});
