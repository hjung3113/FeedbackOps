import { describe, expect, it } from 'vitest';
import { listVocsQuerySchema } from '../list-query.js';

const U = '01919b8c-0000-7000-8000-000000000001';

describe('listVocsQuerySchema — view (required)', () => {
  it('rejects when view is missing', () => {
    expect(() => listVocsQuerySchema.parse({})).toThrow();
  });

  it.each(['inbox', 'my', 'triage'] as const)('accepts view=%s', (view) => {
    expect(listVocsQuerySchema.parse({ view }).view).toBe(view);
  });

  it('rejects unknown view value', () => {
    expect(() => listVocsQuerySchema.parse({ view: 'all' })).toThrow();
  });
});

describe('listVocsQuerySchema — managed_system_id', () => {
  it('accepts managed_system_id as UUID', () => {
    const result = listVocsQuerySchema.parse({ view: 'my', managed_system_id: U });
    expect(result.managed_system_id).toBe(U);
  });

  it("accepts managed_system_id='all'", () => {
    // Service layer enforces 422 for view=my + all; zod schema allows it.
    const result = listVocsQuerySchema.parse({ view: 'inbox', managed_system_id: 'all' });
    expect(result.managed_system_id).toBe('all');
  });

  it('rejects invalid managed_system_id (not uuid, not "all")', () => {
    expect(() =>
      listVocsQuerySchema.parse({ view: 'inbox', managed_system_id: 'bad-id' }),
    ).toThrow();
  });

  it('accepts missing managed_system_id (optional)', () => {
    const result = listVocsQuerySchema.parse({ view: 'triage' });
    expect(result.managed_system_id).toBeUndefined();
  });
});

describe('listVocsQuerySchema — filter.severity', () => {
  it('parses comma-separated severity values', () => {
    const result = listVocsQuerySchema.parse({ view: 'inbox', 'filter.severity': 'high,critical' });
    expect(result['filter.severity']).toEqual(['high', 'critical']);
  });

  it('rejects invalid severity token', () => {
    expect(() =>
      listVocsQuerySchema.parse({ view: 'inbox', 'filter.severity': 'high,extreme' }),
    ).toThrow();
  });

  it('rejects more than 10 severity tokens', () => {
    const tokens = Array.from({ length: 11 }, () => 'low').join(',');
    expect(() =>
      listVocsQuerySchema.parse({ view: 'inbox', 'filter.severity': tokens }),
    ).toThrow();
  });

  it('accepts exactly 10 severity tokens', () => {
    const tokens = Array.from({ length: 10 }, () => 'low').join(',');
    const result = listVocsQuerySchema.parse({ view: 'inbox', 'filter.severity': tokens });
    expect(result['filter.severity']).toHaveLength(10);
  });

  it('drops empty tokens from comma list', () => {
    const result = listVocsQuerySchema.parse({ view: 'inbox', 'filter.severity': 'high,,critical' });
    expect(result['filter.severity']).toEqual(['high', 'critical']);
  });
});

describe('listVocsQuerySchema — filter.reporter_facing_status', () => {
  it('parses comma-separated status values', () => {
    const result = listVocsQuerySchema.parse({
      view: 'inbox',
      'filter.reporter_facing_status': 'received,reviewing',
    });
    expect(result['filter.reporter_facing_status']).toEqual(['received', 'reviewing']);
  });

  it('rejects invalid status token', () => {
    expect(() =>
      listVocsQuerySchema.parse({ view: 'inbox', 'filter.reporter_facing_status': 'pending' }),
    ).toThrow();
  });

  it('rejects more than 10 status tokens', () => {
    const tokens = Array.from({ length: 11 }, () => 'received').join(',');
    expect(() =>
      listVocsQuerySchema.parse({ view: 'inbox', 'filter.reporter_facing_status': tokens }),
    ).toThrow();
  });
});

describe('listVocsQuerySchema — sort', () => {
  it.each([
    'created_at:desc',
    'created_at:asc',
    'severity:asc',
    'severity:desc',
    'reporter_facing_status:asc',
  ] as const)('accepts sort=%s', (sort) => {
    expect(listVocsQuerySchema.parse({ view: 'inbox', sort }).sort).toBe(sort);
  });

  it('rejects unknown sort value', () => {
    expect(() =>
      listVocsQuerySchema.parse({ view: 'inbox', sort: 'created_at:random' }),
    ).toThrow();
  });
});

describe('listVocsQuerySchema — cursor', () => {
  it('accepts cursor (optional)', () => {
    const result = listVocsQuerySchema.parse({ view: 'inbox', cursor: 'eyJzIjoiY3JlYXRlZF9hdCJ9' });
    expect(result.cursor).toBe('eyJzIjoiY3JlYXRlZF9hdCJ9');
  });

  it('accepts missing cursor', () => {
    const result = listVocsQuerySchema.parse({ view: 'inbox' });
    expect(result.cursor).toBeUndefined();
  });
});

describe('listVocsQuerySchema — limit', () => {
  it('defaults limit to 50', () => {
    const result = listVocsQuerySchema.parse({ view: 'inbox' });
    expect(result.limit).toBe(50);
  });

  it('coerces string limit to number', () => {
    const result = listVocsQuerySchema.parse({ view: 'inbox', limit: '25' });
    expect(result.limit).toBe(25);
  });

  it('rejects limit > 100', () => {
    expect(() => listVocsQuerySchema.parse({ view: 'inbox', limit: 101 })).toThrow();
  });

  it('rejects limit < 1', () => {
    expect(() => listVocsQuerySchema.parse({ view: 'inbox', limit: 0 })).toThrow();
  });
});

describe('listVocsQuerySchema — tab', () => {
  it.each(['untriaged', 'high', 'unassigned', 'similar', 'no-link', 'waiting'] as const)(
    'accepts tab=%s',
    (tab) => {
      expect(listVocsQuerySchema.parse({ view: 'inbox', tab }).tab).toBe(tab);
    },
  );

  it('rejects unknown tab', () => {
    expect(() => listVocsQuerySchema.parse({ view: 'inbox', tab: 'new' })).toThrow();
  });
});

describe('listVocsQuerySchema — filter.owner', () => {
  it.each(['assigned', 'unassigned'] as const)('accepts filter.owner=%s', (owner) => {
    expect(listVocsQuerySchema.parse({ view: 'inbox', 'filter.owner': owner })['filter.owner']).toBe(owner);
  });

  it('rejects unknown filter.owner value', () => {
    expect(() =>
      listVocsQuerySchema.parse({ view: 'inbox', 'filter.owner': 'all' }),
    ).toThrow();
  });
});
