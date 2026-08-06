// PublicUpdateComposer — attachment dropzone wiring tests (PLAN-22 C7a).
//
// Covers:
//   - drop file → upload → submit body includes attachment_ids[]
//   - failed upload not included
//   - Send disabled while uploading

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// RichEditor stub so the composer mounts headlessly.
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
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
          }),
      }),
  };
});

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

vi.mock('@/features/voc/hooks/useVocPublicUpdateMutation', () => ({
  useVocPublicUpdateMutation: vi.fn(),
}));

import {
  type PublicUpdateSuccess,
  useVocPublicUpdateMutation,
} from '@/features/voc/hooks/useVocPublicUpdateMutation';
import * as attachmentsApi from '@/lib/api/attachments';
import { ApiError } from '@/lib/api/types';
import type { MeResponse } from '@/lib/auth/useMe';
import { type VocDetailEnvelope, publicUpdateRequestSchema } from '@fops/shared';
import { PublicUpdateComposer } from '../PublicUpdateComposer';

const REPORTER_ID = '00000000-0000-0000-0000-000000000001';
const ADMIN_ID = '00000000-0000-0000-0000-000000000002';

const BASE_VOC: VocDetailEnvelope = {
  id: 'voc-uuid-1111',
  display_id: 'VOC-0001',
  title: '테스트 VOC',
  primary_managed_system_id: 'ms-1',
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

const ATTACHMENT = {
  id: 'aaaa1111-0000-4000-8000-000000000001',
  name: 'shot.png',
  size_bytes: 1024,
  mime_type: 'image/png',
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

function makeFile(name = 'shot.png', type = 'image/png', size = 1024): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size, configurable: true });
  return f;
}

function pickFile(file: File): void {
  const input = document.querySelector(
    '[data-testid="public-update-attachment-dropzone-input"]',
  ) as HTMLInputElement | null;
  if (!input) throw new Error('public-update-attachment-dropzone-input not found');
  fireEvent.change(input, { target: { files: [file] } });
}

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('<PublicUpdateComposer> attachments (PLAN-22 C7a)', () => {
  beforeEach(() => {
    vi.mocked(useVocPublicUpdateMutation).mockReturnValue(
      DEFAULT_MUTATION as unknown as ReturnType<typeof useVocPublicUpdateMutation>,
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('AC-A1b AC-A1c submits the body-present discriminant without attachments and passes the schema', async () => {
    vi.spyOn(attachmentsApi, 'uploadAttachment').mockResolvedValue(ATTACHMENT);
    const mutateMock = vi.fn();
    vi.mocked(useVocPublicUpdateMutation).mockReturnValue({
      ...DEFAULT_MUTATION,
      mutate: mutateMock,
    } as unknown as ReturnType<typeof useVocPublicUpdateMutation>);

    render(<PublicUpdateComposer voc={BASE_VOC} me={ME_ADMIN} />, { wrapper: wrap() });

    // Fill draft (so submit not blocked by empty)
    const user = userEvent.setup();
    await user.click(screen.getByTestId('rich-editor-public-update'));

    await act(async () => {
      pickFile(makeFile());
    });

    await waitFor(() => {
      expect(screen.getByTestId('attachment-row').getAttribute('data-state')).toBe('uploaded');
    });

    await user.click(screen.getByRole('button', { name: 'Publish update' }));

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalledTimes(1);
    });
    const firstCall = mutateMock.mock.calls[0];
    if (!firstCall) throw new Error('expected the public-update mutation to have been called');
    const calledVars = firstCall[0] as {
      body: Record<string, unknown>;
    };
    expect(calledVars.body).toEqual({
      skip_public_update: false,
      body_rich_content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
      },
      next_reporter_facing_status: 'received',
      attachment_ids: [ATTACHMENT.id],
    });
    expect(calledVars.body).not.toHaveProperty('attachments');
    expect(publicUpdateRequestSchema.safeParse(calledVars.body).success).toBe(true);
  });

  it('failed upload not included in POST body', async () => {
    vi.spyOn(attachmentsApi, 'uploadAttachment').mockRejectedValue(
      new ApiError(422, { code: 'attachment.unsupported_type', message: 'nope' }),
    );
    const mutateMock = vi.fn();
    vi.mocked(useVocPublicUpdateMutation).mockReturnValue({
      ...DEFAULT_MUTATION,
      mutate: mutateMock,
    } as unknown as ReturnType<typeof useVocPublicUpdateMutation>);

    render(<PublicUpdateComposer voc={BASE_VOC} me={ME_ADMIN} />, { wrapper: wrap() });

    const user = userEvent.setup();
    await user.click(screen.getByTestId('rich-editor-public-update'));

    await act(async () => {
      pickFile(makeFile('a.zip', 'application/zip'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('attachment-row').getAttribute('data-state')).toBe('error');
    });

    await user.click(screen.getByRole('button', { name: 'Publish update' }));

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalled();
    });
    const firstCall = mutateMock.mock.calls[0];
    if (!firstCall) throw new Error('expected the public-update mutation to have been called');
    const calledVars = firstCall[0] as {
      body: { attachment_ids: string[] };
    };
    expect(calledVars.body.attachment_ids).toEqual([]);
  });

  it('#354 clears linked attachments on publish success so the next submit sends none', async () => {
    vi.spyOn(attachmentsApi, 'uploadAttachment').mockResolvedValue(ATTACHMENT);
    const mutateMock = vi.fn();
    let capturedOnSuccess: ((data: PublicUpdateSuccess) => void) | undefined;
    vi.mocked(useVocPublicUpdateMutation).mockImplementation((args) => {
      capturedOnSuccess = args?.onSuccess as ((data: PublicUpdateSuccess) => void) | undefined;
      return {
        ...DEFAULT_MUTATION,
        mutate: mutateMock,
      } as unknown as ReturnType<typeof useVocPublicUpdateMutation>;
    });

    render(<PublicUpdateComposer voc={BASE_VOC} me={ME_ADMIN} />, { wrapper: wrap() });
    const user = userEvent.setup();

    await user.click(screen.getByTestId('rich-editor-public-update'));
    await act(async () => {
      pickFile(makeFile());
    });
    await waitFor(() => {
      expect(screen.getByTestId('attachment-row').getAttribute('data-state')).toBe('uploaded');
    });
    await user.click(screen.getByRole('button', { name: 'Publish update' }));
    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));

    // Server accepted the publish and linked the attachment.
    await act(async () => {
      capturedOnSuccess?.({
        public_update: {
          id: 'pu-1',
          voc_id: BASE_VOC.id,
          body_rich_content: null,
          reporter_facing_status_before: 'received',
          reporter_facing_status_after: 'received',
          skip_public_update: false,
          skip_reason: null,
          created_at: '2026-05-01T00:01:00Z',
        },
        voc: BASE_VOC,
      });
    });

    // The chip must be gone — the attachment now belongs to the published item.
    expect(screen.queryByTestId('attachment-row')).not.toBeInTheDocument();

    // Compose a second update and publish again.
    await user.click(screen.getByTestId('rich-editor-public-update'));
    await user.click(screen.getByRole('button', { name: 'Publish update' }));
    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(2));

    const secondCall = mutateMock.mock.calls[1];
    if (!secondCall) throw new Error('expected a second public-update mutation call');
    const secondVars = secondCall[0] as { body: { attachment_ids: string[] } };
    expect(secondVars.body.attachment_ids).toEqual([]);
  });

  it('#354 reset keeps a still-uploading row — a file added while the post was in flight survives', async () => {
    // First file resolves immediately; the second is left pending so it is
    // mid-upload at the moment the publish succeeds.
    let resolveSecond!: (v: typeof ATTACHMENT) => void;
    const SECOND = { ...ATTACHMENT, id: 'aaaa1111-0000-4000-8000-000000000002' };
    vi.spyOn(attachmentsApi, 'uploadAttachment')
      .mockResolvedValueOnce(ATTACHMENT)
      .mockReturnValueOnce(
        new Promise((res) => {
          resolveSecond = res;
        }),
      );

    const mutateMock = vi.fn();
    let capturedOnSuccess: ((data: PublicUpdateSuccess) => void) | undefined;
    vi.mocked(useVocPublicUpdateMutation).mockImplementation((args) => {
      capturedOnSuccess = args?.onSuccess as ((data: PublicUpdateSuccess) => void) | undefined;
      return {
        ...DEFAULT_MUTATION,
        mutate: mutateMock,
      } as unknown as ReturnType<typeof useVocPublicUpdateMutation>;
    });

    render(<PublicUpdateComposer voc={BASE_VOC} me={ME_ADMIN} />, { wrapper: wrap() });
    const user = userEvent.setup();

    await user.click(screen.getByTestId('rich-editor-public-update'));
    await act(async () => {
      pickFile(makeFile('first.png'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('attachment-row').getAttribute('data-state')).toBe('uploaded');
    });
    await user.click(screen.getByRole('button', { name: 'Publish update' }));
    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));

    // User attaches another file while the publish request is still in flight.
    await act(async () => {
      pickFile(makeFile('second.png'));
    });
    await waitFor(() => {
      expect(
        screen.getAllByTestId('attachment-row').map((r) => r.getAttribute('data-state')),
      ).toEqual(['uploaded', 'uploading']);
    });

    await act(async () => {
      capturedOnSuccess?.({
        public_update: {
          id: 'pu-1',
          voc_id: BASE_VOC.id,
          body_rich_content: null,
          reporter_facing_status_before: 'received',
          reporter_facing_status_after: 'received',
          skip_public_update: false,
          skip_reason: null,
          created_at: '2026-05-01T00:01:00Z',
        },
        voc: BASE_VOC,
      });
    });

    // The linked row is gone; the in-flight one is untouched.
    const rowsAfterReset = screen.getAllByTestId('attachment-row');
    expect(rowsAfterReset).toHaveLength(1);
    expect(rowsAfterReset[0]?.getAttribute('data-state')).toBe('uploading');

    // It finishes normally and is carried by the next submit.
    await act(async () => {
      resolveSecond(SECOND);
    });
    await waitFor(() => {
      expect(screen.getByTestId('attachment-row').getAttribute('data-state')).toBe('uploaded');
    });

    await user.click(screen.getByTestId('rich-editor-public-update'));
    await user.click(screen.getByRole('button', { name: 'Publish update' }));
    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(2));
    const secondCall = mutateMock.mock.calls[1];
    if (!secondCall) throw new Error('expected a second public-update mutation call');
    expect((secondCall[0] as { body: { attachment_ids: string[] } }).body.attachment_ids).toEqual([
      SECOND.id,
    ]);
  });

  it('#354 reset keeps a failed row so the user can still see and remove it', async () => {
    vi.spyOn(attachmentsApi, 'uploadAttachment')
      .mockResolvedValueOnce(ATTACHMENT)
      .mockRejectedValueOnce(
        new ApiError(422, { code: 'attachment.unsupported_type', message: 'nope' }),
      );

    const mutateMock = vi.fn();
    let capturedOnSuccess: ((data: PublicUpdateSuccess) => void) | undefined;
    vi.mocked(useVocPublicUpdateMutation).mockImplementation((args) => {
      capturedOnSuccess = args?.onSuccess as ((data: PublicUpdateSuccess) => void) | undefined;
      return {
        ...DEFAULT_MUTATION,
        mutate: mutateMock,
      } as unknown as ReturnType<typeof useVocPublicUpdateMutation>;
    });

    render(<PublicUpdateComposer voc={BASE_VOC} me={ME_ADMIN} />, { wrapper: wrap() });
    const user = userEvent.setup();

    await user.click(screen.getByTestId('rich-editor-public-update'));
    await act(async () => {
      pickFile(makeFile('ok.png'));
    });
    await act(async () => {
      pickFile(makeFile('bad.zip', 'application/zip'));
    });
    await waitFor(() => {
      expect(
        screen.getAllByTestId('attachment-row').map((r) => r.getAttribute('data-state')),
      ).toEqual(['uploaded', 'error']);
    });

    await user.click(screen.getByRole('button', { name: 'Publish update' }));
    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      capturedOnSuccess?.({
        public_update: {
          id: 'pu-1',
          voc_id: BASE_VOC.id,
          body_rich_content: null,
          reporter_facing_status_before: 'received',
          reporter_facing_status_after: 'received',
          skip_public_update: false,
          skip_reason: null,
          created_at: '2026-05-01T00:01:00Z',
        },
        voc: BASE_VOC,
      });
    });

    const rowsAfterReset = screen.getAllByTestId('attachment-row');
    expect(rowsAfterReset).toHaveLength(1);
    expect(rowsAfterReset[0]?.getAttribute('data-state')).toBe('error');
  });

  it('Publish disabled while any attachment is mid-upload', async () => {
    let resolveUpload!: (v: typeof ATTACHMENT) => void;
    vi.spyOn(attachmentsApi, 'uploadAttachment').mockReturnValue(
      new Promise((res) => {
        resolveUpload = res;
      }),
    );

    render(<PublicUpdateComposer voc={BASE_VOC} me={ME_ADMIN} />, { wrapper: wrap() });

    const user = userEvent.setup();
    await user.click(screen.getByTestId('rich-editor-public-update'));

    await act(async () => {
      pickFile(makeFile());
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Publish update' })).toBeDisabled();
    });

    await act(async () => {
      resolveUpload(ATTACHMENT);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Publish update' })).not.toBeDisabled();
    });
  });
});
