// InternalCommentComposer — attachment dropzone wiring tests (PLAN-22 C7a).

import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fops/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fops/ui')>();
  return {
    ...actual,
    RichEditor: ({
      onChange,
      surface,
    }: {
      onChange?: (doc: import('@fops/ui').TipTapDoc) => void;
      surface?: string;
    }) =>
      React.createElement('button', {
        type: 'button',
        'data-testid': `rich-editor-${surface ?? 'default'}`,
        onClick: () =>
          onChange?.({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
          }),
      }),
  };
});

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

vi.mock('@/features/voc/hooks/useVocInternalCommentMutation', () => ({
  useVocInternalCommentMutation: vi.fn(),
}));

import { useVocInternalCommentMutation } from '@/features/voc/hooks/useVocInternalCommentMutation';
import { InternalCommentComposer } from '../InternalCommentComposer';
import * as attachmentsApi from '@/lib/api/attachments';
import { ApiError } from '@/lib/api/types';
import type { VocDetailEnvelope } from '@fops/shared';
import type { MeResponse } from '@/lib/auth/useMe';

const ADMIN_ID = '00000000-0000-0000-0000-000000000002';

const BASE_VOC: VocDetailEnvelope = {
  id: 'voc-uuid-2222',
  display_id: 'VOC-0002',
  title: '내부',
  primary_managed_system_id: 'ms-1',
  analytics_area_id: null,
  reporter_id: '00000000-0000-0000-0000-000000000001',
  owner_user_id: ADMIN_ID,
  owner_team_id: null,
  severity: 'medium',
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

const ATTACHMENT = {
  id: 'bbbb2222-0000-4000-8000-000000000002',
  name: 'note.pdf',
  size_bytes: 2048,
  mime_type: 'application/pdf',
  uploaded_by_actor_id: '00000000-0000-4000-8000-000000000099',
  created_at: '2026-05-22T10:00:00.000Z',
};

const DEFAULT_MUTATION = {
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  isIdle: true,
  isSuccess: false,
  isPaused: false,
  status: 'idle' as const,
  submittedAt: 0,
  variables: undefined,
  data: undefined,
  error: null,
  reset: vi.fn(),
  context: undefined,
  failureCount: 0,
  failureReason: null,
  mutateAsync: vi.fn(),
};

function makeFile(name = 'note.pdf', type = 'application/pdf', size = 2048): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size, configurable: true });
  return f;
}

function pickFile(file: File): void {
  const input = document.querySelector(
    '[data-testid="internal-comment-attachment-dropzone-input"]',
  ) as HTMLInputElement | null;
  if (!input) throw new Error('internal-comment-attachment-dropzone-input not found');
  fireEvent.change(input, { target: { files: [file] } });
}

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('<InternalCommentComposer> attachments (PLAN-22 C7a)', () => {
  beforeEach(() => {
    vi.mocked(useVocInternalCommentMutation).mockReturnValue(
      DEFAULT_MUTATION as unknown as ReturnType<typeof useVocInternalCommentMutation>,
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('upload → submit body includes attachment_ids[]', async () => {
    vi.spyOn(attachmentsApi, 'uploadAttachment').mockResolvedValue(ATTACHMENT);
    const mutateMock = vi.fn();
    vi.mocked(useVocInternalCommentMutation).mockReturnValue(
      { ...DEFAULT_MUTATION, mutate: mutateMock } as unknown as ReturnType<
        typeof useVocInternalCommentMutation
      >,
    );

    render(<InternalCommentComposer voc={BASE_VOC} me={ME_ADMIN} />, { wrapper: wrap() });

    const user = userEvent.setup();
    await user.click(screen.getByTestId('rich-editor-internal-comment'));

    await act(async () => {
      pickFile(makeFile());
    });

    await waitFor(() => {
      expect(screen.getByTestId('attachment-row').getAttribute('data-state')).toBe('uploaded');
    });

    await user.click(screen.getByRole('button', { name: 'Add note' }));

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalled();
    });
    const calledVars = mutateMock.mock.calls[0]![0] as {
      body: { attachment_ids: string[] };
    };
    expect(calledVars.body.attachment_ids).toEqual([ATTACHMENT.id]);
  });

  it('failed upload not included in POST body', async () => {
    vi.spyOn(attachmentsApi, 'uploadAttachment').mockRejectedValue(
      new ApiError(422, { code: 'attachment.unsupported_type', message: 'nope' }),
    );
    const mutateMock = vi.fn();
    vi.mocked(useVocInternalCommentMutation).mockReturnValue(
      { ...DEFAULT_MUTATION, mutate: mutateMock } as unknown as ReturnType<
        typeof useVocInternalCommentMutation
      >,
    );

    render(<InternalCommentComposer voc={BASE_VOC} me={ME_ADMIN} />, { wrapper: wrap() });

    const user = userEvent.setup();
    await user.click(screen.getByTestId('rich-editor-internal-comment'));

    await act(async () => {
      pickFile(makeFile('bad.zip', 'application/zip'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('attachment-row').getAttribute('data-state')).toBe('error');
    });

    await user.click(screen.getByRole('button', { name: 'Add note' }));

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalled();
    });
    const calledVars = mutateMock.mock.calls[0]![0] as {
      body: { attachment_ids: string[] };
    };
    expect(calledVars.body.attachment_ids).toEqual([]);
  });

  it('Add note disabled while any attachment is mid-upload', async () => {
    let resolveUpload!: (v: typeof ATTACHMENT) => void;
    vi.spyOn(attachmentsApi, 'uploadAttachment').mockReturnValue(
      new Promise((res) => {
        resolveUpload = res;
      }),
    );

    render(<InternalCommentComposer voc={BASE_VOC} me={ME_ADMIN} />, { wrapper: wrap() });

    const user = userEvent.setup();
    await user.click(screen.getByTestId('rich-editor-internal-comment'));

    await act(async () => {
      pickFile(makeFile());
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add note' })).toBeDisabled();
    });

    await act(async () => {
      resolveUpload(ATTACHMENT);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add note' })).not.toBeDisabled();
    });
  });
});
