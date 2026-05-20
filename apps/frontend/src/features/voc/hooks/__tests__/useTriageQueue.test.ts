// useTriageQueue.test.ts — RED tests for the triage queue reducer.
// Covers: reducer transitions, optimistic remove/restore.
// TDD RED: these tests are written before the implementation file exists.

import { describe, expect, it } from 'vitest';
import { triageQueueReducer, initialTriageQueueState } from '../useTriageQueue';
import type { TriageQueueState, TriageQueueAction } from '../useTriageQueue';

const VOC_ID = '00000000-0000-0000-0000-000000000001';
const VOC_ID_2 = '00000000-0000-0000-0000-000000000002';

describe('triageQueueReducer', () => {
  it('starts with empty optimisticallyRemoved set and null lastRemoved', () => {
    expect(initialTriageQueueState.optimisticallyRemoved.size).toBe(0);
    expect(initialTriageQueueState.lastRemoved).toBeNull();
  });

  it('optimistic_remove: adds id to optimisticallyRemoved and sets lastRemoved', () => {
    const action: TriageQueueAction = {
      type: 'optimistic_remove',
      vocId: VOC_ID,
      priorValues: { severity: 'high', ownerUserId: null, ownerTeamId: null, analyticsAreaId: null },
    };
    const next: TriageQueueState = triageQueueReducer(initialTriageQueueState, action);
    expect(next.optimisticallyRemoved.has(VOC_ID)).toBe(true);
    expect(next.lastRemoved?.vocId).toBe(VOC_ID);
    expect(next.lastRemoved?.priorValues.severity).toBe('high');
  });

  it('optimistic_restore: removes id from optimisticallyRemoved and clears lastRemoved', () => {
    const removeAction: TriageQueueAction = {
      type: 'optimistic_remove',
      vocId: VOC_ID,
      priorValues: { severity: 'medium', ownerUserId: null, ownerTeamId: null, analyticsAreaId: null },
    };
    const afterRemove = triageQueueReducer(initialTriageQueueState, removeAction);

    const restoreAction: TriageQueueAction = { type: 'optimistic_restore', vocId: VOC_ID };
    const afterRestore = triageQueueReducer(afterRemove, restoreAction);

    expect(afterRestore.optimisticallyRemoved.has(VOC_ID)).toBe(false);
    expect(afterRestore.lastRemoved).toBeNull();
  });

  it('clear_last_removed: clears lastRemoved but keeps optimisticallyRemoved intact', () => {
    const removeAction: TriageQueueAction = {
      type: 'optimistic_remove',
      vocId: VOC_ID,
      priorValues: { severity: 'low', ownerUserId: null, ownerTeamId: null, analyticsAreaId: null },
    };
    const afterRemove = triageQueueReducer(initialTriageQueueState, removeAction);

    const clearAction: TriageQueueAction = { type: 'clear_last_removed' };
    const afterClear = triageQueueReducer(afterRemove, clearAction);

    // Optimistically removed entry stays
    expect(afterClear.optimisticallyRemoved.has(VOC_ID)).toBe(true);
    // But lastRemoved is cleared
    expect(afterClear.lastRemoved).toBeNull();
  });
});

describe('triageQueueReducer — multi-item scenarios', () => {
  it('removing two items both appear in optimisticallyRemoved; lastRemoved tracks most recent', () => {
    const state1 = triageQueueReducer(initialTriageQueueState, {
      type: 'optimistic_remove',
      vocId: VOC_ID,
      priorValues: { severity: 'critical', ownerUserId: null, ownerTeamId: null, analyticsAreaId: null },
    });
    const state2 = triageQueueReducer(state1, {
      type: 'optimistic_remove',
      vocId: VOC_ID_2,
      priorValues: { severity: 'low', ownerUserId: 'u1', ownerTeamId: null, analyticsAreaId: null },
    });

    expect(state2.optimisticallyRemoved.has(VOC_ID)).toBe(true);
    expect(state2.optimisticallyRemoved.has(VOC_ID_2)).toBe(true);
    // lastRemoved is the most recent one
    expect(state2.lastRemoved?.vocId).toBe(VOC_ID_2);
  });
});
