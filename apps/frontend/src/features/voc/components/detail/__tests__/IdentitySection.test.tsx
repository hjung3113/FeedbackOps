import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/useMe', () => ({ useMe: vi.fn() }));
vi.mock('@/features/voc/hooks/useManagedSystem', () => ({ useManagedSystem: vi.fn() }));
vi.mock('@/features/voc/components/list/VocRow', () => ({
  formatVocCreatedAt: (_iso: string) => '방금 전',
}));

import { useMe } from '@/lib/auth/useMe';
import { useManagedSystem } from '@/features/voc/hooks/useManagedSystem';
import { IdentitySection } from '../IdentitySection';
import { DETAIL_ENVELOPE, ME_RESPONSE, REPORTER_ID, OTHER_ACTOR_ID } from './_fixtures';

beforeEach(() => {
  vi.mocked(useManagedSystem).mockReturnValue(null);
  vi.mocked(useMe).mockReturnValue({ data: ME_RESPONSE } as ReturnType<typeof useMe>);
});

describe('<IdentitySection>', () => {
  it('renders the VOC title', () => {
    render(<IdentitySection voc={DETAIL_ENVELOPE} />);
    expect(screen.getByText('테스트 VOC 제목')).toBeInTheDocument();
  });

  it('renders ReporterStatusBadge', () => {
    render(<IdentitySection voc={DETAIL_ENVELOPE} />);
    // ReporterStatusBadge renders Korean label '접수됨' for 'received'
    expect(screen.getByText('접수됨')).toBeInTheDocument();
  });

  it('renders SeverityBadge when severity is non-null', () => {
    render(<IdentitySection voc={{ ...DETAIL_ENVELOPE, severity: 'high' }} />);
    // SeverityBadge renders Korean label '높음' for 'high'
    expect(screen.getByText('높음')).toBeInTheDocument();
  });

  it('shows me.display_name in UserChip when reporter_id matches me', () => {
    vi.mocked(useMe).mockReturnValue({
      data: ME_RESPONSE,
    } as ReturnType<typeof useMe>);
    render(<IdentitySection voc={{ ...DETAIL_ENVELOPE, reporter_id: REPORTER_ID }} />);
    expect(screen.getByText('김개발')).toBeInTheDocument();
  });

  it('shows stub display_name when reporter_id does not match me', () => {
    render(<IdentitySection voc={{ ...DETAIL_ENVELOPE, reporter_id: OTHER_ACTOR_ID }} />);
    expect(screen.getByText(`Actor ${OTHER_ACTOR_ID.slice(0, 8)}`)).toBeInTheDocument();
  });

  it('renders formatted created_at', () => {
    render(<IdentitySection voc={DETAIL_ENVELOPE} />);
    expect(screen.getByText('방금 전')).toBeInTheDocument();
  });
});
