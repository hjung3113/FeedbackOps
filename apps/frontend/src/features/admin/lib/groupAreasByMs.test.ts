import { describe, expect, it } from 'vitest';
import type { AnalyticsAreaDto } from '../../../lib/api';
import { groupAreasByMs } from './groupAreasByMs';

function area(id: string, managed_system_id: string, archived_at: string | null = null): AnalyticsAreaDto {
  return {
    id,
    workspace_id: 'ws-1',
    managed_system_id,
    slug: `slug-${id}`,
    name: `Area ${id}`,
    owner_team_id: null,
    archived_at,
    archived_by_actor_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('groupAreasByMs', () => {
  it('buckets by managed_system_id in first-seen order, preserving input order', () => {
    const a1 = area('a1', 'ms-1');
    const a2 = area('a2', 'ms-2');
    const a3 = area('a3', 'ms-1');
    const map = groupAreasByMs([a1, a2, a3], true);
    expect([...map.keys()]).toEqual(['ms-1', 'ms-2']);
    expect(map.get('ms-1')).toEqual([a1, a3]);
    expect(map.get('ms-2')).toEqual([a2]);
  });

  it('with includeArchived: false drops archived areas and omits their managed-system key', () => {
    const live = area('a1', 'ms-1');
    const archived = area('a2', 'ms-2', '2026-02-01T00:00:00Z');
    const map = groupAreasByMs([live, archived], false);
    expect(map.has('ms-2')).toBe(false);
    expect(map.get('ms-1')).toEqual([live]);
  });

  it('returns an empty map for empty input', () => {
    expect(groupAreasByMs([], true).size).toBe(0);
  });
});
