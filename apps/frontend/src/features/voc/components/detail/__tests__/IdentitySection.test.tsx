import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/useMe', () => ({ useMe: vi.fn() }));
vi.mock('@/features/voc/hooks/useManagedSystem', () => ({ useManagedSystem: vi.fn() }));
vi.mock('@/features/voc/components/list/VocRow', () => ({
  formatVocCreatedAt: (_iso: string) => '방금 전',
}));

import { useManagedSystem } from '@/features/voc/hooks/useManagedSystem';
import { useMe } from '@/lib/auth/useMe';
import { IdentityMetadataStrip, IdentitySection } from '../IdentitySection';
import { DETAIL_ENVELOPE, ME_RESPONSE, OTHER_ACTOR_ID } from './_fixtures';

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

  it('does NOT render SeverityBadge in the title group (relocated to IdentityMetadataStrip)', () => {
    render(<IdentitySection voc={{ ...DETAIL_ENVELOPE, severity: 'high' }} />);
    // Severity must not appear in the title block per .review/title-reference.png.
    expect(screen.queryByText('높음')).not.toBeInTheDocument();
  });

  it('IdentityMetadataStrip renders SeverityBadge when severity is non-null', () => {
    render(<IdentityMetadataStrip voc={{ ...DETAIL_ENVELOPE, severity: 'high' }} />);
    expect(screen.getByText('높음')).toBeInTheDocument();
  });

  it('renders the shared PanelTitleBlock at prototype lg typography', () => {
    render(<IdentitySection voc={DETAIL_ENVELOPE} />);
    const h2 = screen.getByRole('heading', { level: 2 });
    expect(h2).toHaveClass('text-lg');
    expect(h2).toHaveClass('font-semibold');
    expect(h2).toHaveClass('leading-[1.35]');
    expect(h2).not.toHaveClass('text-xl');
  });

  it('aligns the title block to the section nav 24px left inset (inset now on scroll container)', () => {
    render(<IdentitySection voc={DETAIL_ENVELOPE} />);
    const h2 = screen.getByRole('heading', { level: 2 });
    // px-6 removed from IdentitySection; horizontal inset is now on the
    // VocDetailPanel scroll container (pt-7 px-6 pb-16) — matching triage pattern.
    expect(h2.parentElement?.parentElement).not.toHaveClass('px-6');
    expect(h2.parentElement?.parentElement).toHaveClass('mb-4');
  });

  it('renders the reporter+time meta line as "<reporter> · <relative>" (no FieldRow labels)', () => {
    render(<IdentitySection voc={DETAIL_ENVELOPE} />);
    // Reference: ".review/title-reference.png" — single horizontal meta row
    // below the title: status pill + reporter name + middle-dot + relative time.
    // The verbose '제출자' / '제출 시각' FieldRow labels must be gone.
    expect(screen.queryByText('제출자')).not.toBeInTheDocument();
    expect(screen.queryByText('제출 시각')).not.toBeInTheDocument();
    // Reporter + relative coexist on the page.
    expect(screen.getByText('김개발')).toBeInTheDocument();
    expect(screen.getByText('방금 전')).toBeInTheDocument();
  });

  it('shows resolved reporter display_name when reporter_id does not match me', () => {
    render(
      <IdentitySection
        voc={{ ...DETAIL_ENVELOPE, reporter_id: OTHER_ACTOR_ID }}
        reporterDisplayName="박운영"
      />,
    );
    expect(screen.getByText('박운영')).toBeInTheDocument();
    expect(screen.queryByText(`Actor ${OTHER_ACTOR_ID.slice(0, 8)}`)).not.toBeInTheDocument();
  });

  it('IdentityMetadataStrip renders analytics area name when provided', () => {
    const areaId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    render(
      <IdentityMetadataStrip
        voc={{ ...DETAIL_ENVELOPE, analytics_area_id: areaId }}
        analyticsAreaName="결제 경험"
      />,
    );
    expect(screen.getByText('결제 경험')).toBeInTheDocument();
    expect(screen.queryByText(areaId.slice(0, 8))).not.toBeInTheDocument();
  });
});
