import {
  type EvidenceHighlightDto,
  type EvidenceHighlightImportance,
  type EvidenceHighlightSourceType,
  evidenceHighlightImportanceSchema,
  evidenceHighlightSourceTypeSchema,
} from '@fops/shared';
import { render, screen } from '@testing-library/react';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EvidenceHighlightsSection } from './EvidenceHighlights';

const useEvidenceHighlightsMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/findings/hooks/useEvidenceHighlights', () => ({
  useEvidenceHighlights: useEvidenceHighlightsMock,
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    search?: Record<string, string>;
    className?: string;
  }) => (
    <a
      href={`${to}${search ? `?${new URLSearchParams(search).toString()}` : ''}`}
      className={className}
    >
      {children}
    </a>
  ),
}));

const SOURCE_TYPE_LABELS: Record<EvidenceHighlightSourceType, string> = {
  voc: 'VOC',
  survey_response: 'Survey',
  note: '수동 메모',
};

const IMPORTANCE_LABELS: Record<EvidenceHighlightImportance, string> = {
  low: '낮음',
  medium: '보통',
  high: '높음',
};

function makeHighlight(
  sourceType: EvidenceHighlightSourceType,
  importance: EvidenceHighlightImportance | null,
): EvidenceHighlightDto {
  const base = {
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    finding_id: '22222222-2222-4222-8222-222222222222',
    primary_managed_system_id: '33333333-3333-4333-8333-333333333333',
    quote_or_summary: 'Evidence quote',
    analytics_area_id: null,
    sentiment: null,
    importance,
    created_by: '44444444-4444-4444-8444-444444444444',
    created_at: '2026-01-01T00:00:00.000Z',
  };

  if (sourceType === 'survey_response') {
    return {
      ...base,
      source_type: sourceType,
      source_title: 'Survey response',
      source_meta: 'Discovery · CSAT 7점 · Identity protected',
    };
  }

  return {
    ...base,
    source_type: sourceType,
    source_id: null,
    source_title: null,
    source_meta: null,
  };
}

function renderEvidence(
  sourceType: EvidenceHighlightSourceType,
  importance: EvidenceHighlightImportance | null = null,
) {
  useEvidenceHighlightsMock.mockReturnValue({
    data: [makeHighlight(sourceType, importance)],
    isLoading: false,
    isError: false,
  });

  render(<EvidenceHighlightsSection findingId="finding-id" evidenceCount={1} />);
}

describe('EvidenceHighlightsSection labels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the safe Survey reference beside its source chip', () => {
    useEvidenceHighlightsMock.mockReturnValue({
      data: [
        {
          ...makeHighlight('survey_response', null),
          source_meta: 'outcome · SRV-1001 · Identity protected',
        },
      ],
      isLoading: false,
      isError: false,
    });
    render(<EvidenceHighlightsSection findingId="finding-id" evidenceCount={1} />);

    expect(screen.getByTestId('evidence-highlight-row')).toHaveTextContent(
      'outcome · SRV-1001 · Identity protected',
    );
    expect(screen.queryByTestId('evidence-source-id')).not.toBeInTheDocument();
  });

  it.each(evidenceHighlightSourceTypeSchema.options)(
    'renders evidence source kind %s with its shared label',
    (sourceType) => {
      renderEvidence(sourceType);

      const badge = screen.getByTestId('evidence-source-type');
      expect(badge.textContent).toBe(SOURCE_TYPE_LABELS[sourceType]);
      if (sourceType === 'note') {
        expect(badge.textContent).not.toBe('Note');
      }
    },
  );

  it.each(evidenceHighlightImportanceSchema.options)(
    'renders evidence importance %s with its shared label',
    (importance) => {
      renderEvidence('voc', importance);

      const badge = screen.getByTestId('evidence-importance');
      expect(badge.textContent).toBe(IMPORTANCE_LABELS[importance]);
      expect(badge).not.toHaveTextContent(/\b(?:Low|Medium|High)\b/);
    },
  );

  // #1174b U2-6: a readable VOC source is named by its display id and links to the
  // VOC; a UUID fragment is never shown.
  it('links VOC evidence to its source VOC via the display id, never a UUID fragment', () => {
    const sourceId = '55555555-5555-4555-8555-555555555555';
    useEvidenceHighlightsMock.mockReturnValue({
      data: [
        {
          ...makeHighlight('voc', null),
          source_id: sourceId,
          source_title: 'Export failures',
          source_meta: 'VOC-1001',
        },
      ],
      isLoading: false,
      isError: false,
    });
    render(<EvidenceHighlightsSection findingId="finding-id" evidenceCount={1} />);

    const vocLink = screen.getByRole('link', { name: 'VOC-1001' });
    expect(vocLink.getAttribute('href')).toBe(`/vocs?view=inbox&selected=${sourceId}`);
    expect(screen.queryByText(sourceId.slice(0, 8))).not.toBeInTheDocument();
  });

  // #1174b U2-6 / #1174 FIX1: the backend keeps the VOC `source_id` but
  // withholds `source_meta` when the source is unreadable, so exercise that
  // real shape — no identifier, no UUID fragment and no link may render.
  it('shows the source type only for VOC evidence without a readable source meta', () => {
    const sourceId = '55555555-5555-4555-8555-555555555555';
    useEvidenceHighlightsMock.mockReturnValue({
      data: [
        {
          ...makeHighlight('voc', null),
          source_id: sourceId,
          source_title: 'Export failures',
          source_meta: null,
        },
      ],
      isLoading: false,
      isError: false,
    });
    render(<EvidenceHighlightsSection findingId="finding-id" evidenceCount={1} />);

    expect(screen.getByTestId('evidence-source-type')).toHaveTextContent('VOC');
    expect(screen.queryByTestId('evidence-source-id')).not.toBeInTheDocument();
    expect(screen.queryByText(sourceId.slice(0, 8))).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
