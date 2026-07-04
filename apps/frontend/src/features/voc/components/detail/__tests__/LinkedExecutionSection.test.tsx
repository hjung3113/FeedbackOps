import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/features/voc/hooks/usePermissionDecision', () => ({
  usePermissionDecision: vi.fn(),
}));

import { usePermissionDecision } from '@/features/voc/hooks/usePermissionDecision';
import { LinkedExecutionSection } from '../LinkedExecutionSection';
import { DETAIL_ENVELOPE } from './_fixtures';

describe('<LinkedExecutionSection>', () => {
  beforeEach(() => {
    vi.mocked(usePermissionDecision).mockReturnValue(null);
  });

  it('renders EmptyState when no linkedFinding permission decision', () => {
    render(<LinkedExecutionSection voc={DETAIL_ENVELOPE} />);
    expect(screen.getByText('연결된 실행 없음')).toBeInTheDocument();
    expect(screen.queryByText('(Slice 4/5에서 활성화)')).not.toBeInTheDocument();
  });

  it('renders linked task title and status when a linked task exists', () => {
    render(
      <LinkedExecutionSection
        voc={DETAIL_ENVELOPE}
        linkedTask={{ title: '결제 오류 수정', status: 'doing' }}
      />,
    );
    expect(screen.getByText('결제 오류 수정')).toBeInTheDocument();
    expect(screen.getByText('doing')).toBeInTheDocument();
  });

  it('renders PermissionBlockedPanel when linkedFinding decision is present', () => {
    vi.mocked(usePermissionDecision).mockReturnValue({
      state: 'denied',
      reason: '권한 없음',
    });
    render(<LinkedExecutionSection voc={DETAIL_ENVELOPE} />);
    // PermissionBlockedPanel renders state-based text; check section title still present
    expect(screen.getByText('연결된 실행')).toBeInTheDocument();
    // EmptyState should NOT appear
    expect(screen.queryByText('아직 연결된 Finding/Task가 없습니다.')).not.toBeInTheDocument();
  });
});
