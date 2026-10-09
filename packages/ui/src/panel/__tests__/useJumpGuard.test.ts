import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type JumpGuard, useJumpGuard } from '../useJumpGuard';

interface RootBox {
  scrollTop?: number;
  scrollHeight?: number;
  clientHeight?: number;
  /** Apply scrollTo synchronously and do not dispatch a scroll event. */
  applyScroll?: boolean;
}

const mountedRoots: HTMLElement[] = [];

function fakeRoot(box: RootBox = {}): HTMLElement {
  const root = document.createElement('div');
  let scrollTop = box.scrollTop ?? 0;
  Object.defineProperty(root, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
  Object.defineProperty(root, 'scrollHeight', {
    configurable: true,
    value: box.scrollHeight ?? 2000,
  });
  Object.defineProperty(root, 'clientHeight', {
    configurable: true,
    value: box.clientHeight ?? 200,
  });
  if (box.applyScroll) {
    root.scrollTo = ((options?: ScrollToOptions) => {
      const top = typeof options === 'object' ? options.top : undefined;
      if (typeof top !== 'number') return;
      const max = Math.max(0, root.scrollHeight - root.clientHeight);
      root.scrollTop = Math.min(Math.max(0, top), max);
    }) as HTMLElement['scrollTo'];
  } else {
    root.scrollTo = vi.fn() as HTMLElement['scrollTo'];
  }
  document.body.append(root);
  mountedRoots.push(root);
  return root;
}

/** Still `jumping`: moving the root without a scroll event must not admit. */
function expectStillJumping(guard: JumpGuard, root: HTMLElement): void {
  const at = root.scrollTop;
  root.scrollTop = at + 25;
  expect(guard.isSuppressed()).toBe(true);
  expect(guard.admitUserScroll(root)).toBe(false);
  root.scrollTop = at;
}

function emitScroll(root: HTMLElement, top: number): void {
  root.scrollTop = top;
  act(() => {
    root.dispatchEvent(new Event('scroll'));
  });
}

function emitScrollEnd(root: HTMLElement): void {
  act(() => {
    root.dispatchEvent(new Event('scrollend'));
  });
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const root of mountedRoots) root.remove();
  mountedRoots.length = 0;
  vi.useRealTimers();
});

describe('useJumpGuard', () => {
  it('admits a scroll while no jump is in progress', () => {
    const root = fakeRoot();
    const { result } = renderHook(() => useJumpGuard());

    expect(result.current.isSuppressed()).toBe(false);
    expect(result.current.admitUserScroll(root)).toBe(true);
  });

  it('releases a stalled jump 700ms after its last moving pulse, and not from the click', () => {
    // Target 400 is inside the 1800px range, so neither the clamp nor a click-timed
    // 700ms can release it. A pulse restarts the net. 699ms after the last one is
    // still the jump; the next millisecond records the landing. A scroll within 1px
    // of that landing does not admit, and the first one farther away admits once.
    const root = fakeRoot();
    const { result } = renderHook(() => useJumpGuard());
    act(() => {
      result.current.startJump(root, 400);
    });

    advance(700);
    expectStillJumping(result.current, root);

    emitScroll(root, 80);
    advance(500);
    expectStillJumping(result.current, root);

    emitScroll(root, 200);
    advance(500);
    expectStillJumping(result.current, root);

    emitScroll(root, 120);
    advance(699);
    expectStillJumping(result.current, root);

    advance(1);
    expect(result.current.isSuppressed()).toBe(true);
    root.scrollTop = 121;
    act(() => {
      root.dispatchEvent(new Event('scroll'));
    });
    expect(result.current.admitUserScroll(root)).toBe(false);

    root.scrollTop = 100;
    act(() => {
      root.dispatchEvent(new Event('scroll'));
    });
    // The event alone does not resume ranking. Admission is the caller's decision.
    expect(result.current.isSuppressed()).toBe(true);
    expect(result.current.admitUserScroll(root)).toBe(true);
    expect(result.current.isSuppressed()).toBe(false);
    expect(result.current.admitUserScroll(root)).toBe(true);
  });

  it.each([
    { end: 'target' as const, release: 'the scroll reaches the target' },
    { end: 'scrollend' as const, release: 'scrollend fires' },
  ])('keeps the jump through pulses 500ms apart until $release', ({ end }) => {
    // 398 is 2px short of 400, so it is not the end. 399 is within 1px. The pulses
    // also run past the 1500ms watchdog: a moving jump must have replaced it.
    const root = fakeRoot();
    const { result } = renderHook(() => useJumpGuard());
    act(() => {
      result.current.startJump(root, 400);
    });

    for (const top of [80, 200, 398]) {
      emitScroll(root, top);
      advance(500);
      expectStillJumping(result.current, root);
    }

    if (end === 'target') emitScroll(root, 399);
    else emitScrollEnd(root);

    expect(result.current.isSuppressed()).toBe(true);
    root.scrollTop = root.scrollTop + 1;
    expect(result.current.admitUserScroll(root)).toBe(false);
    root.scrollTop = root.scrollTop + 19;
    act(() => {
      root.dispatchEvent(new Event('scroll'));
    });
    expect(result.current.isSuppressed()).toBe(true);
    expect(result.current.admitUserScroll(root)).toBe(true);
  });

  it('releases a jump that never moves once the 1500ms start watchdog elapses', () => {
    // A scroll event that does not leave the origin must not arm the 700ms net.
    // 1499ms keeps the jump. 1500ms records the landing at 0.
    const root = fakeRoot();
    const { result } = renderHook(() => useJumpGuard());
    act(() => {
      result.current.startJump(root, 400);
    });
    act(() => {
      root.dispatchEvent(new Event('scroll'));
    });

    advance(700);
    expectStillJumping(result.current, root);
    advance(799);
    expectStillJumping(result.current, root);

    advance(1);
    expect(result.current.isSuppressed()).toBe(true);
    root.scrollTop = 1;
    expect(result.current.admitUserScroll(root)).toBe(false);
    root.scrollTop = 40;
    act(() => {
      root.dispatchEvent(new Event('scroll'));
    });
    expect(result.current.isSuppressed()).toBe(true);
    expect(result.current.admitUserScroll(root)).toBe(true);
  });

  it('releases by the watchdog when the root loses its box without a scroll event', () => {
    // Origin is 120. The root then collapses to 0 with no scroll event (detached).
    // The watchdog still releases, and the landing it records is 0, not 120.
    const root = fakeRoot({ scrollTop: 120 });
    const { result } = renderHook(() => useJumpGuard());
    act(() => {
      result.current.startJump(root, 400);
    });
    root.scrollTop = 0;

    advance(1499);
    expectStillJumping(result.current, root);
    advance(1);

    expect(result.current.isSuppressed()).toBe(true);
    root.scrollTop = 1;
    expect(result.current.admitUserScroll(root)).toBe(false);
    root.scrollTop = 40;
    expect(result.current.admitUserScroll(root)).toBe(true);
  });

  it('releases at the clamp when the scroll stops short of an unreachable target', () => {
    // Max scroll is 460 - 200 = 260. The target is 900. 258 is still short; 259 is within 1px.
    const root = fakeRoot({ scrollHeight: 460, clientHeight: 200 });
    const { result } = renderHook(() => useJumpGuard());
    act(() => {
      result.current.startJump(root, 900);
    });

    emitScroll(root, 258);
    expectStillJumping(result.current, root);

    emitScroll(root, 259);
    expect(result.current.isSuppressed()).toBe(true);
    root.scrollTop = 260;
    expect(result.current.admitUserScroll(root)).toBe(false);
    root.scrollTop = 250;
    expect(result.current.admitUserScroll(root)).toBe(true);
  });

  it('releases at once when the root is already on the clamp the target cannot pass', () => {
    // Max is 260 and the root is already there. The target 900 emits no scroll and no scrollend.
    const root = fakeRoot({ scrollTop: 260, scrollHeight: 460, clientHeight: 200 });
    const { result } = renderHook(() => useJumpGuard());
    act(() => {
      result.current.startJump(root, 900);
    });

    act(() => {
      root.dispatchEvent(new Event('scroll'));
    });
    expect(result.current.isSuppressed()).toBe(true);
    expect(result.current.admitUserScroll(root)).toBe(false);
    root.scrollTop = 261;
    expect(result.current.admitUserScroll(root)).toBe(false);
    root.scrollTop = 200;
    expect(result.current.admitUserScroll(root)).toBe(true);
  });

  it('releases at once when scrollTo lands on the target before its scroll event', () => {
    // scrollTo applies the target and does not dispatch. Staying on that landing does not
    // admit. Leaving it, still with no scroll event, admits only because the jump already
    // released inside startJump — a later scroll event is not what ends it.
    const root = fakeRoot({ applyScroll: true });
    const { result } = renderHook(() => useJumpGuard());
    act(() => {
      result.current.startJump(root, 400);
    });
    expect(root.scrollTop).toBe(400);
    expect(result.current.isSuppressed()).toBe(true);
    root.scrollTop = 401;
    expect(result.current.admitUserScroll(root)).toBe(false);

    root.scrollTop = 340;
    expect(result.current.admitUserScroll(root)).toBe(true);
    expect(result.current.isSuppressed()).toBe(false);
  });

  it('a later jump supersedes the earlier stall net and the earlier target', () => {
    // 400ms into the first jump's 700ms net, a second jump takes over. Arriving at the
    // first target (180) must not end the second jump, and the first net must not either.
    const root = fakeRoot();
    const { result } = renderHook(() => useJumpGuard());
    act(() => {
      result.current.startJump(root, 180);
    });
    emitScroll(root, 100);
    advance(400);

    act(() => {
      result.current.startJump(root, 400);
    });
    emitScroll(root, 180);
    advance(300);
    expectStillJumping(result.current, root);

    emitScroll(root, 220);
    expectStillJumping(result.current, root);
    emitScrollEnd(root);

    expect(result.current.isSuppressed()).toBe(true);
    root.scrollTop = 221;
    expect(result.current.admitUserScroll(root)).toBe(false);
    root.scrollTop = 100;
    expect(result.current.admitUserScroll(root)).toBe(true);
  });

  it('unmount clears the watchdog and both listeners', () => {
    const root = fakeRoot();
    const removeListener = vi.spyOn(root, 'removeEventListener');
    const { result, unmount } = renderHook(() => useJumpGuard());
    act(() => {
      result.current.startJump(root, 400);
    });
    expect(vi.getTimerCount()).toBe(1);
    unmount();

    // External side effects: the watchdog timer and both native listeners are disposed.
    expect(vi.getTimerCount()).toBe(0);
    expect(removeListener.mock.calls.map(([type]) => type).sort()).toEqual(['scroll', 'scrollend']);

    root.scrollTop = 400;
    act(() => {
      root.dispatchEvent(new Event('scroll'));
    });
    root.scrollTop = 10;
    expect(result.current.admitUserScroll(root)).toBe(false);

    act(() => {
      root.dispatchEvent(new Event('scrollend'));
    });
    root.scrollTop = 40;
    expect(result.current.admitUserScroll(root)).toBe(false);

    advance(1500);
    root.scrollTop = 0;
    expect(result.current.admitUserScroll(root)).toBe(false);
    expect(result.current.isSuppressed()).toBe(true);
  });
});
