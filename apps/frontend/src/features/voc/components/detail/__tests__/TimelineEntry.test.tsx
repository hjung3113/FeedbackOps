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
});
