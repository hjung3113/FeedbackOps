import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

// EditDescriptionModal uses QueryClient + mutation hooks — stub to isolate VocDetailPanel tests
vi.mock('@/features/voc/components/detail/EditDescriptionModal', () => ({
  EditDescriptionModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="edit-description-modal" /> : null,
}));

// PublicUpdateComposer uses QueryClient — stub to isolate VocDetailPanel tests (C5.2)
vi.mock('@/features/voc/components/detail/PublicUpdateComposer', () => ({
  PublicUpdateComposer: () => <div data-testid="public-update-composer-stub" />,
}));

// ComposerSection stub that can report dirty state via onDirtyChange callback.
// REV-1 #6: VocDetailPanel must intercept close when a composer draft is dirty.
vi.mock('@/features/voc/components/detail/ComposerSection', () => ({
  ComposerSection: ({
    onDirtyChange,
  }: {
    onDirtyChange?: (dirty: boolean) => void;
  }) => (
    <div data-testid="composer-section-stub">
      <button
        type="button"
        data-testid="composer-dirty-trigger"
        onClick={() => onDirtyChange?.(true)}
      >
        make dirty
      </button>
    </div>
  ),
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

  // REV-1 #6: dirty composer close must show DirtyConfirmation, not call onClose immediately.
  it('#6 dirty composer close: shows DirtyConfirmation before closing panel', async () => {
    vi.mocked(useVocDetail).mockReturnValue(makeDetailQuery());
    const onClose = vi.fn();
    render(<VocDetailPanel vocId="voc-uuid-1111" onClose={onClose} />);

    // Mark composer dirty via stub trigger
    fireEvent.click(screen.getByTestId('composer-dirty-trigger'));

    // Click the DetailHeader close button (aria-label "닫기" on the X icon button)
    const closeBtn = screen.getByRole('button', { name: /닫기|패널 닫기|close/i });
    fireEvent.click(closeBtn);

    // DirtyConfirmation should appear; onClose NOT called yet
    await waitFor(() => {
      expect(screen.getByText('변경사항이 저장되지 않았습니다')).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
