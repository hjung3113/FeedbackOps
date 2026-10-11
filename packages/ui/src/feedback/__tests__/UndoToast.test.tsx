/// <reference types="@testing-library/jest-dom" />
// UndoToast.test.tsx — RED tests for the UndoToast primitive.
// TDD RED: these tests are written before the implementation file exists.
// Prototype ref: docs/design-prototype/screen-voc-create.jsx:699-730

import * as React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UndoToast } from '../UndoToast.js';

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('UndoToast', () => {
  it('renders message and 실행 취소 button', () => {
    render(
      <UndoToast
        message="Triage 확정됨"
        onAction={vi.fn()}
        duration={5000}
      />,
    );
    expect(screen.getByText('Triage 확정됨')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '실행 취소' })).toBeInTheDocument();
  });

  it('calls onAction when 실행 취소 button is clicked', () => {
    const onAction = vi.fn();
    render(
      <UndoToast
        message="보류 처리됨"
        onAction={onAction}
        duration={5000}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '실행 취소' }));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('calls onDismiss after duration ms have elapsed', async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <UndoToast
        message="Triage 확정됨"
        onAction={vi.fn()}
        onDismiss={onDismiss}
        duration={200}
      />,
    );
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(200); });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('calls onAction when Enter is pressed on the button', () => {
    const onAction = vi.fn();
    render(
      <UndoToast
        message="Finding 만들기로 이동"
        onAction={onAction}
        duration={5000}
      />,
    );
    const btn = screen.getByRole('button', { name: '실행 취소' });
    fireEvent.keyDown(btn, { key: 'Enter', code: 'Enter' });
    expect(onAction).toHaveBeenCalledOnce();
  });
});

describe('UndoToast auto-dismiss pause (#960)', () => {
  // Pause sources per #960: keyboard focus inside the toast root, pointer over it.
  // jsdom has no PointerEvent; React synthesizes onPointerEnter/Leave from native
  // pointerover/pointerout, which fireEvent.pointerOver/pointerOut dispatch.
  const pauseSources = [
    {
      source: 'keyboard focus inside the toast',
      pause: ({ btn }: { root: HTMLElement; btn: HTMLElement }) => {
        fireEvent.focus(btn);
      },
      resume: ({ btn }: { root: HTMLElement; btn: HTMLElement }) => {
        fireEvent.blur(btn, { relatedTarget: document.body });
      },
    },
    {
      source: 'pointer over the toast',
      pause: ({ root }: { root: HTMLElement; btn: HTMLElement }) => {
        fireEvent.pointerOver(root);
      },
      resume: ({ root }: { root: HTMLElement; btn: HTMLElement }) => {
        fireEvent.pointerOut(root);
      },
    },
  ] as const;

  it.each(pauseSources)(
    'pauses the auto-dismiss while $source and resumes with the remaining time',
    ({ pause, resume }) => {
      vi.useFakeTimers();
      const onDismiss = vi.fn();
      render(
        <UndoToast
          message="Triage 확정됨"
          onAction={vi.fn()}
          onDismiss={onDismiss}
          duration={4000}
        />,
      );
      const root = screen.getByRole('status');
      const btn = screen.getByRole('button', { name: '실행 취소' });

      // 3 s elapsed normally.
      act(() => { vi.advanceTimersByTime(3000); });
      expect(onDismiss).not.toHaveBeenCalled();

      // Pause source enters at 3 s: even 7 s more must not dismiss.
      act(() => { pause({ root, btn }); });
      act(() => { vi.advanceTimersByTime(7000); });
      expect(onDismiss).not.toHaveBeenCalled();

      // Source leaves: exactly the remaining ~1 s, not before.
      act(() => { resume({ root, btn }); });
      act(() => { vi.advanceTimersByTime(999); });
      expect(onDismiss).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(1); });
      expect(onDismiss).toHaveBeenCalledOnce();
    },
  );

  it('keeps the timer paused until every pause source has left', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <UndoToast
        message="Triage 확정됨"
        onAction={vi.fn()}
        onDismiss={onDismiss}
        duration={4000}
      />,
    );
    const root = screen.getByRole('status');
    const btn = screen.getByRole('button', { name: '실행 취소' });

    act(() => { vi.advanceTimersByTime(1000); });
    act(() => {
      fireEvent.focus(btn);
      fireEvent.pointerOver(root);
    });

    // Pointer leaves but focus stays inside: still paused.
    act(() => { fireEvent.pointerOut(root); });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onDismiss).not.toHaveBeenCalled();

    // Last source leaves at 6 s: 3 s remain.
    act(() => { fireEvent.blur(btn, { relatedTarget: document.body }); });
    act(() => { vi.advanceTimersByTime(2999); });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe('UndoToast pause host covers the sonner toast <li> (#960)', () => {
  // Sonner wraps toast.custom() content in <li data-sonner-toast tabindex=0>;
  // the first Tab lands on that <li>, so focus on the wrapper itself must
  // pause the timer too, not only focus inside the card.
  it.each([
    {
      source: 'keyboard focus on the sonner toast wrapper',
      pause: ({ wrapper }: { wrapper: HTMLElement }) => {
        fireEvent.focus(wrapper);
      },
      resume: ({ wrapper }: { wrapper: HTMLElement }) => {
        fireEvent.blur(wrapper, { relatedTarget: document.body });
      },
    },
  ] as const)(
    'pauses the auto-dismiss while $source and resumes with the remaining time',
    ({ pause, resume }) => {
      vi.useFakeTimers();
      const onDismiss = vi.fn();
      // sonner's real wrapper is <li data-sonner-toast tabindex=0>; build it as the render container.
      const host = document.createElement('li');
      host.setAttribute('data-sonner-toast', '');
      host.tabIndex = 0;
      document.body.appendChild(host);
      render(
        <UndoToast message="Triage 확정됨" onAction={vi.fn()} onDismiss={onDismiss} duration={4000} />,
        { container: host },
      );
      const wrapper = screen.getByRole('status').closest('[data-sonner-toast]') as HTMLElement;

      // 3 s elapsed normally.
      act(() => { vi.advanceTimersByTime(3000); });
      expect(onDismiss).not.toHaveBeenCalled();

      // Wrapper focus at 3 s: even 7 s more must not dismiss.
      act(() => { pause({ wrapper }); });
      act(() => { vi.advanceTimersByTime(7000); });
      expect(onDismiss).not.toHaveBeenCalled();

      // Focus moves outside: exactly the remaining ~1 s, not before.
      act(() => { resume({ wrapper }); });
      act(() => { vi.advanceTimersByTime(999); });
      expect(onDismiss).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(1); });
      expect(onDismiss).toHaveBeenCalledOnce();
    },
  );
});

describe('UndoToast duration change resets the budget (#960)', () => {
  it.each([
    { from: 0, used: 0, to: 4000 },
    { from: 4000, used: 3000, to: 8000 },
  ] as const)(
    'dismisses $to ms after the duration changes from $from with $used ms already used',
    ({ from, used, to }) => {
      vi.useFakeTimers();
      const onDismiss = vi.fn();
      const { rerender } = render(
        <UndoToast
          message="Triage 확정됨"
          onAction={vi.fn()}
          onDismiss={onDismiss}
          duration={from}
        />,
      );
      act(() => { vi.advanceTimersByTime(used); });
      expect(onDismiss).not.toHaveBeenCalled();

      rerender(
        <UndoToast
          message="Triage 확정됨"
          onAction={vi.fn()}
          onDismiss={onDismiss}
          duration={to}
        />,
      );
      act(() => { vi.advanceTimersByTime(to - 1); });
      expect(onDismiss).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(1); });
      expect(onDismiss).toHaveBeenCalledOnce();
    },
  );
});

describe('UndoToast expiry is one-shot (#960)', () => {
  it('does not call onDismiss again after the budget is spent', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const onDismissNext = vi.fn();
    const { rerender } = render(
      <UndoToast
        message="Triage 확정됨"
        onAction={vi.fn()}
        onDismiss={onDismiss}
        duration={4000}
      />,
    );
    act(() => { vi.advanceTimersByTime(4000); });
    expect(onDismiss).toHaveBeenCalledOnce();

    // A re-render with a new onDismiss must not re-run the expired budget.
    rerender(
      <UndoToast
        message="Triage 확정됨"
        onAction={vi.fn()}
        onDismiss={onDismissNext}
        duration={4000}
      />,
    );
    act(() => { vi.advanceTimersByTime(8000); });
    expect(onDismissNext).not.toHaveBeenCalled();

    // Pause/resume cycling after expiry must not call either callback again.
    const btn = screen.getByRole('button', { name: '실행 취소' });
    act(() => { fireEvent.focus(btn); });
    act(() => { vi.advanceTimersByTime(5000); });
    act(() => { fireEvent.blur(btn, { relatedTarget: document.body }); });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onDismissNext).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
