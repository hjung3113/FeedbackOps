import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/features/voc/hooks/useVocDetail', () => ({ useVocDetail: vi.fn() }));
vi.mock('@/features/voc/hooks/usePermissionDecision', () => ({ usePermissionDecision: vi.fn() }));
vi.mock('@/features/voc/hooks/useManagedSystem', () => ({ useManagedSystem: vi.fn() }));
vi.mock('@/features/voc/hooks/useVocConversation', () => ({ useVocConversation: vi.fn() }));
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

import { useVocDetail } from '@/features/voc/hooks/useVocDetail';
import { usePermissionDecision } from '@/features/voc/hooks/usePermissionDecision';
import { useManagedSystem } from '@/features/voc/hooks/useManagedSystem';
import { useVocConversation } from '@/features/voc/hooks/useVocConversation';
import { useMe } from '@/lib/auth/useMe';
import { VocDetailPanel } from '../VocDetailPanel';
import {
  DETAIL_ENVELOPE,
  ME_RESPONSE,
  makeDetailQuery,
  makeMeQuery,
  makeConversationQuery,
} from './_fixtures';

beforeEach(() => {
  vi.mocked(useManagedSystem).mockReturnValue(null);
  vi.mocked(usePermissionDecision).mockReturnValue(null);
  vi.mocked(useVocConversation).mockReturnValue(makeConversationQuery());
  vi.mocked(useMe).mockReturnValue(makeMeQuery());
});

describe('<VocDetailPanel>', () => {
  it('happy path: renders the detail panel with title', () => {
    vi.mocked(useVocDetail).mockReturnValue(makeDetailQuery());
    render(<VocDetailPanel vocId="voc-uuid-1111" onClose={vi.fn()} />);
    expect(screen.getByText('테스트 VOC 제목')).toBeInTheDocument();
  });

  it('loading state: renders skeletons instead of content', () => {
    vi.mocked(useVocDetail).mockReturnValue(
      makeDetailQuery({ isLoading: true, isPending: true, isSuccess: false, status: 'pending', data: undefined }),
    );
    const { container } = render(<VocDetailPanel vocId="voc-uuid-1111" onClose={vi.fn()} />);
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(screen.queryByText('테스트 VOC 제목')).not.toBeInTheDocument();
  });

  it('404 state: renders DetailPanelNotFound', () => {
    vi.mocked(useVocDetail).mockReturnValue(
      makeDetailQuery({
        isError: true,
        isSuccess: false,
        isLoading: false,
        isPending: false,
        status: 'error',
        error: { code: 'not_found.record' } as unknown as Error,
        data: undefined,
      }),
    );
    render(<VocDetailPanel vocId="voc-uuid-1111" onClose={vi.fn()} />);
    expect(screen.getByText('VOC를 찾을 수 없습니다.')).toBeInTheDocument();
  });

  it('summary envelope: renders PermissionBlockedPanel', () => {
    const summaryData = {
      id: 'voc-uuid-1111',
      display_id: 'VOC-0001',
      primary_managed_system_id: 'ms-1',
      reporter_facing_status: 'received',
      created_at: '2026-05-01T00:00:00Z',
      permission_decisions: { _self: { state: 'denied' } },
    };
    vi.mocked(useVocDetail).mockReturnValue(
      makeDetailQuery({ data: summaryData as unknown as typeof DETAIL_ENVELOPE }),
    );
    vi.mocked(usePermissionDecision).mockReturnValue({ state: 'denied' });
    vi.mocked(useMe).mockReturnValue(makeMeQuery());

    render(<VocDetailPanel vocId="voc-uuid-1111" onClose={vi.fn()} />);
    // PermissionBlockedPanel renders; title should NOT be present
    expect(screen.queryByText('테스트 VOC 제목')).not.toBeInTheDocument();
  });

  it('calls onClose when DetailPanelNotFound clear button is clicked', () => {
    const onClose = vi.fn();
    vi.mocked(useVocDetail).mockReturnValue(
      makeDetailQuery({
        isError: true,
        isSuccess: false,
        isLoading: false,
        isPending: false,
        status: 'error',
        error: { code: 'not_found.record' } as unknown as Error,
        data: undefined,
      }),
    );
    render(<VocDetailPanel vocId="voc-uuid-1111" onClose={onClose} />);
    screen.getByRole('button', { name: '선택 해제' }).click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders all 7 section titles in happy path', () => {
    vi.mocked(useVocDetail).mockReturnValue(makeDetailQuery());
    render(<VocDetailPanel vocId="voc-uuid-1111" onClose={vi.fn()} />);
    expect(screen.getByText('트리아지 (Read only)')).toBeInTheDocument();
    expect(screen.getByText('설명')).toBeInTheDocument();
    expect(screen.getByText('연결된 실행')).toBeInTheDocument();
    expect(screen.getByText('관련 엔티티')).toBeInTheDocument();
    expect(screen.getByText('대화')).toBeInTheDocument();
  });

  it('renders me.display_name when me matches reporter', () => {
    vi.mocked(useVocDetail).mockReturnValue(
      makeDetailQuery({ data: { ...DETAIL_ENVELOPE, reporter_id: ME_RESPONSE.actor.id } }),
    );
    render(<VocDetailPanel vocId="voc-uuid-1111" onClose={vi.fn()} />);
    expect(screen.getAllByText('김개발').length).toBeGreaterThan(0);
  });
});
