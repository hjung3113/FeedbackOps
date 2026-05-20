// useTriagePanelState.test.ts — RED tests for the triage panel dirty-state hook.
// Covers: dirty derivation on field change, reset on voc.id change.
// TDD RED: these tests are written before the implementation file exists.

import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTriagePanelState } from '../useTriagePanelState';
import type { VocListItem } from '@fops/shared';

const BASE_VOC: VocListItem = {
  id: '00000000-0000-0000-0000-000000000001',
  display_id: 'VOC-001',
  title: 'Test VOC',
  primary_managed_system_id: 'ms-1',
  analytics_area_id: null,
  reporter_id: 'u1',
  owner_user_id: null,
  owner_team_id: null,
  severity: 'medium',
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  similar_count: 0,
};

describe('useTriagePanelState', () => {
  it('initialises panel state from voc baseline and dirty=false', () => {
    const { result } = renderHook(() => useTriagePanelState(BASE_VOC));
    expect(result.current.panelState.severity).toBe('medium');
    expect(result.current.panelState.ownerUserId).toBeNull();
    expect(result.current.panelState.ownerTeamId).toBeNull();
    expect(result.current.panelState.analyticsAreaId).toBeNull();
    expect(result.current.dirty).toBe(false);
  });

  it('dirty=true when severity changed', () => {
    const { result } = renderHook(() => useTriagePanelState(BASE_VOC));
    act(() => {
      result.current.dispatch({ type: 'set_severity', severity: 'critical' });
    });
    expect(result.current.dirty).toBe(true);
    expect(result.current.panelState.severity).toBe('critical');
  });

  it('dirty=false when value returned to baseline', () => {
    const { result } = renderHook(() => useTriagePanelState(BASE_VOC));
    act(() => {
      result.current.dispatch({ type: 'set_severity', severity: 'critical' });
    });
    act(() => {
      result.current.dispatch({ type: 'set_severity', severity: 'medium' });
    });
    expect(result.current.dirty).toBe(false);
  });

  it('re-initialises and clears dirty when voc.id changes', () => {
    const VOC_2: VocListItem = {
      ...BASE_VOC,
      id: '00000000-0000-0000-0000-000000000002',
      severity: 'high',
    };

    const { result, rerender } = renderHook(
      ({ voc }) => useTriagePanelState(voc),
      { initialProps: { voc: BASE_VOC } },
    );

    // Mutate state on first voc
    act(() => {
      result.current.dispatch({ type: 'set_severity', severity: 'critical' });
    });
    expect(result.current.dirty).toBe(true);

    // Switch to a different voc
    rerender({ voc: VOC_2 });
    expect(result.current.panelState.severity).toBe('high');
    expect(result.current.dirty).toBe(false);
  });
});
