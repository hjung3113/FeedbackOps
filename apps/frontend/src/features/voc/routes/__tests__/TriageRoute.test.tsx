// TriageRoute.test.tsx — RED tests for the Triage view routing.
// Covers: URL → view=triage → renders queue; tab change updates URL; selected updates URL.
// TDD RED: written before TriageRoute.tsx implementation exists.

import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const navigateMock = vi.fn();
let searchState: Record<string, unknown> = {};

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => searchState,
  useNavigate: () => navigateMock,
  Link: ({
    children,
    to,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

// ── Stub useVocList ────────────────────────────────────────────────────────────

const MOCK_TRIAGE_VOCS = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    display_id: 'VOC-001',
    title: 'Triage VOC 1',
    primary_managed_system_id: 'ms-1',
    analytics_area_id: null,
    reporter_id: 'u1',
    owner_user_id: null,
    owner_team_id: null,
    severity: 'high' as const,
    reporter_facing_status: 'received' as const,
    triage_state: 'untriaged' as const,
    source_context: 'direct_use' as const,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    similar_count: 0,
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    display_id: 'VOC-002',
    title: 'Triage VOC 2',
    primary_managed_system_id: 'ms-1',
    analytics_area_id: null,
    reporter_id: 'u2',
    owner_user_id: null,
    owner_team_id: null,
    severity: 'critical' as const,
    reporter_facing_status: 'reviewing' as const,
    triage_state: 'untriaged' as const,
    source_context: 'proxy_report' as const,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    similar_count: 0,
  },
];

vi.mock('../../hooks/useVocList', () => ({
  useVocList: () => ({
    data: { items: MOCK_TRIAGE_VOCS, next_cursor: undefined },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// ── Stub VocDetailPanel ───────────────────────────────────────────────────────

vi.mock('../../components/detail/VocDetailPanel', () => ({
  VocDetailPanel: ({
    vocId,
    onClose,
  }: {
    vocId: string;
    onClose: () => void;
  }) => (
    <div data-testid="voc-detail-panel-stub" data-voc-id={vocId}>
      <button type="button" onClick={onClose}>
        닫기
      </button>
    </div>
  ),
}));

// ── Import subject ─────────────────────────────────────────────────────────────

import { TriageRoute } from '../TriageRoute';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TriageRoute', () => {
  beforeEach(() => {
    searchState = { view: 'triage' };
    navigateMock.mockClear();
  });

  it('renders the triage queue with VOC rows when view=triage', async () => {
    render(<TriageRoute />);
    await waitFor(() => {
      expect(screen.getByText('Triage VOC 1')).toBeInTheDocument();
      expect(screen.getByText('Triage VOC 2')).toBeInTheDocument();
    });
  });

  it('selecting a tab calls navigate with tab param', async () => {
    render(<TriageRoute />);
    await waitFor(() => {
      expect(screen.getByText('Triage VOC 1')).toBeInTheDocument();
    });

    // Find a tab trigger (e.g. "미배정" = unassigned)
    const unassignedTab = screen.getByRole('button', { name: /미배정/i });
    fireEvent.click(unassignedTab);

    expect(navigateMock).toHaveBeenCalled();
    const callArg = navigateMock.mock.calls[0]?.[0] as {
      to: string;
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(callArg.to).toBe('/vocs');
    const result = callArg.search({});
    expect(result).toHaveProperty('tab', 'unassigned');
  });

  it('clicking a row calls navigate with selected param', async () => {
    render(<TriageRoute />);
    await waitFor(() => {
      expect(screen.getByText('Triage VOC 1')).toBeInTheDocument();
    });

    const rows = screen.getAllByRole('button', { name: /VOC-00[12]/ });
    if (rows[0]) fireEvent.click(rows[0]);

    expect(navigateMock).toHaveBeenCalled();
    const callArg = navigateMock.mock.calls[0]?.[0] as {
      to: string;
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(callArg.to).toBe('/vocs');
    const result = callArg.search({});
    expect(result).toHaveProperty('selected');
  });
});
