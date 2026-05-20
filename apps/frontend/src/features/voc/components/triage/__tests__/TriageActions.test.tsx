// TriageActions.test.tsx — TDD RED tests for the triage footer action buttons.
// Prototype ref: screen-voc-create.jsx:572-584
// Three buttons: "Triage 확정 & 다음 VOC" (disabled when !dirty), "Finding 만들기", "보류".

import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TriageActions } from '../TriageActions';

describe('TriageActions', () => {
  it('renders all three action buttons', () => {
    render(
      <TriageActions
        dirty={false}
        submitting={false}
        onConfirm={vi.fn()}
        onFinding={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /triage 확정/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /finding 만들기/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /보류/i })).toBeInTheDocument();
  });

  it('"Triage 확정" is disabled when dirty=false', () => {
    render(
      <TriageActions
        dirty={false}
        submitting={false}
        onConfirm={vi.fn()}
        onFinding={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /triage 확정/i })).toBeDisabled();
  });

  it('"Triage 확정" is enabled when dirty=true', () => {
    render(
      <TriageActions
        dirty={true}
        submitting={false}
        onConfirm={vi.fn()}
        onFinding={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /triage 확정/i })).not.toBeDisabled();
  });

  it('calls onConfirm when "Triage 확정" clicked and dirty=true', () => {
    const onConfirm = vi.fn();
    render(
      <TriageActions
        dirty={true}
        submitting={false}
        onConfirm={onConfirm}
        onFinding={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /triage 확정/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('"Finding 만들기" and "보류" are always enabled', () => {
    render(
      <TriageActions
        dirty={false}
        submitting={false}
        onConfirm={vi.fn()}
        onFinding={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /finding 만들기/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /보류/i })).not.toBeDisabled();
  });
});
