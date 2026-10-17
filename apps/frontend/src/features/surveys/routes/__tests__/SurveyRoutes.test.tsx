import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const {
  useCloseSurvey,
  useManagedSystemNamesResult,
  useOpenSurvey,
  useSurvey,
  useSurveys,
  useSurveyManageAnySystemGate,
  useSurveyManageGate,
  useWorkspaceActors,
} = vi.hoisted(() => ({
  useCloseSurvey: vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null })),
  useManagedSystemNamesResult: vi.fn(() => ({ namesById: new Map(), isSuccess: true })),
  useOpenSurvey: vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null })),
  useSurvey: vi.fn(),
  useSurveys: vi.fn(),
  useSurveyManageAnySystemGate: vi.fn(),
  useSurveyManageGate: vi.fn(),
  useWorkspaceActors: vi.fn(() => ({ actors: [], isSuccess: true })),
}));

vi.mock('@/features/surveys/hooks/useSurveys', () => ({
  useCloseSurvey,
  useOpenSurvey,
  useSurvey,
  useSurveys,
}));
vi.mock('@/features/surveys/routes/SurveyPermissionGate', () => ({
  useSurveyManageAnySystemGate,
  useSurveyManageGate,
}));
vi.mock('@/lib/cross-system/useManagedSystemNames', () => ({ useManagedSystemNamesResult }));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({ useWorkspaceActors }));
vi.mock('@/lib/useAnalyticsAreaFilterLabel', () => ({
  useAnalyticsAreaFilterLabel: () => undefined,
}));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));

import { SurveysIndexRoute } from '@/routes/_authed/surveys/index';

describe('/surveys route', () => {
  // #1075 moved the entry decision to the survey.manage capability scope; the
  // scope shapes themselves are covered in SurveyPermissionGate/SurveyScreens
  // tests. Here only the route wiring is pinned: a denied scope gate renders
  // no creation entry point.
  it('does not render the create entry point when the scope gate denies creation', () => {
    useSurveys.mockReturnValue({ data: [], isLoading: false, error: null });
    useSurvey.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });
    useSurveyManageAnySystemGate.mockReturnValue({ canManage: false });
    useSurveyManageGate.mockReturnValue({ canManage: false, gateState: 'absent' });

    render(<SurveysIndexRoute />);

    expect(screen.queryByTestId('survey-create-button')).not.toBeInTheDocument();
    expect(screen.queryByText('Create VOC')).not.toBeInTheDocument();
  });
});
