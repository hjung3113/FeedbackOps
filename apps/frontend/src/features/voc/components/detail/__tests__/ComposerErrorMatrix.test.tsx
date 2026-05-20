/// <reference types="@testing-library/jest-dom" />
// ComposerErrorMatrix.test.tsx — TDD RED
// Error matrix sweep across PublicUpdateComposer and ReporterReplyComposer.
//
// Tests:
//   1. reporter_facing_status.invalid_transition → red Callout inline (PublicUpdateComposer)
//   2. reporter_facing_status.gate_blocked → amber Callout inline (ReporterReplyComposer — same
//      error surface but on a different composer; any composer accepting this error is covered)
//   3. conflict.idempotency_key_reuse → locks submit + preview buttons (PublicUpdateComposer)
//
// C5.5 of slice3 #21.
// Spec: PLAN-21-SUBCHUNKS.md C5.5 error matrix
// PLAN-21 §3.7.b: inline Callout copy sourced from backend detail.reason (not errorMapper)

import { ApiError } from '@/lib/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Shared RichEditor mock ─────────────────────────────────────────────────

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
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'test' }] }],
          }),
      }),
  };
});

// ── Mocked mutation hooks ─────────────────────────────────────────────────

const publicMutate = vi.fn();
const replyMutate = vi.fn();

vi.mock('@/features/voc/hooks/useVocPublicUpdateMutation', () => ({
  useVocPublicUpdateMutation: vi.fn(() => ({
    mutate: publicMutate,
    isPending: false,
    isError: false,
    error: null,
  })),
}));

vi.mock('@/features/voc/hooks/useVocReporterReplyMutation', () => ({
  useVocReporterReplyMutation: vi.fn(() => ({
    mutate: replyMutate,
    isPending: false,
    isError: false,
    error: null,
  })),
}));

import type { MeResponse } from '@/lib/auth/useMe';
import type { VocDetailEnvelope } from '@fops/shared';
import { PublicUpdateComposer } from '../PublicUpdateComposer';
import { ReporterReplyComposer } from '../ReporterReplyComposer';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REPORTER_ID = '00000000-0000-0000-0000-000000000001';
const ADMIN_ID = '00000000-0000-0000-0000-000000000002';

const BASE_VOC: VocDetailEnvelope = {
  id: 'voc-error-matrix-1',
  display_id: 'VOC-0099',
  title: 'Error matrix test VOC',
  primary_managed_system_id: 'ms-uuid-1111',
  analytics_area_id: null,
  reporter_id: REPORTER_ID,
  owner_user_id: ADMIN_ID,
  owner_team_id: null,
  severity: 'high',
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

function makeInvalidTransitionError(): ApiError {
  return new ApiError(422, {
    code: 'reporter_facing_status.invalid_transition',
    message: 'Invalid transition',
    detail: { reason: '해당 상태로 전환할 수 없습니다.' },
  });
}

function makeGateBlockedError(): ApiError {
  return new ApiError(409, {
    code: 'reporter_facing_status.gate_blocked',
    message: 'Gate blocked',
    detail: { reason: 'Task가 검토 중입니다.' },
  });
}

function makeIdempotencyReuseError(): ApiError {
  return new ApiError(409, {
    code: 'conflict.idempotency_key_reuse',
    message: 'Idempotency key reuse',
    detail: {},
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Composer error matrix (C5.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. invalid_transition: shows red Callout inline in PublicUpdateComposer after mutation error', async () => {
    const { useVocPublicUpdateMutation } = await import(
      '@/features/voc/hooks/useVocPublicUpdateMutation'
    );

    vi.mocked(useVocPublicUpdateMutation).mockReturnValue({
      mutate: publicMutate,
      isPending: false,
      isError: true,
      error: makeInvalidTransitionError(),
    } as unknown as ReturnType<typeof useVocPublicUpdateMutation>);

    render(<PublicUpdateComposer voc={BASE_VOC} me={ME_ADMIN} />, {
      wrapper: makeWrapper(),
    });

    // Red inline Callout should be present with reason text from detail.reason
    const callout = await screen.findByTestId('composer-error-callout');
    expect(callout).toBeInTheDocument();
    // tone should be red for invalid_transition
    expect(callout.dataset.tone).toBe('red');
    // Must show backend detail.reason, not errorMapper message
    expect(callout).toHaveTextContent('해당 상태로 전환할 수 없습니다.');
  });

  it('2. gate_blocked: shows amber Callout inline in ReporterReplyComposer after mutation error', async () => {
    const { useVocReporterReplyMutation } = await import(
      '@/features/voc/hooks/useVocReporterReplyMutation'
    );

    vi.mocked(useVocReporterReplyMutation).mockReturnValue({
      mutate: replyMutate,
      isPending: false,
      isError: true,
      error: makeGateBlockedError(),
    } as unknown as ReturnType<typeof useVocReporterReplyMutation>);

    render(<ReporterReplyComposer voc={BASE_VOC} me={ME_ADMIN} />, {
      wrapper: makeWrapper(),
    });

    const callout = await screen.findByTestId('composer-error-callout');
    expect(callout).toBeInTheDocument();
    // tone should be amber for gate_blocked
    expect(callout.dataset.tone).toBe('amber');
    expect(callout).toHaveTextContent('Task가 검토 중입니다.');
  });

  it('3. idempotency_key_reuse: disables both Submit and Preview buttons after mutation error', async () => {
    const { useVocPublicUpdateMutation } = await import(
      '@/features/voc/hooks/useVocPublicUpdateMutation'
    );

    vi.mocked(useVocPublicUpdateMutation).mockReturnValue({
      mutate: publicMutate,
      isPending: false,
      isError: true,
      error: makeIdempotencyReuseError(),
    } as unknown as ReturnType<typeof useVocPublicUpdateMutation>);

    render(<PublicUpdateComposer voc={BASE_VOC} me={ME_ADMIN} />, {
      wrapper: makeWrapper(),
    });

    // First click the editor to make it non-empty (so submit isn't blocked by isEmpty)
    fireEvent.click(screen.getByRole('textbox'));

    await waitFor(() => {
      const previewBtn = screen.getByRole('button', { name: /preview/i });
      const submitBtn = screen.getByRole('button', { name: /publish update/i });
      // Both must be disabled when idempotency_key_reuse error is active
      expect(previewBtn).toBeDisabled();
      expect(submitBtn).toBeDisabled();
    });
  });
});
