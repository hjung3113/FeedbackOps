import { TASK_STATUS_LABELS } from '@/lib/copy/enum-labels';
import { taskStatusSchema } from '@fops/shared';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cross-system/getPermissionDecision', () => ({
  getPermissionDecision: vi.fn(),
}));

import { getPermissionDecision } from '@/lib/cross-system/getPermissionDecision';
import { LinkedExecutionSection } from '../LinkedExecutionSection';
import { DETAIL_ENVELOPE } from './_fixtures';

describe('<LinkedExecutionSection>', () => {
  beforeEach(() => {
    vi.mocked(getPermissionDecision).mockReturnValue(null);
  });

  it('renders EmptyState when no linkedFinding permission decision', () => {
    render(<LinkedExecutionSection voc={DETAIL_ENVELOPE} />);
    expect(screen.getByText('연결된 실행 없음')).toBeInTheDocument();
    expect(screen.queryByText('(Slice 4/5에서 활성화)')).not.toBeInTheDocument();
  });

  it.each(taskStatusSchema.options)('renders a display label for Task status %s', (status) => {
    render(
      <LinkedExecutionSection
        voc={DETAIL_ENVELOPE}
        linkedTask={{ title: '결제 오류 수정', status }}
      />,
    );
    expect(screen.getByText('결제 오류 수정')).toBeInTheDocument();
    expect(screen.getByText(TASK_STATUS_LABELS[status])).toBeInTheDocument();
    expect(screen.queryByText(status, { exact: true })).not.toBeInTheDocument();
  });

  it('renders PermissionBlockedPanel when linkedFinding decision is present', () => {
    vi.mocked(getPermissionDecision).mockReturnValue({
      state: 'denied',
      reason: '권한 없음',
    });
    render(<LinkedExecutionSection voc={DETAIL_ENVELOPE} />);
    // PermissionBlockedPanel renders state-based text; check section title still present
    expect(screen.getByText('연결된 실행')).toBeInTheDocument();
    // EmptyState should NOT appear
    expect(screen.queryByText('아직 연결된 Finding/Task가 없습니다.')).not.toBeInTheDocument();
  });

  it('does not show the machine reason code of a request_access decision (#564)', () => {
    vi.mocked(getPermissionDecision).mockReturnValue({
      state: 'request_access',
      reason: 'developer_outside_managed_system_scope',
      required_scope: ['tableau'],
    });
    render(<LinkedExecutionSection voc={DETAIL_ENVELOPE} />);

    expect(screen.getByText('이 항목에 접근하려면 권한 요청이 필요합니다.')).toBeInTheDocument();
    expect(screen.queryByText('developer_outside_managed_system_scope')).not.toBeInTheDocument();
  });
});
