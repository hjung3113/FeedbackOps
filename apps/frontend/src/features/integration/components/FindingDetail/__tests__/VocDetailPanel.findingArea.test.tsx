import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/voc/hooks/useVocDetail', () => ({ useVocDetail: vi.fn() }));
vi.mock('@/features/voc/hooks/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [] }),
}));
vi.mock('@/features/voc/hooks/usePermissionDecision', () => ({
  usePermissionDecision: () => null,
}));
vi.mock('@/features/voc/hooks/usePublicUpdateReviewCandidates', () => ({
  usePublicUpdateReviewCandidates: () => ({ data: { items: [] } }),
}));
vi.mock('@/features/voc/hooks/useRequestTaskFromVoc', () => ({
  useRequestTaskFromVoc: () => ({ isPending: false, mutate: vi.fn(), reset: vi.fn() }),
}));
vi.mock('@/lib/api/analytics-areas', () => ({
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [], total: 0 })),
}));
vi.mock('@/lib/auth/useMe', () => ({ useMe: vi.fn() }));
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('@/features/integration/components/FindingDetail/CreateFindingModal', () => ({
  CreateFindingModal: (props: {
    managedSystemId: string;
    sourceAnalyticsAreaId: string | null;
    open: boolean;
  }) => (
    <div
      data-testid="create-finding-modal-props"
      data-managed-system-id={props.managedSystemId}
      data-source-analytics-area-id={props.sourceAnalyticsAreaId ?? ''}
      data-open={String(props.open)}
    />
  ),
}));
vi.mock('@/features/voc/components/detail/ComposerSection', () => ({
  ComposerSection: () => null,
}));
vi.mock('@/features/voc/components/detail/ConversationTimeline', () => ({
  ConversationTimeline: () => null,
}));
vi.mock('@/features/voc/components/detail/DescriptionSection', () => ({
  DescriptionSection: () => null,
}));
vi.mock('@/features/voc/components/detail/IdentitySection', () => ({
  IdentityMetadataStrip: () => null,
  IdentitySection: () => null,
}));
vi.mock('@/features/voc/components/detail/LinkedEntityTrailSection', () => ({
  LinkedEntityTrailSection: () => null,
}));
vi.mock('@/features/voc/components/detail/LinkedExecutionSection', () => ({
  LinkedExecutionSection: () => null,
}));
vi.mock('@/features/voc/components/detail/NextActionFooter', () => ({
  NextActionFooter: () => null,
}));
vi.mock('@/features/voc/components/detail/PublicUpdateReviewModal', () => ({
  PublicUpdateReviewModal: () => null,
}));
vi.mock('@/features/voc/components/detail/SimilarVocSection', () => ({
  SimilarVocSection: () => null,
  hasSimilarVocSection: () => false,
}));
vi.mock('@/features/voc/components/detail/TriageBlock', () => ({ TriageBlock: () => null }));

import { VocDetailPanel } from '@/features/voc/components/detail/VocDetailPanel';
import {
  DETAIL_ENVELOPE,
  ME_RESPONSE,
  makeDetailQuery,
  makeMeQuery,
} from '@/features/voc/components/detail/__tests__/_fixtures';
import { useVocDetail } from '@/features/voc/hooks/useVocDetail';
import { useMe } from '@/lib/auth/useMe';

const AREA_ID = '20000000-0000-4000-8000-000000000001';

beforeEach(() => {
  vi.mocked(useVocDetail).mockReturnValue(
    makeDetailQuery({ data: { ...DETAIL_ENVELOPE, analytics_area_id: AREA_ID } }),
  );
  vi.mocked(useMe).mockReturnValue(
    makeMeQuery({ data: { ...ME_RESPONSE, actor: { ...ME_RESPONSE.actor, role_level: 'admin' } } }),
  );
});

describe('VocDetailPanel Finding creation area handoff', () => {
  it('AC-B5d passes the source VOC Analytics Area and Managed System to CreateFindingModal', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <VocDetailPanel vocId={DETAIL_ENVELOPE.id} onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Finding 생성' }));

    const modal = screen.getByTestId('create-finding-modal-props');
    expect(modal).toHaveAttribute('data-open', 'true');
    expect(modal).toHaveAttribute('data-source-analytics-area-id', AREA_ID);
    expect(modal).toHaveAttribute(
      'data-managed-system-id',
      DETAIL_ENVELOPE.primary_managed_system_id,
    );
  });
});
