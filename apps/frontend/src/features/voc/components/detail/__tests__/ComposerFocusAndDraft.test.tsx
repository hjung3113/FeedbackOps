// Real-editor submit outcomes for the three VOC composers (#1182 Do 7, Do 4, Do 5): a rejected
// submit keeps the editor text and attachment rows; a successful one clears both, moves DOM focus
// into the editable, and reports the toast / timeline signal the composer owns.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

import * as attachmentsApi from '@/lib/api/attachments';
import type { MeResponse } from '@/lib/auth/useMe';
import { useJsdomRangeGeometry } from '@/test/realEditor';
import type { VocDetailEnvelope } from '@fops/shared';
import type { TipTapEditor } from '@fops/ui';
import { toast } from 'sonner';
import { InternalCommentComposer } from '../InternalCommentComposer';
import { PublicUpdateComposer } from '../PublicUpdateComposer';
import { ReporterReplyComposer } from '../ReporterReplyComposer';

const ME_ID = '00000000-0000-0000-0000-000000000002';

const VOC = {
  id: 'voc-uuid-1111',
  display_id: 'VOC-0001',
  title: 'Test',
  primary_managed_system_id: 'ms-1',
  analytics_area_id: null,
  reporter_id: ME_ID,
  owner_user_id: null,
  owner_team_id: null,
  severity: 'high',
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
  similar_count: 0,
  attachments: [],
  attachment_count: 0,
  description_rich_content: { type: 'doc', content: [] },
  next_actions: [],
  next_reporter_states: { allowed: [], forbidden: {} },
  linked_execution: { findingRef: null, taskRef: null },
  conversation_timeline: [],
  conversation_page: { has_more: false },
  permission_decisions: {},
} as unknown as VocDetailEnvelope;

const ME: MeResponse = {
  actor: {
    id: ME_ID,
    external_id: 'ext',
    email: 'a@test.com',
    display_name: '관리자',
    role_level: 'admin',
  },
  workspace_id: 'ws-1',
};

const ATTACHMENT = {
  id: 'cccc3333-0000-4000-8000-000000000003',
  name: 'photo.jpg',
  size_bytes: 4096,
  mime_type: 'image/jpeg',
  uploaded_by_actor_id: ME_ID,
  created_at: '2026-05-22T10:00:00.000Z',
};

interface ComposerCase {
  name: string;
  root: string;
  dropzone: string;
  submit: string;
  render: (onCommentAdded?: () => void) => React.ReactElement;
}

function Controlled({
  children,
}: {
  children: (props: {
    draftDoc: import('@fops/ui').TipTapDoc | null;
    onDraftChange: (doc: import('@fops/ui').TipTapDoc | null) => void;
  }) => React.ReactElement;
}): React.ReactElement {
  const [doc, setDoc] = React.useState<import('@fops/ui').TipTapDoc | null>(null);
  return children({ draftDoc: doc, onDraftChange: setDoc });
}

const CASES: ComposerCase[] = [
  {
    name: 'PublicUpdateComposer',
    root: 'public-update-composer',
    dropzone: 'public-update-attachment-dropzone',
    submit: '공개 업데이트 게시',
    render: () => (
      <Controlled>{(p) => <PublicUpdateComposer voc={VOC} me={ME} {...p} />}</Controlled>
    ),
  },
  {
    name: 'ReporterReplyComposer',
    root: 'reporter-reply-composer',
    dropzone: 'reporter-reply-attachment-dropzone',
    submit: '답변 보내기',
    render: () => (
      <Controlled>{(p) => <ReporterReplyComposer voc={VOC} me={ME} {...p} />}</Controlled>
    ),
  },
  {
    name: 'InternalCommentComposer',
    root: 'internal-comment-composer',
    dropzone: 'internal-comment-attachment-dropzone',
    submit: '내부 코멘트 추가',
    render: (onCommentAdded) => (
      <Controlled>
        {(p) => (
          <InternalCommentComposer
            voc={VOC}
            me={ME}
            {...p}
            {...(onCommentAdded ? { onCommentAdded } : {})}
          />
        )}
      </Controlled>
    ),
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installFetch(outcome: 'ok' | 'fail'): void {
  globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method !== 'POST') return jsonResponse({});
    if (outcome === 'fail') {
      return jsonResponse({ error: { code: 'internal', message: '서버 오류' } }, 500);
    }
    // Union of the three success bodies; each composer reads only its own fields.
    return jsonResponse({
      voc: VOC,
      public_update: { id: 'p1' },
      reporter_reply: { id: 'r1' },
      internal_comment: { id: 'i1' },
    });
  }) as typeof globalThis.fetch;
}

function editorWithin(root: string): TipTapEditor {
  const dom = screen.getByTestId(root).querySelector('.ProseMirror') as
    | (HTMLElement & { editor?: TipTapEditor })
    | null;
  if (!dom?.editor) throw new Error(`no mounted TipTap editor inside ${root}`);
  return dom.editor;
}

async function writeAndAttach(c: ComposerCase): Promise<TipTapEditor> {
  await waitFor(() =>
    expect(screen.getByTestId(c.root).querySelector('.ProseMirror')).not.toBeNull(),
  );
  const editor = editorWithin(c.root);
  act(() => {
    editor.commands.setContent('초안 내용');
  });
  const input = screen.getByTestId(`${c.dropzone}-input`);
  const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
  await waitFor(() =>
    expect(screen.getByTestId('attachment-row').getAttribute('data-state')).toBe('uploaded'),
  );
  return editor;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe.each(CASES)('$name submit outcomes (real editor)', (c) => {
  useJsdomRangeGeometry();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(attachmentsApi, 'uploadAttachment').mockResolvedValue(ATTACHMENT);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mount(onCommentAdded?: () => void) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
      <QueryClientProvider client={client}>{c.render(onCommentAdded)}</QueryClientProvider>,
    );
  }

  it('a rejected submit keeps the editor text and the attachment row', async () => {
    installFetch('fail');
    const onCommentAdded = vi.fn();
    mount(onCommentAdded);
    const editor = await writeAndAttach(c);

    fireEvent.click(screen.getByRole('button', { name: c.submit }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await act(async () => {
      await nextFrame();
    });

    expect(editor.getText()).toBe('초안 내용');
    expect(screen.getByTestId('attachment-row')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    expect(onCommentAdded).not.toHaveBeenCalled();
  });

  it('a successful submit clears the draft and attachments and focuses the editor', async () => {
    installFetch('ok');
    const onCommentAdded = vi.fn();
    mount(onCommentAdded);
    const editor = await writeAndAttach(c);
    // Move focus onto the submit button the way a keyboard user leaves the editor.
    const submit = screen.getByRole('button', { name: c.submit });
    act(() => submit.focus());

    fireEvent.click(submit);

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    await act(async () => {
      await nextFrame();
    });
    await waitFor(() => expect(editor.getText()).toBe(''));
    await waitFor(() => expect(editor.view.dom).toHaveFocus());
    expect(screen.queryByTestId('attachment-row')).not.toBeInTheDocument();
    expect(onCommentAdded).toHaveBeenCalledTimes(c.name === 'InternalCommentComposer' ? 1 : 0);
  });
});

describe('ReporterReplyComposer success toast', () => {
  useJsdomRangeGeometry();

  it('tells the Reporter the reply was registered, not that it was sent to themselves', async () => {
    installFetch('ok');
    vi.spyOn(attachmentsApi, 'uploadAttachment').mockResolvedValue(ATTACHMENT);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(<QueryClientProvider client={client}>{CASES[1]?.render()}</QueryClientProvider>);
    await waitFor(() =>
      expect(
        screen.getByTestId('reporter-reply-composer').querySelector('.ProseMirror'),
      ).not.toBeNull(),
    );
    act(() => {
      editorWithin('reporter-reply-composer').commands.setContent('답장');
    });

    fireEvent.click(screen.getByRole('button', { name: '답변 보내기' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('답장이 등록되었습니다.'));
  });
});
