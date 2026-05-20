import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

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

import { useVocConversation } from '@/features/voc/hooks/useVocConversation';
import { useMe } from '@/lib/auth/useMe';
import { ConversationTimeline } from '../ConversationTimeline';
import { DETAIL_ENVELOPE, ME_RESPONSE, makeConversationQuery } from './_fixtures';
import type { ConversationEntry } from '@fops/shared';

const PUBLIC_ENTRY: ConversationEntry = {
  id: 'entry-public-1',
  kind: 'public_update',
  actor_id: 'actor-99',
  body_rich_content: {},
  created_at: '2026-05-01T00:00:00Z',
  visibility: 'public',
};

const REPORTER_REPLY_ENTRY: ConversationEntry = {
  id: 'entry-reply-1',
  kind: 'reporter_reply',
  actor_id: 'actor-99',
  body_rich_content: {},
  created_at: '2026-05-01T01:00:00Z',
  visibility: 'reporter',
};

const INTERNAL_ENTRY: ConversationEntry = {
  id: 'entry-internal-1',
  kind: 'internal_comment',
  actor_id: 'actor-99',
  body_rich_content: {},
  created_at: '2026-05-01T02:00:00Z',
  visibility: 'internal',
};

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
