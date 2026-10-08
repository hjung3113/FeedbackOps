// useCommittedSearchDraft — debounce, immediate commit, and acknowledgement.
// The inbox route used to own this; these tests are the seam that moved with it.

import { act, renderHook } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCommittedSearchDraft } from '../useCommittedSearchDraft';

const DEBOUNCE_MS = 300;

function StrictModeWrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(React.StrictMode, null, children);
}

function renderDraft(committed: string, options?: { strict?: boolean }) {
  const write = vi.fn();
  const hook = renderHook(
    ({ committed: next }: { committed: string }) =>
      useCommittedSearchDraft({ committed: next, write, debounceMs: DEBOUNCE_MS }),
    {
      initialProps: { committed },
      ...(options?.strict === true ? { wrapper: StrictModeWrapper } : {}),
    },
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

  it('writes the draft after debounceMs and not before', () => {
    const { result, write } = renderDraft('');

    act(() => {
      result.current.setDraft('로그인');
    });

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS - 1);
    });
    expect(write).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('로그인', '');
  });

  it('commits the current draft at once and the timer does not write it again', () => {
    const { result, write } = renderDraft('');

    act(() => {
      result.current.setDraft('로그인');
    });
    act(() => {
      result.current.commit();
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('로그인', '');

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      label: 'committed',
      committed: '로그인',
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
        result.current.setDraft('로그인');
      });
      act(() => {
        result.current.commit();
      });
      write.mockClear();
    } else {
      act(() => {
        result.current.setDraft('로그인');
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

  it('keeps a draft typed ahead of an acknowledgement under StrictMode', () => {
    const { result, rerender } = renderDraft('', { strict: true });

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
  });
});
