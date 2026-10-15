import type { VocSummaryEnvelope } from '@fops/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SummaryPermissionView } from '../SummaryPermissionView';

describe('SummaryPermissionView reason copy', () => {
  it.each([
    ['explicit_deny', '이 Managed System의 VOC 조회가 제한되어 있습니다.'],
    ['grant_expired', 'VOC 조회 권한이 만료되었습니다.'],
    ['grant_revoked', 'VOC 조회 권한이 회수되었습니다.'],
    ['no_grant', '이 Managed System의 VOC를 볼 권한이 없습니다.'],
    ['unknown_reason', null],
  ])('renders safe Korean copy for %s', (reason, copy) => {
    const data: VocSummaryEnvelope = {
      id: 'voc-1',
      display_id: 'VOC-0001',
      primary_managed_system_id: 'ms-1',
      reporter_facing_status: 'received',
      created_at: '2026-05-01T00:00:00Z',
      permission_decisions: { _self: { state: 'blocked_not_requestable', reason } },
    };
    render(<SummaryPermissionView data={data} vocId={data.id} onClose={vi.fn()} />);
    expect(screen.queryByText(reason)).not.toBeInTheDocument();
    if (copy !== null) expect(screen.getByText(copy)).toBeInTheDocument();
    else expect(screen.getByText('권한 요청이 허용되지 않습니다.')).toBeInTheDocument();
  });
});
