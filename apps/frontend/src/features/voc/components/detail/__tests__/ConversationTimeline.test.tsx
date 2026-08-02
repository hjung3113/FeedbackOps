import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

vi.mock('@/features/voc/hooks/useVocConversation', () => ({
  useVocConversation: vi.fn(),
}));
vi.mock('@/lib/auth/useMe', () => ({ useMe: vi.fn() }));
vi.mock('@fops/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fops/ui')>();
  return {
    ...actual,
    RichContentRenderer: () => <div data-testid="rce" />,
  };
});
vi.mock('@/features/voc/components/list/VocRow', () => ({
  formatVocCreatedAt: () => '방금 전',
}));
vi.mock('../TimelineEntry', () => ({
  TimelineEntry: ({ entry }: { entry: ConversationEntry }) => (
    <div data-entry-id={entry.id}>
      {entry.kind === 'public_update'
        ? '공개 업데이트'
        : entry.kind === 'reporter_reply'
          ? 'Reporter 답변'
          : '내부 코멘트'}
    </div>
  ),
}));

import { useVocConversation } from '@/features/voc/hooks/useVocConversation';
import { useMe } from '@/lib/auth/useMe';
import { ConversationTimeline } from '../ConversationTimeline';
import { InternalTimeline } from '../InternalTimeline';
import { PublicTimeline } from '../PublicTimeline';
import { DETAIL_ENVELOPE, ME_RESPONSE, makeConversationQuery } from './_fixtures';
import type { ConversationEntry } from '@fops/shared';

const PUBLIC_ENTRY: ConversationEntry = {
  id: 'entry-public-1',
  kind: 'public_update',
  actor_id: 'actor-99',
  body_rich_content: {},
  created_at: '2026-05-01T00:00:00Z',
  visibility: 'public',
  attachments: [],
};

const REPORTER_REPLY_ENTRY: ConversationEntry = {
  id: 'entry-reply-1',
  kind: 'reporter_reply',
  actor_id: 'actor-99',
  body_rich_content: {},
  created_at: '2026-05-01T01:00:00Z',
  visibility: 'reporter',
  attachments: [],
};

const INTERNAL_ENTRY: ConversationEntry = {
  id: 'entry-internal-1',
  kind: 'internal_comment',
  actor_id: 'actor-99',
  body_rich_content: {},
  created_at: '2026-05-01T02:00:00Z',
  visibility: 'internal',
  attachments: [],
};

type TimelineComponent = React.ComponentType<{
  vocId: string;
  inline: ConversationEntry[];
  hasMore: boolean;
}>;

function makeEntry(
  id: string,
  kind: ConversationEntry['kind'],
  text: string,
  createdAt: string,
): ConversationEntry {
  return {
    id,
    kind,
    actor_id: `${id}-actor`,
    body_rich_content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    },
    created_at: createdAt,
    visibility: kind === 'internal_comment' ? 'internal' : 'public',
    attachments: [],
  };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function renderTimeline(
  Component: TimelineComponent,
  inline: ConversationEntry[],
  pages: ConversationEntry[][] | undefined,
) {
  vi.mocked(useVocConversation).mockReturnValue(
    makeConversationQuery({
      // useVocConversation narrows its result to `{ pages: ConversationPage[] }`,
      // so `pageParams` is an excess property here even though the real
      // infinite-query data carries it.
      data: pages
        ? { pages: pages.map((items) => ({ items, has_more: false })) }
        : undefined,
      isPending: pages === undefined,
    }),
  );
  return render(<Component vocId="voc-timeline" inline={inline} hasMore={false} />, {
    wrapper: makeWrapper(),
  });
}

function renderedIds(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('[data-entry-id]')].map(
    (element) => element.dataset.entryId ?? '',
  );
}

beforeEach(() => {
  vi.mocked(useVocConversation).mockReturnValue(makeConversationQuery());
  vi.mocked(useMe).mockReturnValue({ data: ME_RESPONSE } as ReturnType<typeof useMe>);
});

describe('<ConversationTimeline>', () => {
  it('renders both tabs', () => {
    render(<ConversationTimeline voc={DETAIL_ENVELOPE} />);
    expect(screen.getByRole('tab', { name: '공개' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '내부' })).toBeInTheDocument();
  });

  it('public tab shows public_update entries', () => {
    const vocWithEntries = {
      ...DETAIL_ENVELOPE,
      conversation_timeline: [PUBLIC_ENTRY, REPORTER_REPLY_ENTRY, INTERNAL_ENTRY],
    };
    render(<ConversationTimeline voc={vocWithEntries} />);
    // public tab is default; public + reporter_reply should appear
    expect(screen.getByText('공개 업데이트')).toBeInTheDocument();
    expect(screen.getByText('Reporter 답변')).toBeInTheDocument();
    // internal comment should NOT be in public tab
    expect(screen.queryByText('내부 코멘트')).not.toBeInTheDocument();
  });

  it('shows empty state when no entries in public tab', () => {
    render(<ConversationTimeline voc={DETAIL_ENVELOPE} />);
    expect(screen.getByText('아직 대화가 없습니다.')).toBeInTheDocument();
  });
});

describe('deduplicated timeline rendering', () => {
  const publicInline = [
    makeEntry('public-1', 'reporter_reply', 'first public body', '2026-05-01T01:00:00Z'),
    makeEntry('public-2', 'public_update', 'second public body', '2026-05-01T02:00:00Z'),
    makeEntry('public-3', 'reporter_reply', 'third public body', '2026-05-01T03:00:00Z'),
  ];
  const internalInline = [
    makeEntry('internal-1', 'internal_comment', 'first internal body', '2026-05-01T01:30:00Z'),
    makeEntry('internal-2', 'internal_comment', 'second internal body', '2026-05-01T02:30:00Z'),
    makeEntry('internal-3', 'internal_comment', 'third internal body', '2026-05-01T03:30:00Z'),
  ];

  it.each([
    ['Public', PublicTimeline, publicInline],
    ['Internal', InternalTimeline, internalInline],
  ] as const)('AC-A3a %s timeline renders identical inline and page ids exactly once', (_, Component, inline) => {
    const { container } = renderTimeline(Component, inline, [inline]);
    const ids = renderedIds(container);

    expect(new Set(ids)).toEqual(new Set(inline.map((entry) => entry.id)));
    expect(ids).toHaveLength(3);
  });

  it.each([
    [
      'Public',
      PublicTimeline,
      publicInline,
      makeEntry('public-older', 'public_update', 'older public body', '2026-04-30T23:00:00Z'),
    ],
    [
      'Internal',
      InternalTimeline,
      internalInline,
      makeEntry(
        'internal-older',
        'internal_comment',
        'older internal body',
        '2026-04-30T23:30:00Z',
      ),
    ],
  ] as const)(
    'AC-A3b %s timeline keeps the older page entry and the deduplicated inline entries in order',
    (_, Component, inline, older) => {
      const { container } = renderTimeline(Component, inline, [[older, ...inline]]);
      const ids = renderedIds(container);
      const expectedIds = [older.id, ...inline.map((entry) => entry.id)];

      expect(ids).toEqual(expectedIds);
      expect(new Set(ids)).toEqual(new Set(expectedIds));
      expect(ids).toHaveLength(4);
    },
  );

  it.each([
    ['Public', PublicTimeline, publicInline],
    ['Internal', InternalTimeline, internalInline],
  ] as const)('AC-A3c %s timeline renders inline entries while the query is pending', (_, Component, inline) => {
    const { container } = renderTimeline(Component, inline, undefined);
    const ids = renderedIds(container);

    expect(ids).toEqual(inline.map((entry) => entry.id));
    expect(ids).toHaveLength(3);
  });
});
