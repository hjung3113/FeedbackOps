import type { VocListItem } from '@fops/shared';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTriageQueue } from '../useTriageQueue';

const voc: VocListItem = {
  id: 'voc-a',
  display_id: 'VOC-A',
  title: 'VOC A',
  primary_managed_system_id: 'ms-1',
  analytics_area_id: null,
  reporter_id: 'reporter-1',
  owner_user_id: null,
  owner_team_id: null,
  severity: null,
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  similar_count: 0,
  review_postponed_at: null,
  attachment_count: 0,
};
describe('useTriageQueue — exclusion lifetime', () => {
  it.each(['waiting:ms-1', 'untriaged:ms-2', 'other-context'])(
    'expires exclusions on context change to %s and keeps the restored VOC visible',
    (context) => {
      const { result, rerender } = renderHook(
        ({ context }) => useTriageQueue([voc], context, true),
        { initialProps: { context: 'untriaged:ms-1' } },
      );
      act(() => result.current.optimisticRemove(voc.id));
      expect(result.current.liveQueue).toEqual([]);

      rerender({ context });
      expect(result.current.liveQueue).toEqual([voc]);
      act(() => result.current.optimisticRestore(voc.id));
      expect(result.current.liveQueue).toEqual([voc]);
    },
  );

  it('rollback of repeat-postpone restores the original marker across a settled refetch', () => {
    const original: VocListItem = { ...voc, review_postponed_at: '2026-10-09T00:00:00.000Z' };
    const { result, rerender } = renderHook(
      ({ items }) => useTriageQueue(items, 'unassigned:ms-1', true),
      { initialProps: { items: [original] } },
    );
    act(() => result.current.optimisticPostpone(voc.id));
    act(() => result.current.optimisticRestore(voc.id, 'rollback'));
    expect(result.current.liveQueue[0]?.review_postponed_at).toBe(original.review_postponed_at);
    rerender({ items: [{ ...original }] });
    expect(result.current.liveQueue[0]?.review_postponed_at).toBe(original.review_postponed_at);
    rerender({ items: [voc] });
    expect(result.current.liveQueue[0]?.review_postponed_at).toBeNull();
  });

  it('undo clears a postponed marker after a settled server read acknowledged it', () => {
    const { result, rerender } = renderHook(
      ({ items }) => useTriageQueue(items, 'unassigned:ms-1', true),
      { initialProps: { items: [voc] } },
    );
    act(() => result.current.optimisticPostpone(voc.id));
    rerender({ items: [{ ...voc, review_postponed_at: '2026-10-09T00:00:00.000Z' }] });
    expect(result.current.liveQueue[0]?.review_postponed_at).toBe('2026-10-09T00:00:00.000Z');
    act(() => result.current.optimisticRestore(voc.id));
    expect(result.current.liveQueue[0]?.review_postponed_at).toBeNull();
    rerender({ items: [voc] });
    // Once undo is acknowledged, later server postponements must remain visible.
    rerender({ items: [{ ...voc, review_postponed_at: '2026-10-10T00:00:00.000Z' }] });
    expect(result.current.liveQueue[0]?.review_postponed_at).toBe('2026-10-10T00:00:00.000Z');
  });

  it('expires an absent VOC only on a successful settled read, allowing later server returns', () => {
    const { result, rerender } = renderHook(
      ({ items, settled }) => useTriageQueue(items, 'untriaged:ms-1', settled),
      { initialProps: { items: [voc], settled: true } },
    );
    act(() => result.current.optimisticRemove(voc.id));
    // Pending/error reads can temporarily supply no rows; they are not settlement.
    rerender({ items: [], settled: false });
    rerender({ items: [voc], settled: false });
    expect(result.current.liveQueue).toEqual([]);

    rerender({ items: [], settled: true });
    rerender({ items: [voc], settled: true });
    expect(result.current.liveQueue).toEqual([voc]);
  });
});
