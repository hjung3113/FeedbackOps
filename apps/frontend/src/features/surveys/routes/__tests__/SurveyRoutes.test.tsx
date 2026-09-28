import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const {
  useCloseSurvey,
  useManagedSystemNamesResult,
  useOpenSurvey,
  useSurvey,
  useSurveys,
  useSurveyManageGate,
  useWorkspaceActors,
} = vi.hoisted(() => ({
  useCloseSurvey: vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null })),
  useManagedSystemNamesResult: vi.fn(() => ({ namesById: new Map(), isSuccess: true })),
  useOpenSurvey: vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null })),
  useSurvey: vi.fn(),
  useSurveys: vi.fn(),
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
  useSurveyManageGate,
}));
vi.mock('@/lib/cross-system/useManagedSystemNames', () => ({ useManagedSystemNamesResult }));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({ useWorkspaceActors }));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));

import { SurveysIndexRoute } from '@/routes/_authed/surveys/index';

describe('/surveys route', () => {
  it.each(['loading', 'error', 'absent'] as const)(
    'does not render the create entry point when the permission gate is %s',
    (gateState) => {
      useSurveys.mockReturnValue({ data: [], isLoading: false, error: null });
      useSurvey.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
      });
      useSurveyManageGate.mockReturnValue({ canManage: false, gateState });

      render(<SurveysIndexRoute />);

      expect(screen.queryByTestId('survey-create-button')).not.toBeInTheDocument();
      expect(screen.queryByText('Create VOC')).not.toBeInTheDocument();
    },
  );
});
