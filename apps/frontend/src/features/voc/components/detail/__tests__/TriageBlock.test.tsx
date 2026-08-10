import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TriageBlock } from '../TriageBlock';
import { DETAIL_ENVELOPE } from './_fixtures';

describe('<TriageBlock>', () => {
  it('renders section title', () => {
    render(<TriageBlock voc={DETAIL_ENVELOPE} canTriage={false} onOpenTriage={vi.fn()} />);
    expect(screen.getByText('트리아지 (Read only)')).toBeInTheDocument();
  });

  it('shows SeverityBadge when severity is non-null', () => {
    render(
      <TriageBlock
        voc={{ ...DETAIL_ENVELOPE, severity: 'critical' }}
        canTriage={false}
        onOpenTriage={vi.fn()}
      />,
    );
    // SeverityBadge renders Korean label '심각' for 'critical'
    expect(screen.getByText('심각')).toBeInTheDocument();
  });

  it('shows "미설정" when severity is null', () => {
    render(
      <TriageBlock
        voc={{ ...DETAIL_ENVELOPE, severity: null }}
        canTriage={false}
        onOpenTriage={vi.fn()}
      />,
    );
    expect(screen.getByText('미설정')).toBeInTheDocument();
  });

  it('shows "Owner 없음" when owner_user_id and owner_team_id are both null', () => {
    render(
      <TriageBlock
        voc={{ ...DETAIL_ENVELOPE, owner_user_id: null, owner_team_id: null }}
        canTriage={false}
        onOpenTriage={vi.fn()}
      />,
    );
    expect(screen.getByText('Owner 없음')).toBeInTheDocument();
  });

  it('shows resolved owner display name when owner_user_id is present', () => {
    const ownerId = '00000000-0000-0000-0000-000000000099';
    render(
      <TriageBlock
        voc={{ ...DETAIL_ENVELOPE, owner_user_id: ownerId, owner_team_id: null }}
        ownerDisplayName="정담당"
        canTriage={false}
        onOpenTriage={vi.fn()}
      />,
    );
    expect(screen.getByText('정담당')).toBeInTheDocument();
    expect(screen.queryByText(`Actor ${ownerId.slice(0, 8)}`)).not.toBeInTheDocument();
  });

  it('shows "미지정" in amber text when analytics_area_id is null', () => {
    render(
      <TriageBlock
        voc={{ ...DETAIL_ENVELOPE, analytics_area_id: null }}
        canTriage={false}
        onOpenTriage={vi.fn()}
      />,
    );
    expect(screen.getByText('미지정')).toBeInTheDocument();
  });

  it('shows analytics area name when present', () => {
    const areaId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    render(
      <TriageBlock
        voc={{ ...DETAIL_ENVELOPE, analytics_area_id: areaId }}
        analyticsAreaName="결제 경험"
        canTriage={false}
        onOpenTriage={vi.fn()}
      />,
    );
    expect(screen.getByText('결제 경험')).toBeInTheDocument();
    expect(screen.queryByText(areaId.slice(0, 8))).not.toBeInTheDocument();
  });

  it('renders triage_state value', () => {
    render(
      <TriageBlock
        voc={{ ...DETAIL_ENVELOPE, triage_state: 'triaged' }}
        canTriage={false}
        onOpenTriage={vi.fn()}
      />,
    );
    expect(screen.getByText('triaged')).toBeInTheDocument();
  });

  it('opens the triage console once when authorized', () => {
    const onOpenTriage = vi.fn();
    render(<TriageBlock voc={DETAIL_ENVELOPE} canTriage onOpenTriage={onOpenTriage} />);

    fireEvent.click(screen.getByTestId('triage-open-console'));
    expect(onOpenTriage).toHaveBeenCalledTimes(1);
  });

  it('omits the triage-console button when unauthorized', () => {
    render(<TriageBlock voc={DETAIL_ENVELOPE} canTriage={false} onOpenTriage={vi.fn()} />);

    expect(screen.getByText('트리아지 (Read only)')).toBeInTheDocument();
    expect(screen.queryByTestId('triage-open-console')).toBeNull();
  });

  it('renders all four read-only triage fields regardless of capability', () => {
    render(<TriageBlock voc={DETAIL_ENVELOPE} canTriage={false} onOpenTriage={vi.fn()} />);

    for (const label of ['심각도', '담당자', '분석 영역', '트리아지 상태']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
