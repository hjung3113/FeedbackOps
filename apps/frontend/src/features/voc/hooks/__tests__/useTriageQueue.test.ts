// useTriageQueue.test.ts — RED tests for the triage queue reducer.
// Covers: reducer transitions, optimistic remove/restore.
// TDD RED: these tests are written before the implementation file exists.

import { describe, expect, it } from 'vitest';
import { initialTriageQueueState, triageQueueReducer } from '../useTriageQueue';
import type { TriageQueueAction, TriageQueueState } from '../useTriageQueue';

const VOC_ID = '00000000-0000-0000-0000-000000000001';
const VOC_ID_2 = '00000000-0000-0000-0000-000000000002';

describe('triageQueueReducer', () => {
  it('starts with empty optimisticallyRemoved set', () => {
    expect(initialTriageQueueState.optimisticallyRemoved.size).toBe(0);
  });

  it('optimistic_remove: adds id to optimisticallyRemoved', () => {
    const action: TriageQueueAction = {
      type: 'optimistic_remove',
      vocId: VOC_ID,
    };
    const next: TriageQueueState = triageQueueReducer(initialTriageQueueState, action);
    expect(next.optimisticallyRemoved.has(VOC_ID)).toBe(true);
  });

  it('optimistic_restore: removes id from optimisticallyRemoved', () => {
    const removeAction: TriageQueueAction = {
      type: 'optimistic_remove',
      vocId: VOC_ID,
    };
    const afterRemove = triageQueueReducer(initialTriageQueueState, removeAction);

    const restoreAction: TriageQueueAction = { type: 'optimistic_restore', vocId: VOC_ID };
    const afterRestore = triageQueueReducer(afterRemove, restoreAction);

    expect(afterRestore.optimisticallyRemoved.has(VOC_ID)).toBe(false);
  });
});

describe('triageQueueReducer — multi-item scenarios', () => {
  it('removing two items both appear in optimisticallyRemoved', () => {
    const state1 = triageQueueReducer(initialTriageQueueState, {
      type: 'optimistic_remove',
      vocId: VOC_ID,
    });
    const state2 = triageQueueReducer(state1, {
      type: 'optimistic_remove',
      vocId: VOC_ID_2,
    });

    expect(state2.optimisticallyRemoved.has(VOC_ID)).toBe(true);
    expect(state2.optimisticallyRemoved.has(VOC_ID_2)).toBe(true);
  });
});
