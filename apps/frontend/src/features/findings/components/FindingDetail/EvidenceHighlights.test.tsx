import {
  type EvidenceHighlightDto,
  type EvidenceHighlightImportance,
  type EvidenceHighlightSourceType,
  evidenceHighlightImportanceSchema,
  evidenceHighlightSourceTypeSchema,
} from '@fops/shared';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EvidenceHighlightsSection } from './EvidenceHighlights';

const useEvidenceHighlightsMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/findings/hooks/useEvidenceHighlights', () => ({
  useEvidenceHighlights: useEvidenceHighlightsMock,
}));

const SOURCE_TYPE_LABELS: Record<EvidenceHighlightSourceType, string> = {
  voc: 'VOC',
  survey_response: 'Survey',
  note: 'Manual note',
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
});
