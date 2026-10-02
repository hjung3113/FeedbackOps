import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mutation = vi.hoisted(() => ({
  error: new Error('raw server error'),
  isPending: false,
  mutate: vi.fn(),
}));

vi.mock('@/features/surveys/hooks/useCreateFindingFromSurveyResponse', () => ({
  useCreateFindingFromSurveyResponse: () => mutation,
}));

import { CreateFindingDraftPanel } from '../CreateFindingDraftPanel';

describe('CreateFindingDraftPanel', () => {
  it('shows mapped Korean copy when creating a Finding fails', () => {
    render(
      <CreateFindingDraftPanel
        groups={[[{ id: 'excerpt-1', response_id: 'response-1', text: '응답 발췌' }]]}
        scopedResponseId="response-1"
        surveyId="survey-1"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      '일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    );
    expect(screen.queryByText('raw server error')).not.toBeInTheDocument();
  });
});
