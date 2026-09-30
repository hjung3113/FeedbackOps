import {
  type FindingConfidence,
  type FindingSeverity,
  type VocClusterDto,
  findingConfidenceSchema,
  findingSeveritySchema,
} from '@fops/shared';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const clusterState = vi.hoisted(() => ({
  data: {
    id: '10000000-0000-0000-0000-000000000001',
    workspace_id: '90000000-0000-0000-0000-000000000009',
    display_id: 'CLU-9',
    title: '매출 리포트 성능 문제',
    summary: null,
    rationale: null,
    status: 'confirmed',
    severity: 'high',
    confidence: 'high',
    owner_user_id: '20000000-0000-0000-0000-000000000002',
    confirmed_by: '30000000-0000-0000-0000-000000000003',
    confirmed_at: '2026-07-10T00:00:00.000Z',
    primary_managed_system_id: '40000000-0000-0000-0000-000000000004',
    member_count: 0,
    members: [],
    linked_findings: [],
    created_by: '50000000-0000-0000-0000-000000000005',
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
  },
  actors: [
    {
      id: '20000000-0000-0000-0000-000000000002',
      display_name: '이서준',
      email: 'owner@example.test',
      role_level: 'developer',
    },
    {
      id: '30000000-0000-0000-0000-000000000003',
      display_name: '박지우',
      email: 'confirmer@example.test',
      role_level: 'admin',
    },
  ],
}));

vi.mock('@/features/voc-cluster/hooks/useVocClusterDetail', () => ({
  useVocClusterDetail: () => ({ data: clusterState.data, isLoading: false, isError: false }),
}));
vi.mock('@/features/voc-cluster/hooks/useConfirmCluster', () => ({
  useConfirmCluster: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/voc-cluster/hooks/useRemoveClusterMember', () => ({
  useRemoveClusterMember: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}));
vi.mock('@/features/voc-cluster/hooks/useRequestTaskFromCluster', () => ({
  useRequestTaskFromCluster: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/cross-system/useManagedSystem', () => ({ useManagedSystem: () => null }));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: clusterState.actors }),
}));
vi.mock('@/lib/auth/useMe', () => ({ useMe: () => ({ data: { actor: { role_level: 'user' } } }) }));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
  useNavigate: () => vi.fn(),
}));

import { VocClusterDetailPanel } from './VocClusterDetailPanel';

const cluster = clusterState.data as unknown as VocClusterDto;

const severityLabels: Record<FindingSeverity, string> = {
  low: '낮음',
  medium: '보통',
  high: '높음',
  critical: '심각',
};

const confidenceLabels: Record<FindingConfidence, string> = {
  low: '낮음',
  medium: '중간',
  high: '높음',
};

describe('VocClusterDetailPanel identity', () => {
  beforeEach(() => {
    clusterState.data.owner_user_id = '20000000-0000-0000-0000-000000000002';
    clusterState.data.confirmed_by = '30000000-0000-0000-0000-000000000003';
    clusterState.actors = [
      {
        id: '20000000-0000-0000-0000-000000000002',
        display_name: '이서준',
        email: 'owner@example.test',
        role_level: 'developer',
      },
      {
        id: '30000000-0000-0000-0000-000000000003',
        display_name: '박지우',
        email: 'confirmer@example.test',
        role_level: 'admin',
      },
    ];
  });

  it('shows owner and confirmer names instead of UUID fragments', () => {
    render(<VocClusterDetailPanel clusterId={cluster.id} />);

    expect(screen.getByTestId('cluster-detail-owner')).toHaveTextContent('이서준');
    expect(screen.getByTestId('cluster-detail-confirmed-by')).toHaveTextContent('박지우');
    expect(screen.queryByText('20000000')).not.toBeInTheDocument();
    expect(screen.queryByText('30000000')).not.toBeInTheDocument();
  });

  it('uses Korean properties navigation and field labels', () => {
    render(<VocClusterDetailPanel clusterId={cluster.id} />);

    expect(screen.getByRole('button', { name: '속성' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '속성' })).toBeInTheDocument();
    for (const label of ['심각도', '신뢰도', '담당자']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('uses a safe owner label when the actor name is unavailable', () => {
    clusterState.actors = [];

    render(<VocClusterDetailPanel clusterId={cluster.id} />);

    expect(screen.getByTestId('cluster-detail-owner')).toHaveTextContent('알 수 없는 사용자');
    expect(screen.getByText('20000000')).toHaveClass('text-text-muted');
  });

  it.each(findingSeveritySchema.options)('renders the %s severity label', (severity) => {
    clusterState.data.severity = severity;

    render(<VocClusterDetailPanel clusterId={cluster.id} />);

    const value = screen.getByTestId('cluster-detail-severity');
    expect(value).toHaveTextContent(severityLabels[severity]);
    expect(value).not.toHaveTextContent(severity);
  });

  it.each(findingConfidenceSchema.options)('renders the %s confidence label', (confidence) => {
    clusterState.data.confidence = confidence;

    render(<VocClusterDetailPanel clusterId={cluster.id} />);

    const value = screen.getByTestId('cluster-detail-confidence');
    expect(value).toHaveTextContent(confidenceLabels[confidence]);
    expect(value).not.toHaveTextContent(confidence);
    expect(screen.getByTestId('cluster-detail-confidence-badge')).toHaveTextContent(
      `신뢰도 · ${confidenceLabels[confidence]}`,
    );
  });
});
