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
  attachment_count: 0,
};
const priorValues = {
  severity: null,
  ownerUserId: null,
  ownerTeamId: null,
  analyticsAreaId: null,
};

describe('useTriageQueue — exclusion lifetime', () => {
  it.each(['waiting:ms-1', 'untriaged:ms-2', 'untriaged:ms-1:pin-voc-b'])(
    'expires exclusions in %s while preserving original-id undo information',
    (context) => {
      const { result, rerender } = renderHook(
        ({ context }) => useTriageQueue([voc], context, true),
        { initialProps: { context: 'untriaged:ms-1' } },
      );
      act(() => result.current.optimisticRemove(voc.id, priorValues));
      expect(result.current.liveQueue).toEqual([]);

      rerender({ context });
      expect(result.current.liveQueue).toEqual([voc]);
      expect(result.current.state.lastRemoved?.vocId).toBe(voc.id);
      act(() => result.current.optimisticRestore(voc.id));
      expect(result.current.state.lastRemoved).toBeNull();
      expect(result.current.liveQueue).toEqual([voc]);
    },
  );

  it('expires an absent VOC only on a successful settled read, allowing later server returns', () => {
    const { result, rerender } = renderHook(
      ({ items, settled }) => useTriageQueue(items, 'untriaged:ms-1', settled),
      { initialProps: { items: [voc], settled: true } },
    );
    act(() => result.current.optimisticRemove(voc.id, priorValues));
    // Pending/error reads can temporarily supply no rows; they are not settlement.
    rerender({ items: [], settled: false });
    rerender({ items: [voc], settled: false });
    expect(result.current.liveQueue).toEqual([]);

    rerender({ items: [], settled: true });
    rerender({ items: [voc], settled: true });
    expect(result.current.liveQueue).toEqual([voc]);
    expect(result.current.state.lastRemoved?.vocId).toBe(voc.id);
  });
});
