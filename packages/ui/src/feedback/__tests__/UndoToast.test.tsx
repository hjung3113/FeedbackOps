/// <reference types="@testing-library/jest-dom" />
// UndoToast.test.tsx — RED tests for the UndoToast primitive.
// TDD RED: these tests are written before the implementation file exists.
// Prototype ref: docs/design-prototype/screen-voc-create.jsx:699-730

import * as React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UndoToast } from '../UndoToast.js';

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
    vi.useRealTimers();
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
      vi.useRealTimers();
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
    vi.useRealTimers();
  });
});
