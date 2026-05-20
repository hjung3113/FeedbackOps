// useComposerDraft.vocSwitchRace.test.ts — codex REV-2 P1 #7 (partial)
//
// The old implementation dispatched CLEAR_ALL during render when vocId
// changed, then returned the *current* state (still holding the prior VOC's
// drafts) on that first render. Consumers (the three composer bodies)
// received the stale drafts on the first render for the new VOC; a second
// render landed before the user could observe the bug in normal interaction,
// but the race is real and the test fixture below proves it.
//
// Required behavior: the render that first sees a new vocId must return the
// fresh empty state synchronously. The stored reducer state catches up on
// the same render via a self-dispatched RESET; subsequent renders are stable.

import { describe, it, expect } from 'vitest';
import { renderHook, render, act } from '@testing-library/react';
import * as React from 'react';
import { useComposerDraft } from '../useComposerDraft';
import type { TipTapDoc } from '@fops/ui';

const VOC_A = 'voc-aaa';
const VOC_B = 'voc-bbb';

function makeDoc(text: string): TipTapDoc {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  } as TipTapDoc;
}

describe('useComposerDraft — vocId switch race (REV-2 #7)', () => {
  it('returns fresh empty drafts on the FIRST render with a new vocId', () => {
    const { result, rerender } = renderHook(
      ({ vocId }: { vocId: string }) => useComposerDraft(vocId),
      { initialProps: { vocId: VOC_A } },
    );

    act(() => {
      result.current.setDraft('public', makeDoc('VOC A public'));
      result.current.setDraft('reply', makeDoc('VOC A reply'));
      result.current.setDraft('internal', makeDoc('VOC A internal'));
    });

    // Sanity: VOC A drafts present.
    expect(result.current.getDraft('public')).not.toBeNull();
    expect(result.current.getDraft('reply')).not.toBeNull();
    expect(result.current.getDraft('internal')).not.toBeNull();

    // Switch to VOC B. The FIRST render with VOC_B must already expose empty
    // drafts via getDraft / state — children rendered in the same pass must
    // see fresh state, not the prior VOC's drafts.
    rerender({ vocId: VOC_B });

    expect(result.current.state.public).toBeNull();
    expect(result.current.state.reply).toBeNull();
    expect(result.current.state.internal).toBeNull();
    expect(result.current.getDraft('public')).toBeNull();
    expect(result.current.getDraft('reply')).toBeNull();
    expect(result.current.getDraft('internal')).toBeNull();
  });

  // Children rendered in the same pass as the new vocId must see fresh empty
  // drafts. The previous implementation dispatched CLEAR_ALL during render
  // but returned the old `state` to children before the re-render landed.
  it('child component sees fresh drafts on the first render with a new vocId', () => {
    const renderedDrafts: Array<{ vocId: string; public: TipTapDoc | null }> = [];

    function Child({ vocId }: { vocId: string }) {
      const draft = useComposerDraft(vocId);
      // Record what THIS render sees — no useEffect, captured synchronously.
      renderedDrafts.push({ vocId, public: draft.state.public });
      // Seed VOC_A on the first render only.
      const seededRef = React.useRef<Record<string, boolean>>({});
      if (vocId === VOC_A && !seededRef.current[VOC_A]) {
        seededRef.current[VOC_A] = true;
        // Defer seed to an effect to mimic a real user typing.
      }
      React.useEffect(() => {
        if (vocId === VOC_A && draft.state.public === null) {
          draft.setDraft('public', makeDoc('VOC A public'));
        }
        // biome-ignore lint/correctness/useExhaustiveDependencies: only re-seed when vocId switches
      }, [vocId]);
      return null;
    }

    const { rerender } = render(<Child vocId={VOC_A} />);
    // Allow the effect to run and seed VOC_A.
    act(() => {});

    // Reset our log to focus on the switch.
    renderedDrafts.length = 0;

    // Switch to VOC_B.
    rerender(<Child vocId={VOC_B} />);

    // EVERY render captured with vocId === VOC_B must have a null public draft.
    const switchRenders = renderedDrafts.filter((r) => r.vocId === VOC_B);
    expect(switchRenders.length).toBeGreaterThan(0);
    for (const r of switchRenders) {
      expect(r.public).toBeNull();
    }
  });

  it('setDraft on the same first render with the new vocId applies cleanly', () => {
    const { result, rerender } = renderHook(
      ({ vocId }: { vocId: string }) => useComposerDraft(vocId),
      { initialProps: { vocId: VOC_A } },
    );

    act(() => {
      result.current.setDraft('public', makeDoc('VOC A public'));
    });

    rerender({ vocId: VOC_B });

    // Setting a new draft for VOC_B must land on the empty baseline, not on
    // top of VOC_A's stale drafts.
    act(() => {
      result.current.setDraft('reply', makeDoc('VOC B reply'));
    });

    expect(result.current.state.public).toBeNull();
    expect(result.current.state.reply).toEqual(makeDoc('VOC B reply'));
    expect(result.current.state.internal).toBeNull();
  });
});
