// MentionPickerButton.test.tsx — TDD RED
// Tests:
//   1. Combobox lists workspace actors (by display_name)
//   2. onSelect inserts a mention node via the callback
//
// C5.4 of slice3 #21.
// Spec: PLAN-21-SUBCHUNKS.md C5.4 — Combobox click only (NOT inline @-autocomplete)

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/features/voc/hooks/useWorkspaceActors', () => ({
  useWorkspaceActors: vi.fn(() => ({
    actors: [
      { id: 'actor-uuid-1', display_name: '홍길동', kind: 'user' },
      { id: 'actor-uuid-2', display_name: '김철수', kind: 'user' },
    ],
    isLoading: false,
    isError: false,
  })),
}));

import { MentionPickerButton } from '../MentionPickerButton';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('<MentionPickerButton>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists workspace actors in the Combobox dropdown', async () => {
    const onSelect = vi.fn();
    render(<MentionPickerButton onSelect={onSelect} />, { wrapper: makeWrapper() });

    // Click the @Mention trigger button to open the combobox.
    const triggerBtn = screen.getByRole('button', { name: /@/i });
    fireEvent.click(triggerBtn);

    // Both actors should appear in the popover.
    expect(await screen.findByText('홍길동')).toBeInTheDocument();
    expect(await screen.findByText('김철수')).toBeInTheDocument();
  });

  it('calls onSelect with actor id when an actor is chosen', async () => {
    const onSelect = vi.fn();
    render(<MentionPickerButton onSelect={onSelect} />, { wrapper: makeWrapper() });

    // Open the picker.
    const triggerBtn = screen.getByRole('button', { name: /@/i });
    fireEvent.click(triggerBtn);

    // Click the first actor option.
    const option = await screen.findByText('홍길동');
    fireEvent.click(option);

    expect(onSelect).toHaveBeenCalledWith({ id: 'actor-uuid-1', display_name: '홍길동' });
  });
});
