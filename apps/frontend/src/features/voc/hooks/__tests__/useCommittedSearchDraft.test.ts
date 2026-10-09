// useCommittedSearchDraft — debounce, immediate commit, and acknowledgement.
// The inbox route used to own this; these tests are the seam that moved with it.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCommittedSearchDraft } from '../useCommittedSearchDraft';

const DEBOUNCE_MS = 300;
// #875: searchDebounceMs waits this long when the draft ends in Hangul.
const HANGUL_DEBOUNCE_MS = 700;

function renderDraft(committed: string) {
  const write = vi.fn();
  const hook = renderHook(
    ({ committed: next }: { committed: string }) =>
      useCommittedSearchDraft({
        committed: next,
        write,
      }),
    { initialProps: { committed } },
  );
  return { ...hook, write };
}

describe('useCommittedSearchDraft', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('commits the current draft at once and the timer does not write it again', () => {
    const { result, write } = renderDraft('');

    act(() => {
      result.current.setDraft('login');
    });
    act(() => {
      result.current.commit();
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('login', '');

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      label: 'committed',
      committed: 'login',
      // The box already shows the URL q. Committing or waiting must not write.
      prime: false,
    },
    {
      label: 'a pending draft',
      committed: '',
      // The first commit writes. A repeat of that same draft must not.
      prime: true,
    },
  ])('does not write when the draft equals $label', ({ committed, prime }) => {
    const { result, write } = renderDraft(committed);

    if (prime) {
      act(() => {
        result.current.setDraft('login');
      });
      act(() => {
        result.current.commit();
      });
      write.mockClear();
    } else {
      act(() => {
        result.current.setDraft('login');
      });
    }

    act(() => {
      result.current.commit();
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(write).not.toHaveBeenCalled();
  });

  it('keeps a newer draft typed while a commit is still unacknowledged', () => {
    const { result, rerender, write } = renderDraft('');

    act(() => {
      result.current.setDraft('로그인');
    });
    act(() => {
      result.current.commit();
    });
    act(() => {
      result.current.setDraft('로그인 오류');
    });

    rerender({ committed: '로그인' });

    expect(result.current.draft).toBe('로그인 오류');

    act(() => {
      result.current.commit();
    });
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith('로그인 오류', '로그인');
  });

  // #891: returning to the base of a write the URL has not acknowledged yet
  // (Escape back to '', or typing the previous query again) is a newer draft.
  // The acknowledgement must not copy the pending text back, and the debounce
  // then writes the returned value.
  it.each([
    {
      label: 'an Escape clear back to the empty query',
      committed: '',
      typed: 'login',
      returned: '',
    },
    {
      label: 'typed back to the previous non-empty query',
      committed: 'a',
      typed: 'ab',
      returned: 'a',
    },
  ])(
    'keeps a draft that returns to the pending write base ($label)',
    ({ committed, typed, returned }) => {
      const { result, rerender, write } = renderDraft(committed);

      act(() => {
        result.current.setDraft(typed);
      });
      act(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
      });
      expect(write).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenCalledWith(typed, committed);

      act(() => {
        result.current.setDraft(returned);
      });
      rerender({ committed: typed });

      expect(result.current.draft).toBe(returned);

      act(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
      });
      expect(write).toHaveBeenCalledTimes(2);
      expect(write).toHaveBeenNthCalledWith(2, returned, typed);

      act(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
      });
      expect(write).toHaveBeenCalledTimes(2);
    },
  );

  // #891: an unrelated outside URL supersedes the pending write. The box still
  // shows that write, but its base is no longer protected: Escape does not mark
  // it ahead, so a later back/forward to the pending value shows it and writes
  // nothing.
  it('shows a back/forward to a pending search after an unrelated URL change', () => {
    const { result, rerender, write } = renderDraft('');

    act(() => {
      result.current.setDraft('login');
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('login', '');

    rerender({ committed: 'other' });
    rerender({ committed: '' });
    expect(result.current.draft).toBe('login');

    act(() => {
      result.current.setDraft('');
    });
    rerender({ committed: 'login' });

    expect(result.current.draft).toBe('login');

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('uses the pending draft as base while that commit is unacknowledged', () => {
    const { result, write } = renderDraft('');

    act(() => {
      result.current.setDraft('로그인');
    });
    act(() => {
      result.current.commit();
    });
    act(() => {
      result.current.setDraft('로그인 오류');
    });
    act(() => {
      result.current.commit();
    });

    expect(write).toHaveBeenNthCalledWith(1, '로그인', '');
    expect(write).toHaveBeenNthCalledWith(2, '로그인 오류', '로그인');
  });

  it('replaces an idle draft when committed changes outside the box', () => {
    const { result, rerender, write } = renderDraft('로그인');

    expect(result.current.draft).toBe('로그인');

    rerender({ committed: '결제' });

    expect(result.current.draft).toBe('결제');
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(write).not.toHaveBeenCalled();
  });

  // The inbox passes a new writer when the tab changes; the pending debounce
  // restarts and fires through the new writer, as it did inside the route.
  it('sends a pending write through the newest writer', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ write }: { write: (draft: string, base: string) => void }) =>
        useCommittedSearchDraft({
          committed: '',
          write,
        }),
      { initialProps: { write: first } },
    );

    act(() => {
      result.current.setDraft('login');
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS - 100);
    });
    rerender({ write: second });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(first).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS - 100);
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith('login', '');
  });

  // ── Hangul debounce (#875) ──────────────────────────────────────────────────
  //
  // A draft ending in a Hangul character may still be a half-typed syllable
  // (로그이 on the way to 로그인 looks like a finished one), and browsers do
  // not report IME composition reliably, so any Hangul-final draft waits
  // longer instead of trusting composition events.

  it.each([
    { draft: '로그이', delayMs: HANGUL_DEBOUNCE_MS },
    { draft: 'voc-02', delayMs: DEBOUNCE_MS },
  ])('debounces a draft ending in "$draft" for $delayMs ms', ({ draft, delayMs }) => {
    const { result, write } = renderDraft('');

    act(() => {
      result.current.setDraft(draft);
    });

    act(() => {
      vi.advanceTimersByTime(delayMs - 1);
    });
    expect(write).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(draft, '');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(write).toHaveBeenCalledTimes(1);
  });

  // A non-Hangul character (here a space) after a Hangul-final draft restarts
  // the pending timer back at the normal delay.
  it('writes 300 ms after a space follows the Hangul-final draft', () => {
    const { result, write } = renderDraft('');

    act(() => {
      result.current.setDraft('로그이');
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(write).not.toHaveBeenCalled();

    act(() => {
      result.current.setDraft('로그이 ');
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS - 1);
    });
    expect(write).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('로그이 ', '');
  });
});
