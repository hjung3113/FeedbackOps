import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

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

import { useMe } from '@/lib/auth/useMe';
import { TimelineEntry } from '../TimelineEntry';
import { ME_RESPONSE } from './_fixtures';
import type { ConversationEntry } from '@fops/shared';

beforeEach(() => {
  vi.mocked(useMe).mockReturnValue({ data: ME_RESPONSE } as ReturnType<typeof useMe>);
});

const BASE: Omit<ConversationEntry, 'kind' | 'visibility'> = {
  id: 'e-1',
  actor_id: 'actor-99',
  body_rich_content: {},
  created_at: '2026-05-01T00:00:00Z',
  // PLAN-22 §Bug-2 (2026-05-22): per-entry linked attachments — default empty.
  attachments: [],
};

describe('<TimelineEntry>', () => {
  it('renders "공개 업데이트" kind chip', () => {
    const entry: ConversationEntry = { ...BASE, kind: 'public_update', visibility: 'public' };
    render(<TimelineEntry entry={entry} />);
    expect(screen.getByText('공개 업데이트')).toBeInTheDocument();
  });

  it('renders "Reporter 답변" kind chip', () => {
    const entry: ConversationEntry = { ...BASE, kind: 'reporter_reply', visibility: 'reporter' };
    render(<TimelineEntry entry={entry} />);
    expect(screen.getByText('Reporter 답변')).toBeInTheDocument();
  });

  it('renders "내부 코멘트" kind chip', () => {
    const entry: ConversationEntry = { ...BASE, kind: 'internal_comment', visibility: 'internal' };
    render(<TimelineEntry entry={entry} />);
    expect(screen.getByText('내부 코멘트')).toBeInTheDocument();
  });

  it('renders status transition pair when both status fields present', () => {
    const entry: ConversationEntry = {
      ...BASE,
      kind: 'public_update',
      visibility: 'public',
      reporter_facing_status_before: 'received',
      reporter_facing_status_after: 'reviewing',
    };
    render(<TimelineEntry entry={entry} />);
    // ReporterStatusBadge renders Korean labels: '접수됨' for received, '검토 중' for reviewing
    expect(screen.getByText('접수됨')).toBeInTheDocument();
    expect(screen.getByText('검토 중')).toBeInTheDocument();
    // Separator arrow
    expect(screen.getByText('→')).toBeInTheDocument();
  });

  it('does NOT render status transition when fields are absent', () => {
    const entry: ConversationEntry = { ...BASE, kind: 'public_update', visibility: 'public' };
    render(<TimelineEntry entry={entry} />);
    expect(screen.queryByText('→')).not.toBeInTheDocument();
  });

  // ── PLAN-22 §Bug-2 (2026-05-22): per-entry attachment chips ────────────────
  describe('attachment chips', () => {
    const ATT = {
      id: 'bbbb2222-0000-4000-8000-000000000001',
      name: 'log.txt',
      size_bytes: 512,
      mime_type: 'text/plain',
      uploaded_by_actor_id: '00000000-0000-4000-8000-000000000099',
      created_at: '2026-05-22T10:00:00.000Z',
      linked_at: '2026-05-22T10:00:00.000Z',
    };

    it('public_update entry with linked attachments renders chip(s)', () => {
      const entry: ConversationEntry = {
        ...BASE,
        kind: 'public_update',
        visibility: 'public',
        attachments: [ATT],
      };
      render(<TimelineEntry entry={entry} />);
      expect(screen.getByTestId('attachment-chip')).toBeInTheDocument();
      expect(screen.getByText('log.txt')).toBeInTheDocument();
    });

    it('internal_comment entry renders chips', () => {
      const entry: ConversationEntry = {
        ...BASE,
        kind: 'internal_comment',
        visibility: 'internal',
        attachments: [ATT],
      };
      render(<TimelineEntry entry={entry} />);
      expect(screen.getByTestId('attachment-chip')).toBeInTheDocument();
    });

    it('reporter_reply entry renders chips', () => {
      const entry: ConversationEntry = {
        ...BASE,
        kind: 'reporter_reply',
        visibility: 'reporter',
        attachments: [ATT],
      };
      render(<TimelineEntry entry={entry} />);
      expect(screen.getByTestId('attachment-chip')).toBeInTheDocument();
    });

    it('entry with empty attachments[] renders no chips', () => {
      const entry: ConversationEntry = {
        ...BASE,
        kind: 'public_update',
        visibility: 'public',
        attachments: [],
      };
      render(<TimelineEntry entry={entry} />);
      expect(screen.queryByTestId('attachment-chip')).not.toBeInTheDocument();
    });
  });
});
