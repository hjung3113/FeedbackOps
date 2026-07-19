import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { useSurvey, useSurveys, useSurveyManageGate } = vi.hoisted(() => ({
  useSurvey: vi.fn(),
  useSurveys: vi.fn(),
  useSurveyManageGate: vi.fn(),
}));

vi.mock('@/features/surveys/hooks/useSurveys', () => ({
  useSurvey,
  useSurveys,
}));
vi.mock('@/features/surveys/routes/SurveyPermissionGate', () => ({
  useSurveyManageGate,
}));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
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
