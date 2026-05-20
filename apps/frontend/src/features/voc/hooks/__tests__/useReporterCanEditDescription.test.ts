// useReporterCanEditDescription.test.ts — TDD RED
// Gate hook: returns true only when actor.id === voc.reporter_id AND
// voc.triage_state === 'untriaged'. Three cases: positive, wrong actor, triaged.
//
// C6.1 of slice3 #21.

import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useReporterCanEditDescription } from '../useReporterCanEditDescription';
import type { VocListItem } from '@fops/shared';

// Minimal VOC shape needed by the gate hook (subset of VocListItem)
const BASE_VOC: Pick<VocListItem, 'reporter_id' | 'triage_state'> = {
  reporter_id: '00000000-0000-0000-0000-000000000099',
  triage_state: 'untriaged',
};

const ACTOR_ID = '00000000-0000-0000-0000-000000000099';

describe('useReporterCanEditDescription', () => {
  // ── 1. Positive case: actor is reporter AND voc is untriaged ──────────────
  it('returns true when actor is the reporter and triage_state is untriaged', () => {
    const { result } = renderHook(() =>
      useReporterCanEditDescription({ actorId: ACTOR_ID, voc: BASE_VOC }),
    );
    expect(result.current).toBe(true);
  });

  // ── 2. Wrong actor: different id → false ──────────────────────────────────
  it('returns false when actor is not the reporter', () => {
    const { result } = renderHook(() =>
      useReporterCanEditDescription({
        actorId: '00000000-0000-0000-0000-000000000001',
        voc: BASE_VOC,
      }),
    );
    expect(result.current).toBe(false);
  });

  // ── 3. Triaged: reporter on own VOC but triage_state !== 'untriaged' ──────
  it('returns false when triage_state is not untriaged (even for the reporter)', () => {
    const triaged: typeof BASE_VOC = {
      reporter_id: ACTOR_ID,
      triage_state: 'triaged',
    };
    const { result } = renderHook(() =>
      useReporterCanEditDescription({ actorId: ACTOR_ID, voc: triaged }),
    );
    expect(result.current).toBe(false);
  });
});
