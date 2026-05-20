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
