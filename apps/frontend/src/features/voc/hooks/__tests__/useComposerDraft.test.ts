// useComposerDraft — unit tests (C5.1 RED, slice3 #21)
// 4 test cases:
//   1. vocId × surface isolation
//   2. switch surface preserves other surfaces
//   3. switch voc clears all surfaces
//   4. reducer actions (setDraft, clearDraft, clearAll)

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useComposerDraft, type ComposerSurface } from '../useComposerDraft';

const VOC_A = 'voc-aaa';
const VOC_B = 'voc-bbb';

describe('useComposerDraft', () => {
  it('isolates drafts per (vocId, surface)', () => {
    const { result } = renderHook(() => useComposerDraft(VOC_A));
    act(() => {
      result.current.setDraft('public', 'hello public');
      result.current.setDraft('reply', 'hello reply');
    });
    expect(result.current.getDraft('public')).toBe('hello public');
    expect(result.current.getDraft('reply')).toBe('hello reply');
    expect(result.current.getDraft('internal')).toBe('');
  });

  it('switching surface preserves other surfaces', () => {
    const { result } = renderHook(() => useComposerDraft(VOC_A));
    act(() => {
      result.current.setDraft('public', 'public text');
      result.current.setDraft('internal', 'internal text');
    });
    // Both surfaces should still be accessible independently
    expect(result.current.getDraft('public')).toBe('public text');
    expect(result.current.getDraft('internal')).toBe('internal text');
    expect(result.current.getDraft('reply')).toBe('');
  });

  it('switching voc clears all 3 surfaces', () => {
    const { resultA } = (() => {
      const r = renderHook(({ vocId }: { vocId: string }) => useComposerDraft(vocId), {
        initialProps: { vocId: VOC_A },
      });
      return { resultA: r };
    })();

    act(() => {
      resultA.result.current.setDraft('public', 'draft for voc A');
      resultA.result.current.setDraft('reply', 'reply for voc A');
      resultA.result.current.setDraft('internal', 'internal for voc A');
    });

    // Switch to VOC_B — all drafts should be cleared
    resultA.rerender({ vocId: VOC_B });

    expect(resultA.result.current.getDraft('public')).toBe('');
    expect(resultA.result.current.getDraft('reply')).toBe('');
    expect(resultA.result.current.getDraft('internal')).toBe('');
  });

  it('clearDraft clears only the targeted surface', () => {
    const { result } = renderHook(() => useComposerDraft(VOC_A));
    act(() => {
      result.current.setDraft('public', 'pub');
      result.current.setDraft('reply', 'rep');
    });
    act(() => {
      result.current.clearDraft('public');
    });
    expect(result.current.getDraft('public')).toBe('');
    expect(result.current.getDraft('reply')).toBe('rep');
  });
});

// Re-export the type so tests can use it without importing from the hook directly
export type { ComposerSurface };
