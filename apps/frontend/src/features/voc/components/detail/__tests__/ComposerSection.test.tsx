// ComposerSection — unit tests (C5.1 RED, slice3 #21)
// REV-1 #6, #7 tests added.
// Test cases:
//   1. mounts when at least one tab is visible
//   2. returns null when no tabs visible
//   3. [REV-1 #7] switching tabs preserves draft state (drafts survive tab switches)
//   4. [REV-1 #6] onDirtyChange callback is called when a composer becomes dirty

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

vi.mock('@/features/voc/hooks/useComposerVisibility', () => ({
  useComposerVisibility: vi.fn(),
}));
vi.mock('@/lib/auth/useMe', () => ({ useMe: vi.fn() }));

// Mock RichEditor to avoid TipTap JSDOM issues. Emits onChange with a
// non-empty doc on click so the dirty derivation (REV-2 #6) lights up.
vi.mock('@fops/ui', async (importActual) => {
  const actual = await importActual<typeof import('@fops/ui')>();
  return {
    ...actual,
    RichEditor: ({ onChange }: { onChange?: (doc: import('@fops/ui').TipTapDoc) => void }) =>
      React.createElement('div', {
        'data-testid': 'rich-editor',
        onClick: () =>
          onChange?.({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }],
          }),
      }),
  };
});

import { useComposerVisibility } from '@/features/voc/hooks/useComposerVisibility';
import { useMe } from '@/lib/auth/useMe';
import { ComposerSection } from '../ComposerSection';
import type { VocDetailEnvelope } from '@fops/shared';

const REPORTER_ID = '00000000-0000-0000-0000-000000000001';

const VOC: VocDetailEnvelope = {
  id: 'voc-uuid-1111',
  display_id: 'VOC-0001',
  title: 'Test',
  primary_managed_system_id: 'ms-1',
  analytics_area_id: null,
  reporter_id: REPORTER_ID,
  owner_user_id: null,
  owner_team_id: null,
  severity: 'high',
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
  similar_count: 0,
  description_rich_content: { type: 'doc', content: [] },
  next_actions: [],
  next_reporter_states: { allowed: [], forbidden: {} },
  linked_execution: { findingRef: null, taskRef: null },
  conversation_timeline: [],
  conversation_page: { has_more: false },
  permission_decisions: {},
} as unknown as VocDetailEnvelope;

const ME = {
  actor: {
    id: REPORTER_ID,
    external_id: 'reporter-1',
    email: 'reporter@test.com',
    display_name: '김개발',
    role_level: 'user' as const,
  },
  workspace_id: 'ws-1',
};

beforeEach(() => {
  vi.mocked(useMe).mockReturnValue({
    data: ME,
    isLoading: false,
    isError: false,
    isPending: false,
    isSuccess: true,
    error: null,
    status: 'success',
    fetchStatus: 'idle',
    isFetching: false,
    isRefetching: false,
    isLoadingError: false,
    isRefetchError: false,
    isPlaceholderData: false,
    isStale: false,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useMe>);
});

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('<ComposerSection>', () => {
  it('renders the composer section when at least one tab is visible', () => {
    vi.mocked(useComposerVisibility).mockReturnValue({
      showPublic: false,
      showReply: true,
      showInternal: false,
    });
    render(<ComposerSection voc={VOC} me={ME} />, { wrapper: makeWrapper() });
    expect(screen.getByTestId('composer-section')).toBeInTheDocument();
  });

  it('renders nothing when no tabs are visible', () => {
    vi.mocked(useComposerVisibility).mockReturnValue(null);
    const { container } = render(<ComposerSection voc={VOC} me={ME} />, { wrapper: makeWrapper() });
    expect(container.firstChild).toBeNull();
  });

  // REV-1 #7: all three composer bodies must stay mounted across tab switches so
  // drafts survive. Switching from 'reply' to 'internal' must not unmount 'reply'.
  it('[#7] draft survives tab switch: all composers stay mounted when tab changes', () => {
    vi.mocked(useComposerVisibility).mockReturnValue({
      showPublic: true,
      showReply: true,
      showInternal: true,
    });
    render(<ComposerSection voc={VOC} me={ME} />, { wrapper: makeWrapper() });

    // Switch to internal tab (ComposerTabs renders buttons with role="tab")
    const internalTab = screen.getByRole('tab', { name: /Internal note/i });
    fireEvent.click(internalTab);

    // All three composer RichEditor stubs must remain in the DOM (kept mounted, CSS-hidden).
    const editors = screen.queryAllByTestId('rich-editor');
    // With all 3 tabs visible and all kept mounted, we expect 3 editors.
    expect(editors.length).toBe(3);
  });

  // REV-1 #6: onDirtyChange is called when user interacts with the composer body.
  it('[#6] onDirtyChange callback fires with true when composer body is clicked', () => {
    vi.mocked(useComposerVisibility).mockReturnValue({
      showPublic: true,
      showReply: false,
      showInternal: false,
    });
    const onDirtyChange = vi.fn();
    render(<ComposerSection voc={VOC} me={ME} onDirtyChange={onDirtyChange} />, { wrapper: makeWrapper() });

    // Click the rich editor (inside the composer body) to trigger dirty tracking.
    // The RichEditor stub renders a <div data-testid="rich-editor"> — clicking it
    // bubbles up to the composer body's onClick handler.
    fireEvent.click(screen.getByTestId('rich-editor'));

    // onDirtyChange should have been called with true.
    expect(onDirtyChange).toHaveBeenCalledWith(true);
  });
});
