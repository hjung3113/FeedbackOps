import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { installListMotionEnvironment } from './list-motion-environment';

let environment: ReturnType<typeof installListMotionEnvironment>;
afterEach(() => {
  cleanup();
  environment.restore();
});

it.each([
  ['enabled', false, true, true],
  ['reduced motion', true, true, false],
  ['missing tokens', false, false, false],
] as const)('animates child mutations only when %s', async (_, reduced, tokens, enabled) => {
  environment = installListMotionEnvironment(reduced, tokens);
  const { useListMotion } = await import('../useListMotion');
  function List({ ids }: { ids: string[] }) {
    const ref = useListMotion();
    return (
      <div ref={ref}>
        {ids.map((id) => (
          <div key={id}>{id}</div>
        ))}
      </div>
    );
  }
  const view = render(<List ids={['a', 'b']} />);
  await act(async () => {});
  expect(environment.animate).not.toHaveBeenCalled();
  view.rerender(<List ids={['a', 'b', 'c']} />);
  if (enabled) await waitFor(() => expect(environment.animate).toHaveBeenCalled());
  else {
    await act(async () => {});
    expect(environment.animate).not.toHaveBeenCalled();
  }
  environment.animate.mockClear();
  view.rerender(<List ids={['b', 'c']} />);
  if (enabled) await waitFor(() => expect(environment.animate).toHaveBeenCalled());
  else {
    await act(async () => {});
    expect(environment.animate).not.toHaveBeenCalled();
  }
  const container = view.container.firstElementChild;
  view.unmount();
  environment.animate.mockClear();
  await act(async () => {
    container?.appendChild(document.createElement('div'));
  });
  expect(environment.animate).not.toHaveBeenCalled();
});

it.each([100, 2500])(
  'stops detached-list polling when reattached after %i ms',
  async (startupTime) => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    environment = installListMotionEnvironment();
    const { useListMotion } = await import('../useListMotion');
    function List({ context }: { context: string }) {
      const ref = useListMotion();
      return (
        <div key={context} ref={ref}>
          <div>row</div>
        </div>
      );
    }
    const view = render(<List context="a" />);
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(startupTime);
      });
      view.rerender(<List context="b" />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(startupTime);
      });
      view.unmount();
      environment.intersections.mockClear();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8000);
      });
      expect(environment.intersections).not.toHaveBeenCalled();
    } finally {
      view.unmount();
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  },
);

it('stops polling a removed row after its exit animation finishes', async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  environment = installListMotionEnvironment();
  const { useListMotion } = await import('../useListMotion');
  function List({ ids }: { ids: string[] }) {
    const ref = useListMotion();
    return (
      <div ref={ref}>
        {ids.map((id) => (
          <div key={id}>{id}</div>
        ))}
      </div>
    );
  }
  const view = render(<List ids={['a', 'b']} />);
  try {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    const removed = view.getByText('a');
    view.rerender(<List ids={['b']} />);
    await act(async () => {});
    expect(environment.animate).toHaveBeenCalled();
    await act(async () => {
      environment.finishAnimations();
    });
    expect(removed.isConnected).toBe(false);
    // Keep the surviving list mounted; count observer side effects on the removed row only.
    const observed: Element[] = [];
    environment.intersections.mockImplementation(() => ({
      observe: (el: Element) => observed.push(el),
      disconnect() {},
      unobserve() {},
    }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(observed).not.toContain(removed);
  } finally {
    view.unmount();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  }
});
