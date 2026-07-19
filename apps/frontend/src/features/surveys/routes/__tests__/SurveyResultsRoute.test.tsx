import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { useSurvey, useSurveyResults, useSurveyReadGate } = vi.hoisted(() => ({
  useSurvey: vi.fn(),
  useSurveyResults: vi.fn(),
  useSurveyReadGate: vi.fn(),
}));

vi.mock('@/features/surveys/hooks/useSurveys', () => ({ useSurvey, useSurveyResults }));
vi.mock('@/features/surveys/routes/SurveyPermissionGate', () => ({ useSurveyReadGate }));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  createFileRoute: () => (options: { component: unknown }) => ({
    ...options,
    useParams: () => ({ surveyId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
  }),
}));

import { SurveyResultsRoute } from '@/routes/_authed/surveys/$surveyId.results';

const survey = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  display_id: 'SRV-21',
  title: 'Results',
  type: 'outcome' as const,
  status: 'closed' as const,
  description: null,
  primary_managed_system_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  analytics_area_id: null,
  operator_actor_id: null,
  responses_identity_protected: true,
  created_by: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  opened_at: null,
  closed_at: null,
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-20T00:00:00.000Z',
  questions: [],
};

describe('/surveys/:surveyId/results route', () => {
  it.each(['loading', 'error', 'absent'] as const)(
    'fails closed and does not render result content when the read gate is %s',
    (gateState) => {
      useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
      useSurveyReadGate.mockReturnValue({ canRead: false, gateState });
      useSurveyResults.mockReturnValue({ data: undefined, isLoading: false, isError: false });

      render(<SurveyResultsRoute />);

      expect(screen.queryByTestId('survey-results-summary')).not.toBeInTheDocument();
      if (gateState !== 'loading') expect(screen.getByText('Survey Result')).toBeInTheDocument();
    },
  );

  it('renders not-found state when results cannot be loaded', () => {
    useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false });
    useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
    useSurveyResults.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    render(<SurveyResultsRoute />);

    expect(screen.getByText('설문 결과를 찾을 수 없습니다.')).toBeInTheDocument();
  });
});
