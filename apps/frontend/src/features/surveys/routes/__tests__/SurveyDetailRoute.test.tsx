import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Survey } from '../../types';

const { useCloseSurvey, useOpenSurvey, useSurvey, useSurveys, useSurveyManageGate } = vi.hoisted(
  () => ({
    useCloseSurvey: vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null })),
    useOpenSurvey: vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null })),
    useSurvey: vi.fn(),
    useSurveys: vi.fn(),
    useSurveyManageGate: vi.fn(),
  }),
);

vi.mock('@/features/surveys/hooks/useSurveys', () => ({
  useCloseSurvey,
  useOpenSurvey,
  useSurvey,
  useSurveys,
}));
vi.mock('@/features/surveys/routes/SurveyPermissionGate', () => ({
  useSurveyManageGate,
}));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  createFileRoute: () => () => ({
    useParams: () => ({ surveyId: 'survey-1' }),
    useSearch: () => ({}),
  }),
  useMatchRoute: () => () => false,
  useNavigate: () => vi.fn(),
}));

import { SurveyDetailRoute } from '@/routes/_authed/surveys/$surveyId';

const survey: Survey = {
  id: 'survey-1',
  display_id: 'SRV-1',
  title: 'Q3 사용성 진단',
  type: 'discovery',
  status: 'draft',
  description: null,
  primary_managed_system_id: 'system-1',
  analytics_area_id: null,
  operator_actor_id: null,
  responses_identity_protected: true,
  created_by: 'actor-1',
  opened_at: null,
  closed_at: null,
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-20T00:00:00.000Z',
  questions: [],
};

describe('/surveys/:surveyId route', () => {
  it('renders the detail screen when the survey exists', () => {
    useSurvey.mockReturnValue({
      data: survey,
      isLoading: false,
      isError: false,
    });
    useSurveyManageGate.mockReturnValue({
      canManage: false,
      gateState: 'absent',
    });
    useSurveys.mockReturnValue({
      data: [survey],
      isLoading: false,
      error: null,
    });

    render(<SurveyDetailRoute />);

    expect(screen.getByTestId('survey-list')).toBeInTheDocument();
    expect(screen.getByText('Q3 사용성 진단')).toBeInTheDocument();
  });

  it('renders not-found when the survey is unavailable', () => {
    useSurvey.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    useSurveyManageGate.mockReturnValue({
      canManage: false,
      gateState: 'absent',
    });
    useSurveys.mockReturnValue({ data: [], isLoading: false, error: null });

    render(<SurveyDetailRoute />);

    expect(screen.getByText('설문을 찾을 수 없습니다.')).toBeInTheDocument();
  });
});
