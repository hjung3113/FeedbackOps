/// <reference types="@testing-library/jest-dom" />
// ComposerDirtyKeyboard.test.tsx — codex REV-2 P1 #6 (partial)
//
// The old implementation set isDirty via a container onClick handler. A user
// typing into the editor with the keyboard (without first clicking the
// container) bypassed the dirty signal — close fired without
// DirtyConfirmation. Required: dirty is derived from the controlled draft
// state (the same TipTapDoc passed through onDraftChange), not from any
// click event.

import type { MeResponse } from '@/lib/auth/useMe';
import type { VocDetailEnvelope } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ComposerSection } from '../ComposerSection';

// RichEditor mock: emits onChange on a custom event the test fires directly,
// simulating keyboard typing (no container click required).
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
        onKeyDown: () =>
          onChange?.({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'typed via keyboard' }] }],
          }),
      }),
  };
});

vi.mock('@/features/voc/hooks/useVocPublicUpdateMutation', () => ({
  useVocPublicUpdateMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false, error: null })),
}));
vi.mock('@/features/voc/hooks/useVocReporterReplyMutation', () => ({
  useVocReporterReplyMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false, error: null })),
}));
vi.mock('@/features/voc/hooks/useVocInternalCommentMutation', () => ({
  useVocInternalCommentMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false, error: null })),
}));

const ADMIN_ID = '00000000-0000-0000-0000-000000000002';

const BASE_VOC: VocDetailEnvelope = {
  id: 'voc-keyboard-dirty',
  display_id: 'VOC-0099',
  title: 'Keyboard dirty test',
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

describe('ComposerSection dirty from draft state (REV-2 #6)', () => {
  it('keyboard-only typing (no container click) still triggers DirtyConfirmation', async () => {
    const onCloseRequest = vi.fn();
    render(
      <ComposerSection voc={BASE_VOC} me={ME_ADMIN} onCloseRequest={onCloseRequest} />,
      { wrapper: makeWrapper() },
    );

    const editor = screen.getByRole('textbox');

    // Simulate keyboard typing — fires onChange but NOT a click on the
    // container. The old click-based dirty path would have missed this.
    await act(async () => {
      fireEvent.keyDown(editor, { key: 'a' });
    });

    // Close button click.
    const closeBtn = screen.getByRole('button', { name: /닫기/i });
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    // DirtyConfirmation must appear because the draft state is non-empty.
    await waitFor(() => {
      expect(screen.getByText('변경사항이 저장되지 않았습니다')).toBeInTheDocument();
    });
    expect(onCloseRequest).not.toHaveBeenCalled();
  });

  it('empty draft state allows close without confirmation', async () => {
    const onCloseRequest = vi.fn();
    render(
      <ComposerSection voc={BASE_VOC} me={ME_ADMIN} onCloseRequest={onCloseRequest} />,
      { wrapper: makeWrapper() },
    );

    const closeBtn = screen.getByRole('button', { name: /닫기/i });
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    expect(onCloseRequest).toHaveBeenCalledTimes(1);
  });
});
