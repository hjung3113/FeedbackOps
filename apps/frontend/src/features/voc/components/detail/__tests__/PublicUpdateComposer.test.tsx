// PublicUpdateComposer.test.tsx — TDD RED
// Tests:
//   1. body+status path: when nextStatus !== currentStatus, renders ReporterStatusChangeBlock
//   2. body-only path: when nextStatus === currentStatus, ReporterStatusChangeBlock still renders
//      (it's always shown in public update — user controls the status picker)
//   3. Publish disabled when gate blocks the staged next status
//
// C5.2 of slice3 #21.
// Prototype ref: docs/design-prototype/screen-voc.jsx:415-468

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

// ── Module mocks ─────────────────────────────────────────────────────────────

const mockMutate = vi.fn();

vi.mock('@/features/voc/hooks/useVocPublicUpdateMutation', () => ({
  useVocPublicUpdateMutation: vi.fn(() => ({
    mutate: mockMutate,
    isPending: false,
    isError: false,
    error: null,
  })),
}));

// Mock RichEditor to avoid TipTap JSDOM issues.
vi.mock('@fops/ui', async (importActual) => {
  const actual = await importActual<typeof import('@fops/ui')>();
  return {
    ...actual,
    RichEditor: ({
      onChange,
      'data-testid': testId,
    }: {
      onChange?: (doc: import('@fops/ui').TipTapDoc) => void;
      'data-testid'?: string;
    }) =>
      React.createElement('div', {
        'data-testid': testId ?? 'rich-editor',
        role: 'textbox',
        onClick: () =>
          onChange?.({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
          }),
      }),
  };
});

import { PublicUpdateComposer } from '../PublicUpdateComposer';
import type { VocDetailEnvelope } from '@fops/shared';
import type { MeResponse } from '@/lib/auth/useMe';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REPORTER_ID = '00000000-0000-0000-0000-000000000001';
const ADMIN_ID = '00000000-0000-0000-0000-000000000002';

const BASE_VOC: VocDetailEnvelope = {
  id: 'voc-uuid-1111',
  display_id: 'VOC-0001',
  title: '테스트 VOC 제목',
  primary_managed_system_id: 'ms-uuid-1111',
  analytics_area_id: null,
  reporter_id: REPORTER_ID,
  owner_user_id: ADMIN_ID,
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
  next_reporter_states: { allowed: ['reviewing'], forbidden: {} },
  linked_execution: { findingRef: null, taskRef: null },
  conversation_timeline: [],
  conversation_page: { has_more: false },
  permission_decisions: {},
} as unknown as VocDetailEnvelope;

const ME_ADMIN: MeResponse = {
  actor: {
    id: ADMIN_ID,
    external_id: 'admin-1',
    email: 'admin@feedbackops.local',
    display_name: '관리자',
    role_level: 'admin',
  },
  workspace_id: 'ws-1111',
};

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('<PublicUpdateComposer>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders ReporterStatusChangeBlock for body+status path (status change)', () => {
    render(
      <PublicUpdateComposer voc={BASE_VOC} me={ME_ADMIN} />,
      { wrapper: makeWrapper() },
    );
    // ReporterStatusChangeBlock should always be visible in the public composer.
    expect(
      screen.getByTestId('reporter-status-change-block'),
    ).toBeInTheDocument();
  });

  it('renders ReporterStatusChangeBlock for body-only path (status unchanged)', () => {
    // VOC with no allowed transitions — status picker stays at current value.
    const vocNoTransitions = {
      ...BASE_VOC,
      next_reporter_states: { allowed: [], forbidden: {} },
    } as unknown as VocDetailEnvelope;

    render(
      <PublicUpdateComposer voc={vocNoTransitions} me={ME_ADMIN} />,
      { wrapper: makeWrapper() },
    );
    expect(
      screen.getByTestId('reporter-status-change-block'),
    ).toBeInTheDocument();
  });

  it('disables Publish when reporter_status_gate.blocking_for includes nextStatus', () => {
    const vocGated = {
      ...BASE_VOC,
      reporter_status_gate: {
        blocking_for: ['received'], // blocks the current/default status
        reason: 'Task is still in review',
      },
    } as unknown as VocDetailEnvelope;

    render(
      <PublicUpdateComposer voc={vocGated} me={ME_ADMIN} />,
      { wrapper: makeWrapper() },
    );

    // The Publish button must be disabled when gate blocks the staged next status.
    const publishBtn = screen.getByRole('button', { name: /publish update/i });
    expect(publishBtn).toBeDisabled();
  });

  it('disables Publish for a whitespace-only draft without calling the mutation', () => {
    render(
      <PublicUpdateComposer
        voc={BASE_VOC}
        me={ME_ADMIN}
        draftDoc={{
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }],
        }}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByTestId('public-update-composer')).toBeInTheDocument();
    const publish = screen.getByRole('button', { name: /^publish update$/i });
    expect(publish).toBeDisabled();
    publish.click();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('enables Publish for a text draft', () => {
    render(
      <PublicUpdateComposer
        voc={BASE_VOC}
        me={ME_ADMIN}
        draftDoc={{
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'update' }] }],
        }}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByTestId('public-update-composer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^publish update$/i })).not.toBeDisabled();
  });
});
