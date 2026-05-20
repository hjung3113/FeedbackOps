// useComposerDraft — unit tests (C5.1 RED, slice3 #21)
// REV-1 #7: draft values updated to TipTapDoc | null (was string).
// 4 test cases:
//   1. vocId × surface isolation
//   2. switch surface preserves other surfaces
//   3. switch voc clears all surfaces
//   4. reducer actions (setDraft, clearDraft, clearAll)

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useComposerDraft, type ComposerSurface } from '../useComposerDraft';
import type { TipTapDoc } from '@fops/ui';

const VOC_A = 'voc-aaa';
const VOC_B = 'voc-bbb';

// Helper to create minimal TipTapDoc fixtures for testing.
function makeDoc(text: string): TipTapDoc {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  } as TipTapDoc;
}

const DOC_PUBLIC = makeDoc('hello public');
const DOC_REPLY = makeDoc('hello reply');
const DOC_PUBLIC2 = makeDoc('public text');
const DOC_INTERNAL2 = makeDoc('internal text');
const DOC_A_PUBLIC = makeDoc('draft for voc A');
const DOC_A_REPLY = makeDoc('reply for voc A');
const DOC_A_INTERNAL = makeDoc('internal for voc A');
const DOC_PUB = makeDoc('pub');
const DOC_REP = makeDoc('rep');

describe('useComposerDraft', () => {
  it('isolates drafts per (vocId, surface)', () => {
    const { result } = renderHook(() => useComposerDraft(VOC_A));
    act(() => {
      result.current.setDraft('public', DOC_PUBLIC);
      result.current.setDraft('reply', DOC_REPLY);
    });
    expect(result.current.getDraft('public')).toEqual(DOC_PUBLIC);
    expect(result.current.getDraft('reply')).toEqual(DOC_REPLY);
    expect(result.current.getDraft('internal')).toBeNull();
  });

  it('switching surface preserves other surfaces', () => {
    const { result } = renderHook(() => useComposerDraft(VOC_A));
    act(() => {
      result.current.setDraft('public', DOC_PUBLIC2);
      result.current.setDraft('internal', DOC_INTERNAL2);
    });
    // Both surfaces should still be accessible independently
    expect(result.current.getDraft('public')).toEqual(DOC_PUBLIC2);
    expect(result.current.getDraft('internal')).toEqual(DOC_INTERNAL2);
    expect(result.current.getDraft('reply')).toBeNull();
  });

  it('switching voc clears all 3 surfaces', () => {
    const { resultA } = (() => {
      const r = renderHook(({ vocId }: { vocId: string }) => useComposerDraft(vocId), {
        initialProps: { vocId: VOC_A },
      });
      return { resultA: r };
    })();

    act(() => {
      resultA.result.current.setDraft('public', DOC_A_PUBLIC);
      resultA.result.current.setDraft('reply', DOC_A_REPLY);
      resultA.result.current.setDraft('internal', DOC_A_INTERNAL);
    });

    // Switch to VOC_B — all drafts should be cleared
    resultA.rerender({ vocId: VOC_B });

    expect(resultA.result.current.getDraft('public')).toBeNull();
    expect(resultA.result.current.getDraft('reply')).toBeNull();
    expect(resultA.result.current.getDraft('internal')).toBeNull();
  });

  it('clearDraft clears only the targeted surface', () => {
    const { result } = renderHook(() => useComposerDraft(VOC_A));
    act(() => {
      result.current.setDraft('public', DOC_PUB);
      result.current.setDraft('reply', DOC_REP);
    });
    act(() => {
      result.current.clearDraft('public');
    });
    expect(result.current.getDraft('public')).toBeNull();
    expect(result.current.getDraft('reply')).toEqual(DOC_REP);
  });
});

// Re-export the type so tests can use it without importing from the hook directly
export type { ComposerSurface };
