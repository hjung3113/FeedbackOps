// Unit tests for cursor.ts — encode/decode round-trips and error cases.

import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { SEVERITY_ORDINAL, SORT_CONFIG, decodeCursor, encodeCursor, severityToOrdinal } from '../cursor.js';

describe('cursor codec', () => {
  it('round-trips a created_at:desc cursor', () => {
    const input = {
      s: 'created_at:desc',
      d: 'desc' as const,
      sv: '2024-01-01T00:00:00.000Z',
      id: randomUUID(),
    };
    const encoded = encodeCursor(input);
    const decoded = decodeCursor(encoded, 'created_at:desc', 'desc');
    expect(decoded).toEqual(input);
  });

  it('round-trips a severity:asc cursor with numeric sv', () => {
    const input = {
      s: 'severity:asc',
      d: 'asc' as const,
      sv: 3,
      id: randomUUID(),
    };
    const encoded = encodeCursor(input);
    const decoded = decodeCursor(encoded, 'severity:asc', 'asc');
    expect(decoded).toEqual(input);
  });

  it('round-trips a reporter_facing_status:asc cursor', () => {
    const input = {
      s: 'reporter_facing_status:asc',
      d: 'asc' as const,
      sv: 'reviewing',
      id: randomUUID(),
    };
    const encoded = encodeCursor(input);
    const decoded = decodeCursor(encoded, 'reporter_facing_status:asc', 'asc');
    expect(decoded).toEqual(input);
  });

  it('throws on non-base64 input', () => {
    expect(() => decodeCursor('!!!not-base64!!!', 'created_at:desc', 'desc')).toThrow();
  });

  it('throws on valid base64 but non-JSON content', () => {
    const notJson = Buffer.from('hello world', 'utf8').toString('base64');
    expect(() => decodeCursor(notJson, 'created_at:desc', 'desc')).toThrow();
  });

  it('throws on valid JSON missing required fields', () => {
    const partial = Buffer.from(JSON.stringify({ s: 'created_at:desc', d: 'desc' }), 'utf8').toString('base64');
    expect(() => decodeCursor(partial, 'created_at:desc', 'desc')).toThrow();
  });

  it('throws when s does not match expectSort', () => {
    const input = encodeCursor({ s: 'severity:asc', d: 'asc', sv: 2, id: randomUUID() });
    expect(() => decodeCursor(input, 'created_at:desc', 'asc')).toThrow();
  });

  it('throws when d does not match expectDir', () => {
    const input = encodeCursor({ s: 'created_at:desc', d: 'desc', sv: '2024-01-01T00:00:00.000Z', id: randomUUID() });
    expect(() => decodeCursor(input, 'created_at:desc', 'asc')).toThrow();
  });

  it('throws when id is not a valid UUID', () => {
    const badId = Buffer.from(JSON.stringify({ s: 'created_at:desc', d: 'desc', sv: 'x', id: 'not-a-uuid' }), 'utf8').toString('base64');
    expect(() => decodeCursor(badId, 'created_at:desc', 'desc')).toThrow();
  });
});

describe('SEVERITY_ORDINAL', () => {
  it('maps low=1 medium=2 high=3 critical=4', () => {
    expect(SEVERITY_ORDINAL.low).toBe(1);
    expect(SEVERITY_ORDINAL.medium).toBe(2);
    expect(SEVERITY_ORDINAL.high).toBe(3);
    expect(SEVERITY_ORDINAL.critical).toBe(4);
  });

  it('severityToOrdinal returns correct values', () => {
    expect(severityToOrdinal('low')).toBe(1);
    expect(severityToOrdinal('medium')).toBe(2);
    expect(severityToOrdinal('high')).toBe(3);
    expect(severityToOrdinal('critical')).toBe(4);
  });

  it('severityToOrdinal throws on unknown severity', () => {
    expect(() => severityToOrdinal('unknown')).toThrow();
  });
});

describe('SORT_CONFIG', () => {
  it('created_at:desc → column=created_at, no severityOrdinal', () => {
    const cfg = SORT_CONFIG['created_at:desc'];
    expect(cfg.column).toBe('created_at');
    expect(cfg.severityOrdinal).toBeUndefined();
  });

  it('severity:asc → column=severity, severityOrdinal=true', () => {
    const cfg = SORT_CONFIG['severity:asc'];
    expect(cfg.column).toBe('severity');
    expect(cfg.severityOrdinal).toBe(true);
  });

  it('reporter_facing_status:asc → column=reporter_facing_status', () => {
    const cfg = SORT_CONFIG['reporter_facing_status:asc'];
    expect(cfg.column).toBe('reporter_facing_status');
  });

  it('triage_pinned → triagePinned=true', () => {
    const cfg = SORT_CONFIG['triage_pinned'];
    expect(cfg.triagePinned).toBe(true);
  });
});
