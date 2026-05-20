/// <reference types="@testing-library/jest-dom" />
// ComposerDirtyConfirmation.test.tsx — TDD RED
// Tests:
//   1. DirtyConfirmation opens on ComposerSection close when any composer has dirty draft
//
// C5.5 of slice3 #21.
// Spec: PLAN-21-SUBCHUNKS.md C5.5 (DirtyConfirmation on panel close)
// See: packages/ui/src/feedback/DirtyConfirmation.tsx for the primitive

import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ComposerSection } from '../ComposerSection';
import type { VocDetailEnvelope } from '@fops/shared';
import type { MeResponse } from '@/lib/auth/useMe';

// ── Mock RichEditor ────────────────────────────────────────────────────────

vi.mock('@fops/ui', async (importActual) => {
  const actual = await importActual<typeof import('@fops/ui')>();
  return {
    ...actual,
    RichEditor: ({
      onChange,
    }: {
      onChange?: (doc: import('@fops/ui').TipTapDoc) => void;
    }) =>
      React.createElement('div', {
        'data-testid': 'rich-editor',
        role: 'textbox',
        onClick: () =>
          onChange?.({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'dirty content' }] }],
          }),
      }),
  };
});

// ── Mock mutation hooks ─────────────────────────────────────────────────────

vi.mock('@/features/voc/hooks/useVocPublicUpdateMutation', () => ({
  useVocPublicUpdateMutation: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  })),
}));

vi.mock('@/features/voc/hooks/useVocReporterReplyMutation', () => ({
  useVocReporterReplyMutation: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  })),
}));

vi.mock('@/features/voc/hooks/useVocInternalCommentMutation', () => ({
  useVocInternalCommentMutation: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  })),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ADMIN_ID = '00000000-0000-0000-0000-000000000002';

const BASE_VOC: VocDetailEnvelope = {
  id: 'voc-dirty-test-1',
  display_id: 'VOC-0088',
  title: 'DirtyConfirmation test',
  primary_managed_system_id: 'ms-uuid-1111',
  analytics_area_id: null,
  reporter_id: 'some-reporter-id',
  owner_user_id: ADMIN_ID,
  owner_team_id: null,
  severity: 'low',
  reporter_facing_status: 'received',
  triage_state: 'triaged',
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

// Admin in a Managed System context — sees all three tabs.
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

describe('ComposerSection DirtyConfirmation', () => {
  it('shows DirtyConfirmation dialog when close is requested with a dirty composer draft', async () => {
    const onCloseRequest = vi.fn();
    render(
      <ComposerSection
        voc={BASE_VOC}
        me={ME_ADMIN}
        onCloseRequest={onCloseRequest}
      />,
      { wrapper: makeWrapper() },
    );

    // Make the editor dirty by clicking (mock returns non-empty doc).
    const editor = screen.getByRole('textbox');
    fireEvent.click(editor);

    // Trigger close request (the parent would call this when the panel is about to close).
    const closeBtn = screen.getByRole('button', { name: /닫기/i });
    fireEvent.click(closeBtn);

    // DirtyConfirmation dialog should appear.
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('변경사항이 저장되지 않았습니다')).toBeInTheDocument();
  });
});
