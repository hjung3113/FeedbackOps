// ComposerSection — unit tests (C5.1 RED, slice3 #21)
// 2 test cases:
//   1. mounts when at least one tab is visible
//   2. returns null when no tabs visible

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

vi.mock('@/features/voc/hooks/useComposerVisibility', () => ({
  useComposerVisibility: vi.fn(),
}));
vi.mock('@/lib/auth/useMe', () => ({ useMe: vi.fn() }));

// Mock RichEditor to avoid TipTap JSDOM issues (pulled in by ReporterReplyComposer / PublicUpdateComposer).
vi.mock('@fops/ui', async (importActual) => {
  const actual = await importActual<typeof import('@fops/ui')>();
  return {
    ...actual,
    RichEditor: () => React.createElement('div', { 'data-testid': 'rich-editor' }),
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
});
