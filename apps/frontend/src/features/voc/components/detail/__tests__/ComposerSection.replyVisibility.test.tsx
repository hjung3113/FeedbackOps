// ComposerSection with the real visibility hook: the Reply tab belongs to the VOC's Reporter only
// (U1-12, #1182). When it disappears under a selected Reply, the existing fallback selects the
// first visible tab, recovers focus, and leaves the other surfaces' drafts alone.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

// Focusable textarea stand-in (TipTap takes no text in jsdom); `data-draft` mirrors the value.
vi.mock('@fops/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fops/ui')>();
  return {
    ...actual,
    RichEditor: ({
      surface,
      value,
      onChange,
    }: {
      surface?: string;
      value?: import('@fops/ui').TipTapDoc | null;
      onChange?: (doc: import('@fops/ui').TipTapDoc) => void;
    }) =>
      React.createElement('textarea', {
        'data-testid': `editor-${surface}`,
        'data-draft': value ? JSON.stringify(value) : '',
        onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
          onChange?.({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: e.target.value }] }],
          }),
      }),
  };
});

import type { MeResponse } from '@/lib/auth/useMe';
import type { VocDetailEnvelope } from '@fops/shared';
import { ComposerSection } from '../ComposerSection';

const ADMIN_ID = '00000000-0000-0000-0000-000000000002';
const OTHER_ID = '00000000-0000-0000-0000-000000000003';

const BASE_VOC = {
  id: 'voc-uuid-1111',
  display_id: 'VOC-0001',
  title: 'Test',
  primary_managed_system_id: 'ms-1',
  analytics_area_id: null,
  reporter_id: ADMIN_ID,
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

const ownReporter: VocDetailEnvelope = BASE_VOC;
const someoneElses: VocDetailEnvelope = { ...BASE_VOC, reporter_id: OTHER_ID };

function meOf(role_level: 'admin' | 'user'): MeResponse {
  return {
    actor: {
      id: ADMIN_ID,
      external_id: 'ext',
      email: 'a@test.com',
      display_name: '관리자',
      role_level,
    },
    workspace_id: 'ws-1',
  };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const REPLY_TAB = { name: '제출자 답변' };

describe('<ComposerSection> reply visibility (real useComposerVisibility)', () => {
  it('falls back to the first visible tab, moves focus out of the removed Reply body, and keeps other drafts', () => {
    const me = meOf('admin');
    const { rerender } = render(<ComposerSection voc={ownReporter} me={me} canTriage />, {
      wrapper: Wrapper,
    });

    fireEvent.change(screen.getByTestId('editor-public-update'), { target: { value: 'pub' } });
    fireEvent.click(screen.getByRole('tab', REPLY_TAB));
    expect(screen.getByRole('tab', REPLY_TAB)).toHaveAttribute('aria-selected', 'true');
    act(() => screen.getByTestId('editor-reporter-reply').focus());

    rerender(<ComposerSection voc={someoneElses} me={me} canTriage />);

    expect(screen.queryByRole('tab', REPLY_TAB)).not.toBeInTheDocument();
    expect(screen.queryByTestId('reporter-reply-composer')).not.toBeInTheDocument();
    const publicTab = screen.getByRole('tab', { name: '공개 업데이트' });
    expect(publicTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('public-update-composer')).toBeVisible();
    expect(document.activeElement).toBe(publicTab);
    expect(screen.getByTestId('editor-public-update').getAttribute('data-draft')).toContain('pub');
  });

  it('renders nothing when no tab is visible', () => {
    const { container } = render(<ComposerSection voc={someoneElses} me={meOf('user')} />, {
      wrapper: Wrapper,
    });
    expect(container.firstChild).toBeNull();
  });

  it('starts on the first visible tab after switching to another VOC', () => {
    const me = meOf('admin');
    const { rerender } = render(<ComposerSection voc={ownReporter} me={me} canTriage />, {
      wrapper: Wrapper,
    });
    fireEvent.click(screen.getByRole('tab', REPLY_TAB));

    rerender(<ComposerSection voc={{ ...someoneElses, id: 'voc-uuid-2222' }} me={me} canTriage />);

    expect(screen.getByRole('tab', { name: '공개 업데이트' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByRole('tab', REPLY_TAB)).not.toBeInTheDocument();
  });

  it('reports a successful Internal comment so the timeline can show 내부', async () => {
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Response(JSON.stringify({ voc: ownReporter, internal_comment: { id: 'i1' } }), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          })
        : new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    ) as typeof globalThis.fetch;
    const onConversationPosted = vi.fn();
    render(
      <ComposerSection
        voc={someoneElses}
        me={meOf('admin')}
        canTriage
        onConversationPosted={onConversationPosted}
      />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByRole('tab', { name: '내부 코멘트' }));
    fireEvent.change(screen.getByTestId('editor-internal-comment'), { target: { value: '메모' } });

    fireEvent.click(screen.getByRole('button', { name: '내부 코멘트 추가' }));

    await waitFor(() => expect(onConversationPosted).toHaveBeenCalledTimes(1));
    expect(onConversationPosted).toHaveBeenCalledWith('internal');
  });
});
